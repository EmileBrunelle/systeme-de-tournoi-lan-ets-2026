/**
 * Génère le playoff avec un BIAIS pré-tournoi (séparation des têtes de série).
 * Score = 2×calibre_moyen − défaites − SEED_BIAS×seed_initial.
 * « Les chiffres ne disent pas tout » : le biais remonte les fortes sur papier
 * (seed initial bas) → GRID/Garnis/XTM se retrouvent seeds 1/2/3, donc séparés
 * (GRID en haut, Garnis & XTM en bas) par le placement standard du bracket.
 *
 * ÉCRIT en DB. Backup AVANT. Garde : abandonne si un match playoff est déjà joué.
 *   DATABASE_URL="file:./dev.db" npx tsx scripts/generate-playoff-biased.ts
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import * as runner from '../lib/runtime/runner';
import * as swiss from '../lib/formats/swiss';
import * as de from '../lib/formats/double-elimination';

const SEED_BIAS = 2; // poids du seed initial (force pré-tournoi).
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.tournament.findFirst({ where: { game: 'valorant' } });
  if (!t?.stateJson) throw new Error('État Valorant introuvable.');

  const backupPath = `scripts/.backup-state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(backupPath, t.stateJson);
  console.log(`Backup état AVANT → ${backupPath}`);

  const state = JSON.parse(t.stateJson) as runner.ValorantState;
  if (state.playoff?.matches.some((m) => m.winner)) {
    throw new Error('Des résultats de playoff existent déjà — abandon (on n’écrase pas une braquette entamée).');
  }

  const sw = state.swiss;
  const n = state.playoffSize;
  const seedOf = new Map(sw.participants.map((p) => [p.id, p.seed]));
  const biased = (id: string) =>
    2 * swiss.avgOpponentWins(sw, id) - sw.records[id].losses - SEED_BIAS * (seedOf.get(id) ?? 0);

  const ordered = swiss.standings(sw).slice(0, n).sort((a, b) => {
    const d = biased(b.participantId) - biased(a.participantId);
    if (d !== 0) return d;
    const rd = swiss.roundDiff(sw, b.participantId) - swiss.roundDiff(sw, a.participantId);
    if (rd !== 0) return rd;
    return (seedOf.get(a.participantId) ?? 0) - (seedOf.get(b.participantId) ?? 0);
  });

  const participants = ordered.map((s, i) => ({ id: s.participantId, name: s.name, seed: i + 1 }));
  const next: runner.ValorantState = {
    ...state,
    phase: 'playoff',
    playoff: de.createDoubleElim(participants, { grandFinalReset: false }),
  };
  await prisma.tournament.update({ where: { id: t.id }, data: { stateJson: JSON.stringify(next) } });

  console.log('\nSeed (biais pré-tournoi appliqué) :');
  participants.forEach((p) =>
    console.log(`  ${p.seed}. ${p.name.padEnd(26)} [seedInit ${seedOf.get(p.id)}, score biaisé ${biased(p.id).toFixed(2)}]`),
  );
  console.log('');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
