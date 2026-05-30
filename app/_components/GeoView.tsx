import { Trophy } from 'lucide-react';
import * as se from '@/lib/formats/single-elimination';
import type { GeoState } from '@/lib/runtime/runner';
import { resetTournament, submitSeResult } from '../_lib/actions';
import { discordBlocks } from '../_lib/discord-views';
import DiscordPanel from './DiscordPanel';
import SoloRoster from './SoloRoster';
import ConfirmDialog from './ConfirmDialog';
import type { TournamentWithRoster } from '../_lib/repo';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export default function GeoView({ t, state }: { t: TournamentWithRoster; state: GeoState | null }) {
  if (!state) return <SoloRoster t={t} startLabel="Démarrer l'élimination simple" />;

  const s = state.se;
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const slot = (x: se.SESlot) =>
    x.kind === 'player' ? (names.get(x.id) ?? x.id) : x.kind === 'bye' ? 'bye' : 'à venir';
  const playable = se.playableMatches(s);
  const champ = se.champion(s);
  const board = se.standings(s);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Élimination simple</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {champ && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-lg font-bold text-amber-400">
              <Trophy className="size-5" /> Champion : {names.get(champ) ?? champ}
            </div>
          )}
          {playable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{champ ? 'Tournoi terminé.' : 'Aucun match jouable.'}</p>
          ) : (
            playable.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0">
                {m.bracket === 'third' && <Badge variant="outline" className="text-muted-foreground">petite finale</Badge>}
                <span className="min-w-[150px] font-medium">{slot(m.a)}</span>
                <span className="text-sm text-muted-foreground">vs</span>
                <span className="min-w-[150px] font-medium">{slot(m.b)}</span>
                <form action={submitSeResult.bind(null, t.id, m.id)} className="flex items-center gap-1.5">
                  <Input type="number" name="a" min={0} required aria-label="Score A" className="h-9 w-16" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="number" name="b" min={0} required aria-label="Score B" className="h-9 w-16" />
                  <Button type="submit" size="sm" variant="secondary">Enregistrer</Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classement</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-10">#</TableHead><TableHead>Joueur</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {board.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DiscordPanel blocks={discordBlocks(state)} />

      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-base text-muted-foreground">Zone dangereuse</CardTitle></CardHeader>
        <CardContent>
          <ConfirmDialog
            action={resetTournament.bind(null, t.id)}
            title="Réinitialiser le tournoi ?"
            description="L'état du moteur sera effacé. Le roster des joueurs est conservé."
            confirmLabel="Réinitialiser"
            triggerLabel="Réinitialiser le tournoi"
          />
        </CardContent>
      </Card>
    </div>
  );
}
