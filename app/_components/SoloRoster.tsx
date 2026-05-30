import { Play, Plus } from 'lucide-react';
import {
  cyclePlayerPresence,
  removePlayer,
  submitAddPlayer,
  submitStart,
} from '../_lib/actions';
import type { TournamentWithRoster } from '../_lib/repo';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import ConfirmDialog from './ConfirmDialog';

function presenceLabel(p: string): string {
  return p === 'confirmed' ? 'Confirmé' : p === 'withdrawn' ? 'Retiré' : 'À confirmer';
}
function presenceClasses(p: string): string {
  if (p === 'confirmed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20';
  if (p === 'withdrawn') return 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20';
}

/** Gestion des joueurs solo (ajout, présence, retrait) + bouton de démarrage. */
export default function SoloRoster({ t, startLabel }: { t: TournamentWithRoster; startLabel: string }) {
  const entrants = t.players.filter((p) => p.presence !== 'withdrawn');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Joueurs ({t.players.length})</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <form action={submitAddPlayer.bind(null, t.id)} className="flex items-center gap-2">
          <Input name="name" placeholder="Nom du joueur" aria-label="Nom du joueur" required className="max-w-xs" />
          <Button type="submit" variant="secondary"><Plus className="size-4" /> Ajouter</Button>
        </form>

        {t.players.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Joueur</TableHead>
                <TableHead>Présence</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.players.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <form action={cyclePlayerPresence.bind(null, t.id, p.id)}>
                      <button
                        type="submit"
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${presenceClasses(p.presence)}`}
                        title="Cliquer pour changer le statut"
                      >
                        {presenceLabel(p.presence)}
                      </button>
                    </form>
                  </TableCell>
                  <TableCell>
                    <ConfirmDialog
                      action={removePlayer.bind(null, t.id, p.id)}
                      title={`Retirer ${p.name} ?`}
                      description="Ce joueur sera retiré du tournoi."
                      confirmLabel="Retirer"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CardFooter>
        <form action={submitStart.bind(null, t.id)}>
          <Button type="submit" disabled={entrants.length < 2}>
            <Play className="size-4" /> {startLabel} ({entrants.length} joueurs)
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
