import { notFound } from 'next/navigation';
import { getTournament, loadState } from '@/app/_lib/repo';
import { phaseLabel } from '@/app/_lib/phase';
import PageHeader from '@/app/_components/PageHeader';
import ValorantView from '@/app/_components/ValorantView';
import GeoView from '@/app/_components/GeoView';
import TrackmaniaView from '@/app/_components/TrackmaniaView';

export const dynamic = 'force-dynamic';

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournament(id);
  if (!t) notFound();

  const state = loadState(t);

  return (
    <div className="space-y-6">
      <PageHeader title={t.name} subtitle={phaseLabel(state)} />
      {t.game === 'valorant' && <ValorantView t={t} state={state?.game === 'valorant' ? state : null} />}
      {t.game === 'geoguessr' && <GeoView t={t} state={state?.game === 'geoguessr' ? state : null} />}
      {t.game === 'trackmania' && <TrackmaniaView t={t} state={state?.game === 'trackmania' ? state : null} />}
    </div>
  );
}
