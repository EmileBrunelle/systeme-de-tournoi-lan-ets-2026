import Link from 'next/link';
import { Check, ChevronRight, Lock, Plus, UserRound } from 'lucide-react';
import {
  cycleTeamPresence,
  deleteTeam,
  submitAddTeam,
  submitRenameTeam,
} from '../_lib/actions';
import type { TournamentWithRoster } from '../_lib/repo';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import ConfirmDialog from './ConfirmDialog';

function presenceLabel(p: string): string {
  return p === 'confirmed' ? 'Confirmée' : p === 'withdrawn' ? 'Retirée' : 'À confirmer';
}

function presenceClasses(p: string): string {
  if (p === 'confirmed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20';
  if (p === 'withdrawn') return 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20';
}

/**
 * Éditeur complet des équipes Valorant. `locked` (tournoi démarré) désactive
 * les modifications structurelles (ajout/suppression) ; renommer et présence
 * restent permis.
 */
export default function TeamManager({ t, locked }: { t: TournamentWithRoster; locked: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Équipes ({t.teams.length})</CardTitle>
        {locked && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Lock className="size-3" /> Structure verrouillée
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {t.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune équipe. Lancez <code className="rounded bg-muted px-1 py-0.5">npm run import</code> pour charger le
            roster, ou ajoutez-en une ci-dessous.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Équipe</TableHead>
                <TableHead>Roster</TableHead>
                <TableHead className="text-right">Rang&nbsp;moy.</TableHead>
                <TableHead>Présence</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.teams.map((team, i) => {
                const starters = team.members.filter((m) => !m.isSub).length;
                const subs = team.members.length - starters;
                return (
                  <TableRow key={team.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <form action={submitRenameTeam.bind(null, t.id, team.id)} className="flex items-center gap-1.5">
                        <Input
                          name="name"
                          defaultValue={team.name}
                          aria-label="Nom de l'équipe"
                          className="h-8 min-w-[180px]"
                        />
                        <Button type="submit" size="icon" variant="ghost" className="size-8 shrink-0" title="Renommer">
                          <Check className="size-4" />
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/equipe/${team.id}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <UserRound className="size-3.5" />
                        {starters} tit.{subs > 0 ? ` +${subs}` : ''}
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {team.avgRank !== null ? team.avgRank.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell>
                      <form action={cycleTeamPresence.bind(null, t.id, team.id)}>
                        <button
                          type="submit"
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${presenceClasses(team.presence)}`}
                          title="Cliquer pour changer le statut"
                        >
                          {presenceLabel(team.presence)}
                        </button>
                      </form>
                    </TableCell>
                    <TableCell>
                      {!locked && (
                        <ConfirmDialog
                          action={deleteTeam.bind(null, t.id, team.id)}
                          title={`Supprimer « ${team.name} » ?`}
                          description="L'équipe et tous ses membres seront définitivement supprimés."
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {!locked && (
        <CardFooter>
          <form action={submitAddTeam.bind(null, t.id)} className="flex w-full items-center gap-2">
            <Input name="name" placeholder="Nom de la nouvelle équipe" aria-label="Nouvelle équipe" required className="max-w-xs" />
            <Button type="submit" variant="secondary">
              <Plus className="size-4" /> Ajouter une équipe
            </Button>
          </form>
        </CardFooter>
      )}
    </Card>
  );
}
