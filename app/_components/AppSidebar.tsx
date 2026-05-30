'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, MonitorPlay, ArrowLeft, Trophy } from 'lucide-react';
import { cn } from '../_lib/utils';
import { Badge } from './ui/badge';

interface Props {
  id: string;
  tournamentName: string;
  phase: string;
  started: boolean;
}

export default function AppSidebar({ id, tournamentName, phase, started }: Props) {
  const pathname = usePathname();
  const base = `/t/${id}`;

  const items = [
    { href: base, label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
    { href: `${base}/equipes`, label: 'Équipes', icon: Users, match: [`${base}/equipes`, `${base}/equipe`] },
    { href: `${base}/projecteur`, label: 'Projecteur', icon: MonitorPlay, exact: true },
  ];

  const isActive = (item: (typeof items)[number]) => {
    if (item.exact) return pathname === item.href;
    return (item.match ?? [item.href]).some((m) => pathname.startsWith(m));
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Trophy className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight text-sidebar-foreground">{tournamentName}</div>
          <Badge variant="secondary" className="mt-0.5 h-5 px-1.5 text-[11px] font-normal">
            {phase}
          </Badge>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4">
        {!started && (
          <p className="mb-2 px-3 text-[11px] leading-snug text-muted-foreground">
            Tournoi non démarré. Configurez les équipes puis lancez la phase.
          </p>
        )}
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <ArrowLeft className="size-4" />
          Tous les tournois
        </Link>
      </div>
    </aside>
  );
}
