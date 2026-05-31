// Image PNG du bracket playoff, générée à la volée depuis l'état live.
// À ouvrir/enregistrer puis glisser dans Discord. Se met à jour à chaque appel.

import { ensureValorantTournament, loadState } from '../_lib/repo';
import { bracketImageResponse } from '../_lib/bracket-image';

export const runtime = 'nodejs'; // Prisma → pas edge
export const dynamic = 'force-dynamic';

export async function GET() {
  const t = await ensureValorantTournament();
  const state = loadState(t);
  if (!state || state.phase === 'swiss' || !state.playoff) {
    return new Response('Playoff non démarré.', { status: 404 });
  }
  return bracketImageResponse(state.playoff, t.name);
}
