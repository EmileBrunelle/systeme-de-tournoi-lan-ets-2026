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
