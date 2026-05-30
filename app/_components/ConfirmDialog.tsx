'use client';

import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';

/**
 * Bouton déclencheur + dialog de confirmation pour une action destructive.
 * `action` est une server action déjà liée (bind) ; soumise via un <form>.
 * `icon` (défaut : poubelle) personnalise le déclencheur ; `triggerAriaLabel`
 * nomme le bouton icône.
 */
export default function ConfirmDialog({
  action,
  title,
  description,
  confirmLabel = 'Supprimer',
  triggerLabel,
  icon = <Trash2 className="size-4" />,
  triggerAriaLabel = 'Supprimer',
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  triggerLabel?: string;
  icon?: ReactNode;
  triggerAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerLabel ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            {icon} {triggerLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={triggerAriaLabel} className="text-muted-foreground hover:text-destructive">
            {icon}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <form action={action}>
            <Button type="submit" variant="destructive">
              {confirmLabel}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
