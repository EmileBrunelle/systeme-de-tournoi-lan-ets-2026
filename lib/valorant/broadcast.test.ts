// lib/valorant/broadcast.test.ts
import { describe, expect, it } from 'vitest';
import { createSwiss, recordResult } from '../formats/swiss';
import type { SwissState } from '../formats/swiss';
import type { Participant } from '../domain/types';
import { suggestBroadcast } from './broadcast';

/**
 * 6 équipes, appariements de ronde 1 fixés explicitement (M1=(1,2), M2=(3,4),
 * M3=(5,6)) pour tester la suggestion de diffusion indépendamment de l'algo
 * d'appariement suisse.
 */
function sixTeamsRound1(): SwissState {
  const participants: Participant[] = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Équipe ${i + 1}`,
    seed: i + 1,
  }));
  return {
    ...createSwiss(participants),
    matches: [
      { id: 'R1-M1', round: 1, home: 't1', away: 't2', score: null },
      { id: 'R1-M2', round: 1, home: 't3', away: 't4', score: null },
      { id: 'R1-M3', round: 1, home: 't5', away: 't6', score: null },
    ],
  };
}

describe('suggestBroadcast', () => {
  it('aucune ronde générée → aucune suggestion', () => {
    const state = createSwiss([
      { id: 't1', name: 'A', seed: 1 },
      { id: 't2', name: 'B', seed: 2 },
    ]);
    const out = suggestBroadcast(state, { t1: 20, t2: 20 });
    expect(out.best).toBeNull();
    expect(out.ranked).toEqual([]);
  });

  it('privilégie le choc des grosses équipes presque à égalité plutôt qu’un match moyen parfaitement serré', () => {
    const state = sixTeamsRound1();
    // M1 (26, 24) choc du top, écart 2 → calibre 25 − 2 = 23
    // M2 (21, 21) parfaitement serré mais moyen → 21 − 0 = 21
    // M3 (10, 10) faible → 10
    const ranks = { t1: 26, t2: 24, t3: 21, t4: 21, t5: 10, t6: 10 };
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).toBe('R1-M1');
  });

  it('une raclée coule, même entre fortes équipes, au profit d’un match serré', () => {
    const state = sixTeamsRound1();
    // M1 raclée (27 vs 19, écart 8) → 23 − 8 = 15
    // M2 serré moyen (18, 18) → 18
    // M3 serré faible (10, 9) → 9.5 − 1 = 8.5
    const ranks = { t1: 27, t2: 19, t3: 18, t4: 18, t5: 10, t6: 9 };
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).toBe('R1-M2');
    expect(out.ranked.map((p) => p.matchId)).toEqual(['R1-M2', 'R1-M1', 'R1-M3']);
  });

  it('à écart égal, le plus fort calibre l’emporte', () => {
    const state = sixTeamsRound1();
    const ranks = { t1: 27, t2: 27, t3: 18, t4: 18, t5: 10, t6: 10 };
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).toBe('R1-M1');
  });

  it('ignore les matchs déjà joués', () => {
    let state = sixTeamsRound1();
    state = recordResult(state, 'R1-M1', { home: 13, away: 7 });
    // M1 serait le meilleur (gros calibre) mais il est joué
    const ranks = { t1: 26, t2: 24, t3: 21, t4: 21, t5: 19, t6: 19 };
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).not.toBe('R1-M1');
    expect(out.ranked.map((p) => p.matchId)).not.toContain('R1-M1');
  });

  it('place les matchs à rang inconnu en dernier et ne les suggère pas', () => {
    const state = sixTeamsRound1();
    const ranks = { t5: 20, t6: 20 } as Record<string, number>;
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).toBe('R1-M3');
    expect(out.ranked[out.ranked.length - 1].score).toBeNull();
  });

  it('aucun rang connu → aucune suggestion mais liste complète', () => {
    const state = sixTeamsRound1();
    const out = suggestBroadcast(state, {});
    expect(out.best).toBeNull();
    expect(out.ranked).toHaveLength(3);
    expect(out.ranked.every((p) => p.score === null)).toBe(true);
  });

  it('expose les rangs, l’écart et le score du match suggéré', () => {
    const state = sixTeamsRound1();
    const ranks = { t1: 20, t2: 20, t3: 5, t4: 5, t5: 5, t6: 5 };
    const out = suggestBroadcast(state, ranks);
    expect(out.best?.matchId).toBe('R1-M1');
    expect(out.best?.home).toMatchObject({ id: 't1', name: 'Équipe 1', rank: 20 });
    expect(out.best?.away).toMatchObject({ id: 't2', name: 'Équipe 2', rank: 20 });
    expect(out.best?.gap).toBe(0);
    expect(out.best?.score).toBe(20);
  });
});
