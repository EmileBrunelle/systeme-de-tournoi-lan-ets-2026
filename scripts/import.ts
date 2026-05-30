/**
 * Import du roster Valorant depuis le fichier .xlsx LOCAL.
 *
 *   npm run import [chemin/vers/fichier.xlsx]
 *
 * Colonnes attendues (en-tête insensible à la casse) :
 *   Team, Username, Email, Identifier, Rank, Seat
 *
 * Confidentialité : ce script ne journalise JAMAIS de données de joueur
 * (username/email/identifiant). Seuls des compteurs agrégés sont affichés.
 * Le fichier source et la base SQLite restent locaux (voir .gitignore).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { averageRank } from '../lib/valorant/rank';
import { fixMojibake } from '../lib/text/mojibake';

const DEFAULT_FILE = 'Valorant_game_profiles_2026.xlsx';
const STARTERS = 5; // titulaires ; au-delà = remplaçants (rosters 5–8)

const prisma = new PrismaClient();

// ─── Lecture de la feuille ────────────────────────────────────────────────────

interface RawMember {
  team: string;
  username: string;
  email: string | null;
  identifier: string | null;
  rank: string | null;
  seat: string | null;
}

const HEADERS: Record<keyof Omit<RawMember, 'team'> | 'team', string[]> = {
  team: ['team', 'equipe', 'équipe'],
  username: ['username', 'pseudo', 'nom'],
  email: ['email', 'courriel', 'mail'],
  identifier: ['identifier', 'identifiant', 'id', 'riot id', 'riotid'],
  rank: ['rank', 'rang'],
  seat: ['seat', 'siege', 'siège', 'poste'],
};

/** R\u00e9duit \u00e0 des lettres/chiffres minuscules sans accents (tol\u00e8re espaces
 *  ins\u00e9cables, ponctuation et casse). */
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchHeader(cell: string): keyof RawMember | null {
  const norm = slug(cell);
  if (!norm) return null;
  for (const [key, aliases] of Object.entries(HEADERS)) {
    if (aliases.some((a) => slug(a) === norm)) {
      return key as keyof RawMember;
    }
  }
  return null;
}

/** Parse une ligne CSV (gère les champs entre guillemets contenant des virgules). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Lit toutes les lignes en tableaux de champs. Gère deux cas :
 *  - vraies colonnes Excel ;
 *  - CSV "aplati" dans une seule cellule par ligne (extension .xlsx trompeuse). */
function readRows(ws: ExcelJS.Worksheet): string[][] {
  const raw: string[][] = [];
  ws.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(String(cell.text ?? '').trim());
    });
    raw.push(cells);
  });
  const multiColumn = raw.some((r) => r.filter((c) => c.length).length > 1);
  if (multiColumn) return raw;
  // Mode CSV aplati : on re-découpe la 1re cellule de chaque ligne.
  return raw.map((r) => parseCsvLine(r[0] ?? ''));
}

async function readMembers(file: string): Promise<RawMember[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Aucune feuille dans le classeur.');

  const rows = readRows(ws).filter((r) => r.some((c) => c.length));
  if (rows.length === 0) throw new Error('Feuille vide.');

  // En-têtes : première ligne. colMap = clé -> index de colonne (0-based).
  const colMap: Partial<Record<keyof RawMember, number>> = {};
  rows[0].forEach((cell, idx) => {
    const key = matchHeader(cell);
    if (key && colMap[key] === undefined) colMap[key] = idx;
  });
  if (colMap.team === undefined || colMap.username === undefined) {
    throw new Error(
      'Colonnes obligatoires introuvables (au minimum Team et Username). En-têtes vus : ' +
        rows[0].join(' | '),
    );
  }

  const get = (cells: string[], key: keyof RawMember): string | null => {
    const idx = colMap[key];
    if (idx === undefined) return null;
    // fixMojibake : répare l'encodage (ex. "Mac®" mal décodé) à la lecture.
    const text = fixMojibake((cells[idx] ?? '').trim());
    return text.length ? text : null;
  };

  const members: RawMember[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const team = get(cells, 'team');
    const username = get(cells, 'username');
    if (!team || !username) continue; // ligne vide / incomplète
    members.push({
      team,
      username,
      email: get(cells, 'email'),
      identifier: get(cells, 'identifier'),
      rank: get(cells, 'rank'),
      seat: get(cells, 'seat'),
    });
  }
  return members;
}

// ─── Import en base ─────────────────────────────────────────────────────────

async function main() {
  const file = path.resolve(process.argv[2] ?? DEFAULT_FILE);
  if (!existsSync(file)) {
    console.error(`Fichier introuvable : ${file}`);
    console.error("Placez le .xlsx du roster à la racine, ou passez son chemin en argument.");
    process.exit(1);
  }

  const members = await readMembers(file);
  // Regroupe par équipe, en préservant l'ordre d'apparition.
  const byTeam = new Map<string, RawMember[]>();
  for (const m of members) {
    if (!byTeam.has(m.team)) byTeam.set(m.team, []);
    byTeam.get(m.team)!.push(m);
  }

  // Tournoi Valorant (créé si absent).
  let tournament = await prisma.tournament.findFirst({ where: { game: 'valorant' } });
  if (!tournament) {
    tournament = await prisma.tournament.create({
      data: { game: 'valorant', name: 'Valorant', format: 'valorant' },
    });
  }

  // Ré-import idempotent : on efface les équipes existantes (cascade -> membres)
  // et l'état du moteur (le roster change).
  await prisma.team.deleteMany({ where: { tournamentId: tournament.id } });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { stateJson: null } });

  let teamCount = 0;
  let memberCount = 0;
  let subCount = 0;
  for (const [teamName, roster] of byTeam) {
    const starters = roster.slice(0, STARTERS);
    const avgRank = averageRank(starters.map((m) => m.rank));

    await prisma.team.create({
      data: {
        tournamentId: tournament.id,
        name: teamName,
        avgRank,
        members: {
          create: roster.map((m, i) => ({
            username: m.username,
            email: m.email,
            identifier: m.identifier,
            rank: m.rank,
            seat: m.seat,
            isSub: i >= STARTERS,
          })),
        },
      },
    });
    teamCount += 1;
    memberCount += roster.length;
    subCount += Math.max(0, roster.length - STARTERS);
  }

  // Agrégats uniquement — aucune donnée personnelle.
  console.log(`Import terminé : ${teamCount} équipes, ${memberCount} membres (${subCount} remplaçants).`);
}

main()
  .catch((err) => {
    console.error('Échec de l’import :', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
