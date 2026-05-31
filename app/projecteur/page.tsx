import Link from 'next/link';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import { ensureValorantTournament, loadState } from '../_lib/repo';
import LiveBracketImage from '../_components/LiveBracketImage';
import AutoRefresh from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

interface Row {
  rank: number;
  name: string;
  detail?: string;
}

function swissRows(state: NonNullable<ReturnType<typeof loadState>>): Row[] {
  return swiss.standings(state.swiss).map((r) => ({ rank: r.rank, name: r.name, detail: `${r.wins}-${r.losses}` }));
}

export default async function ProjectorPage() {
  const t = await ensureValorantTournament();
  const state = loadState(t);
  if (!state) {
    return (
      <main data-game={t.game} className="min-h-screen p-12">
        <h1 className="text-5xl font-bold tracking-tight">{t.name}</h1>
        <p className="mt-4 text-2xl text-muted-foreground">Tournoi non démarré.</p>
        <Link href="/" className="mt-6 inline-block text-lg text-primary">← Retour</Link>
      </main>
    );
  }

  const isPlayoff = state.phase !== 'swiss' && !!state.playoff;
  const champId = isPlayoff ? de.champion(state.playoff!) : null;
  const champion = champId ? (state.playoff!.participants.find((p) => p.id === champId)?.name ?? champId) : undefined;

  return (
    <main data-game={t.game} className="min-h-screen px-12 py-10">
      <AutoRefresh seconds={20} />
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-6xl font-bold tracking-tight">{t.name}</h1>
          <p className="mt-2 text-3xl text-muted-foreground">{isPlayoff ? 'Playoff' : 'Phase suisse'}</p>
        </div>
        <Link href="/" className="text-base text-muted-foreground hover:text-foreground">← Gestion</Link>
      </div>

      {champion && (
        <div className="mt-8 flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-8 py-6 text-4xl font-bold text-amber-400">
          🏆 {champion}
        </div>
      )}

      {isPlayoff ? (
        <LiveBracketImage intervalMs={15000} className="mx-auto mt-8 max-h-[78vh] w-auto max-w-full rounded-xl border border-border" />
      ) : (
        <table className="mt-8 w-full text-3xl">
          <thead>
            <tr className="border-b border-border text-left text-xl uppercase tracking-wide text-muted-foreground">
              <th className="w-20 py-4 font-semibold">#</th>
              <th className="py-4 font-semibold">Participant</th>
              <th className="py-4 text-right font-semibold" />
            </tr>
          </thead>
          <tbody>
            {swissRows(state).map((r) => (
              <tr key={`${r.rank}-${r.name}`} className="border-b border-border/60">
                <td className="py-5 tabular-nums text-muted-foreground">{r.rank}</td>
                <td className="py-5 font-semibold">{r.name}</td>
                <td className="py-5 text-right tabular-nums text-muted-foreground">{r.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
