import Link from 'next/link';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import { ensureValorantTournament, loadState } from '../_lib/repo';

export const dynamic = 'force-dynamic';

interface Row {
  rank: number;
  name: string;
  detail?: string;
}

function rowsFor(state: NonNullable<ReturnType<typeof loadState>>): { subtitle: string; champion?: string; rows: Row[] } {
  if (state.phase === 'swiss' || !state.playoff) {
    return {
      subtitle: 'Phase suisse',
      rows: swiss.standings(state.swiss).map((r) => ({
        rank: r.rank,
        name: r.name,
        detail: `${r.wins}-${r.losses}`,
      })),
    };
  }
  const board = de.standings(state.playoff);
  const champ = de.champion(state.playoff);
  const names = new Map(state.playoff.participants.map((p) => [p.id, p.name]));
  return {
    subtitle: 'Playoff',
    champion: champ ? (names.get(champ) ?? undefined) : undefined,
    rows: board.map((r) => ({ rank: r.rank, name: r.name })),
  };
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

  const { subtitle, champion, rows } = rowsFor(state);

  return (
    <main data-game={t.game} className="min-h-screen px-12 py-10">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-6xl font-bold tracking-tight">{t.name}</h1>
          <p className="mt-2 text-3xl text-muted-foreground">{subtitle}</p>
        </div>
        <Link href="/" className="text-base text-muted-foreground hover:text-foreground">← Gestion</Link>
      </div>

      {champion && (
        <div className="mt-8 flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-8 py-6 text-4xl font-bold text-amber-400">
          🏆 {champion}
        </div>
      )}

      <table className="mt-8 w-full text-3xl">
        <thead>
          <tr className="border-b border-border text-left text-xl uppercase tracking-wide text-muted-foreground">
            <th className="w-20 py-4 font-semibold">#</th>
            <th className="py-4 font-semibold">Participant</th>
            <th className="py-4 text-right font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rank}-${r.name}`} className="border-b border-border/60">
              <td className="py-5 tabular-nums text-muted-foreground">{r.rank}</td>
              <td className="py-5 font-semibold">{r.name}</td>
              <td className="py-5 text-right tabular-nums text-muted-foreground">{r.detail ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
