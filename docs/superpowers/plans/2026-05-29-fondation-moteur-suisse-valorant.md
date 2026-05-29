# Fondation + Moteur Suisse Valorant — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place la fondation du projet (TypeScript + Vitest) et un moteur de phase suisse Valorant entièrement testé (« jusqu'à 3 V / 3 D », byes génériques, anti-revanche, tiebreak Buchholz).

**Architecture:** Toute la logique de tournoi vit dans `lib/`, en TypeScript pur, sans dépendance au framework UI. Les fonctions sont **pures et immuables** (elles retournent un nouvel état) pour faciliter les tests. Ce plan livre : les types du domaine, un utilitaire de découpage de messages Discord, et le module `swiss`. Le double-élim, l'import et l'UI sont des plans suivants.

**Tech Stack:** TypeScript, Vitest (tests unitaires), Node.js. (Next.js + Prisma arrivent au Plan 2 — pas requis pour le moteur.)

---

## Structure des fichiers

- `package.json` — scripts (`test`), dépendances dev (typescript, vitest).
- `tsconfig.json` — config TypeScript stricte.
- `vitest.config.ts` — config de test.
- `lib/domain/types.ts` — types partagés : `Participant`, `Standing`, etc.
- `lib/discord/split.ts` — découpe un message à la limite Discord (2000 car.).
- `lib/discord/split.test.ts` — tests.
- `lib/formats/swiss.ts` — moteur de phase suisse.
- `lib/formats/swiss.test.ts` — tests.

---

### Task 1: Scaffold du projet (TypeScript + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "systeme-de-tournoi-lan-ets-2026",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["lib", "*.ts"]
}
```

- [ ] **Step 3: Créer `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Installer les dépendances**

Run: `npm install`
Expected: crée `node_modules/` et `package-lock.json` sans erreur.

- [ ] **Step 5: Vérifier que Vitest tourne (aucun test = succès)**

Run: `npm test`
Expected: Vitest démarre et affiche « No test files found » ou équivalent, code de sortie 0 ou message sans erreur de config.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: scaffold TypeScript + Vitest"
```

---

### Task 2: Types du domaine

**Files:**
- Create: `lib/domain/types.ts`

- [ ] **Step 1: Écrire les types**

```ts
// lib/domain/types.ts

/** Identifiant unique d'un participant (équipe ou joueur solo). */
export type ParticipantId = string;

/** Un participant : une équipe Valorant ou un joueur solo. */
export interface Participant {
  id: ParticipantId;
  name: string;
  /** Seed initial (1 = premier slot). Tiré au hasard pour Valorant. */
  seed: number;
}

/** Statut d'un participant dans une phase suisse. */
export type SwissStatus = 'active' | 'qualified' | 'eliminated';

/** Une ligne de classement calculée. */
export interface Standing {
  participantId: ParticipantId;
  name: string;
  /** Position dans le classement (1 = premier). */
  rank: number;
  wins: number;
  losses: number;
  /** Tiebreak (Buchholz : somme des victoires des adversaires). */
  tiebreak: number;
  status: SwissStatus;
}
```

- [ ] **Step 2: Vérifier la compilation des types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/domain/types.ts
git commit -m "feat: types du domaine (Participant, Standing)"
```

---

### Task 3: Découpage de messages Discord (limite 2000 car.)

**Files:**
- Create: `lib/discord/split.test.ts`
- Create: `lib/discord/split.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// lib/discord/split.test.ts
import { describe, it, expect } from 'vitest';
import { splitForDiscord } from './split';

describe('splitForDiscord', () => {
  it('retourne un seul morceau si le message est court', () => {
    expect(splitForDiscord('allo')).toEqual(['allo']);
  });

  it('ne coupe jamais au milieu d’une ligne quand on découpe', () => {
    const line = 'x'.repeat(500);
    const message = Array.from({ length: 10 }, () => line).join('\n'); // ~5000 car.
    const chunks = splitForDiscord(message, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(2000);
      // chaque morceau est composé de lignes complètes
      for (const l of c.split('\n')) {
        expect(l).toBe(line);
      }
    }
    // aucune ligne perdue
    expect(chunks.join('\n').split('\n').length).toBe(10);
  });

  it('coupe brutalement une ligne unique plus longue que la limite', () => {
    const huge = 'y'.repeat(4500);
    const chunks = splitForDiscord(huge, 2000);
    expect(chunks).toEqual(['y'.repeat(2000), 'y'.repeat(2000), 'y'.repeat(500)]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run lib/discord/split.test.ts`
Expected: FAIL — « Failed to resolve import './split' » (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter `splitForDiscord`**

```ts
// lib/discord/split.ts

/** Limite de caractères d'un message Discord. */
export const DISCORD_LIMIT = 2000;

/**
 * Découpe `message` en morceaux d'au plus `limit` caractères, sans couper une
 * ligne en deux. Si une ligne seule dépasse la limite, elle est coupée
 * brutalement (cas rare).
 */
export function splitForDiscord(message: string, limit: number = DISCORD_LIMIT): string[] {
  if (message.length <= limit) return [message];

  const chunks: string[] = [];
  let current = '';

  for (const line of message.split('\n')) {
    if (line.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run lib/discord/split.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/discord/split.ts lib/discord/split.test.ts
git commit -m "feat: découpage de messages à la limite Discord"
```

---

### Task 4: Moteur suisse — création d'état et statut

**Files:**
- Create: `lib/formats/swiss.test.ts`
- Create: `lib/formats/swiss.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// lib/formats/swiss.test.ts
import { describe, it, expect } from 'vitest';
import { createSwiss, statusOf } from './swiss';
import type { Participant } from '../domain/types';

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
  }));
}

describe('createSwiss', () => {
  it('initialise les records à 0 et la config par défaut (3/3)', () => {
    const state = createSwiss(mkParticipants(4));
    expect(state.winsToQualify).toBe(3);
    expect(state.lossesToEliminate).toBe(3);
    expect(state.matches).toEqual([]);
    expect(state.records['p1']).toEqual({ wins: 0, losses: 0, opponents: [], hadBye: false });
  });

  it('accepte une config personnalisée', () => {
    const state = createSwiss(mkParticipants(4), { winsToQualify: 2, lossesToEliminate: 2 });
    expect(state.winsToQualify).toBe(2);
    expect(state.lossesToEliminate).toBe(2);
  });
});

describe('statusOf', () => {
  it('retourne active, qualified ou eliminated selon le record', () => {
    const state = createSwiss(mkParticipants(2), { winsToQualify: 2, lossesToEliminate: 2 });
    expect(statusOf(state, 'p1')).toBe('active');
    state.records['p1'].wins = 2;
    expect(statusOf(state, 'p1')).toBe('qualified');
    state.records['p2'].losses = 2;
    expect(statusOf(state, 'p2')).toBe('eliminated');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: FAIL — import non résolu (`./swiss`).

- [ ] **Step 3: Implémenter l'état, `createSwiss` et `statusOf`**

```ts
// lib/formats/swiss.ts
import type { Participant, ParticipantId, SwissStatus } from '../domain/types';

export interface SwissMatch {
  id: string;
  round: number;
  home: ParticipantId;
  /** null = bye (le `home` gagne automatiquement). */
  away: ParticipantId | null;
  /** null = pas encore joué. */
  score: { home: number; away: number } | null;
}

interface SwissRecord {
  wins: number;
  losses: number;
  /** Adversaires affrontés (byes exclus). */
  opponents: ParticipantId[];
  hadBye: boolean;
}

export interface SwissState {
  participants: Participant[];
  matches: SwissMatch[];
  records: Record<ParticipantId, SwissRecord>;
  winsToQualify: number;
  lossesToEliminate: number;
}

export interface SwissConfig {
  winsToQualify?: number;
  lossesToEliminate?: number;
}

export function createSwiss(participants: Participant[], config: SwissConfig = {}): SwissState {
  const records: Record<ParticipantId, SwissRecord> = {};
  for (const p of participants) {
    records[p.id] = { wins: 0, losses: 0, opponents: [], hadBye: false };
  }
  return {
    participants: [...participants],
    matches: [],
    records,
    winsToQualify: config.winsToQualify ?? 3,
    lossesToEliminate: config.lossesToEliminate ?? 3,
  };
}

export function statusOf(state: SwissState, id: ParticipantId): SwissStatus {
  const rec = state.records[id];
  if (rec.wins >= state.winsToQualify) return 'qualified';
  if (rec.losses >= state.lossesToEliminate) return 'eliminated';
  return 'active';
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/formats/swiss.ts lib/formats/swiss.test.ts
git commit -m "feat: moteur suisse — état initial et statut"
```

---

### Task 5: Moteur suisse — enregistrement d'un résultat

**Files:**
- Modify: `lib/formats/swiss.ts`
- Modify: `lib/formats/swiss.test.ts`

- [ ] **Step 1: Ajouter les tests qui échouent**

```ts
// lib/formats/swiss.test.ts — ajouter
import { recordResult } from './swiss';

describe('recordResult', () => {
  it('met à jour victoires/défaites et la liste des adversaires', () => {
    let state = createSwiss(mkParticipants(2));
    state = {
      ...state,
      matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }],
    };
    state = recordResult(state, 'R1-M1', { home: 13, away: 7 });

    expect(state.records['p1']).toMatchObject({ wins: 1, losses: 0, opponents: ['p2'] });
    expect(state.records['p2']).toMatchObject({ wins: 0, losses: 1, opponents: ['p1'] });
    expect(state.matches[0].score).toEqual({ home: 13, away: 7 });
  });

  it('ne mute pas l’état d’origine (immuabilité)', () => {
    let state = createSwiss(mkParticipants(2));
    state = { ...state, matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }] };
    const before = state;
    recordResult(state, 'R1-M1', { home: 13, away: 7 });
    expect(before.records['p1'].wins).toBe(0);
  });

  it('lève une erreur si le match est introuvable', () => {
    const state = createSwiss(mkParticipants(2));
    expect(() => recordResult(state, 'inexistant', { home: 1, away: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: FAIL — `recordResult` non exporté.

- [ ] **Step 3: Implémenter `recordResult`**

```ts
// lib/formats/swiss.ts — ajouter

/** Copie profonde d'un état (records + matches). */
function cloneState(state: SwissState): SwissState {
  const records: Record<ParticipantId, SwissRecord> = {};
  for (const [id, r] of Object.entries(state.records)) {
    records[id] = { ...r, opponents: [...r.opponents] };
  }
  return {
    ...state,
    records,
    matches: state.matches.map((m) => ({ ...m, score: m.score ? { ...m.score } : null })),
  };
}

export function recordResult(
  state: SwissState,
  matchId: string,
  score: { home: number; away: number },
): SwissState {
  const next = cloneState(state);
  const match = next.matches.find((m) => m.id === matchId);
  if (!match) throw new Error(`Match introuvable : ${matchId}`);
  if (match.away === null) throw new Error(`Le match ${matchId} est un bye, déjà résolu`);

  match.score = { ...score };
  const homeWon = score.home > score.away;
  const winner = homeWon ? match.home : match.away;
  const loser = homeWon ? match.away : match.home;

  next.records[winner].wins += 1;
  next.records[loser].losses += 1;
  next.records[match.home].opponents.push(match.away);
  next.records[match.away].opponents.push(match.home);

  return next;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add lib/formats/swiss.ts lib/formats/swiss.test.ts
git commit -m "feat: moteur suisse — enregistrement de résultat (immuable)"
```

---

### Task 6: Moteur suisse — Buchholz et génération de la ronde 1 (avec bye)

**Files:**
- Modify: `lib/formats/swiss.ts`
- Modify: `lib/formats/swiss.test.ts`

- [ ] **Step 1: Ajouter les tests qui échouent**

```ts
// lib/formats/swiss.test.ts — ajouter
import { buchholz, generateNextRound, statusOf as _statusOf } from './swiss';

describe('generateNextRound — ronde 1', () => {
  it('apparie 4 équipes en 2 matchs, sans bye', () => {
    const state = generateNextRound(createSwiss(mkParticipants(4)));
    const r1 = state.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    expect(r1.every((m) => m.away !== null)).toBe(true);
    // chaque participant apparaît exactement une fois
    const ids = r1.flatMap((m) => [m.home, m.away]);
    expect(new Set(ids).size).toBe(4);
  });

  it('avec 5 équipes : 2 matchs + 1 bye déjà résolu (victoire auto)', () => {
    const state = generateNextRound(createSwiss(mkParticipants(5)));
    const r1 = state.matches.filter((m) => m.round === 1);
    const byes = r1.filter((m) => m.away === null);
    expect(byes).toHaveLength(1);
    const byeTeam = byes[0].home;
    expect(byes[0].score).toEqual({ home: 1, away: 0 }); // résolu
    expect(state.records[byeTeam]).toMatchObject({ wins: 1, hadBye: true });
  });
});

describe('buchholz', () => {
  it('somme les victoires des adversaires affrontés', () => {
    let state = createSwiss(mkParticipants(3), { winsToQualify: 9, lossesToEliminate: 9 });
    // p1 a affronté p2 et p3 ; on leur donne des victoires
    state.records['p1'].opponents = ['p2', 'p3'];
    state.records['p2'].wins = 2;
    state.records['p3'].wins = 1;
    expect(buchholz(state, 'p1')).toBe(3);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: FAIL — `buchholz` / `generateNextRound` non exportés.

- [ ] **Step 3: Implémenter `buchholz`, `currentRound` et `generateNextRound`**

```ts
// lib/formats/swiss.ts — ajouter

export function buchholz(state: SwissState, id: ParticipantId): number {
  return state.records[id].opponents.reduce((sum, oppId) => sum + state.records[oppId].wins, 0);
}

/** Numéro de la dernière ronde générée (0 si aucune). */
export function currentRound(state: SwissState): number {
  return state.matches.reduce((max, m) => Math.max(max, m.round), 0);
}

/** Compare deux participants par force décroissante (victoires, Buchholz, seed). */
function strengthCompare(state: SwissState, a: Participant, b: Participant): number {
  const wa = state.records[a.id].wins;
  const wb = state.records[b.id].wins;
  if (wb !== wa) return wb - wa;
  const ba = buchholz(state, a.id);
  const bb = buchholz(state, b.id);
  if (bb !== ba) return bb - ba;
  return a.seed - b.seed;
}

/**
 * Génère la prochaine ronde. Apparie les participants actifs par force
 * comparable, en évitant les revanches quand c'est possible. Si le nombre
 * d'actifs est impair, attribue un bye (victoire auto) au moins bien classé
 * n'en ayant pas encore eu. Le bye est résolu immédiatement.
 */
export function generateNextRound(state: SwissState): SwissState {
  const unplayed = state.matches.some((m) => m.away !== null && m.score === null);
  if (unplayed) throw new Error('Ronde précédente incomplète : enregistrez tous les résultats.');

  const next = cloneState(state);
  const round = currentRound(next) + 1;

  const active = next.participants
    .filter((p) => statusOf(next, p.id) === 'active')
    .sort((a, b) => strengthCompare(next, a, b));

  // Bye si impair
  let byeId: ParticipantId | null = null;
  if (active.length % 2 === 1) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (!next.records[active[i].id].hadBye) { byeId = active[i].id; break; }
    }
    if (byeId === null) byeId = active[active.length - 1].id;
    const idx = active.findIndex((p) => p.id === byeId);
    active.splice(idx, 1);
  }

  // Appariement glouton anti-revanche
  let matchNo = 0;
  const pool = [...active];
  while (pool.length >= 2) {
    const home = pool.shift()!;
    let oppIdx = pool.findIndex((o) => !next.records[home.id].opponents.includes(o.id));
    if (oppIdx === -1) oppIdx = 0; // revanche inévitable
    const away = pool.splice(oppIdx, 1)[0];
    next.matches.push({
      id: `R${round}-M${++matchNo}`,
      round,
      home: home.id,
      away: away.id,
      score: null,
    });
  }

  // Bye résolu immédiatement
  if (byeId) {
    next.matches.push({ id: `R${round}-BYE`, round, home: byeId, away: null, score: { home: 1, away: 0 } });
    next.records[byeId].wins += 1;
    next.records[byeId].hadBye = true;
  }

  return next;
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add lib/formats/swiss.ts lib/formats/swiss.test.ts
git commit -m "feat: moteur suisse — Buchholz, génération de ronde, byes"
```

---

### Task 7: Moteur suisse — anti-revanche, fin de tournoi, classement, qualifiés

**Files:**
- Modify: `lib/formats/swiss.ts`
- Modify: `lib/formats/swiss.test.ts`

- [ ] **Step 1: Ajouter les tests qui échouent**

```ts
// lib/formats/swiss.test.ts — ajouter
import { isComplete, qualifiers, standings, currentRound } from './swiss';

/** Joue une ronde complète : chaque match, le `home` gagne 13-7. */
function playRoundHomeWins(state: SwissState): SwissState {
  let s = state;
  for (const m of s.matches.filter((mm) => mm.round === currentRound(s) && mm.away !== null && mm.score === null)) {
    s = recordResult(s, m.id, { home: 13, away: 7 });
  }
  return s;
}

describe('anti-revanche', () => {
  it('évite de réapparier deux équipes déjà rencontrées quand c’est possible', () => {
    let s = createSwiss(mkParticipants(4), { winsToQualify: 9, lossesToEliminate: 9 });
    s = generateNextRound(s);          // ronde 1
    s = playRoundHomeWins(s);
    s = generateNextRound(s);          // ronde 2
    // Aucun match de ronde 2 ne doit répéter un appariement de ronde 1
    const r1 = s.matches.filter((m) => m.round === 1).map((m) => [m.home, m.away].sort().join('-'));
    const r2 = s.matches.filter((m) => m.round === 2 && m.away !== null).map((m) => [m.home, m.away!].sort().join('-'));
    for (const pair of r2) expect(r1).not.toContain(pair);
  });
});

describe('isComplete + qualifiers + standings', () => {
  it('déroule un tournoi 4 équipes (2/2) jusqu’à la fin', () => {
    let s = createSwiss(mkParticipants(4), { winsToQualify: 2, lossesToEliminate: 2 });
    let guard = 0;
    while (!isComplete(s) && guard++ < 10) {
      s = generateNextRound(s);
      s = playRoundHomeWins(s);
    }
    expect(isComplete(s)).toBe(true);
    // tout le monde est qualifié ou éliminé
    for (const p of s.participants) {
      expect(_statusOf(s, p.id)).not.toBe('active');
    }
    // les qualifiés ont bien 2 victoires
    for (const id of qualifiers(s)) {
      expect(s.records[id].wins).toBe(2);
    }
  });

  it('standings classe les qualifiés en tête et numérote les rangs', () => {
    let s = createSwiss(mkParticipants(4), { winsToQualify: 2, lossesToEliminate: 2 });
    let guard = 0;
    while (!isComplete(s) && guard++ < 10) { s = generateNextRound(s); s = playRoundHomeWins(s); }
    const table = standings(s);
    expect(table).toHaveLength(4);
    expect(table[0].rank).toBe(1);
    expect(table[table.length - 1].rank).toBe(4);
    // premier = qualifié, dernier = éliminé
    expect(table[0].status).toBe('qualified');
    expect(table[table.length - 1].status).toBe('eliminated');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: FAIL — `isComplete` / `qualifiers` / `standings` non exportés.

- [ ] **Step 3: Implémenter `isComplete`, `qualifiers`, `standings`**

```ts
// lib/formats/swiss.ts — ajouter
import type { Standing } from '../domain/types';

/** Le tournoi est terminé quand plus aucun participant n'est actif. */
export function isComplete(state: SwissState): boolean {
  return state.participants.every((p) => statusOf(state, p.id) !== 'active');
}

/** Ids des participants qualifiés. */
export function qualifiers(state: SwissState): ParticipantId[] {
  return state.participants
    .filter((p) => statusOf(state, p.id) === 'qualified')
    .map((p) => p.id);
}

const STATUS_ORDER: Record<SwissStatus, number> = { qualified: 0, active: 1, eliminated: 2 };

/** Classement : qualifiés d'abord, puis par victoires, Buchholz, seed. */
export function standings(state: SwissState): Standing[] {
  const sorted = [...state.participants].sort((a, b) => {
    const sa = STATUS_ORDER[statusOf(state, a.id)];
    const sb = STATUS_ORDER[statusOf(state, b.id)];
    if (sa !== sb) return sa - sb;
    return strengthCompare(state, a, b);
  });
  return sorted.map((p, i) => ({
    participantId: p.id,
    name: p.name,
    rank: i + 1,
    wins: state.records[p.id].wins,
    losses: state.records[p.id].losses,
    tiebreak: buchholz(state, p.id),
    status: statusOf(state, p.id),
  }));
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run lib/formats/swiss.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Lancer toute la suite de tests**

Run: `npm test`
Expected: PASS — tous les fichiers (`split.test.ts`, `swiss.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/formats/swiss.ts lib/formats/swiss.test.ts
git commit -m "feat: moteur suisse — fin de tournoi, qualifiés, classement"
```

---

## Vérification finale du plan

- [ ] `npm test` : tous les tests passent.
- [ ] `npx tsc --noEmit` : aucune erreur de type.
- [ ] Le moteur suisse gère : nombres pairs/impairs (byes), anti-revanche, Buchholz, fin de tournoi, classement, qualifiés.

## Suite (plans à venir)

- **Plan 2** : moteur double-élimination (playoff Valorant, byes génériques, seedé par le classement suisse).
- **Plan 3** : import de la liste locale + UI orga + panneau Discord (formatters appariements/classement/résultats/horaire).
- **Plan 4** : GeoGuessr (élim simple + 3e place) et TrackMania (time attack + cup).
