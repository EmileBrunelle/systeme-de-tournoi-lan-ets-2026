import { Input } from './ui/input';
import { Button } from './ui/button';

interface ScoreField {
  /** Nom du champ POST lu par l'action serveur (ex. « home »/« away » ou « a »/« b »). */
  name: string;
  label: string;
  default?: number | string;
}

/**
 * Formulaire de score à deux entrées (A – B) + bouton de soumission. Partagé par
 * la saisie suisse, la correction suisse et la saisie playoff — qui ne diffèrent
 * que par l'action liée, les noms de champs et le libellé du bouton. Évite trois
 * copies du même markup : une amélioration ici profite aux trois.
 */
export default function ScoreForm({
  action,
  a,
  b,
  submitLabel,
  className = 'flex items-center gap-1.5',
}: {
  action: (formData: FormData) => void | Promise<void>;
  a: ScoreField;
  b: ScoreField;
  submitLabel: string;
  className?: string;
}) {
  return (
    <form action={action} autoComplete="off" className={className}>
      <Input type="number" name={a.name} min={0} required autoComplete="off" defaultValue={a.default ?? ''} aria-label={a.label} className="h-9 w-16" />
      <span className="text-muted-foreground">–</span>
      <Input type="number" name={b.name} min={0} required autoComplete="off" defaultValue={b.default ?? ''} aria-label={b.label} className="h-9 w-16" />
      <Button type="submit" size="sm" variant="secondary">{submitLabel}</Button>
    </form>
  );
}
