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

function header(champName: string | null) {
  const lanLogo = logoDataUri('lan-ets.png');
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
        { type: 'div', props: { style: { display: 'flex', alignItems: 'baseline' }, children: [
          { type: 'div', props: { style: { display: 'flex', color: C.win, fontSize: 54, fontWeight: 800, letterSpacing: 1 }, children: 'LAN ÉTS' } },
          { type: 'div', props: { style: { display: 'flex', color: RED, fontSize: 54, fontWeight: 800, marginLeft: 16 }, children: '2026' } },
        ] } },
        { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 22, fontWeight: 700, letterSpacing: 8, marginTop: 6 }, children: 'VALORANT · PLAYOFF' } },
      ],
    },
  });

  const right = champName
    ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', padding: '12px 22px', borderRadius: 10, background: '#2a2410', border: `2px solid ${GOLD}` }, children: [
        { type: 'div', props: { style: { display: 'flex', color: GOLD, fontSize: 16, fontWeight: 800, letterSpacing: 3, marginRight: 14 }, children: 'CHAMPION' } },
        { type: 'div', props: { style: { display: 'flex', color: C.win, fontSize: 24, fontWeight: 800 }, children: champName } },
      ] } }
    : valLogo
      ? { type: 'img', props: { src: valLogo, style: { height: 56 } } }
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
  const champName = champ ? (names.get(champ) ?? champ) : null;

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
  if (gf.length) wbRow.push(column('Grande finale', gf, names, seeds, champ, WB_H));

  // Loser bracket : structure entrelacée (pas un arbre binaire) → colonnes simples.
  const lbRow = [];
  for (let r = 1; r <= lbMax; r++) {
    const t = r === lbMax ? 'Finale L' : `Tour ${r}`;
    lbRow.push(column(t, byBR('LB', r), names, seeds, champ, LB_H));
  }

  const element = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: C.bg, padding: 48, fontFamily: 'Geist, sans-serif' },
      children: [
        header(champName),
        sectionLabel('Bracket gagnant · Winners', RED),
        { type: 'div', props: { style: { display: 'flex' }, children: wbRow } },
        sectionLabel('Bracket des perdants · Losers', GOLD),
        { type: 'div', props: { style: { display: 'flex' }, children: lbRow } },
      ],
    },
  };

  return new ImageResponse(element as unknown as React.ReactElement, { width: 1700, height: 1300 });
}
