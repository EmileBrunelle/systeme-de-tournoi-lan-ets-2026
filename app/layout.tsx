import type { Metadata } from 'next';
import './globals.css';
import { TooltipProvider } from './_components/ui/tooltip';
import { Toaster } from './_components/ui/sonner';

export const metadata: Metadata = {
  title: 'Tournoi Valorant — LAN ÉTS 2026',
  description: 'Console d’organisation du tournoi Valorant (LAN ÉTS 2026).',
};

// Thème sombre fixe (choix produit : « sombre + accent par jeu », pas de toggle).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
