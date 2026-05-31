// Image PNG du bracket (double élimination) pour Discord, générée depuis l'état
// live via next/og (Satori). Se met à jour au fil des matchs. Identité LAN ÉTS /
// Valorant : logos depuis public/ si présents (lan-ets.png / valorant.png), sinon
// wordmark typographique. Connecteurs en arbre pour le winner bracket.
// CSS limité à Satori (flexbox, bordures, positions) — pas de grid, pas d'emoji.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { DEState, DEMatch, DESlot } from '@/lib/formats/double-elimination';
import { champion } from '@/lib/formats/double-elimination';

const RED = '#ff4655';
const GOLD = '#f5b942';
const C = {
  bg: '#161719',
  panel: '#232427',
  panelWin: '#2c2024',
  line: '#3a3d44',
  text: '#e3e5e8',
  mute: '#8b8e95',
  win: '#ffffff',
  seedBg: '#34363b',
};

const BOX_W = 360;
const ROW_H = 44;
const COL_GAP = 14;
const CONN_W = 34;
const TITLE_H = 30; // hauteur du libellé de colonne (aligne les connecteurs)
const WB_H = 600;
const LB_H = 280;
const GF_W = 420; // carte « grande finale » plus large que les boîtes ordinaires

/** Logo depuis public/<file> en data URI, ou null si absent (→ fallback wordmark). */
function logoDataUri(file: string): string | null {
  try {
    const p = join(process.cwd(), 'public', file);
    if (!existsSync(p)) return null;
    const ext = /\.jpe?g$/i.test(file) ? 'jpeg' : 'png';
    return `data:image/${ext};base64,${readFileSync(p).toString('base64')}`;
  } catch {
    return null; // décoration optionnelle : l'absence n'est pas une erreur
  }
}

function teamRow(slot: DESlot, o: { names: Map<string, string>; seeds: Map<string, number>; isWinner: boolean; isChampion: boolean; score: number | null; top: boolean }) {
  const tbd = slot.kind === 'tbd';
  const bye = slot.kind === 'bye';
  const name = slot.kind === 'player' ? (o.names.get(slot.id) ?? slot.id) : tbd ? 'À venir' : '—';
  const seed = slot.kind === 'player' ? o.seeds.get(slot.id) : undefined;
  const accent = o.isChampion ? GOLD : RED;
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: ROW_H,
        padding: '0 12px',
        borderBottom: o.top ? `1px solid ${C.line}` : 'none',
        borderLeft: o.isWinner ? `4px solid ${accent}` : '4px solid transparent',
        background: o.isWinner ? C.panelWin : 'transparent',
      },
      children: [
        seed
          ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, marginRight: 10, borderRadius: 5, background: o.isWinner ? accent : C.seedBg, color: o.isWinner ? '#161719' : C.mute, fontSize: 16, fontWeight: 700 }, children: String(seed) } }
          : { type: 'div', props: { style: { display: 'flex', width: 28, marginRight: 10 }, children: '' } },
        { type: 'div', props: { style: { display: 'flex', flexGrow: 1, color: tbd || bye ? C.mute : o.isWinner ? C.win : C.text, fontSize: 21, fontWeight: o.isWinner ? 700 : 500, fontStyle: tbd ? 'italic' : 'normal' }, children: name } },
        { type: 'div', props: { style: { display: 'flex', color: o.isWinner ? accent : C.mute, fontSize: 21, fontWeight: 800 }, children: o.score === null ? '' : String(o.score) } },
      ],
    },
  };
}

function matchBox(m: DEMatch, names: Map<string, string>, seeds: Map<string, number>, champ: string | null) {
  const aWon = !!m.winner && m.a.kind === 'player' && m.a.id === m.winner;
  const bWon = !!m.winner && m.b.kind === 'player' && m.b.id === m.winner;
  const champA = aWon && m.a.kind === 'player' && m.a.id === champ;
  const champB = bWon && m.b.kind === 'player' && m.b.id === champ;
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: BOX_W, border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel, overflow: 'hidden' },
      children: [
        teamRow(m.a, { names, seeds, isWinner: aWon, isChampion: champA, score: m.score ? m.score.a : null, top: true }),
        teamRow(m.b, { names, seeds, isWinner: bWon, isChampion: champB, score: m.score ? m.score.b : null, top: false }),
      ],
    },
  };
}

function column(title: string, matches: DEMatch[], names: Map<string, string>, seeds: Map<string, number>, champ: string | null, height: number) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', marginRight: COL_GAP },
      children: [
        { type: 'div', props: { style: { display: 'flex', height: TITLE_H, color: C.mute, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }, children: title } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height }, children: matches.map((m) => matchBox(m, names, seeds, champ)) } },
      ],
    },
  };
}

/** Colonne de connecteurs « arbre » entre une colonne de `prevN` boîtes et la
 *  suivante (prevN/2 boîtes). Chaque connecteur joint une paire → aligné par
 *  space-around (même rythme géométrique que les colonnes). */
function connectorColumn(prevN: number, height: number) {
  const items = [];
  for (let k = 0; k < Math.floor(prevN / 2); k++) {
    items.push({ type: 'div', props: { style: { display: 'flex', width: CONN_W, height: height / prevN, borderTop: `2px solid ${C.line}`, borderBottom: `2px solid ${C.line}`, borderRight: `2px solid ${C.line}` }, children: '' } });
  }
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', marginRight: COL_GAP },
      children: [
        { type: 'div', props: { style: { display: 'flex', height: TITLE_H }, children: '' } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height }, children: items } },
      ],
    },
  };
}

/** Rangée d'équipe pour la grande finale : plus grande que `teamRow`, avec
 *  pastille « CHAMPION » dorée sur le gagnant du tournoi. */
function gfTeamRow(slot: DESlot, o: { names: Map<string, string>; seeds: Map<string, number>; isWinner: boolean; isChampion: boolean; score: number | null; top: boolean }) {
  const tbd = slot.kind === 'tbd';
  const bye = slot.kind === 'bye';
  const name = slot.kind === 'player' ? (o.names.get(slot.id) ?? slot.id) : tbd ? 'À venir' : '—';
  const seed = slot.kind === 'player' ? o.seeds.get(slot.id) : undefined;
  const accent = o.isChampion ? GOLD : RED;
  const children = [
    seed
      ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 30, marginRight: 12, borderRadius: 6, background: o.isWinner ? accent : C.seedBg, color: o.isWinner ? '#161719' : C.mute, fontSize: 18, fontWeight: 700 }, children: String(seed) } }
      : { type: 'div', props: { style: { display: 'flex', width: 32, marginRight: 12 }, children: '' } },
    { type: 'div', props: { style: { display: 'flex', flexGrow: 1, color: tbd || bye ? C.mute : o.isWinner ? C.win : C.text, fontSize: 25, fontWeight: o.isWinner ? 800 : 600, fontStyle: tbd ? 'italic' : 'normal' }, children: name } },
    o.isChampion
      ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', padding: '4px 10px', marginRight: 14, borderRadius: 6, background: GOLD, color: '#161719', fontSize: 13, fontWeight: 800, letterSpacing: 2 }, children: 'CHAMPION' } }
      : null,
    { type: 'div', props: { style: { display: 'flex', color: o.isWinner ? accent : C.mute, fontSize: 28, fontWeight: 800 }, children: o.score === null ? '' : String(o.score) } },
  ].filter(Boolean);
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: 56,
        padding: '0 16px',
        borderBottom: o.top ? `1px solid ${C.line}` : 'none',
        borderLeft: o.isWinner ? `5px solid ${accent}` : '5px solid transparent',
        background: o.isWinner ? (o.isChampion ? '#2c2410' : C.panelWin) : 'transparent',
      },
      children,
    },
  };
}

/** Pied de la carte : pointage carte par carte (gagnant de chaque partie
 *  surligné) si la série est détaillée, sinon le libellé générique. */
function gfFooter(games: { a: number; b: number }[] | undefined) {
  const base = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, background: '#1b1a17' };
  if (!games || games.length === 0) {
    return { type: 'div', props: { style: { ...base, color: C.mute, fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }, children: 'Série au meilleur de 3' } };
  }
  const children: unknown[] = [
    { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginRight: 12, textTransform: 'uppercase' }, children: 'Parties' } },
  ];
  games.forEach((g, i) => {
    const aw = g.a > g.b;
    if (i > 0) children.push({ type: 'div', props: { style: { display: 'flex', color: C.line, fontSize: 16, margin: '0 9px' }, children: '·' } });
    children.push({
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center' },
        children: [
          { type: 'div', props: { style: { display: 'flex', color: aw ? C.win : C.mute, fontSize: 19, fontWeight: aw ? 800 : 600 }, children: String(g.a) } },
          { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 16, margin: '0 5px' }, children: '–' } },
          { type: 'div', props: { style: { display: 'flex', color: aw ? C.mute : C.win, fontSize: 19, fontWeight: aw ? 600 : 800 }, children: String(g.b) } },
        ],
      },
    });
  });
  return { type: 'div', props: { style: { ...base, padding: '0 14px' }, children } };
}

/** Carte distincte de la grande finale : bordure dorée, titre, et pied
 *  « meilleur de 3 ». Couronne le champion s'il est décidé. */
function grandFinalCard(m: DEMatch, names: Map<string, string>, seeds: Map<string, number>, champ: string | null) {
  const aWon = !!m.winner && m.a.kind === 'player' && m.a.id === m.winner;
  const bWon = !!m.winner && m.b.kind === 'player' && m.b.id === m.winner;
  const champA = aWon && m.a.kind === 'player' && m.a.id === champ;
  const champB = bWon && m.b.kind === 'player' && m.b.id === champ;
  const decided = !!m.winner;
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        { type: 'div', props: { style: { display: 'flex', height: TITLE_H, color: GOLD, fontSize: 17, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase' }, children: 'Grande finale' } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', width: GF_W, border: `3px solid ${GOLD}`, borderRadius: 12, background: decided ? '#221c0c' : C.panel, overflow: 'hidden' },
            children: [
              gfTeamRow(m.a, { names, seeds, isWinner: aWon, isChampion: champA, score: m.score ? m.score.a : null, top: true }),
              gfTeamRow(m.b, { names, seeds, isWinner: bWon, isChampion: champB, score: m.score ? m.score.b : null, top: false }),
              gfFooter(m.games),
            ],
          },
        },
      ],
    },
  };
}

/** Connecteur en accolade reliant les finales W et L (à gauche) à la carte de
 *  grande finale (à droite) : lignes haut/bas + montant droit. */
function finalConnector(height: number) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', marginLeft: COL_GAP, marginRight: COL_GAP },
      children: [{ type: 'div', props: { style: { display: 'flex', width: CONN_W, height, borderTop: `2px solid ${C.line}`, borderBottom: `2px solid ${C.line}`, borderRight: `2px solid ${C.line}` }, children: '' } }],
    },
  };
}

function sectionLabel(text: string, color: string) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', marginBottom: 22, marginTop: 14 },
      children: [
        { type: 'div', props: { style: { display: 'flex', width: 6, height: 28, borderRadius: 3, background: color, marginRight: 14 }, children: '' } },
        { type: 'div', props: { style: { display: 'flex', color: C.text, fontSize: 25, fontWeight: 800, letterSpacing: 0.5 }, children: text } },
      ],
    },
  };
}

function header() {
  // Texte blanc d'abord (lisible sur fond sombre), repli sur la version foncée puis le wordmark.
  const lanLogo = logoDataUri('lan-ets-text-white.png') ?? logoDataUri('lan-ets.png');
  const valLogo = logoDataUri('valorant.png');

  const leftChildren = [];
  leftChildren.push(
    lanLogo
      ? { type: 'img', props: { src: lanLogo, style: { height: 78, marginRight: 22 } } }
      : { type: 'div', props: { style: { display: 'flex', width: 10, height: 78, borderRadius: 4, background: RED, marginRight: 22 }, children: '' } },
  );
  leftChildren.push({
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'baseline' }, children: lanLogo
          // Le logo porte déjà « LAN ÉTS » → on n'affiche que l'année pour éviter le doublon.
          ? [{ type: 'div', props: { style: { display: 'flex', color: RED, fontSize: 54, fontWeight: 800 }, children: '2026' } }]
          : [
              { type: 'div', props: { style: { display: 'flex', color: C.win, fontSize: 54, fontWeight: 800, letterSpacing: 1 }, children: 'LAN ÉTS' } },
              { type: 'div', props: { style: { display: 'flex', color: RED, fontSize: 54, fontWeight: 800, marginLeft: 16 }, children: '2026' } },
            ] } },
        { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 22, fontWeight: 700, letterSpacing: 8, marginTop: 6 }, children: 'VALORANT · PLAYOFF' } },
      ],
    },
  });

  // Logo Valorant toujours présent à droite (le champion est couronné dans la
  // carte de grande finale, plus dans l'en-tête).
  const right = valLogo
    ? { type: 'img', props: { src: valLogo, style: { height: 64 } } }
    : { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 19, fontWeight: 600 }, children: 'Double élimination · 2 défaites = éliminé' } };

  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${C.line}`, paddingBottom: 22, marginBottom: 8 },
      children: [{ type: 'div', props: { style: { display: 'flex', alignItems: 'center' }, children: leftChildren } }, right],
    },
  };
}

export function bracketImageResponse(state: DEState): ImageResponse {
  const names = new Map(state.participants.map((p) => [p.id, p.name]));
  const seeds = new Map(state.participants.map((p) => [p.id, p.seed]));
  const champ = champion(state);

  const byBR = (bracket: 'WB' | 'LB' | 'GF', round: number) => state.matches.filter((m) => m.bracket === bracket && m.round === round);
  const maxR = (bracket: 'WB' | 'LB') => state.matches.filter((m) => m.bracket === bracket).reduce((mx, m) => Math.max(mx, m.round), 0);
  const wbMax = maxR('WB');
  const lbMax = maxR('LB');

  // Winner bracket avec connecteurs en arbre (les rondes WB forment un arbre binaire).
  const wbRow = [];
  for (let r = 1; r <= wbMax; r++) {
    const t = r === wbMax ? 'Finale W' : r === wbMax - 1 ? 'Demies' : `Tour ${r}`;
    const matches = byBR('WB', r);
    wbRow.push(column(t, matches, names, seeds, champ, WB_H));
    if (r < wbMax && matches.length >= 2) wbRow.push(connectorColumn(matches.length, WB_H));
  }
  const gf = byBR('GF', 1);

  // Loser bracket : structure entrelacée (pas un arbre binaire) → colonnes simples.
  const lbRow = [];
  for (let r = 1; r <= lbMax; r++) {
    const t = r === lbMax ? 'Finale L' : `Tour ${r}`;
    lbRow.push(column(t, byBR('LB', r), names, seeds, champ, LB_H));
  }

  // Pile des deux brackets (gauche) ; la grande finale est centrée à droite et
  // reliée aux finales W/L par un connecteur en accolade.
  const bracketsStack = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        sectionLabel('Bracket gagnant · Winners', RED),
        { type: 'div', props: { style: { display: 'flex' }, children: wbRow } },
        sectionLabel('Bracket des perdants · Losers', GOLD),
        { type: 'div', props: { style: { display: 'flex' }, children: lbRow } },
      ],
    },
  };

  const mainArea = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center' },
      children: gf.length
        ? [bracketsStack, finalConnector(360), grandFinalCard(gf[0], names, seeds, champ)]
        : [bracketsStack],
    },
  };

  const element = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: C.bg, padding: 48, fontFamily: 'Geist, sans-serif' },
      children: [header(), mainArea],
    },
  };

  return new ImageResponse(element as unknown as React.ReactElement, {
    width: 2120,
    height: 1300,
    // L'état du tournoi change en live : jamais de cache, sinon Discord/projecteur
    // afficheraient une braquette périmée (next/og met un cache long par défaut).
    headers: { 'cache-control': 'no-store, must-revalidate' },
  });
}
