import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from './ui/badge';
import ScoreForm from './ScoreForm';
import ForfeitDialog from './ForfeitDialog';

type BoundAction = (formData: FormData) => void | Promise<void>;

/**
 * État d'un match côté saisie, en union discriminée : chaque variante porte
 * EXACTEMENT ce dont son rendu a besoin (pas de props conditionnelles éparses).
 *   bye      → l'équipe passe sans jouer
 *   forfeit  → match concédé
 *   played   → score joué ; `amend` (optionnel) permet la correction
 *   pending  → à jouer : saisie du score + forfait
 */
export type MatchRowState =
  | { kind: 'bye' }
  | { kind: 'forfeit' }
  | { kind: 'played'; scoreA: number; scoreB: number; amend?: BoundAction }
  | { kind: 'pending'; result: BoundAction; forfeit: { title: string; options: { label: string; action: BoundAction }[] } };

/**
 * Ligne de match partagée par la phase suisse ET le playoff. Les différences
 * (forme du match, noms de champs, forfait par id vs par côté, badges propres à
 * la phase) vivent dans le view-model que chaque dashboard construit ; ici on ne
 * rend que la structure commune. Une amélioration ici profite aux deux phases.
 */
export default function MatchRow({
  leadingBadge,
  a,
  b,
  trailingBadge,
  state,
  scoreFields,
}: {
  /** Badge avant les noms (ex. Winner/Loser au playoff). */
  leadingBadge?: ReactNode;
  a: string;
  /** Nom de l'adversaire ; `null` = bye (pas de « vs »). */
  b: string | null;
  /** Badge après les noms (ex. « 📺 à diffuser » en suisse). */
  trailingBadge?: ReactNode;
  state: MatchRowState;
  /** Noms des champs POST du score (« home »/« away » ou « a »/« b »). */
  scoreFields: { a: string; b: string };
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {leadingBadge}
        <span className="font-medium">{a}</span>
        {b !== null && (
          <>
            <span className="text-sm text-muted-foreground">vs</span>
            <span className="font-medium">{b}</span>
          </>
        )}
        {trailingBadge}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{renderState(state, scoreFields)}</div>
    </div>
  );
}

function renderState(state: MatchRowState, scoreFields: { a: string; b: string }) {
  if (state.kind === 'bye') {
    return <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">bye — victoire auto</Badge>;
  }
  if (state.kind === 'forfeit') {
    return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">forfait</Badge>;
  }
  if (state.kind === 'played') {
    const badge = (
      <Badge variant="secondary" className="tabular-nums">
        {state.scoreA}–{state.scoreB}
        {state.amend && <Pencil className="ml-1 size-3 opacity-50 group-open:opacity-100" />}
      </Badge>
    );
    if (!state.amend) return badge;
    return (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center">{badge}</summary>
        <ScoreForm
          action={state.amend}
          a={{ name: scoreFields.a, label: 'Score domicile corrigé', default: state.scoreA }}
          b={{ name: scoreFields.b, label: 'Score visiteur corrigé', default: state.scoreB }}
          submitLabel="Corriger"
          className="mt-2 flex items-center gap-1.5"
        />
      </details>
    );
  }
  // pending
  return (
    <>
      <ScoreForm
        action={state.result}
        a={{ name: scoreFields.a, label: 'Score A' }}
        b={{ name: scoreFields.b, label: 'Score B' }}
        submitLabel="Enregistrer"
      />
      <ForfeitDialog title={state.forfeit.title} options={state.forfeit.options} />
    </>
  );
}
