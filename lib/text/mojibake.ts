// lib/text/mojibake.ts
// Repare le mojibake le plus courant : du texte UTF-8 qui a ete relu comme du
// Latin-1. Ex. le symbole (R) dont les octets UTF-8 C2 AE sont mal decodes en
// deux caracteres, ou "e accent aigu" (C3 A9) qui devient deux caracteres.
// Pur et testable. N'altere PAS un texte deja correct (detection prudente).

// Prefixe mojibake typique (U+00C2, U+00C3, U+00E2) suivi d'un octet de
// continuation UTF-8 (U+0080 a U+00BF).
const MOJIBAKE_SIGNATURE = /[\u00c2\u00c3\u00e2][\u0080-\u00bf]/;

/**
 * Si `s` presente la signature d'un UTF-8 relu en Latin-1, le re-decode
 * correctement ; sinon le renvoie inchange. En cas de doute (sequence non
 * valide en UTF-8), renvoie l'original : jamais de perte de donnees.
 */
export function fixMojibake(s: string): string {
  if (!MOJIBAKE_SIGNATURE.test(s)) return s;
  // Tous les caracteres doivent tenir sur un octet (plage Latin-1) pour pouvoir
  // les reinterpreter comme des octets bruts.
  if ([...s].some((c) => c.charCodeAt(0) > 0xff)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s; // pas de l'UTF-8 valide : on garde tel quel
  }
}
