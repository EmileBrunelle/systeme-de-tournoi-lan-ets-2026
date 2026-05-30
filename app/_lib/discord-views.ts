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
      chunks: formatPairings(`Appariements — Ronde ${round}`, pairings),
    });

    const played = inRound.filter((m) => m.score !== null && m.away !== null);
    if (played.length > 0) {
      const results: ResultRow[] = played.map((m) => ({
        a: nm(m.home)!,
        b: nm(m.away),
        scoreA: m.score!.home,
        scoreB: m.score!.away,
      }));
      blocks.push({
        label: `Résultats — Ronde ${round}`,
        chunks: formatResults(`Résultats — Ronde ${round}`, results),
      });
    }
  }

  const standingRows: StandingRow[] = swiss.standings(s).map((r) => ({
    rank: r.rank,
    name: r.name,
    detail: `${r.wins}-${r.losses} (Buchholz ${r.tiebreak})`,
  }));
  blocks.push({
    label: 'Classement — Phase suisse',
    chunks: formatStandings('Classement — Phase suisse', standingRows),
  });

  // Horaire estimé d'après les rondes déjà générées.
  const counts: number[] = [];
  for (let r = 1; r <= round; r++) {
    counts.push(s.matches.filter((m) => m.round === r && m.away !== null).length);
  }
  if (counts.length > 0) {
    const sched = estimateSchedule(counts);
    blocks.push({
      label: 'Horaire estimé',
      chunks: formatSchedule(
        'Horaire estimé — Phase suisse',
        sched.map((r) => ({ time: `J${r.day} ${r.start}`, label: `Ronde ${r.round} (${r.matches} matchs)` })),
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
    blocks.push({ label: 'Matchs à jouer — Playoff', chunks: formatPairings('Playoff — Matchs à jouer', pairings) });
  }

  const standingRows: StandingRow[] = de.standings(s).map((r) => ({
    rank: r.rank,
    name: r.name,
    detail: r.rank === 1 ? '🏆 Champion' : `Rang ${r.rank}`,
  }));
  blocks.push({ label: 'Classement — Playoff', chunks: formatStandings('Classement — Playoff', standingRows) });
  return blocks;
}

// ─── Aiguillage ──────────────────────────────────────────────────────────────

export function discordBlocks(state: RunnerState): DiscordBlock[] {
  return state.phase === 'swiss' || !state.playoff
    ? swissBlocks(state.swiss)
    : deBlocks(state.playoff);
}
