// lib/formats/double-elimination.ts
import type { Participant, ParticipantId } from '../domain/types';

export interface DEMatch {
  id: string;
  bracket: 'WB' | 'LB' | 'GF';
  round: number; // round number within its bracket (1-based)
  a: DESlot; // home side
  b: DESlot; // away side
  score: { a: number; b: number } | null; // null = not played
  winner: ParticipantId | null; // null until decided
}

export type DESlot =
  | { kind: 'tbd' } // not yet determined
  | { kind: 'bye' } // empty (padding)
  | { kind: 'player'; id: ParticipantId };

export interface DEState {
  participants: Participant[]; // in SEED ORDER (index 0 = seed 1 = best)
  matches: DEMatch[];
  grandFinalReset: boolean;
}

export interface DEConfig {
  grandFinalReset?: boolean;
}

export interface DEStanding {
  participantId: ParticipantId;
  name: string;
  rank: number;
}

/**
 * Routing interne : où vont le gagnant et le perdant d'un match donné.
 * `side` indique le côté ('a' | 'b') de la slot cible. `null` = terminal.
 */
type Route = { matchId: string; side: 'a' | 'b' } | null;

interface Routing {
  [matchId: string]: { winnerTo: Route; loserTo: Route };
}

// Le routing n'est pas exposé sur DEMatch ; on le reconstruit déterministe-
// ment à partir de la structure des matches à chaque appel qui en a besoin.

/** Ordre de seeding récursif standard pour un bracket de taille `size`. */
function seedOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const prev = seedOrder(size / 2);
  const out: number[] = [];
  for (const s of prev) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

function nextPow2(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

function deepCloneState(state: DEState): DEState {
  return {
    participants: state.participants.map((p) => ({ ...p })),
    grandFinalReset: state.grandFinalReset,
    matches: state.matches.map((m) => ({
      ...m,
      a: { ...m.a },
      b: { ...m.b },
      score: m.score ? { ...m.score } : null,
    })),
  };
}

/** Construit le routing winnerTo/loserTo pour un bracket de taille B (k rounds). */
function buildRouting(B: number, k: number): Routing {
  const routing: Routing = {};

  // --- Winners bracket ---
  for (let r = 1; r <= k; r++) {
    const count = B / 2 ** r;
    for (let i = 1; i <= count; i++) {
      const id = `WB-R${r}-M${i}`;
      let winnerTo: Route;
      let loserTo: Route;

      if (r < k) {
        // gagnant -> WB round suivant
        const targetM = Math.ceil(i / 2);
        const side: 'a' | 'b' = i % 2 === 1 ? 'a' : 'b';
        winnerTo = { matchId: `WB-R${r + 1}-M${targetM}`, side };
      } else {
        // WB final -> GF side A
        winnerTo = { matchId: 'GF-1', side: 'a' };
      }

      // Perdant -> LB
      if (k === 1) {
        // pas de LB : seul match WB est la "finale" qui alimente GF.B directement
        loserTo = { matchId: 'GF-1', side: 'b' };
      } else if (r === 1) {
        // WB R1 losers -> LB R1 (minor round j=1)
        const targetM = Math.ceil(i / 2);
        const side: 'a' | 'b' = i % 2 === 1 ? 'a' : 'b';
        loserTo = { matchId: `LB-R1-M${targetM}`, side };
      } else {
        // WB R{r} loser (r>=2) -> major round LB R{2*(r-1)} side B, même i
        const j = r - 1; // car WB-R{j+1} alimente major round LB-R{2j}
        const lbRound = 2 * j;
        loserTo = { matchId: `LB-R${lbRound}-M${i}`, side: 'b' };
      }

      routing[id] = { winnerTo, loserTo };
    }
  }

  // --- Losers bracket ---
  if (k >= 2) {
    for (let j = 1; j <= k - 1; j++) {
      // Minor round LB R{2j-1}
      const minorRound = 2 * j - 1;
      const minorCount = B / 2 ** (j + 1);
      for (let i = 1; i <= minorCount; i++) {
        const id = `LB-R${minorRound}-M${i}`;
        // gagnant du minor -> major round LB R{2j} side A, même i
        routing[id] = {
          winnerTo: { matchId: `LB-R${2 * j}-M${i}`, side: 'a' },
          loserTo: null,
        };
      }

      // Major round LB R{2j}
      const majorRound = 2 * j;
      const majorCount = B / 2 ** (j + 1);
      for (let i = 1; i <= majorCount; i++) {
        const id = `LB-R${majorRound}-M${i}`;
        let winnerTo: Route;
        if (j < k - 1) {
          // gagnant -> minor round suivant LB R{2j+1} -> ceil(i/2)
          const targetM = Math.ceil(i / 2);
          const side: 'a' | 'b' = i % 2 === 1 ? 'a' : 'b';
          winnerTo = { matchId: `LB-R${2 * j + 1}-M${targetM}`, side };
        } else {
          // dernier major = LB final -> GF side B
          winnerTo = { matchId: 'GF-1', side: 'b' };
        }
        routing[id] = { winnerTo, loserTo: null };
      }
    }
  }

  // GF-1 : terminal (gestion du reset dans recordResult)
  routing['GF-1'] = { winnerTo: null, loserTo: null };

  return routing;
}

function emptyMatch(id: string, bracket: 'WB' | 'LB' | 'GF', round: number): DEMatch {
  return { id, bracket, round, a: { kind: 'tbd' }, b: { kind: 'tbd' }, score: null, winner: null };
}

export function createDoubleElim(participants: Participant[], config: DEConfig = {}): DEState {
  if (participants.length < 2) throw new Error('Au moins 2 participants requis.');

  // Tri par seed pour garantir l'ordre (index 0 = seed 1).
  const ordered = [...participants].sort((p1, p2) => p1.seed - p2.seed);

  const N = ordered.length;
  const B = nextPow2(N);
  const k = Math.log2(B);

  const seeds = seedOrder(B); // seeds[p] = seed du joueur en position p (0-based)
  // slot position p reçoit le participant dont seed === seeds[p], sinon bye
  const slotFor = (p: number): DESlot => {
    const seed = seeds[p];
    if (seed > N) return { kind: 'bye' };
    const participant = ordered[seed - 1];
    return { kind: 'player', id: participant.id };
  };

  const matches: DEMatch[] = [];

  // WB
  for (let r = 1; r <= k; r++) {
    const count = B / 2 ** r;
    for (let i = 1; i <= count; i++) {
      const m = emptyMatch(`WB-R${r}-M${i}`, 'WB', r);
      if (r === 1) {
        m.a = slotFor(2 * i - 2);
        m.b = slotFor(2 * i - 1);
      }
      matches.push(m);
    }
  }

  // LB
  if (k >= 2) {
    for (let lbRound = 1; lbRound <= 2 * (k - 1); lbRound++) {
      const j = Math.ceil(lbRound / 2);
      const count = B / 2 ** (j + 1);
      for (let i = 1; i <= count; i++) {
        matches.push(emptyMatch(`LB-R${lbRound}-M${i}`, 'LB', lbRound));
      }
    }
  }

  // GF
  matches.push(emptyMatch('GF-1', 'GF', 1));

  const state: DEState = {
    participants: ordered,
    matches,
    grandFinalReset: config.grandFinalReset ?? false,
  };

  // Cascade de résolution des byes à la création.
  const routing = buildRouting(B, k);
  resolveCascade(state, routing);

  return state;
}

function findMatch(state: DEState, id: string): DEMatch | undefined {
  return state.matches.find((m) => m.id === id);
}

/** Place une slot dans la cible désignée par une Route (mutation in place). */
function applyRoute(state: DEState, route: Route, slot: DESlot): void {
  if (!route) return;
  const target = findMatch(state, route.matchId);
  if (!target) return;
  if (route.side === 'a') target.a = slot;
  else target.b = slot;
}

/**
 * Résout en boucle les matches dont les deux slots sont non-tbd mais qui
 * impliquent au moins un bye (auto-advance ou cascade de byes). Ne touche
 * jamais à un match player-vs-player non joué.
 */
function resolveCascade(state: DEState, routing: Routing): void {
  const processed = new Set<string>(); // matches déjà résolus comme bye/bye
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of state.matches) {
      if (m.winner !== null) continue;
      if (m.score !== null) continue;
      if (m.a.kind === 'tbd' || m.b.kind === 'tbd') continue;

      const aPlayer = m.a.kind === 'player';
      const bPlayer = m.b.kind === 'player';

      if (aPlayer && bPlayer) continue; // playable, on ne touche pas

      const route = routing[m.id];

      if (aPlayer && !bPlayer) {
        // a vs bye -> a avance
        m.winner = (m.a as { kind: 'player'; id: ParticipantId }).id;
        m.score = null;
        applyRoute(state, route?.winnerTo ?? null, { kind: 'player', id: m.winner });
        applyRoute(state, route?.loserTo ?? null, { kind: 'bye' });
        changed = true;
      } else if (!aPlayer && bPlayer) {
        // bye vs b -> b avance
        m.winner = (m.b as { kind: 'player'; id: ParticipantId }).id;
        m.score = null;
        applyRoute(state, route?.winnerTo ?? null, { kind: 'player', id: m.winner });
        applyRoute(state, route?.loserTo ?? null, { kind: 'bye' });
        changed = true;
      } else if (!processed.has(m.id)) {
        // bye vs bye -> propage bye aux deux destinations, une seule fois.
        processed.add(m.id);
        applyRoute(state, route?.winnerTo ?? null, { kind: 'bye' });
        applyRoute(state, route?.loserTo ?? null, { kind: 'bye' });
        changed = true;
      }
    }
  }
}

export function recordResult(
  state: DEState,
  matchId: string,
  score: { a: number; b: number },
): DEState {
  const next = deepCloneState(state);
  const match = findMatch(next, matchId);
  if (!match) throw new Error(`Match introuvable : ${matchId}`);
  if (match.a.kind !== 'player' || match.b.kind !== 'player') {
    throw new Error(`Le match ${matchId} n'a pas deux joueurs déterminés.`);
  }
  if (match.winner !== null) throw new Error(`Le match ${matchId} a déjà un résultat.`);

  const B = nextPow2(next.participants.length);
  const k = Math.log2(B);
  const routing = buildRouting(B, k);

  match.score = { a: score.a, b: score.b };
  const aWon = score.a > score.b;
  const aId = (match.a as { kind: 'player'; id: ParticipantId }).id;
  const bId = (match.b as { kind: 'player'; id: ParticipantId }).id;
  const winner = aWon ? aId : bId;
  const loser = aWon ? bId : aId;
  match.winner = winner;

  if (match.id === 'GF-1') {
    // side A = vainqueur WB, side B = vainqueur LB.
    if (next.grandFinalReset && winner === bId) {
      // Le finaliste LB (side B) gagne -> bracket reset : crée GF-2.
      const gf2 = emptyMatch('GF-2', 'GF', 2);
      gf2.a = { kind: 'player', id: aId };
      gf2.b = { kind: 'player', id: bId };
      next.matches.push(gf2);
    }
    // sinon GF-1 décide le champion (pas de routing).
    return next;
  }

  if (match.id === 'GF-2') {
    return next; // terminal
  }

  const route = routing[match.id];
  applyRoute(next, route?.winnerTo ?? null, { kind: 'player', id: winner });
  applyRoute(next, route?.loserTo ?? null, { kind: 'player', id: loser });

  resolveCascade(next, routing);

  return next;
}

/**
 * Corrige le score d'un match DÉJÀ joué (le « crayon » du playoff, parité avec la
 * suisse). Deux cas :
 *   • vainqueur inchangé → on met juste à jour le score (toujours sûr) ;
 *   • vainqueur changé → on re-propage (le nouveau gagnant avance, le nouveau
 *     perdant tombe), mais SEULEMENT si le résultat n'a pas déjà avancé dans un
 *     match joué — sinon on refuse (il faut corriger l'aval d'abord). Évite
 *     d'invalider silencieusement une partie déjà jouée.
 * Le changement de vainqueur en grande finale n'est pas géré ici (création/retrait
 * du reset trop délicat) : seul le score y est corrigible.
 */
export function amendResult(state: DEState, matchId: string, score: { a: number; b: number }): DEState {
  const next = deepCloneState(state);
  const match = findMatch(next, matchId);
  if (!match) throw new Error(`Match introuvable : ${matchId}`);
  if (match.winner === null) throw new Error(`Le match ${matchId} n'a pas encore de résultat à corriger.`);
  if (match.a.kind !== 'player' || match.b.kind !== 'player') {
    throw new Error(`Le match ${matchId} n'a pas deux joueurs déterminés.`);
  }

  const aId = (match.a as { kind: 'player'; id: ParticipantId }).id;
  const bId = (match.b as { kind: 'player'; id: ParticipantId }).id;
  const aWon = score.a > score.b;
  const newWinner = aWon ? aId : bId;
  const newLoser = aWon ? bId : aId;

  // Vainqueur inchangé : simple mise à jour du score.
  if (newWinner === match.winner) {
    match.score = { a: score.a, b: score.b };
    return next;
  }

  if (match.bracket === 'GF') {
    throw new Error('Changer le vainqueur en grande finale n’est pas supporté ici.');
  }

  const B = nextPow2(next.participants.length);
  const k = Math.log2(B);
  const routing = buildRouting(B, k);
  const route = routing[match.id];

  // Refuse si le résultat a déjà avancé dans un match joué (sinon on l'invaliderait).
  for (const r of [route?.winnerTo, route?.loserTo]) {
    if (!r) continue;
    const target = findMatch(next, r.matchId);
    if (target && (target.winner !== null || target.score !== null)) {
      throw new Error(`Impossible : le résultat de ${matchId} a déjà avancé dans le match joué ${r.matchId}. Corrigez-le d'abord.`);
    }
  }

  match.score = { a: score.a, b: score.b };
  match.winner = newWinner;
  applyRoute(next, route?.winnerTo ?? null, { kind: 'player', id: newWinner });
  applyRoute(next, route?.loserTo ?? null, { kind: 'player', id: newLoser });
  resolveCascade(next, routing);
  return next;
}

/**
 * Vrai si le match peut être corrigé en sécurité via `amendResult` : il est joué
 * (vrai score) et son résultat n'a pas encore avancé dans un match joué. Sert à
 * n'afficher le « crayon » que sur la frontière corrigeable (parité « manche
 * courante » du suisse), sans risque d'invalider une partie déjà jouée.
 */
export function isAmendable(state: DEState, matchId: string): boolean {
  const m = findMatch(state, matchId);
  if (!m || m.winner === null || m.score === null) return false;
  if (m.a.kind !== 'player' || m.b.kind !== 'player') return false;
  if (m.bracket === 'GF') return true; // seul le score y est corrigible (géré par amendResult)
  const B = nextPow2(state.participants.length);
  const k = Math.log2(B);
  const routing = buildRouting(B, k);
  const route = routing[matchId];
  for (const r of [route?.winnerTo, route?.loserTo]) {
    if (!r) continue;
    const target = findMatch(state, r.matchId);
    if (target && (target.winner !== null || target.score !== null)) return false;
  }
  return true;
}

export function playableMatches(state: DEState): DEMatch[] {
  return state.matches.filter(
    (m) => m.a.kind === 'player' && m.b.kind === 'player' && m.score === null && m.winner === null,
  );
}

/**
 * Nom affichable d'une slot : nom du joueur s'il est déterminé, sinon « bye » ou
 * « à venir ». Source unique partagée par la console, le panneau Discord et le
 * serveur MCP (évite trois copies du même `kind === 'player' ? …`).
 */
export function slotName(state: DEState, slot: DESlot): string {
  if (slot.kind === 'player') return state.participants.find((p) => p.id === slot.id)?.name ?? slot.id;
  return slot.kind === 'bye' ? 'bye' : 'à venir';
}

function decidingMatch(state: DEState): DEMatch | undefined {
  const gf2 = findMatch(state, 'GF-2');
  if (gf2) return gf2;
  return findMatch(state, 'GF-1');
}

export function isComplete(state: DEState): boolean {
  const m = decidingMatch(state);
  return !!m && m.winner !== null;
}

export function champion(state: DEState): ParticipantId | null {
  const m = decidingMatch(state);
  return m && m.winner !== null ? m.winner : null;
}

/**
 * Classement. Rang 1 = champion, rang 2 = autre finaliste GF, puis le reste
 * par profondeur d'élimination (2e défaite réelle). Élimination plus tardive
 * = meilleur rang ; égalité départagée par meilleur seed (numéro plus bas).
 */
export function standings(state: DEState): DEStanding[] {
  const byId = new Map<ParticipantId, Participant>();
  for (const p of state.participants) byId.set(p.id, p);

  // Compte les défaites réelles (matches player-vs-player joués) par joueur,
  // et mémorise l'ordre global des matches pour estimer la profondeur.
  const matchOrder = new Map<string, number>();
  state.matches.forEach((m, idx) => matchOrder.set(m.id, idx));

  // realLoss : liste des "poids" d'élimination par joueur (ordre des défaites).
  const losses = new Map<ParticipantId, number[]>(); // valeur = index d'ordre du match
  for (const p of state.participants) losses.set(p.id, []);

  for (const m of state.matches) {
    if (m.winner === null) continue;
    if (m.score === null) continue; // bye auto-advance : pas une défaite
    if (m.a.kind !== 'player' || m.b.kind !== 'player') continue;
    const aId = (m.a as { kind: 'player'; id: ParticipantId }).id;
    const bId = (m.b as { kind: 'player'; id: ParticipantId }).id;
    const loser = m.winner === aId ? bId : aId;
    losses.get(loser)!.push(matchOrder.get(m.id)!);
  }

  const champ = champion(state);
  // Autre finaliste GF = l'autre joueur du match décisif.
  let runnerUp: ParticipantId | null = null;
  const dec = decidingMatch(state);
  if (dec && champ) {
    const aId = dec.a.kind === 'player' ? dec.a.id : null;
    const bId = dec.b.kind === 'player' ? dec.b.id : null;
    runnerUp = champ === aId ? bId : aId;
  }

  // Profondeur d'élimination = index d'ordre de la 2e défaite (ou -inf si pas
  // éliminé). Plus grand = éliminé plus tard = meilleur rang.
  const eliminationDepth = (id: ParticipantId): number => {
    const l = losses.get(id)!;
    if (l.length >= 2) return l[1];
    return Number.POSITIVE_INFINITY; // non éliminé (ne devrait concerner que finalistes)
  };

  const rest = state.participants
    .filter((p) => p.id !== champ && p.id !== runnerUp)
    .sort((p1, p2) => {
      const d1 = eliminationDepth(p1.id);
      const d2 = eliminationDepth(p2.id);
      if (d1 !== d2) return d2 - d1; // plus tard = meilleur (en tête)
      return p1.seed - p2.seed; // tie-break : meilleur seed
    });

  const out: DEStanding[] = [];
  let rank = 1;
  if (champ) {
    out.push({ participantId: champ, name: byId.get(champ)!.name, rank: rank++ });
  }
  if (runnerUp) {
    out.push({ participantId: runnerUp, name: byId.get(runnerUp)!.name, rank: rank++ });
  }
  for (const p of rest) {
    out.push({ participantId: p.id, name: p.name, rank: rank++ });
  }
  return out;
}
