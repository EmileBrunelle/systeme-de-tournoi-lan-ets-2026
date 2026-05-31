// Image PNG du bracket (double élimination) pour Discord, générée depuis l'état
// live via next/og (Satori). Se met à jour : gagnants en surbrillance, scores,
// slots « à venir » résolus au fil des matchs. CSS limité à ce que Satori gère
// (flexbox, bordures, positions) — pas de grid, pas d'emoji (rendu fiable).

import { ImageResponse } from 'next/og';
import type { DEState, DEMatch, DESlot } from '@/lib/formats/double-elimination';

const C = {
  bg: '#1a1b1e',
  panel: '#2b2d31',
  panelWin: '#3a3d44',
  line: '#3f4147',
  text: '#dbdee1',
  mute: '#80848e',
  win: '#ffffff',
  acc: '#f0b132', // or pour le gagnant / la grande finale
  accDim: '#5d4a1f',
  seedBg: '#404249',
  title: '#ffffff',
};

const BOX_W = 250;
const ROW_H = 30;

function teamRow(slot: DESlot, opts: { names: Map<string, string>; seeds: Map<string, number>; isWinner: boolean; score: number | null; top: boolean }) {
  const { names, seeds, isWinner, score, top } = opts;
  const tbd = slot.kind === 'tbd';
  const bye = slot.kind === 'bye';
  const name = slot.kind === 'player' ? (names.get(slot.id) ?? slot.id) : tbd ? 'À venir' : '—';
  const seed = slot.kind === 'player' ? seeds.get(slot.id) : undefined;
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: ROW_H,
        padding: '0 8px',
        borderBottom: top ? `1px solid ${C.line}` : 'none',
        background: isWinner ? C.panelWin : 'transparent',
      },
      children: [
        seed
          ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 18, marginRight: 6, borderRadius: 3, background: C.seedBg, color: C.mute, fontSize: 12 }, children: String(seed) } }
          : { type: 'div', props: { style: { display: 'flex', width: 20, marginRight: 6 }, children: '' } },
        { type: 'div', props: { style: { display: 'flex', flexGrow: 1, color: tbd || bye ? C.mute : isWinner ? C.win : C.text, fontSize: 15, fontStyle: tbd ? 'italic' : 'normal' }, children: name } },
        { type: 'div', props: { style: { display: 'flex', color: isWinner ? C.acc : C.mute, fontSize: 15, fontWeight: 700 }, children: score === null ? '' : String(score) } },
      ],
    },
  };
}

function matchBox(m: DEMatch, names: Map<string, string>, seeds: Map<string, number>) {
  const aWon = !!m.winner && m.a.kind === 'player' && m.a.id === m.winner;
  const bWon = !!m.winner && m.b.kind === 'player' && m.b.id === m.winner;
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: BOX_W,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
        background: C.panel,
        overflow: 'hidden',
      },
      children: [
        teamRow(m.a, { names, seeds, isWinner: aWon, score: m.score ? m.score.a : null, top: true }),
        teamRow(m.b, { names, seeds, isWinner: bWon, score: m.score ? m.score.b : null, top: false }),
      ],
    },
  };
}

function column(title: string, matches: DEMatch[], names: Map<string, string>, seeds: Map<string, number>, height: number) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', marginRight: 28 },
      children: [
        { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 13, letterSpacing: 1, marginBottom: 8, height: 16, textTransform: 'uppercase' }, children: title } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height },
            children: matches.map((m) => matchBox(m, names, seeds)),
          },
        },
      ],
    },
  };
}

function sectionLabel(text: string, color: string) {
  return { type: 'div', props: { style: { display: 'flex', color, fontSize: 18, fontWeight: 700, marginBottom: 26, marginTop: 12 }, children: text } };
}

export function bracketImageResponse(state: DEState, title: string): ImageResponse {
  const names = new Map(state.participants.map((p) => [p.id, p.name]));
  const seeds = new Map(state.participants.map((p) => [p.id, p.seed]));
  const byBR = (bracket: 'WB' | 'LB' | 'GF', round: number) => state.matches.filter((m) => m.bracket === bracket && m.round === round);
  const maxR = (bracket: 'WB' | 'LB') => state.matches.filter((m) => m.bracket === bracket).reduce((mx, m) => Math.max(mx, m.round), 0);
  const wbMax = maxR('WB');
  const lbMax = maxR('LB');

  const WB_H = 520;
  const LB_H = 200;

  const wbCols = [];
  for (let r = 1; r <= wbMax; r++) {
    const t = r === wbMax ? 'Finale W' : r === wbMax - 1 ? 'Demies' : `Tour ${r}`;
    wbCols.push(column(t, byBR('WB', r), names, seeds, WB_H));
  }
  // Grande finale collée à la suite du bracket gagnant.
  const gf = byBR('GF', 1);
  if (gf.length) wbCols.push(column('Grande finale', gf, names, seeds, WB_H));

  const lbCols = [];
  for (let r = 1; r <= lbMax; r++) {
    const t = r === lbMax ? 'Finale L' : `Tour ${r}`;
    lbCols.push(column(t, byBR('LB', r), names, seeds, LB_H));
  }

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: 36,
        fontFamily: 'Geist, sans-serif',
      },
      children: [
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', marginBottom: 20 }, children: [
          { type: 'div', props: { style: { display: 'flex', color: C.title, fontSize: 30, fontWeight: 800 }, children: title } },
          { type: 'div', props: { style: { display: 'flex', color: C.mute, fontSize: 15, marginTop: 4 }, children: 'Double élimination · 2 défaites = éliminé / 2 losses = out' } },
        ] } },
        sectionLabel('Bracket gagnant · Winners', C.text),
        { type: 'div', props: { style: { display: 'flex' }, children: wbCols } },
        sectionLabel('Bracket des perdants · Losers', C.acc),
        { type: 'div', props: { style: { display: 'flex' }, children: lbCols } },
      ],
    },
  };

  return new ImageResponse(element as unknown as React.ReactElement, { width: 1260, height: 960 });
}
