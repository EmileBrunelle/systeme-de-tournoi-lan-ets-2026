// Utilitaires de formatage partagés (pas d'effet de bord, importables côté
// serveur comme client).

/** Parse "1:23.456", "83.4" ou "83400" en millisecondes, ou null si invalide. */
export function parseTimeToMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const sec = Number(m[2]);
  const ms = Math.round((min * 60 + sec) * 1000);
  return ms > 0 ? ms : null;
}

/** Formate des millisecondes en "m:ss.mmm" (ou "ss.mmm" si < 1 min). */
export function msToTime(ms: number | null): string {
  if (ms === null) return '—';
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  const secStr = sec.toFixed(3).padStart(6, '0');
  return min > 0 ? `${min}:${secStr}` : secStr;
}
