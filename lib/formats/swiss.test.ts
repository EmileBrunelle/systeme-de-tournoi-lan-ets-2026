// lib/formats/swiss.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSwiss,
  statusOf,
  recordResult,
  buchholz,
  generateNextRound,
  currentRound,
  isComplete,
  qualifiers,
  standings,
} from './swiss';
import type { SwissState } from './swiss';
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
      expect(statusOf(s, p.id)).not.toBe('active');
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
