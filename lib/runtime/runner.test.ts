// Tests de la couche d'orchestration : les transitions de phase qui relient
// les moteurs purs (suisse -> playoff, Time Attack -> cup).
import { describe, it, expect } from 'vitest';
import type { Participant } from '../domain/types';
import * as swiss from '../formats/swiss';
import * as de from '../formats/double-elimination';
import * as runner from './runner';

function makeParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Équipe ${i + 1}`, seed: i + 1 }));
}

/** Joue la phase suisse jusqu'au bout (résout chaque match : home gagne). */
function playOutSwiss(state: runner.ValorantState): runner.ValorantState {
  let s = state.swiss;
  while (!swiss.isComplete(s)) {
    s = swiss.generateNextRound(s);
    for (const m of s.matches) {
      if (m.away !== null && m.score === null) {
        s = swiss.recordResult(s, m.id, { home: 13, away: 7 });
      }
    }
  }
  return { ...state, swiss: s };
}

describe('runner Valorant', () => {
  it('démarre en phase suisse', () => {
    const state = runner.startValorant(makeParticipants(8), 4);
    expect(state.phase).toBe('swiss');
    expect(state.playoffSize).toBe(4);
    expect(state.playoff).toBeNull();
  });

  it('passe au playoff avec les N meilleurs du classement suisse', () => {
    const started = runner.startValorant(makeParticipants(8), 4);
    const done = playOutSwiss(started);
    expect(runner.canStartPlayoff(done)).toBe(true);

    const withPlayoff = runner.startPlayoff(done);
    expect(withPlayoff.phase).toBe('playoff');
    expect(withPlayoff.playoff).not.toBeNull();

    // Le playoff contient exactement les 4 premiers du classement suisse,
    // re-seedés 1..4.
    const top4 = swiss.standings(done.swiss).slice(0, 4).map((r) => r.participantId);
    const playoffParts = withPlayoff.playoff!.participants;
    expect(playoffParts.map((p) => p.id)).toEqual(top4);
    expect(playoffParts.map((p) => p.seed)).toEqual([1, 2, 3, 4]);
  });

  it('refuse le playoff tant que la suisse n’est pas finie', () => {
    const started = runner.startValorant(makeParticipants(8), 4);
    expect(runner.canStartPlayoff(started)).toBe(false);
  });
});

// Sanity : le champion du playoff est calculable après l'avoir joué.
describe('runner intégration', () => {
  it('un playoff complet désigne un champion', () => {
    const started = runner.startValorant(makeParticipants(4), 4);
    const done = playOutSwiss(started);
    let withPlayoff = runner.startPlayoff(done);
    let p = withPlayoff.playoff!;
    while (!de.isComplete(p)) {
      const playable = de.playableMatches(p);
      if (playable.length === 0) break;
      p = de.recordResult(p, playable[0].id, { a: 2, b: 0 });
    }
    expect(de.champion(p)).not.toBeNull();
  });
});
