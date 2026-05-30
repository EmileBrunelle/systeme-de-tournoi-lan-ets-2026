import { describe, it, expect } from 'vitest';
import { fixMojibake } from './mojibake';

describe('fixMojibake', () => {
  it('repare le symbole (R) mal decode (C2 AE relu en Latin-1)', () => {
    // "Mac" + U+00C2 + U+00AE  ->  "Mac" + U+00AE
    const broken = 'Garnis Comme MacÂ®';
    expect(fixMojibake(broken)).toBe('Garnis Comme Mac®');
  });

  it('repare un e accent aigu mal decode (C3 A9)', () => {
    expect(fixMojibake('CafÃ©')).toBe('Café'); // "CafÃ©" -> "Café"
  });

  it('laisse intact un texte ASCII', () => {
    expect(fixMojibake('Pandas Solaris')).toBe('Pandas Solaris');
  });

  it('laisse intact un texte deja correctement accentue', () => {
    // "Équipe" : É (U+00C9) n'est PAS suivi d'un octet de continuation -> ignore.
    expect(fixMojibake('Équipe')).toBe('Équipe');
    expect(fixMojibake('Crème')).toBe('Crème');
  });

  it('laisse intact si le re-decodage donnerait de l UTF-8 invalide', () => {
    // Â seul (sans octet de continuation valide) ne matche pas la signature.
    expect(fixMojibake('AÂ B')).toBe('AÂ B');
  });

  it('ne touche pas aux caracteres hors plage Latin-1 (emoji, CJK)', () => {
    expect(fixMojibake('Team \u{1f600}')).toBe('Team \u{1f600}');
  });
});
