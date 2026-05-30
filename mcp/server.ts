// mcp/server.ts
// Serveur MCP « Valorant LAN ÉTS » : expose le moteur de tournoi (lib/) +
// la base Prisma comme outils, pour piloter le tournoi en langage naturel.
// Mince wrapper — réutilise exactement les mêmes fonctions que l'app web.
//
// Lancé via .mcp.json : npx tsx --env-file=.env mcp/server.ts
// IMPORTANT : écrit dans la base LIVE. Pendant l'événement, vérifier au
// projecteur (/projecteur) après chaque écriture.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PrismaClient } from '@prisma/client';
import type { Participant } from '../lib/domain/types';
import * as swiss from '../lib/formats/swiss';
import * as de from '../lib/formats/double-elimination';
import * as runner from '../lib/runtime/runner';
import { lanEtsValorantSchedule, saturdayEndTime, sleepGapMinutes } from '../lib/schedule/lan-ets';

const prisma = new PrismaClient();

// ─── Accès base ──────────────────────────────────────────────────────────────

type TeamRow = { id: string; name: string; presence: string; avgRank: number | null };

async function loadCtx(): Promise<{ id: string; teams: TeamRow[]; state: runner.ValorantState | null }> {
  const t = await prisma.tournament.findFirst({
    where: { game: 'valorant' },
    include: { teams: { select: { id: true, name: true, presence: true, avgRank: true } } },
  });
  if (!t) throw new Error('Tournoi Valorant introuvable.');
  const state = t.stateJson ? (JSON.parse(t.stateJson) as runner.ValorantState) : null;
  return { id: t.id, teams: t.teams, state };
}

async function saveState(id: string, state: runner.ValorantState): Promise<void> {
  await prisma.tournament.update({ where: { id }, data: { stateJson: JSON.stringify(state) } });
}

function requireState(state: runner.ValorantState | null): runner.ValorantState {
  if (!state) throw new Error('Tournoi non démarré. Utilise start_swiss d’abord.');
  return state;
}

function nameOf(state: runner.ValorantState, id: string): string {
  return state.swiss.participants.find((p) => p.id === id)?.name ?? id;
}

function slotName(state: runner.ValorantState, s: de.DESlot): string {
  if (s.kind === 'player') return state.playoff?.participants.find((p) => p.id === s.id)?.name ?? s.id;
  return s.kind === 'bye' ? 'bye' : 'à venir';
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Définition des outils ─────────────────────────────────────────────────

const tools = [
  { name: 'get_status', description: 'État courant : phase, ronde, qualifiés, prochaine action.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_teams', description: 'Liste des équipes : nom, présence, rang moyen.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'set_presence',
    description: 'Change la présence d’une équipe (avant le démarrage).',
    inputSchema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Nom (ou fragment) de l’équipe' }, status: { type: 'string', enum: ['confirmed', 'unconfirmed', 'withdrawn'] } },
      required: ['team', 'status'],
    },
  },
  {
    name: 'start_swiss',
    description: 'Démarre la phase suisse (seeding aléatoire) avec les équipes non retirées.',
    inputSchema: { type: 'object', properties: { playoffSize: { type: 'number', description: 'Qualifiés au playoff (défaut 8)' } } },
  },
  { name: 'swiss_round', description: 'Appariements de la ronde suisse courante (id, équipes, score).', inputSchema: { type: 'object', properties: {} } },
  { name: 'generate_swiss_round', description: 'Génère la prochaine ronde suisse (la ronde courante doit être complète).', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'record_swiss_result',
    description: 'Saisit le score d’un match suisse. matchId vient de swiss_round.',
    inputSchema: {
      type: 'object',
      properties: { matchId: { type: 'string' }, homeScore: { type: 'number' }, awayScore: { type: 'number' } },
      required: ['matchId', 'homeScore', 'awayScore'],
    },
  },
  { name: 'standings', description: 'Classement complet (suisse ou playoff selon la phase).', inputSchema: { type: 'object', properties: {} } },
  { name: 'start_playoff', description: 'Lance le playoff double-élimination (top N de la suisse). La suisse doit être finie.', inputSchema: { type: 'object', properties: {} } },
  { name: 'playoff_matches', description: 'Matchs jouables du playoff (id, équipes, bracket).', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'record_playoff_result',
    description: 'Saisit le score d’un match de playoff. matchId vient de playoff_matches.',
    inputSchema: {
      type: 'object',
      properties: { matchId: { type: 'string' }, aScore: { type: 'number' }, bScore: { type: 'number' } },
      required: ['matchId', 'aScore', 'bScore'],
    },
  },
  { name: 'schedule', description: 'Horaire LAN ÉTS prévu (samedi suisse+playoff BO1, finale dimanche 8h BO3).', inputSchema: { type: 'object', properties: {} } },
];

// ─── Exécution des outils ─────────────────────────────────────────────────

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const ctx = await loadCtx();

  switch (name) {
    case 'get_status': {
      if (!ctx.state) return { phase: 'non démarré', equipes: ctx.teams.length, next: 'start_swiss' };
      const s = ctx.state;
      if (s.phase === 'swiss') {
        const round = swiss.currentRound(s.swiss);
        const quals = swiss.qualifiers(s.swiss);
        const done = swiss.isComplete(s.swiss);
        return {
          phase: 'suisse', round, qualifiés: quals.length, playoffSize: s.playoffSize, suisseComplète: done,
          next: done ? 'start_playoff' : round === 0 ? 'generate_swiss_round' : 'swiss_round / record_swiss_result puis generate_swiss_round',
        };
      }
      if (s.phase === 'playoff' && s.playoff) {
        return { phase: 'playoff', champion: de.champion(s.playoff) ? nameOf(s, de.champion(s.playoff)!) : null, matchsJouables: de.playableMatches(s.playoff).length, next: 'playoff_matches / record_playoff_result' };
      }
      return { phase: 'terminé', champion: s.playoff && de.champion(s.playoff) ? nameOf(s, de.champion(s.playoff)!) : null };
    }

    case 'list_teams':
      return ctx.teams
        .map((t) => ({ nom: t.name, présence: t.presence, rangMoyen: t.avgRank }))
        .sort((a, b) => (b.rangMoyen ?? 0) - (a.rangMoyen ?? 0));

    case 'set_presence': {
      if (ctx.state) throw new Error('Tournoi déjà démarré : présences verrouillées.');
      const q = String(args.team).toLowerCase();
      const matches = ctx.teams.filter((t) => t.name.toLowerCase().includes(q));
      if (matches.length === 0) throw new Error(`Aucune équipe ne correspond à « ${args.team} ».`);
      if (matches.length > 1) throw new Error(`Ambigu : ${matches.map((m) => m.name).join(', ')}.`);
      await prisma.team.update({ where: { id: matches[0].id }, data: { presence: String(args.status) } });
      return { équipe: matches[0].name, présence: args.status };
    }

    case 'start_swiss': {
      if (ctx.state) throw new Error('Déjà démarré.');
      const entrants = ctx.teams.filter((t) => t.presence !== 'withdrawn');
      if (entrants.length < 2) throw new Error('Au moins 2 équipes non retirées requises.');
      const participants: Participant[] = shuffled(entrants).map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 }));
      const size = typeof args.playoffSize === 'number' ? args.playoffSize : runner.DEFAULT_PLAYOFF_SIZE;
      const state = runner.startValorant(participants, size);
      await saveState(ctx.id, state);
      return { démarré: true, équipes: entrants.length, playoffSize: size, next: 'generate_swiss_round' };
    }

    case 'swiss_round': {
      const s = requireState(ctx.state);
      const round = swiss.currentRound(s.swiss);
      if (round === 0) return { round: 0, note: 'Aucune ronde générée. Utilise generate_swiss_round.' };
      const matches = s.swiss.matches.filter((m) => m.round === round).map((m) => ({
        matchId: m.id,
        home: nameOf(s, m.home),
        away: m.away ? nameOf(s, m.away) : 'BYE',
        score: m.score ? `${m.score.home}-${m.score.away}` : 'à jouer',
      }));
      return { round, matches };
    }

    case 'generate_swiss_round': {
      const s = requireState(ctx.state);
      const next = { ...s, swiss: swiss.generateNextRound(s.swiss) };
      await saveState(ctx.id, next);
      const round = swiss.currentRound(next.swiss);
      return { round, matches: next.swiss.matches.filter((m) => m.round === round).map((m) => ({ matchId: m.id, home: nameOf(next, m.home), away: m.away ? nameOf(next, m.away) : 'BYE' })) };
    }

    case 'record_swiss_result': {
      const s = requireState(ctx.state);
      const next = { ...s, swiss: swiss.recordResult(s.swiss, String(args.matchId), { home: Number(args.homeScore), away: Number(args.awayScore) }) };
      await saveState(ctx.id, next);
      return { enregistré: args.matchId, score: `${args.homeScore}-${args.awayScore}`, suisseComplète: swiss.isComplete(next.swiss) };
    }

    case 'standings': {
      const s = requireState(ctx.state);
      if (s.phase !== 'swiss' && s.playoff) return { phase: 'playoff', classement: de.standings(s.playoff).map((r) => ({ rang: r.rank, équipe: r.name })) };
      return { phase: 'suisse', classement: swiss.standings(s.swiss).map((r) => ({ rang: r.rank, équipe: r.name, bilan: `${r.wins}-${r.losses}`, buchholz: r.tiebreak, statut: r.status })) };
    }

    case 'start_playoff': {
      const s = requireState(ctx.state);
      if (!runner.canStartPlayoff(s)) throw new Error('La phase suisse n’est pas terminée.');
      const next = runner.startPlayoff(s);
      await saveState(ctx.id, next);
      return { phase: 'playoff', qualifiés: next.playoff!.participants.map((p) => p.name), next: 'playoff_matches' };
    }

    case 'playoff_matches': {
      const s = requireState(ctx.state);
      if (!s.playoff) throw new Error('Playoff non démarré.');
      return { matches: de.playableMatches(s.playoff).map((m) => ({ matchId: m.id, bracket: m.bracket, a: slotName(s, m.a), b: slotName(s, m.b) })) };
    }

    case 'record_playoff_result': {
      const s = requireState(ctx.state);
      if (!s.playoff) throw new Error('Playoff non démarré.');
      const playoff = de.recordResult(s.playoff, String(args.matchId), { a: Number(args.aScore), b: Number(args.bScore) });
      const phase = de.isComplete(playoff) ? 'done' : 'playoff';
      await saveState(ctx.id, { ...s, playoff, phase });
      const champ = de.champion(playoff);
      return { enregistré: args.matchId, score: `${args.aScore}-${args.bScore}`, terminé: phase === 'done', champion: champ ? (playoff.participants.find((p) => p.id === champ)?.name ?? champ) : null };
    }

    case 'schedule': {
      const slots = lanEtsValorantSchedule();
      return { finSamedi: saturdayEndTime(slots), sommeilMin: sleepGapMinutes(slots), blocs: slots.map((x) => ({ jour: x.day, début: x.start, fin: x.end, bloc: x.label, matchs: x.matches, stream: x.stream ?? false })) };
    }

    default:
      throw new Error(`Outil inconnu : ${name}`);
  }
}

// ─── Serveur ───────────────────────────────────────────────────────────────

const server = new Server({ name: 'valorant-lan-ets', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const result = await runTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Erreur : ${e instanceof Error ? e.message : String(e)}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
