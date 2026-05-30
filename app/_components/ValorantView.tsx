import { Trophy, Play, Flag } from 'lucide-react';
import * as swiss from '@/lib/formats/swiss';
import * as de from '@/lib/formats/double-elimination';
import { lanEtsValorantSchedule, saturdayEndTime, sleepGapMinutes } from '@/lib/schedule/lan-ets';
import { valorantVitals } from '@/lib/valorant/dashboard';
import { suggestBroadcast } from '@/lib/valorant/broadcast';
import type { ValorantState } from '@/lib/runtime/runner';
import {
  concedePlayoffMatch,
  concedeSwissMatch,
  generateSwissRound,
  resetTournament,
  startPlayoff,
  submitPlayoffResult,
  submitStart,
  submitSwissResult,
  withdrawTeam,
} from '../_lib/actions';
import { discordBlocks } from '../_lib/discord-views';
import DiscordPanel from './DiscordPanel';
import StatusTiles from './StatusTiles';
import TeamManager from './TeamManager';
import ConfirmDialog from './ConfirmDialog';
import ForfeitDialog from './ForfeitDialog';
import type { TournamentWithRoster } from '../_lib/repo';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export default function ValorantView({
  t,
  state,
}: {
  t: TournamentWithRoster;
  state: ValorantState | null;
}) {
  if (!state) return <Setup t={t} />;

  const vitals = valorantVitals(state);
  // Heure réelle (fuseau de l'ÉTS) pour ancrer l'horaire estimé et le récap.
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const rankById = Object.fromEntries(t.teams.map((team) => [team.id, team.avgRank]));

  return (
    <div className="space-y-6">
      {/* Étage 1 — tuiles glançables */}
      <StatusTiles tiles={vitals.tiles} />

      {/* Étage 2 — zone d'action */}
      {state.phase === 'swiss' ? (
        <SwissDashboard t={t} state={state} />
      ) : (
        <PlayoffDashboard t={t} state={state} />
      )}

      {/* Sous le pli — consulté moins souvent */}
      <LanEtsSchedule />
      <DiscordPanel blocks={discordBlocks(state, { now, rankById })} />
      <DangerZone id={t.id} />
    </div>
  );
}

// ─── Setup (roster + démarrage) ──────────────────────────────────────────────

function Setup({ t }: { t: TournamentWithRoster }) {
  const entrants = t.teams.filter((x) => x.presence !== 'withdrawn');
  return (
    <div className="space-y-6">
      <TeamManager t={t} locked={false} />
      <Card>
        <CardHeader>
          <CardTitle>Démarrage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Le seeding suit la force des équipes (rangMoyen) : la ronde 1 oppose le groupe fort au
            groupe faible. Les équipes « retirées » sont exclues. Une fois démarré, la structure des
            équipes est verrouillée.
          </p>
          <form action={submitStart.bind(null, t.id)} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Qualifiés au playoff :
              <Input type="number" name="playoffSize" defaultValue={8} min={2} max={entrants.length || 8} className="h-9 w-20" />
            </label>
            <Button type="submit" disabled={entrants.length < 2}>
              <Play className="size-4" /> Démarrer la phase suisse ({entrants.length} équipes)
            </Button>
          </form>
        </CardContent>
      </Card>
      <LanEtsSchedule />
    </div>
  );
}

// ─── Phase suisse : matchs (action) + classement, côte à côte ─────────────────

function SwissDashboard({ t, state }: { t: TournamentWithRoster; state: ValorantState }) {
  const s = state.swiss;
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const nm = (id: string | null) => (id ? (names.get(id) ?? id) : null);
  const round = swiss.currentRound(s);
  const hasUnplayed = s.matches.some((m) => m.away !== null && m.score === null);
  const complete = swiss.isComplete(s);
  const current = s.matches.filter((m) => m.round === round);

  // Match suggéré pour le stream : niveaux proches d'abord, fort calibre ensuite.
  const rankById = Object.fromEntries(t.teams.map((team) => [team.id, team.avgRank]));
  const onAir = suggestBroadcast(s, rankById).best;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Matchs{round > 0 && ` — Ronde ${round}`}</CardTitle>
          {complete ? (
            <form action={startPlayoff.bind(null, t.id)}>
              <Button type="submit">
                <Trophy className="size-4" /> Démarrer le playoff (top {state.playoffSize})
              </Button>
            </form>
          ) : (
            <form action={generateSwissRound.bind(null, t.id)}>
              <Button type="submit" disabled={hasUnplayed}>
                {round === 0 ? 'Générer la ronde 1' : 'Générer la ronde suivante'}
              </Button>
            </form>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          {round === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune ronde générée.</p>
          ) : (
            current.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{nm(m.home)}</span>
                  {m.away !== null && (
                    <>
                      <span className="text-sm text-muted-foreground">vs</span>
                      <span className="font-medium">{nm(m.away)}</span>
                    </>
                  )}
                  {onAir?.matchId === m.id && m.score === null && (
                    <Badge
                      variant="secondary"
                      title="Niveaux proches, fort calibre — bon match pour le stream"
                    >
                      📺 à diffuser
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {m.away === null ? (
                    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">bye — victoire auto</Badge>
                  ) : m.score ? (
                    m.forfeit ? (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">forfait</Badge>
                    ) : (
                      <Badge variant="secondary" className="tabular-nums">{m.score.home}–{m.score.away}</Badge>
                    )
                  ) : (
                    <>
                      <form action={submitSwissResult.bind(null, t.id, m.id)} autoComplete="off" className="flex items-center gap-1.5">
                        <Input type="number" name="home" min={0} required autoComplete="off" defaultValue="" aria-label="Score domicile" className="h-9 w-16" />
                        <span className="text-muted-foreground">–</span>
                        <Input type="number" name="away" min={0} required autoComplete="off" defaultValue="" aria-label="Score visiteur" className="h-9 w-16" />
                        <Button type="submit" size="sm" variant="secondary">Enregistrer</Button>
                      </form>
                      <ForfeitDialog
                        title={`Forfait — ${nm(m.home)} vs ${nm(m.away)}`}
                        options={[
                          { label: `${nm(m.home)} déclare forfait`, action: concedeSwissMatch.bind(null, t.id, m.id, m.home) },
                          { label: `${nm(m.away)} déclare forfait`, action: concedeSwissMatch.bind(null, t.id, m.id, m.away) },
                        ]}
                      />
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <SwissStandings tournamentId={t.id} state={s} />
    </div>
  );
}

function statusBadge(status: string) {
  if (status === 'qualified') return <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">Qualifié</Badge>;
  if (status === 'eliminated') return <Badge className="border-red-500/40 bg-red-500/10 text-red-400">Éliminé</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">En lice</Badge>;
}

function SwissStandings({ tournamentId, state }: { tournamentId: string; state: ValorantState['swiss'] }) {
  const board = swiss.standings(state);
  // Aucun match joué → le classement n'est pas significatif (simple ordre de seed).
  // On le présente alors par ordre alphabétique, sans rang, avec une note.
  const ranked = board.some((r) => r.wins > 0 || r.losses > 0);
  const rows = ranked ? board : [...board].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classement</CardTitle>
      </CardHeader>
      <CardContent>
        {!ranked && (
          <p className="mb-3 text-sm text-muted-foreground">
            Aucun match joué — classement à venir.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead className="text-right">V-D</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.participantId}>
                <TableCell className="text-muted-foreground tabular-nums">{ranked ? r.rank : '—'}</TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{r.name}</span>
                    {r.status !== 'active' && statusBadge(r.status)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <span className="tabular-nums">{r.wins}-{r.losses}</span>
                    {r.status === 'active' && (
                      <ConfirmDialog
                        action={withdrawTeam.bind(null, tournamentId, r.participantId)}
                        title={`Retirer ${r.name} du tournoi ?`}
                        description="L’équipe est éliminée et ne sera plus appariée. Son match en cours, s’il y en a un, est accordé à l’adversaire. Irréversible sans réinitialiser."
                        confirmLabel="Retirer l’équipe"
                        icon={<Flag className="size-4" />}
                        triggerAriaLabel={`Retirer ${r.name} du tournoi`}
                      />
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LanEtsSchedule() {
  const slots = lanEtsValorantSchedule();
  const samedi = slots.filter((s) => s.day === 'samedi');
  const finale = slots.find((s) => s.day === 'dimanche')!;
  const fin = saturdayEndTime(slots);
  const gap = sleepGapMinutes(slots);
  const sommeil = `${Math.floor(gap / 60)}h${String(gap % 60).padStart(2, '0')}`;

  const row = (s: (typeof slots)[number], i: number) => (
    <TableRow key={`${s.day}-${i}`} className={s.kind === 'meal' ? 'text-muted-foreground' : undefined}>
      <TableCell className="tabular-nums">{s.start}</TableCell>
      <TableCell className="tabular-nums">{s.end}</TableCell>
      <TableCell>
        {s.label}
        {s.stream && <Badge variant="secondary" className="ml-2 font-normal">📺 stream</Badge>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{s.matches ?? '—'}</TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horaire LAN ÉTS — Valorant</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Samedi : suisse + playoff en BO1 (départ 10h, lousse 15 min/ronde, dîner & souper).
          Grande finale dimanche 8h sur le stream, en BO3.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Début</TableHead><TableHead>Fin</TableHead>
              <TableHead>Bloc</TableHead><TableHead className="text-right">Matchs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={4} className="font-semibold">Samedi 30 mai — matchs</TableCell>
            </TableRow>
            {samedi.map(row)}
            <TableRow className="bg-muted/40">
              <TableCell colSpan={4} className="font-semibold">Dimanche 31 mai — finale</TableCell>
            </TableRow>
            {row(finale, 0)}
          </TableBody>
        </Table>
        <p className="mt-3 text-sm">
          Fin samedi <span className="font-semibold tabular-nums">{fin}</span> · <span className="font-semibold tabular-nums">{sommeil}</span> de sommeil avant la finale.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Playoff (double-élimination) : matchs jouables + classement ──────────────

const BRACKET_LABEL: Record<string, string> = { WB: 'Winner', LB: 'Loser', GF: 'Grande finale' };

function PlayoffDashboard({ t, state }: { t: TournamentWithRoster; state: ValorantState }) {
  const s = state.playoff!;
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const slot = (x: de.DESlot) =>
    x.kind === 'player' ? (names.get(x.id) ?? x.id) : x.kind === 'bye' ? 'bye' : 'à venir';
  const playable = de.playableMatches(s);
  const champ = de.champion(s);
  const board = de.standings(s);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Matchs jouables — Double élimination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {champ && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-lg font-bold text-amber-400">
              <Trophy className="size-5" /> Champion : {names.get(champ) ?? champ}
            </div>
          )}
          {playable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{champ ? 'Tournoi terminé.' : 'Aucun match jouable pour le moment.'}</p>
          ) : (
            playable.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <Badge variant="outline" className="shrink-0 text-muted-foreground">{BRACKET_LABEL[m.bracket] ?? m.bracket}</Badge>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{slot(m.a)}</span>
                  <span className="text-sm text-muted-foreground">vs</span>
                  <span className="font-medium">{slot(m.b)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={submitPlayoffResult.bind(null, t.id, m.id)} autoComplete="off" className="flex items-center gap-1.5">
                    <Input type="number" name="a" min={0} required autoComplete="off" defaultValue="" aria-label="Score A" className="h-9 w-16" />
                    <span className="text-muted-foreground">–</span>
                    <Input type="number" name="b" min={0} required autoComplete="off" defaultValue="" aria-label="Score B" className="h-9 w-16" />
                    <Button type="submit" size="sm" variant="secondary">Enregistrer</Button>
                  </form>
                  <ForfeitDialog
                    title={`Forfait — ${slot(m.a)} vs ${slot(m.b)}`}
                    options={[
                      { label: `${slot(m.a)} déclare forfait`, action: concedePlayoffMatch.bind(null, t.id, m.id, 'b') },
                      { label: `${slot(m.b)} déclare forfait`, action: concedePlayoffMatch.bind(null, t.id, m.id, 'a') },
                    ]}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classement playoff</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-8">#</TableHead><TableHead>Équipe</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {board.map((r) => (
                <TableRow key={r.participantId}>
                  <TableCell className="text-muted-foreground tabular-nums">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Zone dangereuse ─────────────────────────────────────────────────────────

function DangerZone({ id }: { id: string }) {
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">Zone dangereuse</CardTitle>
      </CardHeader>
      <CardContent>
        <ConfirmDialog
          action={resetTournament.bind(null, id)}
          title="Réinitialiser le tournoi ?"
          description="L'état du moteur (rondes, scores, playoff) sera effacé. Le roster des équipes est conservé."
          confirmLabel="Réinitialiser"
          triggerLabel="Réinitialiser le tournoi"
        />
      </CardContent>
    </Card>
  );
}
