import Link from 'next/link';
import { Gamepad2, ChevronRight } from 'lucide-react';
import { ensureTournaments, loadState } from './_lib/repo';
import { phaseLabel } from './_lib/phase';
import { Card, CardContent } from './_components/ui/card';
import { Badge } from './_components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournaments = await ensureTournaments();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Système de tournoi</h1>
        <p className="mt-2 text-muted-foreground">LAN ÉTS 2026 — outil d&apos;organisation. Données joueurs locales uniquement.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tournaments.map((t) => {
          const phase = phaseLabel(loadState(t));
          return (
            <Link key={t.id} href={`/t/${t.id}`} data-game={t.game} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Gamepad2 className="size-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{t.name}</div>
                    <Badge variant="secondary" className="mt-1.5 font-normal">{phase}</Badge>
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground group-hover:text-primary">
                    Ouvrir <ChevronRight className="size-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
