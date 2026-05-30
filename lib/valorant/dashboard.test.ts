// Dérivation des « vitals » du poste de commandement (présentation pure).
// Aucune logique de tournoi ici : on lit ce que le moteur expose.
import { describe, it, expect } from 'vitest';
import type { Participant } from '../domain/types';
import * as swiss from '../formats/swiss';
import * as de from '../formats/double-elimination';
import * as runner from '../runtime/runner';
import { valorantVitals } from './dashboard';

function makeParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Équipe ${i + 1}`, seed: i + 1 }));
}

function tile(state: runner.ValorantState, key: string) {
  const v = valorantVitals(state);
  const t = v.tiles.find((x) => x.key === key);
  if (!t) throw new Error(`tuile absente: ${key} (présentes: ${v.tiles.map((x) => x.key).join(',')})`);
  return t;
}

describe('valorantVitals — phase suisse', () => {
  it('avant toute ronde : ronde 0 affichée « — », aucun match', () => {
    const state = runner.startValorant(makeParticipants(8), 4);
    const v = valorantVitals(state);
    expect(v.phase).toBe('swiss');
    expect(tile(state, 'round').value).toBe('—');
    expect(tile(state, 'matches').value).toBe('0/0');
  });

  it('compte les matchs joués / total de la ronde courante (byes exclus du total)', () => {
    let state = runner.startValorant(makeParticipants(8), 4);
    state = { ...state, swiss: swiss.generateNextRound(state.swiss) }; // ronde 1 : 4 matchs
    expect(tile(state, 'round').value).toBe('1');
    expect(tile(state, 'matches').value).toBe('0/4');

    const first = state.swiss.matches.find((m) => m.away !== null)!;
    state = { ...state, swiss: swiss.recordResult(state.swiss, first.id, { home: 13, away: 7 }) };
    expect(tile(state, 'matches').value).toBe('1/4');
    expect(tile(state, 'matches').progress).toBeCloseTo(0.25);
  });

  it('qualification : qualifiés / playoffSize avec actifs et éliminés en indice', () => {
    let state = runner.startValorant(makeParticipants(8), 4);
    // Joue toute la suisse (home gagne toujours).
    let s = state.swiss;
    while (!swiss.isComplete(s)) {
      s = swiss.generateNextRound(s);
      for (const m of s.matches) {
        if (m.away !== null && m.score === null) s = swiss.recordResult(s, m.id, { home: 13, away: 5 });
      }
    }
    state = { ...state, swiss: s };
    const q = tile(state, 'qualif');
    const qualified = swiss.qualifiers(s).length;
    expect(q.value).toBe(`${qualified}/4`);
    expect(q.hint).toMatch(/élimin/i);
  });

  it('meneur : équipe en tête du classement avec son bilan V-D', () => {
    let state = runner.startValorant(makeParticipants(8), 4);
    state = { ...state, swiss: swiss.generateNextRound(state.swiss) };
    for (const m of state.swiss.matches) {
      if (m.away !== null && m.score === null) {
        state = { ...state, swiss: swiss.recordResult(state.swiss, m.id, { home: 13, away: 1 }) };
      }
    }
    const board = swiss.standings(state.swiss);
    const leader = tile(state, 'leader');
    expect(leader.value).toBe(board[0].name);
    expect(leader.hint).toBe(`${board[0].wins}-${board[0].losses}`);
  });
});

describe('valorantVitals — playoff', () => {
  function reachPlayoff(): runner.ValorantState {
    let state = runner.startValorant(makeParticipants(4), 4);
    let s = state.swiss;
    while (!swiss.isComplete(s)) {
      s = swiss.generateNextRound(s);
      for (const m of s.matches) {
        if (m.away !== null && m.score === null) s = swiss.recordResult(s, m.id, { home: 13, away: 4 });
      }
    }
    return runner.startPlayoff({ ...state, swiss: s });
  }

  it('expose la phase playoff et le nombre de matchs jouables', () => {
    const state = reachPlayoff();
    const v = valorantVitals(state);
    expect(v.phase).toBe('playoff');
    expect(tile(state, 'playable').value).toBe(String(de.playableMatches(state.playoff!).length));
  });

  it('champion : « en cours » tant que non décidé, puis le nom une fois fini', () => {
    let state = reachPlayoff();
    expect(tile(state, 'champion').value).toBe('en cours');

    let p = state.playoff!;
    while (!de.isComplete(p)) {
      const playable = de.playableMatches(p);
      if (playable.length === 0) break;
      p = de.recordResult(p, playable[0].id, { a: 2, b: 0 });
    }
    state = { ...state, playoff: p };
    const champ = de.champion(p)!;
    const name = p.participants.find((x) => x.id === champ)!.name;
    expect(tile(state, 'champion').value).toBe(name);
  });
});
