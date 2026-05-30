import 'server-only';
import type { Tournament } from '@prisma/client';
import { prisma } from './db';
import type { Game, RunnerState } from '@/lib/runtime/runner';

/** Les trois tournois du LAN, un par jeu. Créés à la demande s'ils manquent. */
export const GAMES: { game: Game; name: string }[] = [
  { game: 'valorant', name: 'Valorant' },
  { game: 'geoguessr', name: 'GeoGuessr' },
  { game: 'trackmania', name: 'TrackMania' },
];

/** Garantit qu'une ligne Tournament existe pour chaque jeu (idempotent). */
export async function ensureTournaments(): Promise<Tournament[]> {
  for (const { game, name } of GAMES) {
    const existing = await prisma.tournament.findFirst({ where: { game } });
    if (!existing) {
      await prisma.tournament.create({ data: { game, name, format: game } });
    }
  }
  return prisma.tournament.findMany({ orderBy: { game: 'asc' } });
}

export async function getTournament(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    include: {
      teams: { include: { members: true }, orderBy: { seed: 'asc' } },
      players: { orderBy: { seed: 'asc' } },
    },
  });
}

export type TournamentWithRoster = NonNullable<Awaited<ReturnType<typeof getTournament>>>;

/** Désérialise l'état du moteur, ou null si le tournoi n'est pas démarré. */
export function loadState(t: { stateJson: string | null }): RunnerState | null {
  if (!t.stateJson) return null;
  return JSON.parse(t.stateJson) as RunnerState;
}

/** Sérialise et persiste un nouvel état du moteur. */
export async function saveState(id: string, state: RunnerState): Promise<void> {
  await prisma.tournament.update({
    where: { id },
    data: { stateJson: JSON.stringify(state) },
  });
}
