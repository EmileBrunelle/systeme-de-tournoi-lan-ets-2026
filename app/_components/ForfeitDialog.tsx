'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
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
 * Déclare un forfait sur une manche : choisit laquelle des deux équipes concède.
 * Chaque `option.action` est une server action déjà liée (bind), soumise via <form>.
 */
export default function ForfeitDialog({
  title,
  options,
}: {
  title: string;
  options: { label: string; action: (formData: FormData) => void | Promise<void> }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" aria-label="Forfait">
          <Flag className="size-4" /> Forfait
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            L’équipe qui déclare forfait perd la manche ; l’adversaire l’emporte.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {options.map((o) => (
            <form key={o.label} action={o.action}>
              <Button type="submit" variant="outline" className="w-full">
                {o.label}
              </Button>
            </form>
          ))}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
