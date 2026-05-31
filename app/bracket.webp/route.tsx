// Image WebP du bracket playoff, régénérée à la volée depuis l'état live.
// WebP (natif Discord) = ~3-4× plus léger que le PNG. Jamais en cache : chaque
// requête reflète l'état courant. Repli PNG si la conversion échoue.

import sharp from 'sharp';
import { ensureValorantTournament, loadState } from '../_lib/repo';
import { bracketImageResponse } from '../_lib/bracket-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CACHE = 'no-store, must-revalidate';

export async function GET() {
  const t = await ensureValorantTournament();
  const state = loadState(t);
  if (!state || state.phase === 'swiss' || !state.playoff) {
    return new Response('Playoff non démarré.', { status: 404 });
  }

  const png = Buffer.from(await bracketImageResponse(state.playoff).arrayBuffer());
  try {
    const webp = await sharp(png).webp({ quality: 88 }).toBuffer();
    return new Response(new Uint8Array(webp), { headers: { 'content-type': 'image/webp', 'cache-control': NO_CACHE } });
  } catch {
    // WebP indisponible → PNG (rendu nativement par Discord aussi).
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': NO_CACHE } });
  }
}
