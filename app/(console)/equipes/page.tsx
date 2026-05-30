import { notFound } from 'next/navigation';
import { ensureValorantTournament, getTournament } from '@/app/_lib/repo';
import PageHeader from '@/app/_components/PageHeader';
import TeamManager from '@/app/_components/TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const base = await ensureValorantTournament();
  const t = await getTournament(base.id);
  if (!t) notFound();
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
