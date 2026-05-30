'use server';

import { revalidatePath } from 'next/cache';
import type { Participant } from '@/lib/domain/types';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import * as runner from '@/lib/runtime/runner';
import { averageRank } from '@/lib/valorant/rank';
import { prisma } from './db';
import { getTournament, loadState, saveState } from './repo';

function refresh() {
  revalidatePath('/', 'layout');
  revalidatePath('/equipes');
  revalidatePath('/projecteur');
}

/** Empêche les modifications structurelles (ajout/suppression d'équipe) une
 *  fois le tournoi démarré : le bracket utilise un instantané du roster. */
async function assertNotStarted(id: string) {
  const t = await prisma.tournament.findUnique({ where: { id }, select: { stateJson: true } });
  if (t?.stateJson) {
    throw new Error('Tournoi déjà démarré : structure des équipes verrouillée.');
  }
}

/** Recalcule le rang moyen d'une équipe à partir des titulaires (non-remplaçants). */
async function recomputeAvgRank(teamId: string) {
  const members = await prisma.member.findMany({
    where: { teamId, isSub: false },
    select: { rank: true },
  });
  const avgRank = averageRank(members.map((m) => m.rank));
  await prisma.team.update({ where: { id: teamId }, data: { avgRank } });
}

/** Mélange Fisher-Yates : seeding aléatoire (demandé pour Valorant). */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Construit les participants Valorant (seed aléatoire) à partir des équipes présentes. */
async function rosterParticipants(id: string): Promise<Participant[]> {
  const t = await getTournament(id);
  if (!t) throw new Error('Tournoi introuvable.');
  const entrants = t.teams.filter((x) => x.presence !== 'withdrawn').map((x) => ({ id: x.id, name: x.name }));
  return shuffled(entrants).map((p, i) => ({ id: p.id, name: p.name, seed: i + 1 }));
}

const PRESENCE_CYCLE: Record<string, string> = {
  unconfirmed: 'confirmed',
  confirmed: 'withdrawn',
  withdrawn: 'unconfirmed',
};

export async function cycleTeamPresence(id: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return;
  await prisma.team.update({
    where: { id: teamId },
    data: { presence: PRESENCE_CYCLE[team.presence] ?? 'unconfirmed' },
  });
  refresh();
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

export async function startTournament(id: string, playoffSize?: number) {
  const t = await getTournament(id);
  if (!t) throw new Error('Tournoi introuvable.');
  const participants = await rosterParticipants(id);
  if (participants.length < 2) throw new Error('Au moins 2 participants requis.');

  const state = runner.startValorant(participants, playoffSize ?? runner.DEFAULT_PLAYOFF_SIZE);
  await saveState(id, state);
  refresh();
}

/** Remet le tournoi à zéro (efface l'état du moteur, garde le roster). */
export async function resetTournament(id: string) {
  await prisma.tournament.update({ where: { id }, data: { stateJson: null } });
  refresh();
}

// ─── Valorant : suisse ─────────────────────────────────────────────────────────

export async function generateSwissRound(id: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.generateNextRound(state.swiss) };
  await saveState(id, next);
  refresh();
}

export async function recordSwissResult(id: string, matchId: string, home: number, away: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.recordResult(state.swiss, matchId, { home, away }) };
  await saveState(id, next);
  refresh();
}

/** Forfait d'une manche suisse : l'adversaire l'emporte, le concédant reste en lice. */
export async function concedeSwissMatch(id: string, matchId: string, forfeitingId: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.concedeMatch(state.swiss, matchId, forfeitingId) };
  await saveState(id, next);
  refresh();
}

/** Retrait d'une équipe du tournoi suisse : éliminée + match en cours concédé. */
export async function withdrawTeam(id: string, participantId: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.withdraw(state.swiss, participantId) };
  await saveState(id, next);
  refresh();
}

export async function startPlayoff(id: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État Valorant invalide.');
  if (!runner.canStartPlayoff(state)) throw new Error('La phase suisse n’est pas terminée.');
  await saveState(id, runner.startPlayoff(state));
  refresh();
}

export async function recordPlayoffResult(id: string, matchId: string, a: number, b: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant' || !state.playoff) throw new Error('État playoff invalide.');
  const playoff = de.recordResult(state.playoff, matchId, { a, b });
  const phase = de.isComplete(playoff) ? 'done' : 'playoff';
  await saveState(id, { ...state, playoff, phase });
  refresh();
}

/** Forfait d'un match playoff : le côté indiqué l'emporte par forfait (13-0). */
export async function concedePlayoffMatch(id: string, matchId: string, winner: 'a' | 'b') {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant' || !state.playoff) throw new Error('État playoff invalide.');
  const score = winner === 'a' ? { a: 13, b: 0 } : { a: 0, b: 13 };
  const playoff = de.recordResult(state.playoff, matchId, score);
  const phase = de.isComplete(playoff) ? 'done' : 'playoff';
  await saveState(id, { ...state, playoff, phase });
  refresh();
}

// ─── Variantes <form action> (lisent un FormData) ────────────────────────────
// Permettent un UI 100 % rendu serveur (pas de JS client pour la saisie).

export async function submitStart(id: string, formData: FormData) {
  const size = Number(formData.get('playoffSize'));
  await startTournament(id, Number.isFinite(size) && size > 0 ? size : undefined);
}

export async function submitSwissResult(id: string, matchId: string, formData: FormData) {
  await recordSwissResult(id, matchId, Number(formData.get('home')), Number(formData.get('away')));
}

export async function submitPlayoffResult(id: string, matchId: string, formData: FormData) {
  await recordPlayoffResult(id, matchId, Number(formData.get('a')), Number(formData.get('b')));
}

// ─── Gestion des équipes Valorant (CRUD) ─────────────────────────────────────

export async function addTeam(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await assertNotStarted(id);
  await prisma.team.create({ data: { tournamentId: id, name: trimmed } });
  refresh();
}

export async function renameTeam(id: string, teamId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  // Renommer reste permis même après démarrage (cosmétique côté base).
  await prisma.team.update({ where: { id: teamId }, data: { name: trimmed } });
  refresh();
}

export async function deleteTeam(id: string, teamId: string) {
  await assertNotStarted(id);
  await prisma.team.delete({ where: { id: teamId } });
  refresh();
}

// ─── Gestion des membres d'une équipe ────────────────────────────────────────

interface MemberInput {
  username: string;
  email: string | null;
  identifier: string | null;
  rank: string | null;
  seat: string | null;
  isSub: boolean;
}

function readMember(formData: FormData): MemberInput {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v.length ? v : null;
  };
  const rank = str('rank');
  return {
    username: String(formData.get('username') ?? '').trim(),
    email: str('email'),
    identifier: str('identifier'),
    rank: rank === 'none' ? null : rank, // "none" = sentinel du Select shadcn
    seat: str('seat'),
    isSub: formData.get('role') === 'sub',
  };
}

export async function addMember(id: string, teamId: string, formData: FormData) {
  const data = readMember(formData);
  if (!data.username) return;
  await prisma.member.create({ data: { teamId, ...data } });
  await recomputeAvgRank(teamId);
  refresh();
}

export async function updateMember(id: string, teamId: string, memberId: string, formData: FormData) {
  const data = readMember(formData);
  if (!data.username) return;
  await prisma.member.update({ where: { id: memberId }, data });
  await recomputeAvgRank(teamId);
  refresh();
}

export async function deleteMember(id: string, teamId: string, memberId: string) {
  await prisma.member.delete({ where: { id: memberId } });
  await recomputeAvgRank(teamId);
  refresh();
}

// ─── Variantes <form action> pour les équipes ────────────────────────────────

export async function submitAddTeam(id: string, formData: FormData) {
  await addTeam(id, String(formData.get('name') ?? ''));
}

export async function submitRenameTeam(id: string, teamId: string, formData: FormData) {
  await renameTeam(id, teamId, String(formData.get('name') ?? ''));
}
