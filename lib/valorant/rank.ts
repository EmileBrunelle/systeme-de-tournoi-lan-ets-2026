// lib/valorant/rank.ts
// Conversion d'un rang Valorant (texte) vers une valeur numérique, pour
// calculer la moyenne de rang d'une équipe. Pur et testable ; utilisé par
// l'import et par la gestion d'équipes.

const TIERS = [
  'iron', 'bronze', 'silver', 'gold', 'platinum',
  'diamond', 'ascendant', 'immortal', 'radiant',
];

/** Équivalents français -> tier anglais (mots entiers, pour éviter les
 *  collisions comme "or" dans "immortal"). */
const FRENCH_TIER: Record<string, string> = {
  fer: 'iron',
  argent: 'silver',
  or: 'gold',
  platine: 'platinum',
  diamant: 'diamond',
  immortel: 'immortal',
};

/** Mappe "Gold 2", "Diamant 1", "Radiant" vers une échelle numérique, ou null. */
export function rankToNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les accents

  // Tier anglais en priorité (la plupart des rangs Valorant le sont).
  let tierIdx = TIERS.findIndex((t) => s.includes(t));
  // Sinon, équivalent français en mot entier.
  if (tierIdx === -1) {
    for (const [fr, en] of Object.entries(FRENCH_TIER)) {
      if (new RegExp(`\\b${fr}\\b`).test(s)) {
        tierIdx = TIERS.indexOf(en);
        break;
      }
    }
  }
  if (tierIdx === -1) return null;

  const div = s.match(/\b([1-3])\b/);
  const division = div ? Number(div[1]) : 2; // division médiane par défaut
  return tierIdx * 3 + division;
}

/** Moyenne des rangs (valeurs nulles ignorées), ou null si aucune valeur. */
export function averageRank(ranks: (string | null | undefined)[]): number | null {
  const values = ranks.map(rankToNumber).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
