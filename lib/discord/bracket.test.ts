import { describe, it, expect } from 'vitest';
import { createDoubleElim, recordResult } from '../formats/double-elimination';
import { formatBracket } from './bracket';

const participants = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Team${i + 1}`, seed: i + 1 }));

describe('formatBracket', () => {
  it('arbre frais : matchups seedés du 1er tour + sections + « à venir » pour la suite', () => {
    const s = createDoubleElim(participants(4)); // seedOrder(4)=[1,4,2,3] → M1: 1v4, M2: 2v3
    const out = formatBracket(s);

    expect(out).toContain('Bracket');
    expect(out).toMatch(/\(1\) Team1 vs \(4\) Team4/); // seeds affichés
    expect(out).toMatch(/\(2\) Team2 vs \(3\) Team3/);
    expect(out).toContain('Grande finale'); // section GF présente
    expect(out).toContain('à venir'); // slots non déterminés
  });

  it('s’adapte à un résultat : gagnant en gras + score, et l’équipe avance au tour suivant', () => {
    let s = createDoubleElim(participants(4));
    s = recordResult(s, 'WB-R1-M1', { a: 13, b: 7 }); // Team1 (seed 1) gagne

    const out = formatBracket(s);
    expect(out).toContain('`13–7`'); // score affiché
    expect(out).toContain('**(1) Team1**'); // gagnant mis en gras
    // Team1 a avancé en finale gagnants (WB-R2-M1) → n’est plus « à venir » de ce côté
    expect(out).toMatch(/Finale gagnants[\s\S]*\(1\) Team1 vs à venir/);
  });
});
