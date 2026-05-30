// Construit les blocs de messages Discord (prêts à copier) à partir de l'état
// du moteur, via les formatters génériques de lib/discord/format.

import type { ParticipantId } from '@/lib/domain/types';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import {
  formatPairings,
  formatStandings,
  formatResults,
  formatSchedule,
  bilingualChunks,
  type PairingRow,
  type ResultRow,
  type StandingRow,
} from '@/lib/discord/format';
import { estimateSchedule } from '@/lib/schedule/estimate';
import type { RunnerState } from '@/lib/runtime/runner';

export interface DiscordBlock {
  label: string;
  /** Message Discord déjà découpé en morceaux <= 2000 caractères. */
  chunks: string[];
}

function nameMap(participants: { id: ParticipantId; name: string }[]): Map<ParticipantId, string> {
  return new Map(participants.map((p) => [p.id, p.name]));
}

// Chaque message Discord est bilingue : section française (🇫🇷) puis anglaise (🇬🇧),
// chacune avec son drapeau. Les noms d'équipes et scores sont neutres ; seules les
// annotations (bye, forfait, bris d'égalité, libellés d'horaire) sont traduites.
const FR = '🇫🇷';
const EN = '🇬🇧';

// ─── Suisse (Valorant) ─────────────────────────────────────────────────────

function swissBlocks(s: swiss.SwissState): DiscordBlock[] {
  const names = nameMap(s.participants);
  const nm = (id: ParticipantId | null) => (id ? (names.get(id) ?? id) : null);
  const blocks: DiscordBlock[] = [];

  const round = swiss.currentRound(s);
  if (round > 0) {
    const inRound = s.matches.filter((m) => m.round === round);
    const pairings: PairingRow[] = inRound.map((m) => ({ a: nm(m.home)!, b: nm(m.away) }));
    blocks.push({
      label: `Appariements — Ronde ${round}`,
      chunks: bilingualChunks(
        formatPairings(`${FR} Appariements — Ronde ${round}`, pairings, { byeLabel: 'bye (qualifié automatiquement)' }),
        formatPairings(`${EN} Pairings — Round ${round}`, pairings, { byeLabel: 'bye (auto-qualified)' }),
      ),
    });

    const played = inRound.filter((m) => m.score !== null && m.away !== null);
    if (played.length > 0) {
      const result = (outcome?: string) =>
        played.map((m) => ({
          a: nm(m.home)!,
          b: nm(m.away),
          scoreA: m.score!.home,
          scoreB: m.score!.away,
          outcome: m.forfeit ? outcome : undefined,
          forfeit: m.forfeit !== undefined,
        }));
      blocks.push({
        label: `Résultats — Ronde ${round}`,
        chunks: bilingualChunks(
          formatResults(`${FR} Résultats — Ronde ${round}`, result('forfait')),
          formatResults(`${EN} Results — Round ${round}`, result('forfeit')),
        ),
      });
    }
  }

  const board = swiss.standings(s);
  const standing = (label: string): StandingRow[] =>
    board.map((r) => ({ rank: r.rank, name: r.name, detail: `${r.wins}-${r.losses} (${label} ${r.tiebreak})` }));
  blocks.push({
    label: 'Classement — Phase suisse',
    chunks: bilingualChunks(
      formatStandings(`${FR} Classement — Phase suisse`, standing("bris d'égalité")),
      formatStandings(`${EN} Standings — Swiss stage`, standing('tiebreaker')),
    ),
  });

  // Horaire estimé d'après les rondes déjà générées.
  const counts: number[] = [];
  for (let r = 1; r <= round; r++) {
    counts.push(s.matches.filter((m) => m.round === r && m.away !== null).length);
  }
  if (counts.length > 0) {
    // Départ aligné sur le LAN ÉTS (9h30), comme l'horaire fixe de la console.
    const sched = estimateSchedule(counts, { dayStart: '09:30', nextDayStart: '09:30' });
    blocks.push({
      label: 'Horaire estimé',
      chunks: bilingualChunks(
        formatSchedule(
          `${FR} Horaire estimé — Phase suisse`,
          sched.map((r) => ({ time: `J${r.day} ${r.start}`, label: `Ronde ${r.round} (${r.matches} matchs)` })),
        ),
        formatSchedule(
          `${EN} Estimated schedule — Swiss stage`,
          sched.map((r) => ({ time: `D${r.day} ${r.start}`, label: `Round ${r.round} (${r.matches} matches)` })),
        ),
      ),
    });
  }

  return blocks;
}

// ─── Bracket double-élimination (Valorant playoff) ───────────────────────────

function deBlocks(s: de.DEState): DiscordBlock[] {
  const names = nameMap(s.participants);
  const slot = (x: de.DESlot) => (x.kind === 'player' ? (names.get(x.id) ?? x.id) : x.kind === 'bye' ? 'bye' : 'à venir');
  const blocks: DiscordBlock[] = [];

  const playable = de.playableMatches(s);
  if (playable.length > 0) {
    const pairings: PairingRow[] = playable.map((m) => ({ a: slot(m.a), b: slot(m.b), note: m.bracket }));
    blocks.push({
      label: 'Matchs à jouer — Playoff',
      chunks: bilingualChunks(
        formatPairings(`${FR} Playoff — Matchs à jouer`, pairings),
        formatPairings(`${EN} Playoff — Matches to play`, pairings, { byeLabel: 'bye (auto-qualified)' }),
      ),
    });
  }

  const board = de.standings(s);
  const standing = (champion: string, rank: string): StandingRow[] =>
    board.map((r) => ({ rank: r.rank, name: r.name, detail: r.rank === 1 ? `🏆 ${champion}` : `${rank} ${r.rank}` }));
  blocks.push({
    label: 'Classement — Playoff',
    chunks: bilingualChunks(
      formatStandings(`${FR} Classement — Playoff`, standing('Champion', 'Rang')),
      formatStandings(`${EN} Standings — Playoff`, standing('Champion', 'Rank')),
    ),
  });
  return blocks;
}

// ─── Aiguillage ──────────────────────────────────────────────────────────────

export function discordBlocks(state: RunnerState): DiscordBlock[] {
  return state.phase === 'swiss' || !state.playoff
    ? swissBlocks(state.swiss)
    : deBlocks(state.playoff);
}
