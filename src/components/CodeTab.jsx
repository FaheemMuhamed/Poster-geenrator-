import { useMemo } from 'react';
import { Copy, Download, ExternalLink, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MODES, modeFile } from '../../js/modes/index.js';
import { openInCodePen } from '../../js/shared/codegen.js';
import { sourceUrl } from '../config.js';

function save(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function CodeBlock({ source, className = '' }) {
  return (
    <pre className={`overflow-auto rounded-[3px] bg-muted/60 p-3 font-mono text-[11px] leading-[1.55] text-foreground ring-1 ring-border ${className}`}>
      <code>{source}</code>
    </pre>
  );
}

// Standalone, runnable code for the current visual with today's settings inlined.
export default function CodeTab({ engine }) {
  const { mode, state } = engine;
  const meta = MODES.find((m) => m.id === mode.id);
  const values = state.params[mode.id];
  const code = useMemo(
    () => mode.code?.(values, state.colors, state.seed),
    // Settings change in place, so watch a snapshot of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, JSON.stringify(values), JSON.stringify(state.colors), state.seed],
  );

  if (!code) {
    return (
      <div className="space-y-3 p-4 text-[12px] leading-relaxed">
        <p className="text-foreground">A standalone version of {mode.name} is on its way.</p>
        <p className="text-muted-foreground">Until then, you can read how Morva draws it in the source file.</p>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={sourceUrl(modeFile(meta))} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> View source on GitHub</a>
        </Button>
      </div>
    );
  }

  const lines = code.source.split('\n').length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.source);
      toast('Copied. Paste it into an empty .html file and open it in a browser.');
    } catch {
      toast('Copying was blocked. Use Download instead.');
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <p className="text-[12px] leading-snug text-foreground">A single HTML file that runs on its own, with your current settings built in.</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono">{code.library}</span> · {lines} lines · grain, glow and text are left out
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={copy}><Copy className="size-3.5" /> Copy</Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => save(code.source, code.filename)}><Download className="size-3.5" /> Download</Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => openInCodePen(code.pen)}><ExternalLink className="size-3.5" /> CodePen</Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]"><Maximize2 className="size-3.5" /> Full view</Button>
          </DialogTrigger>
          <DialogContent className="grid max-h-[85vh] max-w-3xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-[17px] font-semibold tracking-tight">{mode.name}</DialogTitle>
              <DialogDescription className="text-[12px]">{code.filename} · {code.library} · {lines} lines</DialogDescription>
            </DialogHeader>
            <CodeBlock source={code.source} className="min-h-0" />
          </DialogContent>
        </Dialog>
      </div>

      <CodeBlock source={code.source} className="max-h-[420px]" />
    </div>
  );
}
