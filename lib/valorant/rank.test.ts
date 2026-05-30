import { describe, it, expect } from 'vitest';
import { rankToNumber, averageRank } from './rank';

describe('rankToNumber', () => {
  it('classe les tiers dans le bon ordre croissant', () => {
    const iron = rankToNumber('Iron 1')!;
    const gold = rankToNumber('Gold 2')!;
    const radiant = rankToNumber('Radiant')!;
    expect(iron).toBeLessThan(gold);
    expect(gold).toBeLessThan(radiant);
  });

  it('ne confond pas Immortal avec Gold (collision "or")', () => {
    const immortal = rankToNumber('Immortal 3')!;
    const gold = rankToNumber('Gold 3')!;
    expect(immortal).toBeGreaterThan(gold);
  });

  it('gère les équivalents français', () => {
    expect(rankToNumber('Diamant 1')).toBe(rankToNumber('Diamond 1'));
    expect(rankToNumber('Platine 2')).toBe(rankToNumber('Platinum 2'));
  });

  it('retourne null pour un rang inconnu ou vide', () => {
    expect(rankToNumber('')).toBeNull();
    expect(rankToNumber(null)).toBeNull();
    expect(rankToNumber('Unranked')).toBeNull();
  });
});

describe('averageRank', () => {
  it('moyenne en ignorant les valeurs nulles', () => {
    const a = rankToNumber('Gold 1')!;
    const b = rankToNumber('Gold 3')!;
    expect(averageRank(['Gold 1', 'Gold 3', 'Unranked'])).toBe((a + b) / 2);
  });

  it('null si aucune valeur exploitable', () => {
    expect(averageRank(['Unranked', '', null])).toBeNull();
    expect(averageRank([])).toBeNull();
  });
});
