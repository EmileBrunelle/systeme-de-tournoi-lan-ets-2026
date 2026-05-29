// lib/discord/split.ts

/** Limite de caractères d'un message Discord. */
export const DISCORD_LIMIT = 2000;

/**
 * Découpe `message` en morceaux d'au plus `limit` caractères, sans couper une
 * ligne en deux. Si une ligne seule dépasse la limite, elle est coupée
 * brutalement (cas rare).
 */
export function splitForDiscord(message: string, limit: number = DISCORD_LIMIT): string[] {
  if (message.length <= limit) return [message];

  const chunks: string[] = [];
  let current = '';

  for (const line of message.split('\n')) {
    if (line.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
