// lib/schedule/estimate.ts

/** Configuration for the schedule estimator. All fields optional with sensible defaults. */
export interface ScheduleConfig {
  /** Total BYOC posts available. Default 90. */
  posts?: number;
  /** Players per match (5v5 = 10). Default 10. */
  playersPerMatch?: number;
  /** Duration of a single match in minutes. Default 45. */
  matchDurationMin?: number;
  /** "HH:MM" time when the first day starts. Default "10:00". */
  dayStart?: string;
  /** No new round starts at or after this time. Default "22:00". */
  dayCutoff?: string;
  /** "HH:MM" time when an overflow day starts. Default "10:00". */
  nextDayStart?: string;
  /** Lunch break config. Default { time: "12:00", durationMin: 60 }. */
  lunch?: { time: string; durationMin: number };
  /** Dinner break config. Default { time: "18:00", durationMin: 60 }. */
  dinner?: { time: string; durationMin: number };
}

/** A single round placed in the timeline. */
export interface ScheduledRound {
  /** 1-based index into the input array. */
  round: number;
  /** Number of matches in this round. */
  matches: number;
  /** ceil(matches / capacity) — how many waves of simultaneous games. */
  waves: number;
  /** Day number: 1 = first event day, 2 = next day, etc. */
  day: number;
  /** "HH:MM" 24-hour start time. */
  start: string;
  /** "HH:MM" 24-hour end time. */
  end: string;
}

// ---------------------------------------------------------------------------
// Private time helpers
// ---------------------------------------------------------------------------

/** Parse "HH:MM" into minutes from midnight. */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Format minutes from midnight as "HH:MM". */
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns how many matches can run simultaneously.
 * = floor(posts / playersPerMatch), minimum 1.
 */
export function simultaneousCapacity(config?: ScheduleConfig): number {
  const posts = config?.posts ?? 90;
  const playersPerMatch = config?.playersPerMatch ?? 10;
  return Math.max(1, Math.floor(posts / playersPerMatch));
}

/**
 * Lays out rounds into a timeline, respecting capacity, meal breaks, and day
 * cutoff/rollover rules.
 *
 * For each round:
 * 1. If cursor >= dayCutoff → roll to next day (reset meal flags).
 * 2. If cursor >= meal time and that meal hasn't been taken today → advance
 *    cursor by that meal's duration (check lunch first, then dinner).
 * 3. Place the round starting at cursor; advance cursor by waves * matchDurationMin.
 */
export function estimateSchedule(
  roundMatchCounts: number[],
  config?: ScheduleConfig,
): ScheduledRound[] {
  const capacity = simultaneousCapacity(config);
  const matchDurationMin = config?.matchDurationMin ?? 45;
  const dayCutoffMin = parseTime(config?.dayCutoff ?? '22:00');
  const dayStartMin = parseTime(config?.dayStart ?? '10:00');
  const nextDayStartMin = parseTime(config?.nextDayStart ?? '10:00');

  const lunchTime = parseTime(config?.lunch?.time ?? '12:00');
  const lunchDur = config?.lunch?.durationMin ?? 60;
  const dinnerTime = parseTime(config?.dinner?.time ?? '18:00');
  const dinnerDur = config?.dinner?.durationMin ?? 60;

  let cursor = dayStartMin;
  let day = 1;
  // Mark meals as already taken if the day starts past their scheduled time
  let lunchTaken = dayStartMin >= lunchTime;
  let dinnerTaken = dayStartMin >= dinnerTime;

  const result: ScheduledRound[] = [];

  for (let i = 0; i < roundMatchCounts.length; i++) {
    const matches = roundMatchCounts[i];

    // 1. Roll over to next day if cursor reached cutoff
    if (cursor >= dayCutoffMin) {
      day += 1;
      cursor = nextDayStartMin;
      // Reset meal flags: mark as taken only if the new day starts past them
      lunchTaken = nextDayStartMin >= lunchTime;
      dinnerTaken = nextDayStartMin >= dinnerTime;
    }

    // 2. Insert meal breaks if cursor has passed them
    if (!lunchTaken && cursor >= lunchTime) {
      cursor += lunchDur;
      lunchTaken = true;
    }
    if (!dinnerTaken && cursor >= dinnerTime) {
      cursor += dinnerDur;
      dinnerTaken = true;
    }

    // 3. Place the round
    const waves = Math.ceil(matches / capacity);
    const duration = waves * matchDurationMin;
    const start = cursor;
    cursor += duration;

    result.push({
      round: i + 1,
      matches,
      waves,
      day,
      start: formatTime(start),
      end: formatTime(cursor),
    });
  }

  return result;
}

/**
 * Convenience: total number of matches across all rounds.
 */
export function totalMatches(roundMatchCounts: number[]): number {
  return roundMatchCounts.reduce((sum, n) => sum + n, 0);
}
