// lib/formats/single-elimination.test.ts
import { describe, it, expect } from 'vitest';
import type { Participant } from '../domain/types';
import {
  createSingleElim,
  recordResult,
  playableMatches,
  isComplete,
  champion,
  standings,
} from './single-elimination';

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    seed: i + 1,
  }));
}

// Helper: play a match so the given participant id wins (score 2-0 for them)
function winFor(
  state: ReturnType<typeof createSingleElim>,
  matchId: string,
  winnerId: string,
): ReturnType<typeof createSingleElim> {
  const match = state.matches.find((m) => m.id === matchId)!;
  const aIsWinner = match.a.kind === 'player' && match.a.id === winnerId;
  return recordResult(state, matchId, { a: aIsWinner ? 2 : 0, b: aIsWinner ? 0 : 2 });
}

// -------------------------------------------------------------------
// Test 1: 4 players, higher seed always wins
// -------------------------------------------------------------------
describe('4 players — higher seed wins', () => {
  it('champion is seed 1 and standings has 4 entries with rank 3 from 3rd place match', () => {
    const participants = mkParticipants(4);
    let state = createSingleElim(participants);

    // Bracket: seed order for B=4 is [1,4,2,3]
    // R1-M1: seed1 vs seed4; R1-M2: seed2 vs seed3
    // Seed 1 wins R1-M1, Seed 2 wins R1-M2
    // R2-M1 (final): seed1 vs seed2
    // THIRD-1: seed4 (loser R1-M1) vs seed3 (loser R1-M2)

    // Verify THIRD-1 match exists
    const thirdMatch = state.matches.find((m) => m.id === 'THIRD-1');
    expect(thirdMatch).toBeDefined();
    expect(thirdMatch!.bracket).toBe('third');

    // Play R1
    state = winFor(state, 'R1-M1', 'p1');
    state = winFor(state, 'R1-M2', 'p2');

    // Play THIRD-1 (before final to make sure order doesn't matter)
    state = winFor(state, 'THIRD-1', 'p3');

    // Play final
    state = winFor(state, 'R2-M1', 'p1');

    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe('p1');

    const s = standings(state);
    expect(s).toHaveLength(4);

    const ranks = s.map((x) => x.rank);
    expect(ranks).toContain(1);
    expect(ranks).toContain(2);
    expect(ranks).toContain(3);
    expect(ranks).toContain(4);

    // rank 1 = champion seed1
    expect(s.find((x) => x.rank === 1)!.participantId).toBe('p1');
    // rank 2 = finalist seed2
    expect(s.find((x) => x.rank === 2)!.participantId).toBe('p2');
    // rank 3 = winner of THIRD-1 = p3
    expect(s.find((x) => x.rank === 3)!.participantId).toBe('p3');
    // rank 4 = loser of THIRD-1 = p4
    expect(s.find((x) => x.rank === 4)!.participantId).toBe('p4');
  });
});

// -------------------------------------------------------------------
// Test 2: 8 players clean run — higher seed always wins
// -------------------------------------------------------------------
describe('8 players clean run', () => {
  it('champion is seed 1, standings has 8 entries with distinct ranks 1..8', () => {
    const participants = mkParticipants(8);
    let state = createSingleElim(participants);

    // B=8, seed order [1,8,4,5,2,7,3,6]
    // R1: M1:1v8, M2:4v5, M3:2v7, M4:3v6
    // Higher seed (lower number) wins each match
    state = winFor(state, 'R1-M1', 'p1'); // p1 vs p8
    state = winFor(state, 'R1-M2', 'p4'); // p4 vs p5
    state = winFor(state, 'R1-M3', 'p2'); // p2 vs p7
    state = winFor(state, 'R1-M4', 'p3'); // p3 vs p6

    // R2 (semis): M1: p1 vs p4, M2: p2 vs p3
    state = winFor(state, 'R2-M1', 'p1');
    state = winFor(state, 'R2-M2', 'p2');

    // THIRD-1: p4 vs p3
    state = winFor(state, 'THIRD-1', 'p3');

    // R3 (final): p1 vs p2
    state = winFor(state, 'R3-M1', 'p1');

    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe('p1');

    const s = standings(state);
    expect(s).toHaveLength(8);

    const ranks = s.map((x) => x.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(s.find((x) => x.rank === 1)!.participantId).toBe('p1');
    expect(s.find((x) => x.rank === 2)!.participantId).toBe('p2');
    expect(s.find((x) => x.rank === 3)!.participantId).toBe('p3');
    expect(s.find((x) => x.rank === 4)!.participantId).toBe('p4');
  });
});

// -------------------------------------------------------------------
// Test 3: Byes (5 players → B=8)
// -------------------------------------------------------------------
describe('5 players with byes', () => {
  it('top seeds auto-advance R1 via byes, champion is valid, standings has 5 entries', () => {
    const participants = mkParticipants(5);
    let state = createSingleElim(participants);

    // B=8, seed order [1,8,4,5,2,7,3,6]
    // Seeds 1-5 are players; seeds 6,7,8 are byes
    // R1-M1: seed1(p1) vs seed8(bye) → p1 auto-advances
    // R1-M2: seed4(p4) vs seed5(p5) → PLAYABLE
    // R1-M3: seed2(p2) vs seed7(bye) → p2 auto-advances
    // R1-M4: seed3(p3) vs seed6(bye) → p3 auto-advances

    // Verify bye auto-advance happened: R1-M1 should have a winner already
    const r1m1 = state.matches.find((m) => m.id === 'R1-M1')!;
    expect(r1m1.winner).toBe('p1');

    // R1-M3 should also be auto-resolved
    const r1m3 = state.matches.find((m) => m.id === 'R1-M3')!;
    expect(r1m3.winner).toBe('p2');

    // R1-M4 should also be auto-resolved
    const r1m4 = state.matches.find((m) => m.id === 'R1-M4')!;
    expect(r1m4.winner).toBe('p3');

    // Only R1-M2 is playable in round 1
    const r1Playable = playableMatches(state).filter((m) => m.round === 1);
    expect(r1Playable).toHaveLength(1);
    expect(r1Playable[0].id).toBe('R1-M2');

    // Play R1-M2: p4 wins
    state = winFor(state, 'R1-M2', 'p4');

    // After R1: R2-M1: p1 vs p4 (playable), R2-M2: p2 vs p3 (playable)
    const r2Playable = playableMatches(state).filter((m) => m.round === 2);
    expect(r2Playable).toHaveLength(2);

    // Semis: p1 wins M1, p2 wins M2
    state = winFor(state, 'R2-M1', 'p1');
    state = winFor(state, 'R2-M2', 'p2');

    // THIRD-1: p4 vs p3 → semifinal losers
    // Play final
    state = winFor(state, 'R3-M1', 'p1');
    state = winFor(state, 'THIRD-1', 'p3');

    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe('p1');

    const s = standings(state);
    expect(s).toHaveLength(5);

    const ranks = s.map((x) => x.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);

    expect(s.find((x) => x.rank === 1)!.participantId).toBe('p1');
    expect(s.find((x) => x.rank === 2)!.participantId).toBe('p2');
    expect(s.find((x) => x.rank === 3)!.participantId).toBe('p3');
    expect(s.find((x) => x.rank === 4)!.participantId).toBe('p4');
    expect(s.find((x) => x.rank === 5)!.participantId).toBe('p5');
  });
});

// -------------------------------------------------------------------
// Test 4: thirdPlaceMatch: false
// -------------------------------------------------------------------
describe('thirdPlaceMatch: false', () => {
  it('no third match created; standings still ranks everyone', () => {
    const participants = mkParticipants(4);
    let state = createSingleElim(participants, { thirdPlaceMatch: false });

    expect(state.thirdPlaceMatch).toBe(false);
    const thirdMatch = state.matches.find((m) => m.bracket === 'third');
    expect(thirdMatch).toBeUndefined();

    // Play R1
    state = winFor(state, 'R1-M1', 'p1');
    state = winFor(state, 'R1-M2', 'p2');

    // Play final
    state = winFor(state, 'R2-M1', 'p1');

    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe('p1');

    const s = standings(state);
    expect(s).toHaveLength(4);

    const ranks = s.map((x) => x.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);

    // rank 3 and rank 4 by semifinal loss + seed tiebreak
    expect(s.find((x) => x.rank === 1)!.participantId).toBe('p1');
    expect(s.find((x) => x.rank === 2)!.participantId).toBe('p2');
    // p3 (seed 3) and p4 (seed 4) lost in semis — lower seed = better rank
    expect(s.find((x) => x.rank === 3)!.participantId).toBe('p3');
    expect(s.find((x) => x.rank === 4)!.participantId).toBe('p4');
  });
});

// -------------------------------------------------------------------
// Test 5: immutability
// -------------------------------------------------------------------
describe('immutability', () => {
  it('recordResult does not mutate the input state', () => {
    const participants = mkParticipants(4);
    const state = createSingleElim(participants);

    // Capture deep snapshot
    const matchesBefore = JSON.stringify(state.matches);
    const participantsBefore = JSON.stringify(state.participants);

    // Record a result
    recordResult(state, 'R1-M1', { a: 2, b: 0 });

    // Input state must not be changed
    expect(JSON.stringify(state.matches)).toBe(matchesBefore);
    expect(JSON.stringify(state.participants)).toBe(participantsBefore);
  });
});

// -------------------------------------------------------------------
// Test 6: recordResult throws on unknown id and bye/tbd slot
// -------------------------------------------------------------------
describe('recordResult error handling', () => {
  it('throws on unknown match id', () => {
    const state = createSingleElim(mkParticipants(4));
    expect(() => recordResult(state, 'R99-M99', { a: 1, b: 0 })).toThrow();
  });

  it('throws when trying to record result on a bye slot match', () => {
    // 3 players, B=4: seed order [1,4,2,3]; seed4 is bye
    // R1-M1: seed1 vs bye → already auto-resolved
    const state = createSingleElim(mkParticipants(3));
    // R1-M1 already has a winner; recording again should throw
    expect(() => recordResult(state, 'R1-M1', { a: 2, b: 0 })).toThrow();
  });

  it('throws when a slot is tbd (not yet determined)', () => {
    // In a fresh 4-player bracket, R2-M1 has tbd slots
    const state = createSingleElim(mkParticipants(4));
    expect(() => recordResult(state, 'R2-M1', { a: 2, b: 0 })).toThrow();
  });
});
