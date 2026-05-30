// lib/valorant/seeding.test.ts
import { describe, it, expect } from 'vitest';
import { seedByStrength } from './seeding';

const mk = (id: string, avgRank: number | null) => ({ id, name: id.toUpperCase(), avgRank });

describe('seedByStrength', () => {
  it('seede par rangMoyen décroissant : la plus forte = seed 1', () => {
    // Entré dans le désordre ; doit ressortir trié par force.
    const entrants = [mk('b', 18), mk('a', 26), mk('c', 12)];
    const seeded = seedByStrength(entrants);
    expect(seeded.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(seeded.map((p) => p.seed)).toEqual([1, 2, 3]);
  });

  it('attribue des seeds uniques 1..n et conserve toutes les équipes', () => {
    const entrants = Array.from({ length: 16 }, (_, i) => mk(`t${i}`, 20 - i));
    const seeded = seedByStrength(entrants);
    expect(seeded).toHaveLength(16);
    expect(new Set(seeded.map((p) => p.seed))).toEqual(new Set(Array.from({ length: 16 }, (_, i) => i + 1)));
    expect(new Set(seeded.map((p) => p.id)).size).toBe(16);
  });

  it('une équipe plus forte a toujours un meilleur seed qu’une plus faible (égalités à part)', () => {
    // Inclut des égalités (deux à 21, deux à 17) départagées au hasard ;
    // la propriété de force stricte doit tenir quel que soit le tirage.
    const entrants = [mk('x', 21), mk('y', 21), mk('z', 17), mk('w', 17), mk('top', 26)];
    const seeded = seedByStrength(entrants);
    const rank = Object.fromEntries(entrants.map((e) => [e.id, e.avgRank ?? 0]));
    const seedOf = Object.fromEntries(seeded.map((p) => [p.id, p.seed]));
    for (const a of entrants)
      for (const b of entrants)
        if (rank[a.id] > rank[b.id]) expect(seedOf[a.id]).toBeLessThan(seedOf[b.id]);
  });

  it('traite un rangMoyen null comme le plus faible', () => {
    const entrants = [mk('known', 15), mk('unknown', null)];
    const seeded = seedByStrength(entrants);
    expect(seeded[0].id).toBe('known');
    expect(seeded[1].id).toBe('unknown');
  });
});
