import { notFound } from 'next/navigation';
import { ensureValorantTournament, getTournament, loadState } from '@/app/_lib/repo';
import { phaseLabel } from '@/app/_lib/phase';
import PageHeader from '@/app/_components/PageHeader';
import ValorantView from '@/app/_components/ValorantView';

export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const base = await ensureValorantTournament();
  const t = await getTournament(base.id);
  if (!t) notFound();

  const state = loadState(t);

  return (
    <div className="space-y-6">
      <PageHeader title={t.name} subtitle={phaseLabel(state)} />
      <ValorantView t={t} state={state} />
    </div>
  );
}
