// lib/discord/bracket.ts
//
// Arbre de tournoi (double élimination) en texte Discord, prêt à copier et qui
// SE MET À JOUR : il lit l'état live et résout chaque match au fur et à mesure
// (slots « à venir » → noms des gagnants, scores, gagnant en gras).
//
// Bilingue sans gonfler : noms/scores une seule fois ; seuls les libellés sont
// bilingues (« FR · EN »). Fonction pure → testable, jamais périmée.

import type { DEState, DEMatch, DESlot } from '../formats/double-elimination';

const TBD = 'à venir';

/** Arbre complet (gagnants → perdants → grande finale) en un seul texte Discord. */
export function formatBracket(s: DEState): string {
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const seeds = new Map(s.participants.map((p) => [p.id, p.seed]));

  const label = (slot: DESlot): string => {
    if (slot.kind === 'bye') return '—';
    if (slot.kind === 'tbd') return TBD;
    const nm = names.get(slot.id) ?? slot.id;
    const sd = seeds.get(slot.id);
    return sd ? `(${sd}) ${nm}` : nm;
  };

  const maxRound = (bracket: 'WB' | 'LB') =>
    s.matches.filter((m) => m.bracket === bracket).reduce((mx, m) => Math.max(mx, m.round), 0);
  const wbMax = maxRound('WB');
  const lbMax = maxRound('LB');

  const roundTitle = (m: DEMatch): string => {
    if (m.bracket === 'GF') return 'Grande finale · Grand Final';
    if (m.bracket === 'WB') {
      if (m.round === wbMax) return 'Finale gagnants · Winners Final';
      if (m.round === wbMax - 1) return 'Demies · Semifinals';
      return `Gagnants — Tour ${m.round} · Winners R${m.round}`;
    }
    if (m.round === lbMax) return 'Finale perdants · Losers Final';
    return `Perdants — Tour ${m.round} · Losers R${m.round}`;
  };

  const matchLine = (m: DEMatch): string => {
    const a = label(m.a);
    const b = label(m.b);
    if (m.winner && m.score) {
      const aWon = m.a.kind === 'player' && m.a.id === m.winner;
      return `${aWon ? `**${a}**` : a} \`${m.score.a}–${m.score.b}\` ${aWon ? b : `**${b}**`}`;
    }
    return `${a} vs ${b}`;
  };

  const lines: string[] = ['🏆 **Arbre · Bracket** — *double élim · 2 défaites = out · 2 losses = out*'];
  let lastTitle = '';
  for (const m of s.matches) {
    const title = roundTitle(m);
    if (title !== lastTitle) {
      lines.push('', `__${title}__`);
      lastTitle = title;
    }
    lines.push(matchLine(m));
  }
  return lines.join('\n');
}
