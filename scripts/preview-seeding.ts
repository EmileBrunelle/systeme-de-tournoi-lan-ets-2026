/**
 * LECTURE SEULE — garde-fou avant de générer le playoff.
 * Affiche côte à côte l'ancien seeding (ordre du classement, record-roi) et le
 * nouveau (difficulté du calendrier), avec les métriques, sur les vraies données.
 * N'écrit RIEN.
 *
 *   DATABASE_URL="file:./dev.db" npx tsx scripts/preview-seeding.ts
 */
import { PrismaClient } from '@prisma/client';
import * as runner from '../lib/runtime/runner';
import * as swiss from '../lib/formats/swiss';

const prisma = new PrismaClient();

// Appariements premier tour d'un bracket double-élim seedé 1..8 : 1v8,4v5,2v7,3v6.
const FIRST_ROUND_8 = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
];

async function main() {
  const t = await prisma.tournament.findFirst({ where: { game: 'valorant' } });
  if (!t?.stateJson) throw new Error('État Valorant introuvable.');
  const state = JSON.parse(t.stateJson) as runner.ValorantState;
  const sw = state.swiss;
  const n = state.playoffSize;

  const nameOf = (id: string) => sw.participants.find((p) => p.id === id)?.name ?? id;
  const seedOf = (id: string) => sw.participants.find((p) => p.id === id)?.seed ?? 0;

  const line = (id: string, rank: number) => {
    const r = sw.records[id];
    const avg = swiss.avgOpponentWins(sw, id);
    const rd = swiss.roundDiff(sw, id);
    const score = 2 * avg - r.losses; // SCHEDULE_WEIGHT × cal.moy − défaites
    return `  ${String(rank).padStart(2)}. ${nameOf(id).padEnd(26)} ${r.wins}-${r.losses}  ` +
      `cal.moy ${avg.toFixed(2)}  diffManches ${rd >= 0 ? '+' : ''}${rd}  score ${score.toFixed(2)}  seedInit ${seedOf(id)}`;
  };

  const ancien = swiss.standings(sw).slice(0, n).map((s) => s.participantId);
  const nouveau = swiss.playoffSeeding(sw, n).map((s) => s.participantId);

  console.log(`\n=== ANCIEN seeding (classement suisse : victoires → moins de défaites → buchholz) ===`);
  ancien.forEach((id, i) => console.log(line(id, i + 1)));

  console.log(`\n=== NOUVEAU seeding (score borné : 2×cal.moy − défaites → diff de manches → seed initial) ===`);
  nouveau.forEach((id, i) => console.log(line(id, i + 1)));

  const moved = nouveau
    .map((id, i) => ({ id, was: ancien.indexOf(id) + 1, now: i + 1 }))
    .filter((x) => x.was !== x.now);
  console.log(`\n=== Mouvements ===`);
  if (moved.length === 0) console.log('  Aucun — les deux ordres sont identiques.');
  else moved.forEach((m) => console.log(`  ${nameOf(m.id)} : seed ${m.was} → ${m.now}`));

  const bracket = (order: string[]) =>
    FIRST_ROUND_8.map(([a, b]) => `  ${a}v${b}: ${nameOf(order[a - 1])}  vs  ${nameOf(order[b - 1])}`).join('\n');
  console.log(`\n=== Braquette 1er tour — ANCIEN ===\n${bracket(ancien)}`);
  console.log(`\n=== Braquette 1er tour — NOUVEAU ===\n${bracket(nouveau)}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
