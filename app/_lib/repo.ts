import 'server-only';
import type { Tournament } from '@prisma/client';
import { prisma } from './db';
import type { RunnerState } from '@/lib/runtime/runner';

/** LAN ÉTS : un seul tournoi, Valorant. Garanti à la demande (idempotent). */
export async function ensureValorantTournament(): Promise<Tournament> {
  const existing = await prisma.tournament.findFirst({ where: { game: 'valorant' } });
  if (existing) return existing;
  return prisma.tournament.create({ data: { game: 'valorant', name: 'Valorant', format: 'valorant' } });
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
