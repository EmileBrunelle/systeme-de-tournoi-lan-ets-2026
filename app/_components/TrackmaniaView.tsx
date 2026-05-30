import { Trophy, Play } from 'lucide-react';
import * as ta from '@/lib/formats/time-attack';
import * as cup from '@/lib/formats/cup';
import type { TrackmaniaState } from '@/lib/runtime/runner';
import { resetTournament, startCup, submitRace, submitTime } from '../_lib/actions';
import { msToTime } from '../_lib/format';
import SoloRoster from './SoloRoster';
import ConfirmDialog from './ConfirmDialog';
import type { TournamentWithRoster } from '../_lib/repo';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export default function TrackmaniaView({
  t,
  state,
}: {
  t: TournamentWithRoster;
  state: TrackmaniaState | null;
}) {
  if (!state) return <SoloRoster t={t} startLabel="Démarrer la Time Attack" />;
  return (
    <div className="space-y-6">
      {state.phase === 'time-attack' ? (
        <TimeAttackSection t={t} state={state} />
      ) : (
        <CupSection t={t} state={state} />
      )}
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

function TimeAttackSection({ t, state }: { t: TournamentWithRoster; state: TrackmaniaState }) {
  const s = state.ta;
  const board = ta.standings(s);
  const complete = ta.isComplete(s);
  const names = new Map(s.participants.map((p) => [p.id, p.name]));

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Time Attack (qualification)</CardTitle>
          <form action={startCup.bind(null, t.id)}>
            <Button type="submit" disabled={!complete}><Play className="size-4" /> Démarrer la cup</Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="mb-2 text-sm text-muted-foreground">
            Saisir le meilleur temps : <code className="rounded bg-muted px-1 py-0.5">1:23.456</code> ou{' '}
            <code className="rounded bg-muted px-1 py-0.5">83.4</code> (secondes).
          </p>
          {s.participants.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0">
              <span className="min-w-[150px] font-medium">{names.get(p.id)}</span>
              <Badge variant="secondary" className="tabular-nums">{msToTime(s.bestMs[p.id])}</Badge>
              <form action={submitTime.bind(null, t.id, p.id)} className="flex items-center gap-1.5">
                <Input name="time" placeholder="m:ss.mmm" aria-label="Temps" required className="h-9 w-32" />
                <Button type="submit" size="sm" variant="secondary">Enregistrer</Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classement Time Attack</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-10">#</TableHead><TableHead>Joueur</TableHead><TableHead>Meilleur temps</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {board.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="tabular-nums">{msToTime(r.bestMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function CupSection({ t, state }: { t: TournamentWithRoster; state: TrackmaniaState }) {
  const s = state.cup!;
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const board = cup.standings(s);
  const champ = cup.champion(s);
  const nextRace = s.races.find((r) => r.order === null);

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Cup</CardTitle></CardHeader>
        <CardContent>
          {champ && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-lg font-bold text-amber-400">
              <Trophy className="size-5" /> Champion : {names.get(champ) ?? champ}
            </div>
          )}
          {nextRace ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Course {nextRace.round}
                {nextRace.isFinal && ` (finale ×${s.finalMultiplier})`} — ordre d&apos;arrivée
              </h3>
              <form action={submitRace.bind(null, t.id, nextRace.round, s.participants.length)} className="space-y-2">
                {s.participants.map((_, pos) => (
                  <div key={pos} className="flex items-center gap-3">
                    <span className="w-8 text-sm text-muted-foreground">{pos + 1}.</span>
                    <Select name={`pos${pos + 1}`} defaultValue={s.participants[pos].id}>
                      <SelectTrigger className="h-9 w-56" aria-label={`Position ${pos + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {s.participants.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <Button type="submit" className="mt-2">Enregistrer la course</Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Toutes les courses sont jouées.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classement cup</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-10">#</TableHead><TableHead>Joueur</TableHead><TableHead>Points</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {board.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="tabular-nums">{cup.totalPoints(s, r.participantId)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
