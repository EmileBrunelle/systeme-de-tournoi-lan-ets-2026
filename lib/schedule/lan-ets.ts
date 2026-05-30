// lib/schedule/lan-ets.ts
// Horaire spécifique au LAN ÉTS 2026 — Valorant uniquement.
// Format figé : suisse 16 équipes (3V/3D) → playoff double-élimination top 8,
// grande finale le dimanche matin sur le stream. Seuls le départ du samedi et
// le « lousse » par ronde sont configurables ; le reste est calé sur
// l'événement (rencontre 9h, dîner, souper, finale dimanche 8h en BO3).

export interface LanEtsConfig {
  /** Heure du premier match samedi, "HH:MM". Défaut "09:30". */
  saturdayStart?: string;
  /** Lousse pour imprévus, en minutes par ronde. Défaut 15. */
  slackMin?: number;
}

export interface SchedSlot {
  day: 'samedi' | 'dimanche';
  kind: 'match' | 'meal';
  label: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  /** Nombre de matchs (vagues de match), absent pour un repas. */
  matches?: number;
  /** Vrai pour la ronde mise en avant sur le stream (midi). */
  stream?: boolean;
}

// --- Constantes de l'événement ---------------------------------------------

const SETUP_MIN = 10; // 10 min pour entrer après le lancement de la ronde
const BO1_MIN = 45; // durée d'un match BO1
const BO3_MIN = 120; // durée de la grande finale BO3
const LUNCH = '12:00';
const SUPPER = '17:30';
const MEAL_MIN = 60;
const FINAL_START = '08:00'; // dimanche, sur le stream
const STREAM_NOON = '12:00'; // match mis en avant à midi

/** Vagues séquentielles du samedi : suisse [8,8,8,6,3] + playoff sans la finale. */
const SATURDAY: { label: string; matches: number }[] = [
  { label: 'Ronde suisse 1', matches: 8 },
  { label: 'Ronde suisse 2', matches: 8 },
  { label: 'Ronde suisse 3', matches: 8 },
  { label: 'Ronde suisse 4', matches: 6 },
  { label: 'Ronde suisse 5', matches: 3 },
  { label: 'Playoff — Winner R1', matches: 4 },
  { label: 'Playoff — Winner demi + Loser R1', matches: 4 },
  { label: 'Playoff — Winner finale + Loser R2', matches: 3 },
  { label: 'Playoff — Loser demi', matches: 1 },
  { label: 'Playoff — Loser finale', matches: 1 },
];

// --- Helpers temps ----------------------------------------------------------

function parse(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "HH:MM" sans repli à 24h : un dépassement après minuit s'affiche « 24:30 »,
 *  ce qui garde l'ordre lexical et le parse cohérents (et signale la nuit mordue). */
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- API --------------------------------------------------------------------

export function lanEtsValorantSchedule(config?: LanEtsConfig): SchedSlot[] {
  const slack = config?.slackMin ?? 15;
  const lunchAt = parse(LUNCH);
  const supperAt = parse(SUPPER);
  const noonAt = parse(STREAM_NOON);

  const slots: SchedSlot[] = [];
  let cursor = parse(config?.saturdayStart ?? '09:30');
  let lunchTaken = false;
  let supperTaken = false;

  for (const wave of SATURDAY) {
    if (!lunchTaken && cursor >= lunchAt) {
      slots.push({ day: 'samedi', kind: 'meal', label: 'Dîner', start: fmt(cursor), end: fmt(cursor + MEAL_MIN) });
      cursor += MEAL_MIN;
      lunchTaken = true;
    }
    if (!supperTaken && cursor >= supperAt) {
      slots.push({ day: 'samedi', kind: 'meal', label: 'Souper', start: fmt(cursor), end: fmt(cursor + MEAL_MIN) });
      cursor += MEAL_MIN;
      supperTaken = true;
    }

    const start = cursor;
    cursor += SETUP_MIN + BO1_MIN + slack;
    const onStream = start <= noonAt && cursor > noonAt;
    slots.push({
      day: 'samedi',
      kind: 'match',
      label: wave.label,
      start: fmt(start),
      end: fmt(cursor),
      matches: wave.matches,
      ...(onStream ? { stream: true } : {}),
    });
  }

  // Grande finale : dimanche matin, heure fixe du stream, BO3.
  const finalStart = parse(FINAL_START);
  slots.push({
    day: 'dimanche',
    kind: 'match',
    label: 'Grande finale (BO3)',
    start: fmt(finalStart),
    end: fmt(finalStart + SETUP_MIN + BO3_MIN),
    matches: 1,
    stream: true,
  });

  return slots;
}

/** Heure de fin du samedi (dernier créneau du samedi). */
export function saturdayEndTime(slots: SchedSlot[]): string {
  const samedi = slots.filter((s) => s.day === 'samedi');
  return samedi[samedi.length - 1].end;
}

/** Minutes de sommeil entre la fin du samedi et le début de la finale dimanche. */
export function sleepGapMinutes(slots: SchedSlot[]): number {
  const end = parse(saturdayEndTime(slots));
  const final = slots.find((s) => s.day === 'dimanche')!;
  return 24 * 60 + parse(final.start) - end;
}
