// lib/formats/swiss.test.ts
import { describe, it, expect } from 'vitest';
import { createSwiss, statusOf, recordResult } from './swiss';
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
