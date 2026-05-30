// lib/schedule/estimate.test.ts
import { describe, it, expect } from 'vitest';
import {
  simultaneousCapacity,
  estimateSchedule,
  totalMatches,
} from './estimate';

describe('simultaneousCapacity', () => {
  it('returns 9 with defaults (90 posts / 10 players)', () => {
    expect(simultaneousCapacity()).toBe(9);
  });

  it('respects custom posts and playersPerMatch', () => {
    expect(simultaneousCapacity({ posts: 50, playersPerMatch: 10 })).toBe(5);
    expect(simultaneousCapacity({ posts: 20, playersPerMatch: 4 })).toBe(5);
  });

  it('is never below 1', () => {
    expect(simultaneousCapacity({ posts: 1, playersPerMatch: 100 })).toBe(1);
  });
});

describe('estimateSchedule — basic layout', () => {
  it('lays out three 9-match rounds back-to-back from 10:00 (no breaks before noon)', () => {
    // 9 matches at capacity 9 = 1 wave = 45 min
    const rounds = estimateSchedule([9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '10:00',
      dayCutoff: '22:00',
      // suppress meal breaks to test bare layout
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    // Round 1: 10:00 → 10:45
    expect(rounds[0].round).toBe(1);
    expect(rounds[0].start).toBe('10:00');
    expect(rounds[0].end).toBe('10:45');
    expect(rounds[0].day).toBe(1);
    expect(rounds[0].waves).toBe(1);

    // Round 2: 10:45 → 11:30 (before noon, no lunch yet)
    expect(rounds[1].start).toBe('10:45');
    expect(rounds[1].end).toBe('11:30');

    // Round 3: 11:30 → 12:30 (starts at 11:30, before noon, no break)
    expect(rounds[2].start).toBe('11:30');
    expect(rounds[2].end).toBe('12:15');
  });
});

describe('estimateSchedule — meal breaks', () => {
  it('inserts lunch exactly once when cursor reaches 12:00', () => {
    // 3 rounds of 9 matches, 45 min each.
    // R1: 10:00–10:45, R2: 10:45–11:30, R3: 11:30–12:15
    // R4 starts at 12:15 → past noon → lunch is applied: cursor becomes 13:15
    const rounds = estimateSchedule([9, 9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '10:00',
      dayCutoff: '22:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    // Round 4 should have lunch injected before it
    expect(rounds[3].start).toBe('13:15');
    expect(rounds[3].end).toBe('14:00');
  });

  it('inserts lunch only once (second pass does not re-apply)', () => {
    // Many rounds — lunch should appear exactly once
    const rounds = estimateSchedule([9, 9, 9, 9, 9, 9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '10:00',
      dayCutoff: '22:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    // Collect all start times, verify no round's start is exactly 13:15 twice
    // Actually verify dinner also applied: 8 rounds * 45 min = 360 min + 60 (lunch) + 60 (dinner)
    // R1 10:00, R2 10:45, R3 11:30, R4 starts at 11:30+45=12:15 -> lunch -> 13:15
    // R5 14:00, R6 14:45, R7 15:30, R8 16:15 -> 16:15+45=17:00, no dinner yet
    // R8 starts at 16:15 -> dinner at 18:00 not reached yet
    // R8 ends 17:00; no round after 18:00 in 8 rounds here
    const r4 = rounds[3];
    expect(r4.start).toBe('13:15'); // lunch applied once before R4

    // Verify rounds 5–8 are consecutive without extra break (dinner not reached)
    expect(rounds[4].start).toBe('14:00');
    expect(rounds[5].start).toBe('14:45');
    expect(rounds[6].start).toBe('15:30');
    expect(rounds[7].start).toBe('16:15');
  });

  it('inserts dinner exactly once when cursor reaches 18:00', () => {
    // Start 16:00, 45 min rounds, dinner at 18:00
    // R1: 16:00–16:45, R2: 16:45–17:30, R3 starts at 17:30 < 18:00, no dinner
    // R3: 17:30–18:15, R4 starts at 18:15 -> past 18:00 -> dinner -> 19:15
    const rounds = estimateSchedule([9, 9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '16:00',
      dayCutoff: '22:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    expect(rounds[0].start).toBe('16:00');
    expect(rounds[1].start).toBe('16:45');
    expect(rounds[2].start).toBe('17:30');
    expect(rounds[3].start).toBe('19:15'); // dinner applied
  });
});

describe('estimateSchedule — day rollover', () => {
  it('rolls rounds to day 2 when cursor reaches dayCutoff', () => {
    // Start 20:00, cutoff 22:00, 45-min rounds, capacity 9
    // R1: 20:00–20:45, R2: 20:45–21:30, R3 cursor=21:30 < 22:00 → starts 21:30–22:15
    // After R3 cursor=22:15 >= 22:00: but the check is BEFORE placing a round
    // R1: 20:00–20:45 (day 1)
    // R2: 20:45–21:30 (day 1, cursor=21:30 < 22:00)
    // R3 cursor=21:30 < 22:00 → place R3: 21:30–22:15 (day 1)
    // R4 cursor=22:15 >= 22:00 → rollover to day 2, nextDayStart=10:00
    const rounds = estimateSchedule([9, 9, 9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '20:00',
      dayCutoff: '22:00',
      nextDayStart: '10:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    expect(rounds[0].day).toBe(1);
    expect(rounds[1].day).toBe(1);
    expect(rounds[2].day).toBe(1);
    expect(rounds[3].day).toBe(2);
    expect(rounds[3].start).toBe('10:00');
    expect(rounds[4].day).toBe(2);
    expect(rounds[4].start).toBe('10:45');
  });

  it('resets meal breaks on day 2', () => {
    // Day 1 ends before 12:00 is reached; day 2 should insert lunch at 12:00 again
    const rounds = estimateSchedule([9, 9, 9, 9, 9, 9, 9], {
      matchDurationMin: 45,
      dayStart: '20:00',
      dayCutoff: '22:00',
      nextDayStart: '10:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    const day2Rounds = rounds.filter((r) => r.day === 2);
    // Day 2 starts at 10:00; rounds at 10:00, 10:45, 11:30 → next is 12:15 → lunch
    expect(day2Rounds[0].start).toBe('10:00');
    expect(day2Rounds[1].start).toBe('10:45');
    expect(day2Rounds[2].start).toBe('11:30');
    expect(day2Rounds[3].start).toBe('13:15'); // lunch on day 2
  });
});

describe('estimateSchedule — waves', () => {
  it('computes waves = ceil(matches / capacity)', () => {
    // 18 matches at capacity 9 = 2 waves = 90 min
    const rounds = estimateSchedule([18], {
      matchDurationMin: 45,
      dayStart: '10:00',
      dayCutoff: '22:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    expect(rounds[0].waves).toBe(2);
    expect(rounds[0].start).toBe('10:00');
    expect(rounds[0].end).toBe('11:30'); // 2 * 45 = 90 min
  });

  it('computes waves correctly for non-divisible counts', () => {
    // 10 matches at capacity 9 = ceil(10/9) = 2 waves
    const rounds = estimateSchedule([10], {
      matchDurationMin: 45,
      dayStart: '10:00',
      dayCutoff: '22:00',
      lunch: { time: '12:00', durationMin: 60 },
      dinner: { time: '18:00', durationMin: 60 },
    });

    expect(rounds[0].waves).toBe(2);
  });
});

describe('totalMatches', () => {
  it('sums an array of round match counts', () => {
    expect(totalMatches([9, 9, 9])).toBe(27);
    expect(totalMatches([10, 5, 3])).toBe(18);
    expect(totalMatches([])).toBe(0);
  });
});
