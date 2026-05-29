// lib/discord/split.test.ts
import { describe, it, expect } from 'vitest';
import { splitForDiscord } from './split';

describe('splitForDiscord', () => {
  it('retourne un seul morceau si le message est court', () => {
    expect(splitForDiscord('allo')).toEqual(['allo']);
  });

  it('ne coupe jamais au milieu d’une ligne quand on découpe', () => {
    const line = 'x'.repeat(500);
    const message = Array.from({ length: 10 }, () => line).join('\n'); // ~5000 car.
    const chunks = splitForDiscord(message, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(2000);
      // chaque morceau est composé de lignes complètes
      for (const l of c.split('\n')) {
        expect(l).toBe(line);
      }
    }
    // aucune ligne perdue
    expect(chunks.join('\n').split('\n').length).toBe(10);
  });

  it('coupe brutalement une ligne unique plus longue que la limite', () => {
    const huge = 'y'.repeat(4500);
    const chunks = splitForDiscord(huge, 2000);
    expect(chunks).toEqual(['y'.repeat(2000), 'y'.repeat(2000), 'y'.repeat(500)]);
  });
});
