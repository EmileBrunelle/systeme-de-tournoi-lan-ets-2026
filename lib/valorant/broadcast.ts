// lib/valorant/broadcast.ts
// Suggère quel match diffuser sur le stream. On veut du show : un match relevé
// ET serré. On combine donc les deux en un seul score de « diffusabilité » :
//
//     score = (rangA + rangB) / 2  −  |rangA − rangB|
//             └── calibre du match ──┘   └─ écart de niveau ─┘
//
// Le calibre récompense les fortes équipes ; l'écart pénalise les raclées. Ainsi
// le choc des deux meilleures équipes l'emporte sur un match moyen parfaitement
// serré, mais une raclée (gros écart) coule même entre bonnes équipes.
// Pur et testable. Le « niveau » vient du rang Valorant moyen d'une équipe
// (Team.avgRank), passé ici indexé par participantId (= team.id).
import type { ParticipantId } from '../domain/types';
import { currentRound, type SwissState } from '../formats/swiss';

export interface BroadcastSide {
  id: ParticipantId;
  name: string;
  /** Rang Valorant moyen de l'équipe, ou null si inconnu. */
  rank: number | null;
}

export interface BroadcastPick {
  matchId: string;
  home: BroadcastSide;
  away: BroadcastSide;
  /** Écart de niveau |rang moyen|. null si un des deux rangs est inconnu. */
  gap: number | null;
  /** Score de diffusabilité (calibre − écart). null si un des deux rangs est inconnu. */
  score: number | null;
}

export interface BroadcastSuggestion {
  /** Meilleur match diffusable (rangs connus), ou null si aucun. */
  best: BroadcastPick | null;
  /** Tous les matchs candidats, du plus au moins recommandé. */
  ranked: BroadcastPick[];
}

/**
 * Classe les matchs non joués de la ronde courante par score de diffusabilité
 * décroissant. Les matchs dont un rang est inconnu passent en dernier.
 */
export function suggestBroadcast(
  state: SwissState,
  rankById: Record<ParticipantId, number | null>,
): BroadcastSuggestion {
  const round = currentRound(state);
  if (round === 0) return { best: null, ranked: [] };

  const names = new Map(state.participants.map((p) => [p.id, p.name]));
  const side = (id: ParticipantId): BroadcastSide => ({
    id,
    name: names.get(id) ?? id,
    rank: rankById[id] ?? null,
  });

  const picks: BroadcastPick[] = state.matches
    .filter((m) => m.round === round && m.away !== null && m.score === null)
    .map((m) => {
      const home = side(m.home);
      const away = side(m.away as ParticipantId);
      if (home.rank === null || away.rank === null) {
        return { matchId: m.id, home, away, gap: null, score: null };
      }
      const gap = Math.abs(home.rank - away.rank);
      const score = (home.rank + away.rank) / 2 - gap;
      return { matchId: m.id, home, away, gap, score };
    });

  picks.sort((a, b) => {
    // Rangs inconnus toujours en dernier.
    if ((a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1;
    if (a.score !== null && b.score !== null && a.score !== b.score) {
      return b.score - a.score; // plus diffusable d'abord
    }
    return a.matchId.localeCompare(b.matchId); // ordre stable
  });

  const best = picks.find((p) => p.score !== null) ?? null;
  return { best, ranked: picks };
}
