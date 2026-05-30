// Poste de commandement orga — dérivation pure des « vitals » glançables.
//
// Présentation seulement : on lit ce que le moteur (swiss / double-élim) expose
// et on le met en forme de tuiles. Aucune règle de tournoi n'est calculée ici.
import * as swiss from '../formats/swiss';
import * as de from '../formats/double-elimination';
import type { ValorantState } from '../runtime/runner';

export type VitalTone = 'default' | 'accent' | 'success' | 'danger';

export interface Vital {
  /** Clé stable (tests + key React). */
  key: string;
  /** Libellé sourd au-dessus de la valeur. */
  label: string;
  /** Valeur principale, en gros. */
  value: string;
  /** Sous-titre optionnel. */
  hint?: string;
  /** Progression 0..1 → barre optionnelle. */
  progress?: number;
  tone?: VitalTone;
}

export interface Vitals {
  phase: ValorantState['phase'];
  tiles: Vital[];
}

export function valorantVitals(state: ValorantState): Vitals {
  if (state.phase === 'playoff' && state.playoff) {
    return { phase: 'playoff', tiles: playoffTiles(state.playoff) };
  }
  return { phase: state.phase, tiles: swissTiles(state) };
}

// ─── Phase suisse ────────────────────────────────────────────────────────────

function swissTiles(state: ValorantState): Vital[] {
  const s = state.swiss;
  const round = swiss.currentRound(s);
  const board = swiss.standings(s);

  // Matchs « réels » de la ronde courante (les byes ne comptent pas).
  const real = s.matches.filter((m) => m.round === round && m.away !== null);
  const played = real.filter((m) => m.score !== null).length;
  const total = real.length;

  const qualified = board.filter((r) => r.status === 'qualified').length;
  const eliminated = board.filter((r) => r.status === 'eliminated').length;
  const active = board.filter((r) => r.status === 'active').length;
  // Tant que personne n'a gagné de match, le classement n'est pas significatif
  // (tri par seed aléatoire) : pas de meneur arbitraire.
  const leader = board[0]?.wins ? board[0] : null;

  return [
    {
      key: 'round',
      label: 'Ronde',
      value: round === 0 ? '—' : String(round),
      hint: 'Phase suisse',
    },
    {
      key: 'matches',
      label: 'Matchs de la ronde',
      value: `${played}/${total}`,
      progress: total === 0 ? 0 : played / total,
      tone: total > 0 && played < total ? 'accent' : 'default',
    },
    {
      key: 'qualif',
      label: 'Qualification',
      value: `${qualified}/${state.playoffSize}`,
      hint: `${active} en lice · ${eliminated} éliminés`,
      progress: state.playoffSize === 0 ? 0 : Math.min(1, qualified / state.playoffSize),
      tone: qualified >= state.playoffSize ? 'success' : 'default',
    },
    {
      key: 'leader',
      label: 'Meneur',
      value: leader ? leader.name : 'Aucun',
      hint: leader ? `${leader.wins}-${leader.losses}` : 'aucun match joué',
      tone: leader && leader.status === 'qualified' ? 'success' : 'default',
    },
  ];
}

// ─── Playoff (double-élimination) ─────────────────────────────────────────────

function playoffTiles(p: de.DEState): Vital[] {
  const playable = de.playableMatches(p).length;
  const decided = p.matches.filter((m) => m.winner !== null).length;
  const total = p.matches.length;
  const champId = de.champion(p);
  const champName = champId
    ? (p.participants.find((x) => x.id === champId)?.name ?? champId)
    : null;

  return [
    {
      key: 'phase',
      label: 'Phase',
      value: 'Playoff',
      hint: 'Double élim',
    },
    {
      key: 'playable',
      label: 'Matchs jouables',
      value: String(playable),
      tone: playable > 0 ? 'accent' : 'default',
    },
    {
      key: 'progress',
      label: 'Progression',
      value: `${decided}/${total}`,
      progress: total === 0 ? 0 : decided / total,
    },
    {
      key: 'champion',
      label: 'Champion',
      value: champName ?? 'en cours',
      tone: champName ? 'success' : 'default',
    },
  ];
}
