'use client';

import { useEffect, useState } from 'react';

/**
 * Image du bracket affichée en direct : re-télécharge `/bracket.webp` toutes les
 * `intervalMs` (la route régénère depuis l'état live → toujours à jour), sans
 * recharger la page. Glisse-la dans Discord, ou clic-droit → Copier l'image.
 */
export default function LiveBracketImage({ intervalMs = 15000, className }: { intervalMs?: number; className?: string }) {
  // `0` au premier rendu (serveur + hydratation identiques) puis horodatage côté
  // client pour forcer le re-fetch — évite tout écart d'hydratation.
  const [bust, setBust] = useState(0);
  useEffect(() => {
    setBust(Date.now());
    const id = setInterval(() => setBust(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/bracket.webp?t=${bust}`} alt="Bracket du playoff" className={className} />;
}
