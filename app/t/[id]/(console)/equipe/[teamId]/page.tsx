import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { prisma } from '@/app/_lib/db';
import { addMember, deleteMember, submitRenameTeam, updateMember } from '@/app/_lib/actions';
import PageHeader from '@/app/_components/PageHeader';
import ConfirmDialog from '@/app/_components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/_components/ui/card';
import { Input } from '@/app/_components/ui/input';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/_components/ui/select';

export const dynamic = 'force-dynamic';

const RANKS = [
  'Iron 1', 'Iron 2', 'Iron 3', 'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3', 'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3', 'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

function RankSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <Select name="rank" defaultValue={defaultValue}>
      <SelectTrigger className="h-9 w-[140px]" aria-label="Rang">
        <SelectValue placeholder="Rang" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— rang —</SelectItem>
        {RANKS.map((r) => (
          <SelectItem key={r} value={r}>{r}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoleSelect({ defaultValue }: { defaultValue: 'starter' | 'sub' }) {
  return (
    <Select name="role" defaultValue={defaultValue}>
      <SelectTrigger className="h-9 w-[130px]" aria-label="Rôle">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="starter">Titulaire</SelectItem>
        <SelectItem value="sub">Remplaçant</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id, teamId } = await params;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: { orderBy: [{ isSub: 'asc' }, { username: 'asc' }] } },
  });
  if (!team || team.tournamentId !== id) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/t/${id}/equipes`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Gestion des équipes
      </Link>

      <PageHeader
        title={`Roster — ${team.name}`}
        subtitle={`Rang moyen (titulaires) : ${team.avgRank !== null ? team.avgRank.toFixed(1) : '—'}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Nom de l&apos;équipe</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitRenameTeam.bind(null, id, team.id)} className="flex items-center gap-2">
            <Input name="name" defaultValue={team.name} className="max-w-sm" aria-label="Nom de l'équipe" />
            <Button type="submit" variant="secondary">Renommer</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres ({team.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {team.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun membre.</p>
          ) : (
            team.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                <form
                  action={updateMember.bind(null, id, team.id, m.id)}
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  {m.isSub && <Badge variant="outline" className="text-muted-foreground">R</Badge>}
                  <Input name="username" defaultValue={m.username} aria-label="Pseudo" className="h-9 w-[150px]" required />
                  <Input name="identifier" defaultValue={m.identifier ?? ''} placeholder="Riot ID" aria-label="Identifiant" className="h-9 w-[150px]" />
                  <RankSelect defaultValue={m.rank ?? 'none'} />
                  <Input name="seat" defaultValue={m.seat ?? ''} placeholder="Siège" aria-label="Siège" className="h-9 w-[90px]" />
                  <input type="hidden" name="email" defaultValue={m.email ?? ''} />
                  <RoleSelect defaultValue={m.isSub ? 'sub' : 'starter'} />
                  <Button type="submit" size="sm" variant="secondary">
                    <Check className="size-4" /> Enregistrer
                  </Button>
                </form>
                <ConfirmDialog
                  action={deleteMember.bind(null, id, team.id, m.id)}
                  title={`Retirer ${m.username} ?`}
                  description="Ce membre sera retiré de l'équipe."
                  confirmLabel="Retirer"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addMember.bind(null, id, team.id)} className="flex flex-wrap items-center gap-2">
            <Input name="username" placeholder="Pseudo" aria-label="Pseudo" className="h-9 w-[150px]" required />
            <Input name="identifier" placeholder="Riot ID" aria-label="Identifiant" className="h-9 w-[150px]" />
            <RankSelect defaultValue="none" />
            <Input name="seat" placeholder="Siège" aria-label="Siège" className="h-9 w-[90px]" />
            <Input name="email" placeholder="Courriel" aria-label="Courriel" className="h-9 w-[170px]" />
            <RoleSelect defaultValue="starter" />
            <Button type="submit">
              <Plus className="size-4" /> Ajouter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
