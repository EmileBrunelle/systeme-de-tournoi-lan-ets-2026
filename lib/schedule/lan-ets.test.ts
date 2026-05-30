// lib/schedule/lan-ets.test.ts
import { describe, it, expect } from 'vitest';
import {
  lanEtsValorantSchedule,
  saturdayEndTime,
  sleepGapMinutes,
} from './lan-ets';

describe('lanEtsValorantSchedule', () => {
  it('démarre samedi à 10:00 par défaut', () => {
    const s = lanEtsValorantSchedule();
    expect(s[0]).toMatchObject({ day: 'samedi', kind: 'match', start: '10:00' });
  });

  it('place les 5 rondes suisses puis 5 vagues de playoff samedi (sans la finale)', () => {
    const s = lanEtsValorantSchedule();
    const matchesSamedi = s.filter((x) => x.day === 'samedi' && x.kind === 'match');
    expect(matchesSamedi.map((x) => x.matches)).toEqual([8, 8, 8, 6, 3, 4, 4, 3, 1, 1]);
  });

  it('insère le dîner et le souper samedi', () => {
    const s = lanEtsValorantSchedule();
    const meals = s.filter((x) => x.kind === 'meal').map((x) => x.label);
    expect(meals).toEqual(['Dîner', 'Souper']);
  });

  it('signale le match diffusé à midi (ronde en cours à 12:00)', () => {
    const s = lanEtsValorantSchedule();
    const streamedSamedi = s.filter((x) => x.stream && x.day === 'samedi');
    expect(streamedSamedi).toHaveLength(1);
    // avec un départ à 10:00, la ronde 2 court 11:10–12:20, donc elle englobe midi
    expect(streamedSamedi[0].start <= '12:00' && streamedSamedi[0].end > '12:00').toBe(true);
  });

  it('termine samedi à 23:40 avec les défauts (départ 10:00, lousse 15)', () => {
    const s = lanEtsValorantSchedule();
    expect(saturdayEndTime(s)).toBe('23:40');
  });

  it('place la grande finale dimanche à 08:00 en BO3', () => {
    const s = lanEtsValorantSchedule();
    const final = s.find((x) => x.day === 'dimanche');
    expect(final).toMatchObject({ day: 'dimanche', start: '08:00', label: expect.stringContaining('BO3') });
  });

  it('laisse 8h20 de sommeil avant la finale avec les défauts', () => {
    const s = lanEtsValorantSchedule();
    expect(sleepGapMinutes(s)).toBe(500); // 8h20
  });

  it('plus de lousse repousse la fin de samedi', () => {
    const base = saturdayEndTime(lanEtsValorantSchedule({ slackMin: 10 }));
    const more = saturdayEndTime(lanEtsValorantSchedule({ slackMin: 20 }));
    expect(more > base).toBe(true);
  });

  it('un départ plus tôt avance toute la journée', () => {
    const s = lanEtsValorantSchedule({ saturdayStart: '09:00' });
    expect(s[0].start).toBe('09:00');
  });
});
