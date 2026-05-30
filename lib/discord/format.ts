// lib/discord/format.ts
import { DISCORD_LIMIT, splitForDiscord } from './split';

/** Un message Discord prêt à copier, déjà découpé en morceaux <= 2000 caractères. */
export interface DiscordBlock {
  label: string;
  chunks: string[];
}

// ─── View-model interfaces ────────────────────────────────────────────────────

/** A single pairing row. `b` is null for a bye; `note` is an optional annotation. */
export interface PairingRow {
  a: string;
  b: string | null;
  note?: string;
}

/** A single standings row. `detail` is any string (e.g. "2-1 (Buchholz 5)"). */
export interface StandingRow {
  rank: number;
  name: string;
  detail: string;
}

/** A single result row. `b` is null for a bye; `outcome` is an optional annotation. */
export interface ResultRow {
  a: string;
  b: string | null;
  scoreA: number;
  scoreB: number;
  outcome?: string;
  /** Manche perdue par forfait : on n'affiche pas le score sentinelle (13–0). */
  forfeit?: boolean;
}

/** A single schedule item. */
export interface ScheduleItem {
  time: string;
  label: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Builds a Discord markdown message and splits it into <= 2000-char chunks. */
function build(title: string, lines: string[]): string[] {
  const header = `**${title}**\n`;
  const body = lines.length > 0 ? '\n' + lines.join('\n') : '';
  return splitForDiscord(header + body);
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/**
 * Formats a list of pairings for a round into Discord markdown chunks.
 *
 * Each row becomes a numbered line:
 *   `1.` Team A **vs** Team B _(note)_
 *   `1.` Team A — *bye (qualifié automatiquement)*
 */
export function formatPairings(
  title: string,
  rows: PairingRow[],
  opts: { byeLabel?: string } = {},
): string[] {
  const byeLabel = opts.byeLabel ?? 'bye (qualifié automatiquement)';
  const lines = rows.map((row, i) => {
    const num = `\`${i + 1}.\``;
    let line: string;
    if (row.b === null) {
      line = `${num} ${row.a} — *${byeLabel}*`;
    } else {
      line = `${num} ${row.a} **vs** ${row.b}`;
    }
    if (row.note) {
      line += ` _(${row.note})_`;
    }
    return line;
  });
  return build(title, lines);
}

/**
 * Formats a standings table into Discord markdown chunks.
 *
 * Each row becomes:
 *   `1.` **Team A** — detail
 */
export function formatStandings(title: string, rows: StandingRow[]): string[] {
  const lines = rows.map((row) => `\`${row.rank}.\` **${row.name}** — ${row.detail}`);
  return build(title, lines);
}

/**
 * Formats a list of results into Discord markdown chunks.
 *
 * Each row becomes:
 *   `Team A` 13–7 `Team B` → outcome
 *   `Team A` — bye
 */
export function formatResults(
  title: string,
  rows: ResultRow[],
  opts: { byeLabel?: string } = {},
): string[] {
  const byeLabel = opts.byeLabel ?? 'bye';
  const lines = rows.map((row) => {
    let line: string;
    if (row.b === null) {
      line = `\`${row.a}\` — ${byeLabel}`;
    } else if (row.forfeit) {
      line = `\`${row.a}\` vs \`${row.b}\``;
    } else {
      line = `\`${row.a}\` ${row.scoreA}–${row.scoreB} \`${row.b}\``;
    }
    if (row.outcome) {
      line += ` → ${row.outcome}`;
    }
    return line;
  });
  return build(title, lines);
}

/**
 * Formats a schedule into Discord markdown chunks.
 *
 * Each item becomes:
 *   `10:00` — Ronde 1
 */
export function formatSchedule(title: string, items: ScheduleItem[]): string[] {
  const lines = items.map((item) => `\`${item.time}\` — ${item.label}`);
  return build(title, lines);
}

/**
 * Compose les morceaux bilingues (section FR puis section EN) pour la copie.
 * Si chaque langue tient en un seul morceau et que les deux réunis restent sous
 * la limite Discord, renvoie un unique morceau — copiable d'un coup. Sinon, garde
 * les morceaux séparés (tout le FR, puis tout l'EN).
 */
export function bilingualChunks(fr: string[], en: string[]): string[] {
  if (fr.length === 1 && en.length === 1) {
    const merged = `${fr[0]}\n\n${en[0]}`;
    if (merged.length <= DISCORD_LIMIT) return [merged];
  }
  return [...fr, ...en];
}
