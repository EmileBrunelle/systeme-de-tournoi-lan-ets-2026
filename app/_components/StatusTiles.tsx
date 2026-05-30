import { cn } from '@/app/_lib/utils';
import type { Vital, VitalTone } from '@/lib/valorant/dashboard';
import { Card } from './ui/card';

const toneText: Record<VitalTone, string> = {
  default: 'text-foreground',
  accent: 'text-primary',
  success: 'text-emerald-400',
  danger: 'text-red-400',
};

const toneBar: Record<VitalTone, string> = {
  default: 'bg-muted-foreground/50',
  accent: 'bg-primary',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
};

/** Étage 1 du poste de commandement : tuiles glançables. */
export default function StatusTiles({ tiles }: { tiles: Vital[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const tone = t.tone ?? 'default';
        return (
          <Card key={t.key} className="gap-1 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.label}
            </p>
            <p
              className={cn('truncate text-2xl font-bold tabular-nums', toneText[tone])}
              title={t.value}
            >
              {t.value}
            </p>
            {t.hint && <p className="truncate text-xs text-muted-foreground">{t.hint}</p>}
            {typeof t.progress === 'number' && (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={cn('h-full rounded-full transition-all', toneBar[tone])}
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, t.progress)) * 100)}%` }}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
