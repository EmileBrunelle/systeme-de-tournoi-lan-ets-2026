// lib/formats/cup.test.ts
import type { Participant } from '../domain/types';
import {
  createCup,
  recordRace,
  totalPoints,
  standings,
  isComplete,
  champion,
} from './cup';

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    seed: i + 1,
  }));
}

// ─── Test 1: points accumulate across multiple rounds ────────────────────────
describe('points accumulate across multiple rounds', () => {
  it('sums points from all run races for a participant', () => {
    const ps = mkParticipants(8);
    const state0 = createCup(ps, { rounds: 4 });

    // Round 1: p1 finishes 1st (10 pts), p2 finishes 2nd (8 pts)
    const order1 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const state1 = recordRace(state0, 1, order1);

    // Round 2: p1 finishes 2nd (8 pts), p2 finishes 1st (10 pts)
    const order2 = ['p2', 'p1', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const state2 = recordRace(state1, 2, order2);

    // p1: 10 + 8 = 18 (rounds 1 and 2, non-final)
    expect(totalPoints(state2, 'p1')).toBe(18);
    // p2: 8 + 10 = 18
    expect(totalPoints(state2, 'p2')).toBe(18);
    // p3: 6 + 6 = 12
    expect(totalPoints(state2, 'p3')).toBe(12);
  });
});

// ─── Test 2: final race points are multiplied by finalMultiplier ─────────────
describe('final race points are multiplied by finalMultiplier', () => {
  it('doubles the final race points with default multiplier of 2', () => {
    const ps = mkParticipants(4);
    // rounds=2: round 1 = normal, round 2 = final (multiplier 2)
    const state0 = createCup(ps, { rounds: 2, finalMultiplier: 2 });

    // Run round 1 (normal): p1=1st(10), p2=2nd(8), p3=3rd(6), p4=4th(5)
    const state1 = recordRace(state0, 1, ['p1', 'p2', 'p3', 'p4']);

    // Run round 2 (final): p1=1st → 10 * 2 = 20
    const state2 = recordRace(state1, 2, ['p1', 'p2', 'p3', 'p4']);

    // p1 total: 10 (round 1) + 20 (final) = 30
    expect(totalPoints(state2, 'p1')).toBe(30);
    // p2 total: 8 + 16 = 24
    expect(totalPoints(state2, 'p2')).toBe(24);
  });
});

// ─── Test 3: standings sorted by points desc, tie broken by lower seed ───────
describe('standings sorting', () => {
  it('sorts by total points descending, then lower seed on tie', () => {
    const ps = mkParticipants(4);
    // rounds=1: single final race (rounds=1, last=final)
    const state0 = createCup(ps, { rounds: 1, finalMultiplier: 1 });

    // p2 finishes 1st, p1 finishes 2nd — p2 and p1 would differ in points
    // To create a tie: use a custom pointsTable where positions 1 and 2 yield same
    const stateTied0 = createCup(ps, {
      rounds: 1,
      finalMultiplier: 1,
      pointsTable: [10, 10, 5, 5],
    });
    // p2 1st (10pts, seed 2), p1 2nd (10pts, seed 1) — tie on points → seed 1 wins
    const stateTied1 = recordRace(stateTied0, 1, ['p2', 'p1', 'p3', 'p4']);

    const s = standings(stateTied1);
    expect(s[0].participantId).toBe('p1'); // seed 1 wins tie
    expect(s[1].participantId).toBe('p2'); // seed 2 second
    expect(s[0].rank).toBe(1);
    expect(s[1].rank).toBe(2);
    expect(s[0].points).toBe(10);
    expect(s[1].points).toBe(10);

    // Also verify normal sort by points
    const stateNormal1 = recordRace(state0, 1, ['p3', 'p1', 'p2', 'p4']);
    const sNormal = standings(stateNormal1);
    expect(sNormal[0].participantId).toBe('p3'); // most points
    expect(sNormal[1].participantId).toBe('p1');
    expect(sNormal[2].participantId).toBe('p2');
    expect(sNormal[3].participantId).toBe('p4');
  });
});

// ─── Test 4: recordRace throws on invalid permutation and out-of-range round ──
describe('recordRace validation', () => {
  it('throws on missing participant id', () => {
    const ps = mkParticipants(4);
    const state = createCup(ps, { rounds: 2 });
    expect(() => recordRace(state, 1, ['p1', 'p2', 'p3'])).toThrow(); // missing p4
  });

  it('throws on extra participant id', () => {
    const ps = mkParticipants(4);
    const state = createCup(ps, { rounds: 2 });
    expect(() => recordRace(state, 1, ['p1', 'p2', 'p3', 'p4', 'p5'])).toThrow(); // extra
  });

  it('throws on duplicate participant id', () => {
    const ps = mkParticipants(4);
    const state = createCup(ps, { rounds: 2 });
    expect(() => recordRace(state, 1, ['p1', 'p1', 'p3', 'p4'])).toThrow(); // duplicate
  });

  it('throws on out-of-range round (0)', () => {
    const ps = mkParticipants(4);
    const state = createCup(ps, { rounds: 2 });
    expect(() => recordRace(state, 0, ['p1', 'p2', 'p3', 'p4'])).toThrow();
  });

  it('throws on out-of-range round (too large)', () => {
    const ps = mkParticipants(4);
    const state = createCup(ps, { rounds: 2 });
    expect(() => recordRace(state, 3, ['p1', 'p2', 'p3', 'p4'])).toThrow();
  });
});

// ─── Test 5: recordRace immutability ─────────────────────────────────────────
describe('recordRace immutability', () => {
  it('does not mutate the input state', () => {
    const ps = mkParticipants(4);
    const state0 = createCup(ps, { rounds: 2 });

    // Deep snapshot
    const originalRaces = JSON.stringify(state0.races);

    recordRace(state0, 1, ['p1', 'p2', 'p3', 'p4']);

    expect(JSON.stringify(state0.races)).toBe(originalRaces);
    expect(state0.races[0].order).toBeNull();
  });
});

// ─── Test 6: positions beyond the points table earn 0 ────────────────────────
describe('positions beyond points table earn 0', () => {
  it('gives 0 points to positions past the table length', () => {
    const ps = mkParticipants(10);
    // default table has 8 entries; positions 9 and 10 → 0
    const state0 = createCup(ps, { rounds: 1, finalMultiplier: 1 });
    const order = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
    const state1 = recordRace(state0, 1, order);

    expect(totalPoints(state1, 'p9')).toBe(0);
    expect(totalPoints(state1, 'p10')).toBe(0);
    expect(totalPoints(state1, 'p8')).toBe(1); // 8th place = 1 pt
  });
});

// ─── Test 7: isComplete and champion ─────────────────────────────────────────
describe('isComplete and champion', () => {
  it('isComplete is false until all races are run', () => {
    const ps = mkParticipants(4);
    const state0 = createCup(ps, { rounds: 3 });
    expect(isComplete(state0)).toBe(false);
    expect(champion(state0)).toBeNull();

    const state1 = recordRace(state0, 1, ['p1', 'p2', 'p3', 'p4']);
    expect(isComplete(state1)).toBe(false);
    expect(champion(state1)).toBeNull();

    const state2 = recordRace(state1, 2, ['p2', 'p1', 'p3', 'p4']);
    expect(isComplete(state2)).toBe(false);
    expect(champion(state2)).toBeNull();

    const state3 = recordRace(state2, 3, ['p1', 'p2', 'p3', 'p4']);
    expect(isComplete(state3)).toBe(true);
    // p1: 10+8+10*2=38, p2: 8+10+8*2=34 — p1 is champion
    expect(champion(state3)).toBe('p1');
  });
});

// ─── Test 8: custom config ────────────────────────────────────────────────────
describe('custom config is respected', () => {
  it('uses custom rounds, pointsTable, and finalMultiplier', () => {
    const ps = mkParticipants(3);
    const state0 = createCup(ps, {
      rounds: 2,
      pointsTable: [100, 50, 25],
      finalMultiplier: 3,
    });

    expect(state0.rounds).toBe(2);
    expect(state0.pointsTable).toEqual([100, 50, 25]);
    expect(state0.finalMultiplier).toBe(3);
    expect(state0.races.length).toBe(2);
    expect(state0.races[0].isFinal).toBe(false);
    expect(state0.races[1].isFinal).toBe(true);

    // Run round 1 (normal): p1 1st → 100 pts
    const state1 = recordRace(state0, 1, ['p1', 'p2', 'p3']);
    expect(totalPoints(state1, 'p1')).toBe(100);

    // Run round 2 (final): p2 1st → 100 * 3 = 300 pts
    const state2 = recordRace(state1, 2, ['p2', 'p1', 'p3']);
    expect(totalPoints(state2, 'p1')).toBe(100 + 50 * 3); // 100 + 150 = 250
    expect(totalPoints(state2, 'p2')).toBe(50 + 100 * 3); // 50 + 300 = 350
    expect(champion(state2)).toBe('p2');
  });
});
