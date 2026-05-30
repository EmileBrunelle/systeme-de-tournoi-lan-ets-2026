// lib/discord/format.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatPairings,
  formatStandings,
  formatResults,
  formatSchedule,
  type PairingRow,
  type StandingRow,
  type ResultRow,
  type ScheduleItem,
} from './format';

const DISCORD_LIMIT = 2000;

// ─── formatPairings ──────────────────────────────────────────────────────────

describe('formatPairings', () => {
  it('renders a normal match with "vs"', () => {
    const rows: PairingRow[] = [{ a: 'Team Alpha', b: 'Team Beta' }];
    const chunks = formatPairings('Ronde 1', rows);
    const joined = chunks.join('');
    expect(joined).toContain('**Ronde 1**');
    expect(joined).toContain('Team Alpha **vs** Team Beta');
  });

  it('renders a bye when b is null', () => {
    const rows: PairingRow[] = [{ a: 'Team Omega', b: null }];
    const chunks = formatPairings('Ronde 2', rows);
    const joined = chunks.join('');
    expect(joined).toContain('Team Omega');
    expect(joined).toContain('*bye (qualifié automatiquement)*');
  });

  it('uses a custom bye label when provided (pour l’anglais)', () => {
    const rows: PairingRow[] = [{ a: 'Team Omega', b: null }];
    const joined = formatPairings('Round 2', rows, { byeLabel: 'bye (auto-qualified)' }).join('');
    expect(joined).toContain('*bye (auto-qualified)*');
    expect(joined).not.toContain('qualifié automatiquement');
  });

  it('appends note in italics when present', () => {
    const rows: PairingRow[] = [{ a: 'Team A', b: 'Team B', note: 'Bo3' }];
    const chunks = formatPairings('Ronde 3', rows);
    const joined = chunks.join('');
    expect(joined).toContain('_(Bo3)_');
  });

  it('numbers rows in sequence', () => {
    const rows: PairingRow[] = [
      { a: 'A', b: 'B' },
      { a: 'C', b: 'D' },
      { a: 'E', b: 'F' },
    ];
    const joined = formatPairings('R', rows).join('');
    expect(joined).toContain('`1.`');
    expect(joined).toContain('`2.`');
    expect(joined).toContain('`3.`');
  });

  it('returns string[] and all chunks <= 2000 chars', () => {
    const rows: PairingRow[] = Array.from({ length: 200 }, (_, i) => ({
      a: `Team ${i * 2 + 1}`,
      b: `Team ${i * 2 + 2}`,
    }));
    const chunks = formatPairings('Grande Ronde', rows);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_LIMIT);
    }
  });

  it('empty rows still returns a chunk containing the title', () => {
    const chunks = formatPairings('Mon Titre', []);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('')).toContain('**Mon Titre**');
  });
});

// ─── formatStandings ─────────────────────────────────────────────────────────

describe('formatStandings', () => {
  it('renders rank, bold name, and plain detail', () => {
    const rows: StandingRow[] = [
      { rank: 1, name: 'Alpha', detail: '3-0 (Buchholz 6)' },
      { rank: 2, name: 'Beta', detail: '2-1 (Buchholz 4)' },
    ];
    const joined = formatStandings('Classement', rows).join('');
    expect(joined).toContain('**Classement**');
    expect(joined).toContain('`1.` **Alpha** — 3-0 (Buchholz 6)');
    expect(joined).toContain('`2.` **Beta** — 2-1 (Buchholz 4)');
  });

  it('numbering follows the rank field, not array position', () => {
    const rows: StandingRow[] = [
      { rank: 5, name: 'Retard', detail: '0-3' },
      { rank: 10, name: 'Dernier', detail: '0-5' },
    ];
    const joined = formatStandings('Top', rows).join('');
    expect(joined).toContain('`5.`');
    expect(joined).toContain('`10.`');
  });

  it('returns string[] and all chunks <= 2000 chars', () => {
    const rows: StandingRow[] = Array.from({ length: 200 }, (_, i) => ({
      rank: i + 1,
      name: `Participant ${i + 1}`,
      detail: `${3 - (i % 4)}-${i % 4} (Buchholz ${20 - i})`,
    }));
    const chunks = formatStandings('Grand Classement', rows);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_LIMIT);
    }
  });

  it('empty rows still returns a chunk containing the title', () => {
    const chunks = formatStandings('Classement Vide', []);
    expect(chunks.join('')).toContain('**Classement Vide**');
  });
});

// ─── formatResults ───────────────────────────────────────────────────────────

describe('formatResults', () => {
  it('renders scores with en-dash', () => {
    const rows: ResultRow[] = [{ a: 'Alpha', b: 'Beta', scoreA: 13, scoreB: 7 }];
    const joined = formatResults('Résultats', rows).join('');
    expect(joined).toContain('**Résultats**');
    expect(joined).toContain('`Alpha` 13–7 `Beta`');
  });

  it('renders bye when b is null', () => {
    const rows: ResultRow[] = [{ a: 'Solo', b: null, scoreA: 1, scoreB: 0 }];
    const joined = formatResults('Résultats', rows).join('');
    expect(joined).toContain('`Solo` — bye');
  });

  it('uses a custom bye label when provided', () => {
    const rows: ResultRow[] = [{ a: 'Solo', b: null, scoreA: 1, scoreB: 0 }];
    const joined = formatResults('Results', rows, { byeLabel: 'bye (auto-win)' }).join('');
    expect(joined).toContain('`Solo` — bye (auto-win)');
  });

  it('appends outcome when present', () => {
    const rows: ResultRow[] = [
      { a: 'Winner', b: 'Loser', scoreA: 2, scoreB: 0, outcome: 'qualifié' },
    ];
    const joined = formatResults('Résultats', rows).join('');
    expect(joined).toContain('→ qualifié');
  });

  it('returns string[] and all chunks <= 2000 chars', () => {
    const rows: ResultRow[] = Array.from({ length: 200 }, (_, i) => ({
      a: `Equipe ${i * 2 + 1}`,
      b: `Equipe ${i * 2 + 2}`,
      scoreA: 13,
      scoreB: i % 14,
    }));
    const chunks = formatResults('Tous les résultats', rows);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_LIMIT);
    }
  });

  it('empty rows still returns a chunk containing the title', () => {
    const chunks = formatResults('Résultats Vides', []);
    expect(chunks.join('')).toContain('**Résultats Vides**');
  });
});

// ─── formatSchedule ──────────────────────────────────────────────────────────

describe('formatSchedule', () => {
  it('renders time and label per item', () => {
    const items: ScheduleItem[] = [
      { time: '10:00', label: 'Ronde 1' },
      { time: '12:30', label: 'Dîner' },
      { time: '14:00', label: 'Grande finale' },
    ];
    const joined = formatSchedule('Horaire', items).join('');
    expect(joined).toContain('**Horaire**');
    expect(joined).toContain('`10:00` — Ronde 1');
    expect(joined).toContain('`12:30` — Dîner');
    expect(joined).toContain('`14:00` — Grande finale');
  });

  it('returns string[] and all chunks <= 2000 chars', () => {
    const items: ScheduleItem[] = Array.from({ length: 200 }, (_, i) => ({
      time: `${String(Math.floor(i / 60) + 8).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
      label: `Activité très longue numéro ${i + 1} avec beaucoup de détails supplémentaires`,
    }));
    const chunks = formatSchedule('Programme Complet', items);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_LIMIT);
    }
  });

  it('empty items still returns a chunk containing the title', () => {
    const chunks = formatSchedule('Horaire Vide', []);
    expect(chunks.join('')).toContain('**Horaire Vide**');
  });
});
