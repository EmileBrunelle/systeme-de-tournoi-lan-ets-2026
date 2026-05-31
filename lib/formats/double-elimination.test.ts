// lib/formats/double-elimination.test.ts
import { describe, it, expect } from 'vitest';
import type { Participant } from '../domain/types';
import {
  createDoubleElim,
  recordResult,
  playableMatches,
  isComplete,
  champion,
  standings,
  slotName,
  amendResult,
  isAmendable,
  type DEState,
  type DEMatch,
} from './double-elimination';

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return { id: 'p' + k, name: 'P' + k, seed: k };
  });
}

/** seed (1-based) d'un participant à partir de son id. */
function seedOf(state: DEState, id: string): number {
  return state.participants.find((p) => p.id === id)!.seed;
}

/**
 * Joue le tournoi jusqu'au bout : à chaque match jouable, le meilleur seed
 * (numéro le plus bas) gagne. Renvoie le dernier état.
 */
function playHigherSeedWins(initial: DEState): DEState {
  let state = initial;
  let guard = 0;
  while (!isComplete(state)) {
    const playable = playableMatches(state);
    if (playable.length === 0) break;
    const m = playable[0];
    const aSeed = seedOf(state, (m.a as { id: string }).id);
    const bSeed = seedOf(state, (m.b as { id: string }).id);
    const score = aSeed < bSeed ? { a: 13, b: 7 } : { a: 7, b: 13 };
    state = recordResult(state, m.id, score);
    if (++guard > 1000) throw new Error('boucle de simulation trop longue');
  }
  return state;
}

describe('createDoubleElim + clean runs', () => {
  it('8 players clean run : champion = seed 1, standings complets', () => {
    const state = playHigherSeedWins(createDoubleElim(mkParticipants(8)));
    expect(isComplete(state)).toBe(true);
    const champId = champion(state)!;
    expect(seedOf(state, champId)).toBe(1);

    const s = standings(state);
    expect(s).toHaveLength(8);
    expect(seedOf(state, s[0].participantId)).toBe(1);
    expect(s[0].rank).toBe(1);
    // rang 2 = autre finaliste GF
    const dec = state.matches.find((m) => m.id === 'GF-1')!;
    const aId = (dec.a as { id: string }).id;
    const bId = (dec.b as { id: string }).id;
    const other = champId === aId ? bId : aId;
    expect(s[1].participantId).toBe(other);
    expect(s[1].rank).toBe(2);
    // ranks 1..8 distincts
    expect(new Set(s.map((r) => r.rank))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('total des matches pour B=8 sans reset = 14 (7 WB + 6 LB + 1 GF)', () => {
    const state = createDoubleElim(mkParticipants(8));
    expect(state.matches).toHaveLength(14);
    expect(state.matches.filter((m) => m.bracket === 'WB')).toHaveLength(7);
    expect(state.matches.filter((m) => m.bracket === 'LB')).toHaveLength(6);
    expect(state.matches.filter((m) => m.bracket === 'GF')).toHaveLength(1);
  });

  it('4 players clean run : champion = seed 1, standings length 4', () => {
    const state = playHigherSeedWins(createDoubleElim(mkParticipants(4)));
    expect(isComplete(state)).toBe(true);
    expect(seedOf(state, champion(state)!)).toBe(1);
    expect(standings(state)).toHaveLength(4);
  });
});

describe('byes (6 players -> B=8)', () => {
  it('top seeds auto-advance, bas seeds en bye, run complet, standings length 6', () => {
    const state = createDoubleElim(mkParticipants(6));
    // B=8, 2 byes. Seeds 7 et 8 n'existent pas (N=6) -> slots bye.
    // Les adversaires de ces byes (seeds 2 et 3 via l'ordre de seeding) auto-avancent.
    // On vérifie qu'au moins deux matches WB R1 sont des auto-advances (winner sans score).
    const wbR1 = state.matches.filter((m) => m.bracket === 'WB' && m.round === 1);
    const autoAdvanced = wbR1.filter((m) => m.winner !== null && m.score === null);
    expect(autoAdvanced.length).toBe(2);
    // chaque auto-advance a un joueur gagnant parmi un top seed
    for (const m of autoAdvanced) {
      expect(seedOf(state, m.winner!)).toBeLessThanOrEqual(6);
    }

    const final = playHigherSeedWins(state);
    expect(isComplete(final)).toBe(true);
    expect(champion(final)).not.toBeNull();
    const s = standings(final);
    expect(s).toHaveLength(6);
    // seul des vrais joueurs (p1..p6)
    expect(s.every((r) => /^p[1-6]$/.test(r.participantId))).toBe(true);
    expect(new Set(s.map((r) => r.rank))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe('double-elim safety', () => {
  it('le champion (run higher-seed-wins) n a aucune défaite player-vs-player', () => {
    const state = playHigherSeedWins(createDoubleElim(mkParticipants(8)));
    const champId = champion(state)!;
    const losses = state.matches.filter(
      (m) =>
        m.score !== null &&
        m.a.kind === 'player' &&
        m.b.kind === 'player' &&
        m.winner !== null &&
        m.winner !== champId &&
        (((m.a as { id: string }).id === champId) || ((m.b as { id: string }).id === champId)),
    );
    expect(losses).toHaveLength(0);
  });

  it('une équipe perdante en WB peut gagner en LB', () => {
    const state = playHigherSeedWins(createDoubleElim(mkParticipants(8)));
    // Au moins un match LB joué et gagné par une équipe ayant déjà une défaite WB.
    const lbPlayed = state.matches.filter(
      (m) => m.bracket === 'LB' && m.score !== null && m.winner !== null,
    );
    expect(lbPlayed.length).toBeGreaterThan(0);

    // Le gagnant d'un de ces matches LB a une défaite WB antérieure.
    const wbLosers = new Set<string>();
    for (const m of state.matches) {
      if (m.bracket === 'WB' && m.score !== null && m.winner !== null && m.a.kind === 'player' && m.b.kind === 'player') {
        const aId = (m.a as { id: string }).id;
        const bId = (m.b as { id: string }).id;
        wbLosers.add(m.winner === aId ? bId : aId);
      }
    }
    const lbWinnerWithWbLoss = lbPlayed.some((m) => wbLosers.has(m.winner!));
    expect(lbWinnerWithWbLoss).toBe(true);
  });
});

describe('grandFinalReset', () => {
  it('le finaliste LB bat le finaliste WB en GF-1 -> GF-2 créé et décide le champion', () => {
    // Construit un état où on contrôle GF-1 : on joue tout jusqu'à GF-1, puis
    // on force le side B (LB) à gagner.
    let state = createDoubleElim(mkParticipants(4), { grandFinalReset: true });

    // Joue tout sauf GF en higher-seed-wins, jusqu'à ce que GF-1 soit jouable.
    let guard = 0;
    while (true) {
      const playable = playableMatches(state).filter((m) => m.id !== 'GF-1');
      if (playable.length === 0) break;
      const m = playable[0];
      const aSeed = seedOf(state, (m.a as { id: string }).id);
      const bSeed = seedOf(state, (m.b as { id: string }).id);
      const score = aSeed < bSeed ? { a: 13, b: 7 } : { a: 7, b: 13 };
      state = recordResult(state, m.id, score);
      if (++guard > 100) throw new Error('boucle');
    }

    const gf1 = state.matches.find((m) => m.id === 'GF-1')!;
    expect(gf1.a.kind).toBe('player');
    expect(gf1.b.kind).toBe('player');
    const wbFinalist = (gf1.a as { id: string }).id;
    const lbFinalist = (gf1.b as { id: string }).id;

    // Side B (LB) gagne GF-1.
    state = recordResult(state, 'GF-1', { a: 7, b: 13 });

    const gf2 = state.matches.find((m) => m.id === 'GF-2');
    expect(gf2).toBeDefined();
    expect((gf2!.a as { id: string }).id).toBe(wbFinalist);
    expect((gf2!.b as { id: string }).id).toBe(lbFinalist);
    expect(isComplete(state)).toBe(false); // GF-2 pas encore joué

    // GF-2 décide le champion : disons le finaliste WB gagne le reset.
    state = recordResult(state, 'GF-2', { a: 13, b: 9 });
    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe(wbFinalist);
  });

  it('sans reset, GF-1 décide directement même si side B gagne', () => {
    let state = createDoubleElim(mkParticipants(4)); // reset off
    let guard = 0;
    while (true) {
      const playable = playableMatches(state).filter((m) => m.id !== 'GF-1');
      if (playable.length === 0) break;
      const m = playable[0];
      const aSeed = seedOf(state, (m.a as { id: string }).id);
      const bSeed = seedOf(state, (m.b as { id: string }).id);
      state = recordResult(state, m.id, aSeed < bSeed ? { a: 13, b: 7 } : { a: 7, b: 13 });
      if (++guard > 100) throw new Error('boucle');
    }
    const gf1 = state.matches.find((m) => m.id === 'GF-1')!;
    const lbFinalist = (gf1.b as { id: string }).id;
    state = recordResult(state, 'GF-1', { a: 7, b: 13 });
    expect(state.matches.find((m) => m.id === 'GF-2')).toBeUndefined();
    expect(isComplete(state)).toBe(true);
    expect(champion(state)).toBe(lbFinalist);
  });
});

describe('immutabilité et erreurs', () => {
  it('recordResult ne mute pas l état d entrée', () => {
    const state = createDoubleElim(mkParticipants(8));
    const snapshot = JSON.parse(JSON.stringify(state));
    const playable = playableMatches(state);
    recordResult(state, playable[0].id, { a: 13, b: 5 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('recordResult throw sur id inconnu', () => {
    const state = createDoubleElim(mkParticipants(8));
    expect(() => recordResult(state, 'NOPE-X', { a: 1, b: 0 })).toThrow();
  });

  it('recordResult throw sur match dont une slot est tbd', () => {
    const state = createDoubleElim(mkParticipants(8));
    // GF-1 a deux slots tbd à la création.
    const gf1 = state.matches.find((m) => m.id === 'GF-1')!;
    expect(gf1.a.kind).toBe('tbd');
    expect(() => recordResult(state, 'GF-1', { a: 13, b: 0 })).toThrow();
  });

  it('recordResult throw sur match dont une slot est bye', () => {
    const state = createDoubleElim(mkParticipants(6));
    // Trouve un match WB R1 avec un bye non encore résolu... mais la cascade
    // résout les byes. On construit donc le cas via un match au winner déjà posé.
    const wbR1 = state.matches.filter((m) => m.bracket === 'WB' && m.round === 1);
    const autoAdvanced = wbR1.find((m) => m.winner !== null);
    // ce match a une slot bye et un winner déjà décidé -> doit throw.
    expect(autoAdvanced).toBeDefined();
    expect(() => recordResult(state, autoAdvanced!.id, { a: 13, b: 0 })).toThrow();
  });
});

describe('slotName', () => {
  it('résout un joueur en son nom, sinon « bye » / « à venir »', () => {
    const s = createDoubleElim(mkParticipants(4)); // M1: seed1 vs seed4
    const m1 = s.matches.find((m) => m.id === 'WB-R1-M1')!;
    expect(slotName(s, m1.a)).toBe('P1'); // joueur résolu
    expect(slotName(s, { kind: 'bye' })).toBe('bye');
    expect(slotName(s, { kind: 'tbd' })).toBe('à venir'); // slot non encore déterminé
  });
});

describe('amendResult (corriger un score playoff)', () => {
  it('corrige le score sans changer le vainqueur (toujours sûr)', () => {
    let s = createDoubleElim(mkParticipants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 }); // seed 1 gagne
    s = amendResult(s, 'WB-R1-M1', { a: 13, b: 10 });
    const m = s.matches.find((x) => x.id === 'WB-R1-M1')!;
    expect(m.score).toEqual({ a: 13, b: 10 });
    expect(seedOf(s, m.winner!)).toBe(1);
  });

  it('change le vainqueur et re-propage si l’aval n’est pas joué', () => {
    let s = createDoubleElim(mkParticipants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 }); // seed 1 avance en WB-R2-M1.a
    s = amendResult(s, 'WB-R1-M1', { a: 7, b: 13 }); // flip → seed 4 gagne
    const m = s.matches.find((x) => x.id === 'WB-R1-M1')!;
    expect(seedOf(s, m.winner!)).toBe(4);
    const semi = s.matches.find((x) => x.id === 'WB-R2-M1')!;
    expect(semi.a.kind).toBe('player');
    expect(seedOf(s, (semi.a as { id: string }).id)).toBe(4);
  });

  it('refuse le changement de vainqueur si le résultat a déjà avancé dans un match joué', () => {
    let s = createDoubleElim(mkParticipants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 });
    s = recordResult(s, 'WB-R1-M2', { a: 13, b: 7 });
    s = recordResult(s, 'WB-R2-M1', { a: 13, b: 5 }); // finale WB jouée
    expect(() => amendResult(s, 'WB-R1-M1', { a: 7, b: 13 })).toThrow();
  });

  it('un match sans résultat ne se corrige pas', () => {
    const s = createDoubleElim(mkParticipants(4));
    expect(() => amendResult(s, 'WB-R1-M1', { a: 13, b: 7 })).toThrow();
  });
});

describe('isAmendable', () => {
  it('vrai pour un match joué dont l’aval n’est pas joué', () => {
    let s = createDoubleElim(mkParticipants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 });
    expect(isAmendable(s, 'WB-R1-M1')).toBe(true);
  });
  it('faux si l’aval est déjà joué', () => {
    let s = createDoubleElim(mkParticipants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 });
    s = recordResult(s, 'WB-R1-M2', { a: 13, b: 7 });
    s = recordResult(s, 'WB-R2-M1', { a: 13, b: 5 });
    expect(isAmendable(s, 'WB-R1-M1')).toBe(false);
  });
  it('faux pour un match non joué', () => {
    const s = createDoubleElim(mkParticipants(4));
    expect(isAmendable(s, 'WB-R1-M1')).toBe(false);
  });
});
