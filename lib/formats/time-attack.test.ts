// lib/formats/time-attack.test.ts
import { describe, it, expect } from 'vitest';
import type { Participant } from '../domain/types';
import {
  createTimeAttack,
  recordTime,
  standings,
  isComplete,
  seedingOrder,
} from './time-attack';

/** Helper: create n participants with id='pK', name='PK', seed=K (1-based). */
function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    seed: i + 1,
  }));
}

describe('createTimeAttack', () => {
  it('initializes bestMs to null for every participant', () => {
    const ps = mkParticipants(3);
    const state = createTimeAttack(ps);
    expect(state.participants).toHaveLength(3);
    expect(state.bestMs['p1']).toBeNull();
    expect(state.bestMs['p2']).toBeNull();
    expect(state.bestMs['p3']).toBeNull();
  });
});

describe('standings — ranking by time', () => {
  it('ranks by ascending time (fastest gets rank 1)', () => {
    const ps = mkParticipants(3);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 90_000);
    state = recordTime(state, 'p2', 80_000);
    state = recordTime(state, 'p3', 95_000);

    const result = standings(state);
    expect(result[0].participantId).toBe('p2'); // 80s fastest
    expect(result[0].rank).toBe(1);
    expect(result[1].participantId).toBe('p1'); // 90s
    expect(result[1].rank).toBe(2);
    expect(result[2].participantId).toBe('p3'); // 95s slowest
    expect(result[2].rank).toBe(3);
  });

  it('breaks ties on time by lower seed', () => {
    const ps = mkParticipants(3);
    let state = createTimeAttack(ps);
    // p1 (seed 1) and p3 (seed 3) have the same time; p2 is slower
    state = recordTime(state, 'p1', 75_000);
    state = recordTime(state, 'p2', 80_000);
    state = recordTime(state, 'p3', 75_000);

    const result = standings(state);
    expect(result[0].participantId).toBe('p1'); // seed 1 wins tiebreak
    expect(result[0].rank).toBe(1);
    expect(result[1].participantId).toBe('p3'); // seed 3
    expect(result[1].rank).toBe(2);
    expect(result[2].participantId).toBe('p2');
    expect(result[2].rank).toBe(3);
  });

  it('participants with no time recorded are ranked last', () => {
    const ps = mkParticipants(4);
    let state = createTimeAttack(ps);
    // p2 and p4 have no time; p1 and p3 do
    state = recordTime(state, 'p1', 60_000);
    state = recordTime(state, 'p3', 55_000);

    const result = standings(state);
    // p3 fastest (55s), then p1 (60s), then p2 and p4 (no time, sorted by seed)
    expect(result[0].participantId).toBe('p3');
    expect(result[1].participantId).toBe('p1');
    expect(result[2].participantId).toBe('p2');
    expect(result[2].bestMs).toBeNull();
    expect(result[3].participantId).toBe('p4');
    expect(result[3].bestMs).toBeNull();
    // All ranked 1..4
    expect(result.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('recordTime — best-time logic', () => {
  it('recording a slower time does not replace the existing best', () => {
    const ps = mkParticipants(1);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 70_000);
    state = recordTime(state, 'p1', 90_000); // slower
    expect(state.bestMs['p1']).toBe(70_000);
  });

  it('recording a faster time updates the best', () => {
    const ps = mkParticipants(1);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 70_000);
    state = recordTime(state, 'p1', 65_000); // faster
    expect(state.bestMs['p1']).toBe(65_000);
  });
});

describe('recordTime — immutability', () => {
  it('does not mutate the input state', () => {
    const ps = mkParticipants(2);
    const original = createTimeAttack(ps);
    const before = { ...original.bestMs };
    recordTime(original, 'p1', 80_000);
    // original state must be unchanged
    expect(original.bestMs['p1']).toBeNull();
    expect(original.bestMs).toEqual(before);
  });
});

describe('recordTime — error handling', () => {
  it('throws on unknown participant id', () => {
    const ps = mkParticipants(2);
    const state = createTimeAttack(ps);
    expect(() => recordTime(state, 'p99', 60_000)).toThrow();
  });

  it('throws on non-positive time (zero)', () => {
    const ps = mkParticipants(1);
    const state = createTimeAttack(ps);
    expect(() => recordTime(state, 'p1', 0)).toThrow();
  });

  it('throws on negative time', () => {
    const ps = mkParticipants(1);
    const state = createTimeAttack(ps);
    expect(() => recordTime(state, 'p1', -500)).toThrow();
  });

  it('throws on non-finite time (Infinity)', () => {
    const ps = mkParticipants(1);
    const state = createTimeAttack(ps);
    expect(() => recordTime(state, 'p1', Infinity)).toThrow();
  });

  it('throws on NaN time', () => {
    const ps = mkParticipants(1);
    const state = createTimeAttack(ps);
    expect(() => recordTime(state, 'p1', NaN)).toThrow();
  });
});

describe('isComplete', () => {
  it('returns false when no participant has a time', () => {
    const ps = mkParticipants(3);
    const state = createTimeAttack(ps);
    expect(isComplete(state)).toBe(false);
  });

  it('returns false when only some participants have a time', () => {
    const ps = mkParticipants(3);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 60_000);
    state = recordTime(state, 'p2', 65_000);
    expect(isComplete(state)).toBe(false);
  });

  it('returns true once all participants have a time', () => {
    const ps = mkParticipants(3);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 60_000);
    state = recordTime(state, 'p2', 65_000);
    state = recordTime(state, 'p3', 70_000);
    expect(isComplete(state)).toBe(true);
  });
});

describe('seedingOrder', () => {
  it('returns participant ids in rank order (fastest first)', () => {
    const ps = mkParticipants(4);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 80_000);
    state = recordTime(state, 'p2', 70_000);
    state = recordTime(state, 'p3', 75_000);
    state = recordTime(state, 'p4', 65_000);

    const order = seedingOrder(state);
    expect(order).toEqual(['p4', 'p2', 'p3', 'p1']);
  });

  it('matches the standings order exactly', () => {
    const ps = mkParticipants(4);
    let state = createTimeAttack(ps);
    state = recordTime(state, 'p1', 88_000);
    state = recordTime(state, 'p2', 72_000);
    state = recordTime(state, 'p3', 72_000); // tie with p2, p3 has higher seed
    // p4 has no time

    const order = seedingOrder(state);
    const standingsIds = standings(state).map((s) => s.participantId);
    expect(order).toEqual(standingsIds);
  });
});
