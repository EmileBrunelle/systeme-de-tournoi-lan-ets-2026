// lib/discord/recap.ts
//
// Récapitulatif de fin de manche : un seul message Discord bilingue, posté
// quand une ronde suisse est jouée au complet. Réunit résultats, faits
// saillants, classement à jour et la prochaine manche (appariements + heure
// estimée). Fonction pure : l'heure réelle (`now`) est injectée, jamais lue de
// l'horloge ici — donc testable et jamais périmée.

import type { ParticipantId } from '../domain/types';
import * as swiss from '../formats/swiss';
import type { SwissState } from '../formats/swiss';
import type { ValorantState } from '../runtime/runner';
import { splitForDiscord } from './split';
import { bilingualChunks, type DiscordBlock } from './format';

export interface RecapOptions {
  /** Heure réelle « HH:MM » au moment du récap (horloge du navigateur/serveur). */
  now: string;
  /** Rang Valorant moyen par équipe — réservé pour de futurs faits saillants. */
  rankById?: Record<ParticipantId, number | null>;
  /** Minutes de battement avant la prochaine manche. Défaut 10. */
  setupMin?: number;
}

/** Libellés d'une langue. Les données (noms, scores) sont communes aux deux. */
interface Lang {
  flag: string;
  recap: string;
  manche: string;
  done: string;
  results: string;
  highlights: string;
  upset: string;
  beat: string;
  qualified: string;
  eliminated: string;
  closest: string;
  standings: string;
  tiebreak: string;
  nextManche: string;
  round: string;
  toGenerate: string;
  swissDone: string;
  qualifiersForPlayoff: string;
  bye: string;
  forfeit: string;
}

const FR: Lang = {
  flag: ':flag_fr:',
  recap: 'Récap',
  manche: 'Manche',
  done: 'terminée',
  results: 'Résultats',
  highlights: 'Faits saillants',
  upset: 'Surprise',
  beat: 'bat',
  qualified: 'Qualifiées',
  eliminated: 'Éliminées',
  closest: 'Match le plus serré',
  standings: 'Classement',
  tiebreak: "bris d'égalité",
  nextManche: 'Prochaine manche',
  round: 'Ronde',
  toGenerate: 'appariements à générer',
  swissDone: 'Phase suisse terminée',
  qualifiersForPlayoff: 'Qualifiés pour le playoff',
  bye: 'bye',
  forfeit: 'forfait',
};

const EN: Lang = {
  flag: ':flag_gb:',
  recap: 'Recap',
  manche: 'Round',
  done: 'complete',
  results: 'Results',
  highlights: 'Highlights',
  upset: 'Upset',
  beat: 'beat',
  qualified: 'Qualified',
  eliminated: 'Eliminated',
  closest: 'Closest match',
  standings: 'Standings',
  tiebreak: 'tiebreaker',
  nextManche: 'Next round',
  round: 'Round',
  toGenerate: 'pairings to be drawn',
  swissDone: 'Swiss stage complete',
  qualifiersForPlayoff: 'Qualified for playoffs',
  bye: 'bye',
  forfeit: 'forfeit',
};

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Bloc Discord récapitulant la dernière manche complète. Renvoie `null` si on
 * n'est pas en phase suisse ou si aucune manche n'est encore terminée.
 */
export function roundRecap(state: ValorantState, opts: RecapOptions): DiscordBlock | null {
  if (state.phase !== 'swiss') return null;
  const s = state.swiss;
  const round = swiss.lastCompleteRound(s);
  if (round === 0) return null;

  const setupMin = opts.setupMin ?? 10;
  const nextTime = addMinutes(opts.now, setupMin);

  const fr = render(s, round, opts.now, nextTime, FR);
  const en = render(s, round, opts.now, nextTime, EN);

  return {
    label: `${FR.recap} — ${FR.manche} ${round}`,
    chunks: bilingualChunks(splitForDiscord(fr), splitForDiscord(en)),
  };
}

function render(s: SwissState, round: number, now: string, nextTime: string, L: Lang): string {
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const seeds = new Map(s.participants.map((p) => [p.id, p.seed]));
  const nm = (id: ParticipantId) => names.get(id) ?? id;

  const roundMatches = s.matches.filter((m) => m.round === round);
  const realPlayed = roundMatches.filter((m) => m.away !== null && m.score !== null && !m.forfeit);

  const lines: string[] = [];
  lines.push(`**${L.flag} 📋 ${L.recap} — ${L.manche} ${round} ${L.done}**`);

  // ── Résultats ──
  lines.push('', `__${L.results}__`);
  for (const m of roundMatches) {
    const home = nm(m.home);
    if (m.away === null) {
      lines.push(`\`${home}\` — ${L.bye}`);
    } else if (m.forfeit) {
      lines.push(`\`${home}\` vs \`${nm(m.away)}\` → ${L.forfeit}`);
    } else {
      lines.push(`\`${home}\` ${m.score!.home}–${m.score!.away} \`${nm(m.away)}\``);
    }
  }

  // ── Faits saillants ──
  const highlights: string[] = [];
  for (const m of realPlayed) {
    const homeWon = m.score!.home > m.score!.away;
    const winner = homeWon ? m.home : (m.away as ParticipantId);
    const loser = homeWon ? (m.away as ParticipantId) : m.home;
    // Seed plus élevé = équipe moins bien classée. Si elle gagne, c'est une surprise.
    if ((seeds.get(winner) ?? 0) > (seeds.get(loser) ?? 0)) {
      highlights.push(`🔥 ${L.upset} : \`${nm(winner)}\` ${L.beat} \`${nm(loser)}\``);
    }
  }

  const playedIds = new Set<ParticipantId>();
  for (const m of roundMatches) {
    playedIds.add(m.home);
    if (m.away !== null) playedIds.add(m.away);
  }
  const quals = [...playedIds].filter((id) => swiss.statusOf(s, id) === 'qualified').map(nm);
  const elims = [...playedIds].filter((id) => swiss.statusOf(s, id) === 'eliminated').map(nm);
  if (quals.length > 0) highlights.push(`✅ ${L.qualified} : ${quals.join(', ')}`);
  if (elims.length > 0) highlights.push(`❌ ${L.eliminated} : ${elims.join(', ')}`);

  if (realPlayed.length > 0) {
    const closest = [...realPlayed].sort((a, b) => {
      const ma = Math.abs(a.score!.home - a.score!.away);
      const mb = Math.abs(b.score!.home - b.score!.away);
      if (ma !== mb) return ma - mb;
      const sa = (seeds.get(a.home) ?? 0) + (seeds.get(a.away as ParticipantId) ?? 0);
      const sb = (seeds.get(b.home) ?? 0) + (seeds.get(b.away as ParticipantId) ?? 0);
      return sa - sb;
    })[0];
    highlights.push(
      `🎬 ${L.closest} : \`${nm(closest.home)}\` ${closest.score!.home}–${closest.score!.away} \`${nm(closest.away as ParticipantId)}\``,
    );
  }

  if (highlights.length > 0) {
    lines.push('', `__${L.highlights}__`, ...highlights);
  }

  // ── Classement ──
  lines.push('', `__${L.standings}__`);
  for (const r of swiss.standings(s)) {
    lines.push(`\`${r.rank}.\` **${r.name}** — ${r.wins}-${r.losses} (${L.tiebreak} ${r.tiebreak})`);
  }

  // ── Prochaine manche ──
  lines.push('');
  if (swiss.isComplete(s)) {
    const quali = swiss.qualifiers(s).map(nm);
    lines.push(`**🏆 ${L.swissDone}**`, `${L.qualifiersForPlayoff} : ${quali.join(', ')}`);
  } else {
    const cur = swiss.currentRound(s);
    if (cur > round) {
      // Prochaine ronde déjà tirée : on montre les appariements.
      lines.push(`**${L.nextManche} — ${L.round} ${cur} (≈ ${nextTime})**`);
      const next = s.matches.filter((m) => m.round === cur);
      next.forEach((m, i) => {
        lines.push(
          m.away === null
            ? `\`${i + 1}.\` ${nm(m.home)} — ${L.bye}`
            : `\`${i + 1}.\` ${nm(m.home)} **vs** ${nm(m.away)}`,
        );
      });
    } else {
      lines.push(`**${L.nextManche} — ${L.round} ${round + 1} (≈ ${nextTime})** — ${L.toGenerate}`);
    }
  }

  return lines.join('\n');
}
