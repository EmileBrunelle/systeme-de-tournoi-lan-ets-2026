/**
 * Re-seed de la phase suisse Valorant : remet la phase suisse à zéro et la
 * régénère avec le seeding par force (rangMoyen) + le pli de ronde 1
 * (groupe fort vs groupe faible). À n'utiliser qu'AVANT le premier résultat.
 *
 *   npm run reseed
 *
 * Refuse de tourner si un match suisse a déjà un score (évite d'effacer des
 * résultats réels).
 */
import { PrismaClient } from '@prisma/client';
import * as runner from '../lib/runtime/runner';
import * as swiss from '../lib/formats/swiss';
import { seedByStrength } from '../lib/valorant/seeding';

const prisma = new PrismaClient();

async function main() {
  const t = await prisma.tournament.findFirst({
    where: { game: 'valorant' },
    include: { teams: { select: { id: true, name: true, presence: true, avgRank: true } } },
  });
  if (!t) throw new Error('Tournoi Valorant introuvable.');

  // Garde-fou : ne jamais effacer des résultats déjà saisis.
  const current = t.stateJson ? (JSON.parse(t.stateJson) as runner.ValorantState) : null;
  if (current?.swiss.matches.some((m) => m.away !== null && m.score !== null)) {
    throw new Error('Des résultats suisses existent déjà — re-seed refusé.');
  }
  const playoffSize = current?.playoffSize ?? runner.DEFAULT_PLAYOFF_SIZE;

  const entrants = t.teams.filter((x) => x.presence !== 'withdrawn');
  const participants = seedByStrength(entrants);

  let state = runner.startValorant(participants, playoffSize);
  state = { ...state, swiss: swiss.generateNextRound(state.swiss) };
  await prisma.tournament.update({ where: { id: t.id }, data: { stateJson: JSON.stringify(state) } });

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? id;
  console.log(`Re-seed OK — ${entrants.length} équipes, playoff top ${playoffSize}.\n`);
  console.log('Seeding (1 = plus forte) :');
  participants.forEach((p) => {
    const team = entrants.find((e) => e.id === p.id);
    console.log(`  ${String(p.seed).padStart(2)}. ${p.name} (${team?.avgRank ?? '—'})`);
  });
  console.log('\nRonde 1 (fort vs faible) :');
  state.swiss.matches
    .filter((m) => m.round === 1)
    .forEach((m) => {
      const away = m.away ? nameOf(m.away) : 'BYE';
      console.log(`  ${m.id}: ${nameOf(m.home)} vs ${away}`);
    });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
