// lib/discord/recap.ts
//
// Récapitulatif de fin de manche : un seul message Discord compact, posté quand
// une ronde suisse est jouée au complet. Réunit résultats, faits saillants,
// classement à jour et la prochaine manche.
//
// Bilingue sans gonfler : les données (noms d'équipes, scores) sont neutres et
// affichées UNE seule fois ; seuls les libellés sont bilingues (« FR · EN »).
// Fonction pure : l'heure réelle (`now`) est injectée, jamais lue de l'horloge
// ici — donc testable et jamais périmée.

import type { ParticipantId } from '../domain/types';
import * as swiss from '../formats/swiss';
import type { SwissState } from '../formats/swiss';
import type { ValorantState } from '../runtime/runner';
import { splitForDiscord } from './split';
import type { DiscordBlock } from './format';

export interface RecapOptions {
  /** Heure réelle « HH:MM » au moment du récap (horloge du navigateur/serveur). */
  now: string;
  /** Rang Valorant moyen par équipe — réservé pour de futurs faits saillants. */
  rankById?: Record<ParticipantId, number | null>;
  /** Minutes de battement avant la prochaine manche. Défaut 10. */
  setupMin?: number;
}

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

  const nextTime = addMinutes(opts.now, opts.setupMin ?? 10);
  return {
    label: `Récap — Manche ${round}`,
    chunks: splitForDiscord(render(s, round, nextTime)),
  };
}

function render(s: SwissState, round: number, nextTime: string): string {
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const seeds = new Map(s.participants.map((p) => [p.id, p.seed]));
  const nm = (id: ParticipantId) => names.get(id) ?? id;

  const roundMatches = s.matches.filter((m) => m.round === round);
  const realPlayed = roundMatches.filter((m) => m.away !== null && m.score !== null && !m.forfeit);

  const lines: string[] = [];
  lines.push(`:flag_fr::flag_gb: 📋 **Manche ${round} terminée · Round ${round} complete**`);

  // ── Résultats ──
  lines.push('', '__Résultats · Results__');
  for (const m of roundMatches) {
    const home = nm(m.home);
    if (m.away === null) lines.push(`${home} — *bye*`);
    else if (m.forfeit) lines.push(`${home} vs ${nm(m.away)} — *forfait · forfeit*`);
    else lines.push(`${home} \`${m.score!.home}–${m.score!.away}\` ${nm(m.away)}`);
  }

  // ── Faits saillants (uniquement ce qui est notable) ──
  for (const m of realPlayed) {
    const homeWon = m.score!.home > m.score!.away;
    const winner = homeWon ? m.home : (m.away as ParticipantId);
    const loser = homeWon ? (m.away as ParticipantId) : m.home;
    // Seed plus élevé = équipe moins bien classée. Si elle gagne, c'est une surprise.
    if ((seeds.get(winner) ?? 0) > (seeds.get(loser) ?? 0)) {
      lines.push(`🔥 Surprise · Upset : ${nm(winner)} bat · beat ${nm(loser)}`);
    }
  }

  const playedIds = new Set<ParticipantId>();
  for (const m of roundMatches) {
    playedIds.add(m.home);
    if (m.away !== null) playedIds.add(m.away);
  }
  const quals = [...playedIds].filter((id) => swiss.statusOf(s, id) === 'qualified').map(nm);
  const elims = [...playedIds].filter((id) => swiss.statusOf(s, id) === 'eliminated').map(nm);
  if (quals.length > 0) lines.push(`✅ Qualifiées · Qualified : ${quals.join(' · ')}`);
  if (elims.length > 0) lines.push(`❌ Éliminées · Eliminated : ${elims.join(' · ')}`);

  if (realPlayed.length > 0) {
    const closest = [...realPlayed].sort((a, b) => {
      const ma = Math.abs(a.score!.home - a.score!.away);
      const mb = Math.abs(b.score!.home - b.score!.away);
      if (ma !== mb) return ma - mb;
      const sa = (seeds.get(a.home) ?? 0) + (seeds.get(a.away as ParticipantId) ?? 0);
      const sb = (seeds.get(b.home) ?? 0) + (seeds.get(b.away as ParticipantId) ?? 0);
      return sa - sb;
    })[0];
    lines.push(
      `🎬 Plus serré · Closest : ${nm(closest.home)} \`${closest.score!.home}–${closest.score!.away}\` ${nm(closest.away as ParticipantId)}`,
    );
  }

  // ── Classement, groupé par bilan (compact) ──
  lines.push('', '__Classement · Standings__');
  const board = swiss.standings(s);
  let bucketKey = '';
  let bucket: string[] = [];
  const flush = () => {
    if (bucket.length > 0) lines.push(`\`${bucketKey}\` ${bucket.join(' · ')}`);
  };
  for (const r of board) {
    const key = `${r.wins}-${r.losses}`;
    if (key !== bucketKey) {
      flush();
      bucketKey = key;
      bucket = [];
    }
    bucket.push(r.name);
  }
  flush();

  // ── Prochaine manche ──
  lines.push('');
  if (swiss.isComplete(s)) {
    const quali = swiss.qualifiers(s).map(nm);
    lines.push('🏆 **Phase suisse terminée · Swiss stage complete**');
    lines.push(`Qualifiées · Qualified : ${quali.join(' · ')}`);
  } else {
    const cur = swiss.currentRound(s);
    if (cur > round) {
      // Prochaine ronde déjà tirée : on montre les appariements.
      lines.push(`__Prochaine · Next — Ronde ${cur} (≈ ${nextTime})__`);
      for (const m of s.matches.filter((m) => m.round === cur)) {
        lines.push(m.away === null ? `${nm(m.home)} — *bye*` : `${nm(m.home)} vs ${nm(m.away)}`);
      }
    } else {
      lines.push(`__Prochaine · Next — Ronde ${round + 1} (≈ ${nextTime})__ — *à générer · to be drawn*`);
    }
  }

  return lines.join('\n');
}
