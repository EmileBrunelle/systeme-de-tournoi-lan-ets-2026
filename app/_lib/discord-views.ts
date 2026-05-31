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
  type DiscordBlock,
  type PairingRow,
  type ResultRow,
  type StandingRow,
} from '@/lib/discord/format';
import { roundRecap, type RecapOptions } from '@/lib/discord/recap';
import { formatBracket } from '@/lib/discord/bracket';
import { estimateSchedule } from '@/lib/schedule/estimate';
import { splitForDiscord } from '@/lib/discord/split';
import type { RunnerState } from '@/lib/runtime/runner';

export type { DiscordBlock };

function nameMap(participants: { id: ParticipantId; name: string }[]): Map<ParticipantId, string> {
  return new Map(participants.map((p) => [p.id, p.name]));
}

// Chaque message Discord est bilingue : section française (🇫🇷) puis anglaise (🇬🇧),
// chacune avec son drapeau. Les noms d'équipes et scores sont neutres ; seules les
// annotations (bye, forfait, bris d'égalité, libellés d'horaire) sont traduites.
// Shortcodes Discord plutôt que les emojis unicode : ils rendent le drapeau de
// façon fiable peu importe la police du client, sans risque d'afficher « FR »/« GB ».
const FR = ':flag_fr:';
const EN = ':flag_gb:';

// ─── Suisse (Valorant) ─────────────────────────────────────────────────────

function swissBlocks(s: swiss.SwissState, now: string): DiscordBlock[] {
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

  // Horaire estimé ancré sur l'heure réelle (`now`) : on ne projette que les
  // rondes à venir — la ronde en cours + celles déjà tirées mais pas jouées.
  // Les rondes terminées sont de l'histoire ; les replanifier depuis 10h
  // affichait des heures déjà passées en cas de retard.
  const done = swiss.lastCompleteRound(s);
  const upcoming: { round: number; matches: number }[] = [];
  for (let r = done + 1; r <= round; r++) {
    upcoming.push({ round: r, matches: s.matches.filter((m) => m.round === r && m.away !== null).length });
  }
  if (upcoming.length > 0) {
    const sched = estimateSchedule(
      upcoming.map((u) => u.matches),
      { dayStart: now, nextDayStart: now },
    );
    blocks.push({
      label: 'Horaire estimé',
      chunks: bilingualChunks(
        formatSchedule(
          `${FR} Horaire estimé — à partir de ${now}`,
          sched.map((r, i) => ({ time: `J${r.day} ${r.start}`, label: `Ronde ${upcoming[i].round} (${r.matches} matchs)` })),
        ),
        formatSchedule(
          `${EN} Estimated schedule — from ${now}`,
          sched.map((r, i) => ({ time: `D${r.day} ${r.start}`, label: `Round ${upcoming[i].round} (${r.matches} matches)` })),
        ),
      ),
    });
  }

  return blocks;
}

// ─── Bracket double-élimination (Valorant playoff) ───────────────────────────

// Bilingue compact : données (noms, scores, rangs) UNE seule fois ; les libellés
// portent les deux langues (« FR · EN »). On évite la duplication intégrale
// FR-puis-EN — cf. le récap de fin de manche.
function deBlocks(s: de.DEState): DiscordBlock[] {
  const names = nameMap(s.participants);
  const slot = (x: de.DESlot) => (x.kind === 'player' ? (names.get(x.id) ?? x.id) : x.kind === 'bye' ? 'bye' : 'à venir');
  const blocks: DiscordBlock[] = [];

  // Arbre complet, se met à jour au fil des matchs.
  blocks.push({ label: 'Arbre · Bracket', chunks: splitForDiscord(formatBracket(s)) });

  const playable = de.playableMatches(s);
  if (playable.length > 0) {
    const pairings: PairingRow[] = playable.map((m) => ({ a: slot(m.a), b: slot(m.b), note: m.bracket }));
    blocks.push({
      label: 'Matchs à jouer · To play',
      chunks: formatPairings(`${FR}${EN} Matchs à jouer · To play`, pairings, { byeLabel: 'bye (auto-qualifié · auto-qualified)' }),
    });
  }

  // Rang = nombre neutre ; pas besoin de le traduire.
  const board = de.standings(s);
  const standing: StandingRow[] = board.map((r) => ({
    rank: r.rank,
    name: r.name,
    detail: r.rank === 1 ? '🏆 Champion' : `#${r.rank}`,
  }));
  blocks.push({
    label: 'Classement · Standings',
    chunks: formatStandings(`${FR}${EN} Classement · Standings`, standing),
  });
  return blocks;
}

// ─── Aiguillage ──────────────────────────────────────────────────────────────

export function discordBlocks(state: RunnerState, opts: RecapOptions): DiscordBlock[] {
  if (state.phase === 'swiss' || !state.playoff) {
    // Le récap de fin de manche passe en tête quand une manche est complète.
    const recap = roundRecap(state, opts);
    const blocks = swissBlocks(state.swiss, opts.now);
    return recap ? [recap, ...blocks] : blocks;
  }
  return deBlocks(state.playoff);
}
