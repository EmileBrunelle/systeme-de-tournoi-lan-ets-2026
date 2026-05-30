// lib/formats/single-elimination.ts
import type { Participant, ParticipantId } from '../domain/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SESlot =
  | { kind: 'tbd' }
  | { kind: 'bye' }
  | { kind: 'player'; id: ParticipantId };

export interface SEMatch {
  id: string;
  /** 'main' = KO bracket; 'third' = 3rd-place match */
  bracket: 'main' | 'third';
  round: number;
  a: SESlot;
  b: SESlot;
  score: { a: number; b: number } | null;
  winner: ParticipantId | null;
}

export interface SEState {
  participants: Participant[];
  matches: SEMatch[];
  thirdPlaceMatch: boolean;
}

export interface SEConfig {
  thirdPlaceMatch?: boolean;
}

export interface SEStanding {
  participantId: ParticipantId;
  name: string;
  rank: number;
}

// ---------------------------------------------------------------------------
// Seeding helpers
// ---------------------------------------------------------------------------

/** Returns the seed order array for a bracket of size B (must be power of 2). */
function seedOrder(b: number): number[] {
  if (b === 2) return [1, 2];
  const half = b / 2;
  const prev = seedOrder(half);
  const result: number[] = [];
  for (const s of prev) {
    result.push(s);
    result.push(b + 1 - s);
  }
  return result;
}

/** Smallest power of two >= n. */
function nextPow2(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

// ---------------------------------------------------------------------------
// Deep clone
// ---------------------------------------------------------------------------

function cloneSlot(s: SESlot): SESlot {
  if (s.kind === 'player') return { kind: 'player', id: s.id };
  return { kind: s.kind };
}

function cloneMatch(m: SEMatch): SEMatch {
  return {
    ...m,
    a: cloneSlot(m.a),
    b: cloneSlot(m.b),
    score: m.score ? { ...m.score } : null,
  };
}

function cloneState(state: SEState): SEState {
  return {
    ...state,
    participants: state.participants.map((p) => ({ ...p })),
    matches: state.matches.map(cloneMatch),
  };
}

// ---------------------------------------------------------------------------
// Bye cascade
// ---------------------------------------------------------------------------

/**
 * Run the bye/auto-advance cascade until stable.
 * For each match where both slots are non-tbd:
 *   - player + bye (or bye + player) → player auto-advances; winner set; propagate to next.
 *   - bye + bye → winner stays null, propagate bye onward.
 *   - player + player → nothing (must be played).
 *
 * After deciding a main match, if it has a "next slot" feed it.
 * Also feed the 3rd-place match when a semifinal is decided (winner or bye).
 */
function runCascade(state: SEState): SEState {
  let changed = true;
  while (changed) {
    changed = false;

    for (const match of state.matches) {
      // Skip already-decided matches (winner set, or bye+bye sentinel score)
      if (match.winner !== null) continue;
      if (match.score !== null) continue; // bye+bye sentinel
      if (match.a.kind === 'tbd' || match.b.kind === 'tbd') continue;

      const aIsBye = match.a.kind === 'bye';
      const bIsBye = match.b.kind === 'bye';

      if (!aIsBye && !bIsBye) continue; // real match — must be played manually

      let winnerSlot: SESlot;
      let loserSlot: SESlot;

      if (!aIsBye && bIsBye) {
        // a is a player, b is bye → player wins, loser is the bye
        const playerId = (match.a as { kind: 'player'; id: ParticipantId }).id;
        match.winner = playerId;
        winnerSlot = { kind: 'player', id: playerId };
        loserSlot = { kind: 'bye' };
      } else if (aIsBye && !bIsBye) {
        // b is a player, a is bye → player wins
        const playerId = (match.b as { kind: 'player'; id: ParticipantId }).id;
        match.winner = playerId;
        winnerSlot = { kind: 'player', id: playerId };
        loserSlot = { kind: 'bye' };
      } else {
        // both bye → bye propagates; use sentinel score to prevent re-visiting
        match.score = { a: 0, b: 0 };
        winnerSlot = { kind: 'bye' };
        loserSlot = { kind: 'bye' };
      }

      if (match.bracket === 'main') {
        propagateWinner(state, match, winnerSlot);
        propagateLoser(state, match, loserSlot);
      }

      changed = true;
    }
  }
  return state;
}

/**
 * Get the "next main slot" a match winner feeds into.
 * Returns {matchId, side:'a'|'b'} or null if it's the final.
 */
function nextSlot(
  match: SEMatch,
  allMatches: SEMatch[],
): { matchId: string; side: 'a' | 'b' } | null {
  if (match.bracket !== 'main') return null;

  // Parse round and match index from id like "R{r}-M{i}"
  const m = match.id.match(/^R(\d+)-M(\d+)$/);
  if (!m) return null;
  const r = parseInt(m[1], 10);
  const i = parseInt(m[2], 10);

  const nextRound = r + 1;
  const nextMatchNo = Math.ceil(i / 2);
  const nextId = `R${nextRound}-M${nextMatchNo}`;
  const nextMatch = allMatches.find((x) => x.id === nextId);
  if (!nextMatch) return null;

  const side: 'a' | 'b' = i % 2 === 1 ? 'a' : 'b';
  return { matchId: nextId, side };
}

/** Feed winner of a match into the next bracket slot. */
function propagateWinner(state: SEState, match: SEMatch, winnerSlot: SESlot): void {
  const next = nextSlot(match, state.matches);
  if (!next) return;
  const target = state.matches.find((x) => x.id === next.matchId)!;
  if (next.side === 'a') target.a = cloneSlot(winnerSlot);
  else target.b = cloneSlot(winnerSlot);
}

/** Feed loser of a main match into the 3rd-place match (if applicable). */
function propagateLoser(state: SEState, match: SEMatch, loserSlot: SESlot): void {
  if (!state.thirdPlaceMatch) return;
  if (match.bracket !== 'main') return;

  // Determine if this match is a semifinal (the 3rd-place match consumes semifinal losers)
  const thirdMatch = state.matches.find((x) => x.id === 'THIRD-1');
  if (!thirdMatch) return;

  // Parse match id
  const m = match.id.match(/^R(\d+)-M(\d+)$/);
  if (!m) return;
  const r = parseInt(m[1], 10);
  const i = parseInt(m[2], 10);

  // Compute k (number of rounds)
  const B = nextPow2(state.participants.length === 0 ? 1 : state.participants.length);
  const k = Math.log2(B);

  // Semifinals are round k-1, and there are exactly 2 of them (M1 and M2)
  if (r !== k - 1) return;
  if (i === 1) thirdMatch.a = cloneSlot(loserSlot);
  else if (i === 2) thirdMatch.b = cloneSlot(loserSlot);
}

// ---------------------------------------------------------------------------
// createSingleElim
// ---------------------------------------------------------------------------

export function createSingleElim(participants: Participant[], config?: SEConfig): SEState {
  const thirdPlaceMatch = config?.thirdPlaceMatch ?? true;

  const N = participants.length;
  if (N < 2) throw new Error('Need at least 2 participants');

  const B = nextPow2(N);
  const k = Math.log2(B);

  // Build seeded slots
  const order = seedOrder(B);
  const slots: SESlot[] = order.map((seed) => {
    const participant = participants.find((p) => p.seed === seed);
    if (participant) return { kind: 'player', id: participant.id };
    return { kind: 'bye' };
  });

  const matches: SEMatch[] = [];

  // Build main bracket matches round by round
  for (let r = 1; r <= k; r++) {
    const matchCount = B / Math.pow(2, r);
    for (let i = 1; i <= matchCount; i++) {
      let a: SESlot;
      let b: SESlot;
      if (r === 1) {
        a = slots[2 * (i - 1)];
        b = slots[2 * (i - 1) + 1];
      } else {
        a = { kind: 'tbd' };
        b = { kind: 'tbd' };
      }
      matches.push({
        id: `R${r}-M${i}`,
        bracket: 'main',
        round: r,
        a,
        b,
        score: null,
        winner: null,
      });
    }
  }

  // Add 3rd place match if applicable (k >= 2 means there are semifinals at round k-1)
  if (thirdPlaceMatch && k >= 2) {
    matches.push({
      id: 'THIRD-1',
      bracket: 'third',
      round: k,
      a: { kind: 'tbd' },
      b: { kind: 'tbd' },
      score: null,
      winner: null,
    });
  }

  const state: SEState = {
    participants: [...participants],
    matches,
    thirdPlaceMatch,
  };

  // Run cascade to handle initial byes in R1
  return runCascade(state);
}

// ---------------------------------------------------------------------------
// recordResult
// ---------------------------------------------------------------------------

export function recordResult(
  state: SEState,
  matchId: string,
  score: { a: number; b: number },
): SEState {
  const next = cloneState(state);
  const match = next.matches.find((m) => m.id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);

  // Throw if already decided
  if (match.winner !== null) throw new Error(`Match ${matchId} is already decided`);

  // Throw if score is set (bye+bye sentinel)
  if (match.score !== null) throw new Error(`Match ${matchId} is already decided (bye)`);

  // Validate slots
  if (match.a.kind !== 'player') throw new Error(`Match ${matchId} slot A is not a player (${match.a.kind})`);
  if (match.b.kind !== 'player') throw new Error(`Match ${matchId} slot B is not a player (${match.b.kind})`);

  match.score = { ...score };
  const winnerId = score.a > score.b ? match.a.id : match.b.id;
  const loserId = score.a > score.b ? match.b.id : match.a.id;
  match.winner = winnerId;

  const winnerSlot: SESlot = { kind: 'player', id: winnerId };
  const loserSlot: SESlot = { kind: 'player', id: loserId };

  propagateWinner(next, match, winnerSlot);
  propagateLoser(next, match, loserSlot);

  return runCascade(next);
}

// ---------------------------------------------------------------------------
// playableMatches
// ---------------------------------------------------------------------------

export function playableMatches(state: SEState): SEMatch[] {
  return state.matches.filter(
    (m) => m.a.kind === 'player' && m.b.kind === 'player' && m.score === null && m.winner === null,
  );
}

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------

export function isComplete(state: SEState): boolean {
  const N = state.participants.length;
  const B = nextPow2(N);
  const k = Math.log2(B);

  const final = state.matches.find((m) => m.id === `R${k}-M1`);
  if (!final || final.winner === null) return false;

  if (state.thirdPlaceMatch) {
    const third = state.matches.find((m) => m.id === 'THIRD-1');
    if (!third) return true; // no third match (e.g. k < 2) — just need final
    // third is complete if it has a winner OR it's been resolved by bye cascade (score sentinel)
    if (third.winner === null && third.score === null) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// champion
// ---------------------------------------------------------------------------

export function champion(state: SEState): ParticipantId | null {
  const N = state.participants.length;
  const B = nextPow2(N);
  const k = Math.log2(B);

  const final = state.matches.find((m) => m.id === `R${k}-M1`);
  return final?.winner ?? null;
}

// ---------------------------------------------------------------------------
// standings
// ---------------------------------------------------------------------------

/**
 * Determine round in which each participant lost (or won the tournament).
 * Returns a map: participantId -> round lost (or k+1 for champion, k+0.5 for finalist).
 * Higher = better.
 */
export function standings(state: SEState): SEStanding[] {
  const N = state.participants.length;
  const B = nextPow2(N);
  const k = Math.log2(B);

  // Find champion and finalist
  const finalMatch = state.matches.find((m) => m.id === `R${k}-M1`);
  const championId = finalMatch?.winner ?? null;
  const finalistId = finalMatch
    ? [
        finalMatch.a.kind === 'player' ? finalMatch.a.id : null,
        finalMatch.b.kind === 'player' ? finalMatch.b.id : null,
      ].find((id) => id !== null && id !== championId) ?? null
    : null;

  // Find 3rd and 4th if 3rd-place match exists and is resolved
  let thirdId: ParticipantId | null = null;
  let fourthId: ParticipantId | null = null;
  if (state.thirdPlaceMatch) {
    const thirdMatch = state.matches.find((m) => m.id === 'THIRD-1');
    if (thirdMatch) {
      thirdId = thirdMatch.winner;
      fourthId =
        thirdMatch.winner !== null
          ? [
              thirdMatch.a.kind === 'player' ? thirdMatch.a.id : null,
              thirdMatch.b.kind === 'player' ? thirdMatch.b.id : null,
            ].find((id) => id !== null && id !== thirdId) ?? null
          : null;
    }
  }

  // For remaining participants: find the round they were eliminated in
  // A participant is eliminated when they appear as the loser of a decided match
  const eliminatedInRound = new Map<ParticipantId, number>();

  for (const match of state.matches) {
    if (match.winner === null) continue;
    if (match.bracket === 'third') continue; // handled above

    // Find loser
    const loserSlot = match.winner === (match.a.kind === 'player' ? match.a.id : null)
      ? match.b
      : match.a;

    if (loserSlot.kind === 'player') {
      eliminatedInRound.set(loserSlot.id, match.round);
    }
  }

  // Assign ranks
  const result: SEStanding[] = [];

  if (championId) {
    const p = state.participants.find((x) => x.id === championId)!;
    result.push({ participantId: championId, name: p.name, rank: 1 });
  }
  if (finalistId) {
    const p = state.participants.find((x) => x.id === finalistId)!;
    result.push({ participantId: finalistId, name: p.name, rank: 2 });
  }

  if (state.thirdPlaceMatch && thirdId !== null) {
    const p = state.participants.find((x) => x.id === thirdId)!;
    result.push({ participantId: thirdId, name: p.name, rank: 3 });
    if (fourthId !== null) {
      const p4 = state.participants.find((x) => x.id === fourthId)!;
      result.push({ participantId: fourthId, name: p4.name, rank: 4 });
    }
  }

  // Collect participants not yet assigned a rank
  const assigned = new Set(result.map((r) => r.participantId));

  // Remaining: sort by round eliminated (desc) then seed (asc)
  const remaining = state.participants
    .filter((p) => !assigned.has(p.id))
    .sort((a, b) => {
      const ra = eliminatedInRound.get(a.id) ?? 0;
      const rb = eliminatedInRound.get(b.id) ?? 0;
      if (rb !== ra) return rb - ra; // later round = better rank
      return a.seed - b.seed; // lower seed = better rank
    });

  let nextRank = result.length + 1;

  // Group remaining by same round (ties share rank bands)
  // Actually per spec: "ranks 1..N distinct, no gaps" and tied by round+seed is just ordering
  // So each gets a distinct rank
  for (const p of remaining) {
    result.push({ participantId: p.id, name: p.name, rank: nextRank });
    nextRank++;
  }

  // When thirdPlaceMatch is false, rank 3 and 4 may not be assigned yet
  // (both semifinal losers are in 'remaining', sorted by round then seed)
  // This is already handled above.

  return result.sort((a, b) => a.rank - b.rank);
}
