// lib/formats/swiss.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSwiss,
  statusOf,
  recordResult,
  amendResult,
  concedeMatch,
  withdraw,
  buchholz,
  generateNextRound,
  currentRound,
  lastCompleteRound,
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
    expect(state.records['p1']).toEqual({ wins: 0, losses: 0, opponents: [], hadBye: false, forfeited: false });
  });

  it('accepte une config personnalisée', () => {
    const state = createSwiss(mkParticipants(4), { winsToQualify: 2, lossesToEliminate: 2 });
    expect(state.winsToQualify).toBe(2);
    expect(state.lossesToEliminate).toBe(2);
  });
});

describe('lastCompleteRound', () => {
  const base = createSwiss(mkParticipants(4));

  it('retourne 0 quand aucune ronde générée', () => {
    expect(lastCompleteRound(base)).toBe(0);
  });

  it('retourne 0 quand la ronde courante a encore un match non joué', () => {
    const s: SwissState = {
      ...base,
      matches: [
        { id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: { home: 13, away: 7 } },
        { id: 'R1-M2', round: 1, home: 'p3', away: 'p4', score: null },
      ],
    };
    expect(lastCompleteRound(s)).toBe(0);
  });

  it('retourne le numéro de la ronde quand tous ses matchs sont joués', () => {
    const s: SwissState = {
      ...base,
      matches: [
        { id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: { home: 13, away: 7 } },
        { id: 'R1-M2', round: 1, home: 'p3', away: 'p4', score: { home: 13, away: 9 } },
      ],
    };
    expect(lastCompleteRound(s)).toBe(1);
  });

  it('un bye (away null) compte comme joué', () => {
    const s: SwissState = {
      ...base,
      matches: [
        { id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: { home: 13, away: 7 } },
        { id: 'R1-BYE', round: 1, home: 'p3', away: null, score: { home: 1, away: 0 } },
      ],
    };
    expect(lastCompleteRound(s)).toBe(1);
  });

  it('retourne la ronde précédente quand la prochaine est générée mais non jouée', () => {
    const s: SwissState = {
      ...base,
      matches: [
        { id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: { home: 13, away: 7 } },
        { id: 'R1-M2', round: 1, home: 'p3', away: 'p4', score: { home: 13, away: 9 } },
        { id: 'R2-M1', round: 2, home: 'p1', away: 'p3', score: null },
        { id: 'R2-M2', round: 2, home: 'p2', away: 'p4', score: null },
      ],
    };
    expect(lastCompleteRound(s)).toBe(1);
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

describe('amendResult (corriger un score après coup)', () => {
  function playedMatch(): SwissState {
    let s = createSwiss(mkParticipants(2), { winsToQualify: 9, lossesToEliminate: 9 });
    s = { ...s, matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }] };
    return recordResult(s, 'R1-M1', { home: 13, away: 7 }); // p1 gagne
  }

  it('inverse le gagnant et ajuste victoires/défaites, sans toucher aux adversaires', () => {
    const s = amendResult(playedMatch(), 'R1-M1', { home: 7, away: 13 }); // p2 gagne maintenant
    expect(s.records['p1']).toMatchObject({ wins: 0, losses: 1, opponents: ['p2'] });
    expect(s.records['p2']).toMatchObject({ wins: 1, losses: 0, opponents: ['p1'] });
    expect(s.matches[0].score).toEqual({ home: 7, away: 13 });
  });

  it('corrige le pointage sans changer le gagnant (net nul sur le bilan)', () => {
    const s = amendResult(playedMatch(), 'R1-M1', { home: 13, away: 5 });
    expect(s.records['p1']).toMatchObject({ wins: 1, losses: 0 });
    expect(s.records['p2']).toMatchObject({ wins: 0, losses: 1 });
    expect(s.matches[0].score).toEqual({ home: 13, away: 5 });
  });

  it('ne mute pas l’état d’origine', () => {
    const before = playedMatch();
    amendResult(before, 'R1-M1', { home: 7, away: 13 });
    expect(before.matches[0].score).toEqual({ home: 13, away: 7 });
    expect(before.records['p1'].wins).toBe(1);
  });

  it('refuse un match d’une manche verrouillée (manche suivante déjà générée)', () => {
    let s = createSwiss(mkParticipants(4), { winsToQualify: 9, lossesToEliminate: 9 });
    s = generateNextRound(s); // R1
    for (const m of s.matches.filter((mm) => mm.round === 1 && mm.away !== null)) {
      s = recordResult(s, m.id, { home: 13, away: 7 });
    }
    s = generateNextRound(s); // R2 tirée → R1 verrouillée
    const r1 = s.matches.find((m) => m.round === 1)!;
    expect(() => amendResult(s, r1.id, { home: 7, away: 13 })).toThrow();
  });

  it('refuse un match pas encore joué, un bye, ou un forfait', () => {
    const notPlayed: SwissState = {
      ...createSwiss(mkParticipants(2)),
      matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }],
    };
    expect(() => amendResult(notPlayed, 'R1-M1', { home: 13, away: 0 })).toThrow();

    const bye: SwissState = {
      ...createSwiss(mkParticipants(1)),
      matches: [{ id: 'R1-BYE', round: 1, home: 'p1', away: null, score: { home: 1, away: 0 } }],
    };
    expect(() => amendResult(bye, 'R1-BYE', { home: 13, away: 0 })).toThrow();

    const forfeited = concedeMatch(
      { ...createSwiss(mkParticipants(2)), matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }] },
      'R1-M1',
      'p2',
    );
    expect(() => amendResult(forfeited, 'R1-M1', { home: 7, away: 13 })).toThrow();
  });

  it('lève une erreur si le match est introuvable', () => {
    expect(() => amendResult(playedMatch(), 'inexistant', { home: 1, away: 0 })).toThrow();
  });
});

describe('concedeMatch (forfait de manche)', () => {
  function oneMatch(): SwissState {
    const state = createSwiss(mkParticipants(2));
    return { ...state, matches: [{ id: 'R1-M1', round: 1, home: 'p1', away: 'p2', score: null }] };
  }

  it('accorde la victoire à l’adversaire et marque le forfait', () => {
    const s = concedeMatch(oneMatch(), 'R1-M1', 'p2');
    expect(s.records['p1']).toMatchObject({ wins: 1, losses: 0, opponents: ['p2'] });
    expect(s.records['p2']).toMatchObject({ wins: 0, losses: 1, opponents: ['p1'] });
    expect(s.matches[0].forfeit).toBe('p2');
    expect(s.matches[0].score).not.toBeNull();
  });

  it('laisse l’équipe qui concède en lice (perd juste cette manche)', () => {
    const s = concedeMatch(oneMatch(), 'R1-M1', 'p2');
    expect(statusOf(s, 'p2')).toBe('active');
  });

  it('ne mute pas l’état d’origine', () => {
    const before = oneMatch();
    concedeMatch(before, 'R1-M1', 'p2');
    expect(before.matches[0].forfeit).toBeUndefined();
    expect(before.records['p1'].wins).toBe(0);
  });

  it('lève une erreur si l’équipe ne joue pas ce match', () => {
    expect(() => concedeMatch(oneMatch(), 'R1-M1', 'p9')).toThrow();
  });

  it('lève une erreur sur un bye', () => {
    const state = createSwiss(mkParticipants(2));
    const withBye = { ...state, matches: [{ id: 'R1-BYE', round: 1, home: 'p1', away: null, score: { home: 1, away: 0 } }] };
    expect(() => concedeMatch(withBye, 'R1-BYE', 'p1')).toThrow();
  });

  it('lève une erreur si la manche est déjà jouée', () => {
    const played = concedeMatch(oneMatch(), 'R1-M1', 'p2');
    expect(() => concedeMatch(played, 'R1-M1', 'p1')).toThrow();
  });
});

describe('withdraw (retrait du tournoi en cours)', () => {
  it('marque l’équipe éliminée même sans avoir atteint la limite de défaites', () => {
    const s = withdraw(createSwiss(mkParticipants(4)), 'p1');
    expect(statusOf(s, 'p1')).toBe('eliminated');
  });

  it('concède le match en attente de la ronde courante à l’adversaire', () => {
    let s = generateNextRound(createSwiss(mkParticipants(4))); // ronde 1, 2 matchs non joués
    const m = s.matches.find((mm) => mm.round === 1 && mm.away !== null)!;
    const victim = m.home;
    const opponent = m.away!;
    s = withdraw(s, victim);
    const resolved = s.matches.find((mm) => mm.id === m.id)!;
    expect(resolved.score).not.toBeNull();
    expect(resolved.forfeit).toBe(victim);
    expect(s.records[opponent].wins).toBe(1);
    expect(s.records[victim].losses).toBe(1);
  });

  it('ne réapparie plus l’équipe retirée aux rondes suivantes', () => {
    let s = generateNextRound(createSwiss(mkParticipants(4))); // ronde 1
    s = withdraw(s, 'p1');
    // jouer les autres matchs non joués de la ronde
    for (const m of s.matches.filter((mm) => mm.round === 1 && mm.away !== null && mm.score === null)) {
      s = recordResult(s, m.id, { home: 13, away: 7 });
    }
    s = generateNextRound(s); // ronde 2
    const r2 = s.matches.filter((mm) => mm.round === 2);
    const ids = r2.flatMap((m) => [m.home, m.away]);
    expect(ids).not.toContain('p1');
  });

  it('sans match en attente, marque seulement l’équipe éliminée', () => {
    let s = generateNextRound(createSwiss(mkParticipants(4)));
    for (const m of s.matches.filter((mm) => mm.round === 1 && mm.away !== null && mm.score === null)) {
      s = recordResult(s, m.id, { home: 13, away: 7 });
    }
    const matchesBefore = s.matches.length;
    s = withdraw(s, 'p1');
    expect(statusOf(s, 'p1')).toBe('eliminated');
    expect(s.matches.length).toBe(matchesBefore); // aucun match créé/modifié
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

  it('apparie moitié-haute vs moitié-basse (pli par seed) : seed i vs seed i+n/2', () => {
    // 8 équipes seed 1..8 (1 = plus forte). Le pli oppose le groupe fort
    // (seeds 1-4) au groupe faible (seeds 5-8) : 1v5, 2v6, 3v7, 4v8.
    const state = generateNextRound(createSwiss(mkParticipants(8)));
    const seedOf = Object.fromEntries(state.participants.map((p) => [p.id, p.seed]));
    const r1 = state.matches.filter((m) => m.round === 1 && m.away !== null);
    expect(r1).toHaveLength(4);
    for (const m of r1) {
      expect(seedOf[m.away!] - seedOf[m.home]).toBe(4);
    }
  });

  it('le bye (nombre impair) va à la plus faible équipe avant le pli', () => {
    // 7 équipes seed 1..7 : seed 7 (plus faible) prend le bye, puis pli 1v4, 2v5, 3v6.
    const state = generateNextRound(createSwiss(mkParticipants(7)));
    const bye = state.matches.find((m) => m.round === 1 && m.away === null);
    expect(bye?.home).toBe('p7');
    const seedOf = Object.fromEntries(state.participants.map((p) => [p.id, p.seed]));
    const played = state.matches.filter((m) => m.round === 1 && m.away !== null);
    for (const m of played) {
      expect(seedOf[m.away!] - seedOf[m.home]).toBe(3);
    }
  });
});

describe('generateNextRound — rondes suivantes (appariement par groupe de bilan)', () => {
  it('apparie en pli (fort-vs-faible) à l’intérieur d’un groupe de bilan, pas en adjacent', () => {
    // 8 équipes, seeds 1..8. Ronde 1 (pli) : 1v5, 2v6, 3v7, 4v8, le `home` (le plus
    // fort) gagne → invaincus = seeds 1,2,3,4. En ronde 2, ce groupe de 4 invaincus
    // doit être apparié en pli : 1v3 et 2v4. L’appariement adjacent (1v2, 3v4)
    // forcerait les deux meilleures équipes à s’entre-éliminer dès la ronde 2.
    let s = generateNextRound(createSwiss(mkParticipants(8))); // ronde 1
    s = playRoundHomeWins(s);
    s = generateNextRound(s); // ronde 2
    const seedOf = Object.fromEntries(s.participants.map((p) => [p.id, p.seed]));
    const r2 = s.matches.filter((m) => m.round === 2 && m.away !== null);
    const oppSeedOf = (seed: number): number => {
      const m = r2.find((mm) => seedOf[mm.home] === seed || seedOf[mm.away!] === seed)!;
      return seedOf[m.home] === seed ? seedOf[m.away!] : seedOf[m.home];
    };
    // Groupe de tête (invaincus 1,2,3,4) apparié en pli :
    expect(oppSeedOf(1)).toBe(3);
    expect(oppSeedOf(2)).toBe(4);
    // Groupe du bas (0-1 : seeds 5,6,7,8) également en pli :
    expect(oppSeedOf(5)).toBe(7);
    expect(oppSeedOf(6)).toBe(8);
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

  it('départage les égalités de victoires par moins de défaites avant le Buchholz', () => {
    // Deux qualifiés à 3 victoires : un 3-0 (Buchholz faible) et un 3-2 (Buchholz élevé).
    // Le 3-0 doit primer — moins de défaites l'emporte sur un meilleur Buchholz.
    const base = createSwiss(mkParticipants(2)); // p1, p2
    const s: SwissState = {
      ...base,
      records: {
        p1: { wins: 3, losses: 0, opponents: [], hadBye: false, forfeited: false },
        p2: { wins: 3, losses: 2, opponents: ['p1'], hadBye: false, forfeited: false },
      },
    };
    const table = standings(s);
    expect(table[0].participantId).toBe('p1'); // 3-0 d'abord, malgré un Buchholz plus bas
    expect(table[1].participantId).toBe('p2');
  });
});
