// lib/valorant/seeding.ts
//
// Seeding de la phase suisse Valorant : on classe les équipes par force
// (rangMoyen décroissant) pour que la ronde 1 oppose le groupe fort au groupe
// faible (voir le « pli » dans lib/formats/swiss.ts). Les égalités exactes de
// rangMoyen sont départagées au hasard — équitable entre équipes de même force.

import type { Participant } from '../domain/types';

/** Une équipe candidate au seeding. `avgRank` null = force inconnue (traitée comme la plus faible). */
export interface Entrant {
  id: string;
  name: string;
  avgRank: number | null;
}

/** Mélange Fisher-Yates en place. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Seede les équipes par force décroissante : seed 1 = la plus forte.
 * Un mélange préalable + un tri stable randomisent l'ordre au sein de chaque
 * groupe de rangMoyen identique, sans casser l'ordre de force global.
 */
export function seedByStrength(entrants: Entrant[]): Participant[] {
  const ordered = shuffle([...entrants]).sort((a, b) => (b.avgRank ?? 0) - (a.avgRank ?? 0));
  return ordered.map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 }));
}
