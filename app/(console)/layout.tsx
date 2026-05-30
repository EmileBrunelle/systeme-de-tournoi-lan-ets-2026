import { ensureValorantTournament, loadState } from '@/app/_lib/repo';
import { phaseLabel } from '@/app/_lib/phase';
import AppSidebar from '@/app/_components/AppSidebar';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const t = await ensureValorantTournament();
  const state = loadState(t);

  return (
    <div data-game={t.game} className="flex min-h-screen">
      <AppSidebar tournamentName={t.name} phase={phaseLabel(state)} started={state !== null} />
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
