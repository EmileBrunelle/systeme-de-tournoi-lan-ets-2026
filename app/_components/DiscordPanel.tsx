import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import CopyButton from './CopyButton';
import type { DiscordBlock } from '../_lib/discord-views';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export default function DiscordPanel({ blocks, headerAction }: { blocks: DiscordBlock[]; headerAction?: ReactNode }) {
  if (blocks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" /> Messages Discord
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cliquez pour copier, puis collez dans Discord (markdown, découpé à 2000 caractères).
            </p>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {blocks.map((block) => (
          <div key={block.label}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{block.label}</h3>
              <div className="flex gap-2">
                {block.chunks.map((chunk, i) => (
                  <CopyButton
                    key={i}
                    text={chunk}
                    label={block.chunks.length > 1 ? `Copier ${i + 1}/${block.chunks.length}` : 'Copier'}
                  />
                ))}
              </div>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed">
              {block.chunks.join('\n\n')}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
