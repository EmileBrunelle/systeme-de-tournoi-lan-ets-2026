// lib/discord/recap.test.ts
import { describe, it, expect } from 'vitest';
import { roundRecap } from './recap';
import { createSwiss, generateNextRound, recordResult, type SwissState } from '../formats/swiss';
import type { Participant } from '../domain/types';
import type { ValorantState } from '../runtime/runner';

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Team ${i + 1}`, seed: i + 1 }));
}

function wrap(swiss: SwissState): ValorantState {
  return { game: 'valorant', phase: 'swiss', playoffSize: 8, swiss, playoff: null };
}

/** Joint tous les morceaux d'un bloc en un seul texte pour les assertions. */
function text(block: ReturnType<typeof roundRecap>): string {
  if (!block) throw new Error('bloc null');
  return block.chunks.join('\n');
}

describe('roundRecap', () => {
  it('retourne null quand aucune manche n’est complète', () => {
    let s = createSwiss(mkParticipants(4));
    s = generateNextRound(s); // ronde 1 générée, non jouée
    expect(roundRecap(wrap(s), { now: '11:30' })).toBeNull();
  });

  it('retourne null hors de la phase suisse', () => {
    const s = createSwiss(mkParticipants(4));
    const state: ValorantState = { ...wrap(s), phase: 'playoff' };
    expect(roundRecap(state, { now: '11:30' })).toBeNull();
  });

  it('récapitule la manche complète : résultats, classement et prochaine manche', () => {
    let s = createSwiss(mkParticipants(4));
    s = generateNextRound(s); // R1 : p1 vs p3, p2 vs p4
    s = recordResult(s, 'R1-M1', { home: 13, away: 7 });
    s = recordResult(s, 'R1-M2', { home: 13, away: 9 });
    s = generateNextRound(s); // R2 générée

    const block = roundRecap(wrap(s), { now: '11:30' });
    const out = text(block);
    expect(block!.label).toContain('Manche 1');
    expect(out).toContain('Classement');
    expect(out).toContain('13–7');
    expect(out).toContain('Prochaine manche — Ronde 2');
    // heure ancrée sur l'horloge réelle : 11:30 + 10 min de setup
    expect(out).toContain('11:40');
  });

  it('signale les surprises (équipe moins bien classée qui gagne)', () => {
    let s = createSwiss(mkParticipants(4));
    s = generateNextRound(s); // R1-M1 : p1 (seed 1) vs p3 (seed 3)
    s = recordResult(s, 'R1-M1', { home: 7, away: 13 }); // p3 bat p1 → surprise
    s = recordResult(s, 'R1-M2', { home: 13, away: 9 }); // p2 bat p4 (attendu)

    const out = text(roundRecap(wrap(s), { now: '11:30' }));
    expect(out).toContain('Surprise');
    expect(out).toContain('Team 3');
  });

  it('met « à générer » quand la prochaine ronde n’est pas encore générée', () => {
    let s = createSwiss(mkParticipants(4));
    s = generateNextRound(s);
    s = recordResult(s, 'R1-M1', { home: 13, away: 7 });
    s = recordResult(s, 'R1-M2', { home: 13, away: 9 });
    // pas de generateNextRound : R2 pas encore tirée
    const out = text(roundRecap(wrap(s), { now: '11:30' }));
    expect(out).toContain('à générer');
  });

  it('annonce les qualifiés quand la phase suisse est terminée', () => {
    let s = createSwiss(mkParticipants(4), { winsToQualify: 1, lossesToEliminate: 1 });
    s = generateNextRound(s);
    s = recordResult(s, 'R1-M1', { home: 13, away: 7 });
    s = recordResult(s, 'R1-M2', { home: 13, away: 9 });
    // tout le monde est décidé (1 victoire qualifie, 1 défaite élimine)
    const out = text(roundRecap(wrap(s), { now: '11:30' }));
    expect(out).toContain('Qualifié');
    expect(out).not.toContain('Prochaine manche — Ronde');
  });

  it('met en avant le match le plus serré de la manche', () => {
    let s = createSwiss(mkParticipants(4));
    s = generateNextRound(s);
    s = recordResult(s, 'R1-M1', { home: 13, away: 7 }); // écart 6
    s = recordResult(s, 'R1-M2', { home: 13, away: 11 }); // écart 2 → le plus serré
    const out = text(roundRecap(wrap(s), { now: '11:30' }));
    expect(out).toContain('plus serré');
    expect(out).toContain('13–11');
  });
});
