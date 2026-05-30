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

  it('passe au playoff avec les N qualifiés, seedés par difficulté de calendrier', () => {
    const started = runner.startValorant(makeParticipants(8), 4);
    const done = playOutSwiss(started);
    expect(runner.canStartPlayoff(done)).toBe(true);

    const withPlayoff = runner.startPlayoff(done);
    expect(withPlayoff.phase).toBe('playoff');
    expect(withPlayoff.playoff).not.toBeNull();

    const playoffParts = withPlayoff.playoff!.participants;

    // Même ensemble que les 4 premiers du classement suisse (les qualifiés)...
    const qualifiedSet = swiss.standings(done.swiss).slice(0, 4).map((r) => r.participantId).sort();
    expect([...playoffParts.map((p) => p.id)].sort()).toEqual(qualifiedSet);

    // ...mais l'ORDRE suit le seeding playoff (difficulté du calendrier), re-seedés 1..4.
    const seeded = swiss.playoffSeeding(done.swiss, 4).map((r) => r.participantId);
    expect(playoffParts.map((p) => p.id)).toEqual(seeded);
    expect(playoffParts.map((p) => p.seed)).toEqual([1, 2, 3, 4]);
  });

  it('refuse le playoff tant que la suisse n’est pas finie', () => {
    const started = runner.startValorant(makeParticipants(8), 4);
    expect(runner.canStartPlayoff(started)).toBe(false);
  });

  it('seede le playoff par difficulté de calendrier (peut franchir le bilan), pas par le classement suisse', () => {
    // p1 (3-0) a un calendrier mou (adversaires sans victoire) ; p2 (3-1) a un
    // calendrier dur (adversaires à 2 victoires). Le classement suisse met p1
    // devant (moins de défaites), mais le seeding playoff donne le seed 1 à p2.
    const sw = swiss.createSwiss(makeParticipants(6), { winsToQualify: 9, lossesToEliminate: 9 });
    sw.records['p1'] = { wins: 3, losses: 0, opponents: ['p3', 'p4'], hadBye: false, forfeited: false };
    sw.records['p2'] = { wins: 3, losses: 1, opponents: ['p5', 'p6'], hadBye: false, forfeited: false };
    sw.records['p5'].wins = 2;
    sw.records['p6'].wins = 2;
    const state: runner.ValorantState = { game: 'valorant', phase: 'swiss', playoffSize: 2, swiss: sw, playoff: null };

    expect(swiss.standings(sw).slice(0, 2).map((r) => r.participantId)).toEqual(['p1', 'p2']);

    const withPlayoff = runner.startPlayoff(state);
    expect(withPlayoff.playoff!.participants.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(withPlayoff.playoff!.participants.map((p) => p.seed)).toEqual([1, 2]);
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
