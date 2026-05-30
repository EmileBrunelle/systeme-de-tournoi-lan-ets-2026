import { notFound } from 'next/navigation';
import { getTournament } from '@/app/_lib/repo';
import PageHeader from '@/app/_components/PageHeader';
import TeamManager from '@/app/_components/TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournament(id);
  if (!t || t.game !== 'valorant') notFound();
  const started = t.stateJson !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des équipes"
        subtitle={started ? 'Tournoi démarré — structure verrouillée' : 'Configurez les équipes avant de démarrer'}
      />
      <TeamManager t={t} locked={started} />
    </div>
  );
}
