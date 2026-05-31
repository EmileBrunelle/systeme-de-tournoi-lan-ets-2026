'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Rafraîchit les données serveur à intervalle régulier (écran de salle live),
 *  sans rechargement complet ni flash. */
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
