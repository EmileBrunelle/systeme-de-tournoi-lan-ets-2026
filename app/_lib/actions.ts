'use server';

import { revalidatePath } from 'next/cache';
import type { Participant } from '@/lib/domain/types';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import * as se from '@/lib/formats/single-elimination';
import * as ta from '@/lib/formats/time-attack';
import * as cup from '@/lib/formats/cup';
import * as runner from '@/lib/runtime/runner';
import { averageRank } from '@/lib/valorant/rank';
import { prisma } from './db';
import { getTournament, loadState, saveState } from './repo';
import { parseTimeToMs } from './format';

function refresh(id: string) {
  revalidatePath(`/t/${id}`);
  revalidatePath(`/t/${id}/equipe`, 'layout');
  revalidatePath(`/t/${id}/projecteur`);
  revalidatePath('/');
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

/** Construit les participants (seed aléatoire) à partir du roster présent. */
async function rosterParticipants(id: string): Promise<Participant[]> {
  const t = await getTournament(id);
  if (!t) throw new Error('Tournoi introuvable.');
  const entrants =
    t.game === 'valorant'
      ? t.teams.filter((x) => x.presence !== 'withdrawn').map((x) => ({ id: x.id, name: x.name }))
      : t.players.filter((x) => x.presence !== 'withdrawn').map((x) => ({ id: x.id, name: x.name }));
  return shuffled(entrants).map((p, i) => ({ id: p.id, name: p.name, seed: i + 1 }));
}

// ─── Roster ──────────────────────────────────────────────────────────────────

export async function addPlayer(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.player.create({ data: { tournamentId: id, name: trimmed } });
  refresh(id);
}

export async function removePlayer(id: string, playerId: string) {
  await prisma.player.delete({ where: { id: playerId } });
  refresh(id);
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
  refresh(id);
}

export async function cyclePlayerPresence(id: string, playerId: string) {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return;
  await prisma.player.update({
    where: { id: playerId },
    data: { presence: PRESENCE_CYCLE[player.presence] ?? 'unconfirmed' },
  });
  refresh(id);
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

export async function startTournament(id: string, playoffSize?: number) {
  const t = await getTournament(id);
  if (!t) throw new Error('Tournoi introuvable.');
  const participants = await rosterParticipants(id);
  if (participants.length < 2) throw new Error('Au moins 2 participants requis.');

  let state: runner.RunnerState;
  if (t.game === 'valorant') {
    state = runner.startValorant(participants, playoffSize ?? runner.DEFAULT_PLAYOFF_SIZE);
  } else if (t.game === 'geoguessr') {
    state = runner.startGeoguessr(participants);
  } else {
    state = runner.startTrackmania(participants);
  }
  await saveState(id, state);
  refresh(id);
}

/** Remet le tournoi à zéro (efface l'état du moteur, garde le roster). */
export async function resetTournament(id: string) {
  await prisma.tournament.update({ where: { id }, data: { stateJson: null } });
  refresh(id);
}

// ─── Valorant : suisse ─────────────────────────────────────────────────────────

export async function generateSwissRound(id: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.generateNextRound(state.swiss) };
  await saveState(id, next);
  refresh(id);
}

export async function recordSwissResult(id: string, matchId: string, home: number, away: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État suisse invalide.');
  const next = { ...state, swiss: swiss.recordResult(state.swiss, matchId, { home, away }) };
  await saveState(id, next);
  refresh(id);
}

export async function startPlayoff(id: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant') throw new Error('État Valorant invalide.');
  if (!runner.canStartPlayoff(state)) throw new Error('La phase suisse n’est pas terminée.');
  await saveState(id, runner.startPlayoff(state));
  refresh(id);
}

export async function recordPlayoffResult(id: string, matchId: string, a: number, b: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'valorant' || !state.playoff) throw new Error('État playoff invalide.');
  const playoff = de.recordResult(state.playoff, matchId, { a, b });
  const phase = de.isComplete(playoff) ? 'done' : 'playoff';
  await saveState(id, { ...state, playoff, phase });
  refresh(id);
}

// ─── GeoGuessr : élimination simple ──────────────────────────────────────────

export async function recordSeResult(id: string, matchId: string, a: number, b: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'geoguessr') throw new Error('État GeoGuessr invalide.');
  await saveState(id, { ...state, se: se.recordResult(state.se, matchId, { a, b }) });
  refresh(id);
}

// ─── TrackMania : Time Attack puis cup ───────────────────────────────────────

export async function recordTime(id: string, playerId: string, timeMs: number) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'trackmania') throw new Error('État TrackMania invalide.');
  await saveState(id, { ...state, ta: ta.recordTime(state.ta, playerId, timeMs) });
  refresh(id);
}

export async function startCup(id: string) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'trackmania') throw new Error('État TrackMania invalide.');
  if (!runner.canStartCup(state)) throw new Error('La Time Attack n’est pas terminée.');
  await saveState(id, runner.startCup(state));
  refresh(id);
}

export async function recordRace(id: string, round: number, order: string[]) {
  const t = await getTournament(id);
  const state = t && loadState(t);
  if (!state || state.game !== 'trackmania' || !state.cup) throw new Error('État cup invalide.');
  const cupState = cup.recordRace(state.cup, round, order);
  const phase = cup.isComplete(cupState) ? 'done' : 'cup';
  await saveState(id, { ...state, cup: cupState, phase });
  refresh(id);
}

// ─── Variantes <form action> (lisent un FormData) ────────────────────────────
// Permettent un UI 100 % rendu serveur (pas de JS client pour la saisie).

export async function submitStart(id: string, formData: FormData) {
  const size = Number(formData.get('playoffSize'));
  await startTournament(id, Number.isFinite(size) && size > 0 ? size : undefined);
}

export async function submitAddPlayer(id: string, formData: FormData) {
  await addPlayer(id, String(formData.get('name') ?? ''));
}

export async function submitSwissResult(id: string, matchId: string, formData: FormData) {
  await recordSwissResult(id, matchId, Number(formData.get('home')), Number(formData.get('away')));
}

export async function submitPlayoffResult(id: string, matchId: string, formData: FormData) {
  await recordPlayoffResult(id, matchId, Number(formData.get('a')), Number(formData.get('b')));
}

export async function submitSeResult(id: string, matchId: string, formData: FormData) {
  await recordSeResult(id, matchId, Number(formData.get('a')), Number(formData.get('b')));
}

export async function submitTime(id: string, playerId: string, formData: FormData) {
  const raw = String(formData.get('time') ?? '').trim();
  const ms = parseTimeToMs(raw);
  if (ms !== null) await recordTime(id, playerId, ms);
}

export async function submitRace(id: string, round: number, count: number, formData: FormData) {
  const order: string[] = [];
  for (let pos = 1; pos <= count; pos++) {
    const pid = String(formData.get(`pos${pos}`) ?? '');
    if (pid) order.push(pid);
  }
  await recordRace(id, round, order);
}

// ─── Gestion des équipes Valorant (CRUD) ─────────────────────────────────────

export async function addTeam(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await assertNotStarted(id);
  await prisma.team.create({ data: { tournamentId: id, name: trimmed } });
  refresh(id);
}

export async function renameTeam(id: string, teamId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  // Renommer reste permis même après démarrage (cosmétique côté base).
  await prisma.team.update({ where: { id: teamId }, data: { name: trimmed } });
  refresh(id);
}

export async function deleteTeam(id: string, teamId: string) {
  await assertNotStarted(id);
  await prisma.team.delete({ where: { id: teamId } });
  refresh(id);
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
  refresh(id);
}

export async function updateMember(id: string, teamId: string, memberId: string, formData: FormData) {
  const data = readMember(formData);
  if (!data.username) return;
  await prisma.member.update({ where: { id: memberId }, data });
  await recomputeAvgRank(teamId);
  refresh(id);
}

export async function deleteMember(id: string, teamId: string, memberId: string) {
  await prisma.member.delete({ where: { id: memberId } });
  await recomputeAvgRank(teamId);
  refresh(id);
}

// ─── Variantes <form action> pour les équipes ────────────────────────────────

export async function submitAddTeam(id: string, formData: FormData) {
  await addTeam(id, String(formData.get('name') ?? ''));
}

export async function submitRenameTeam(id: string, teamId: string, formData: FormData) {
  await renameTeam(id, teamId, String(formData.get('name') ?? ''));
}
