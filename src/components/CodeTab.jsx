import { useEffect, useMemo, useState } from 'react';
import { Code2, Copy, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MODES, modeFile } from '../../js/modes/index.js';

// Every effect's own source, loaded only when its Code window opens.
const SOURCES = import.meta.glob('../../js/modes/*/*.js', { query: '?raw', import: 'default' });

function save(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// What the terminal shows: the standalone page when the effect has one, otherwise its source file.
function useCode(engine) {
  const { mode, state } = engine;
  const meta = MODES.find((m) => m.id === mode.id);
  const values = state.params[mode.id];
  const standalone = useMemo(
    () => mode.code?.(values, state.colors, state.seed),
    // Settings change in place, so watch a snapshot of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, JSON.stringify(values), JSON.stringify(state.colors), state.seed],
  );
  const [source, setSource] = useState(null);
  useEffect(() => {
    if (standalone || !meta) return;
    let live = true;
    setSource(null);
    SOURCES[`../../${modeFile(meta)}`]?.().then((text) => live && setSource(text));
    return () => { live = false; };
  }, [standalone, meta]);

  if (standalone) return { kind: 'standalone', text: standalone.source, filename: standalone.filename, library: standalone.library };
  const file = meta ? modeFile(meta).split('/').pop() : `${mode.id}.js`;
  return { kind: 'source', text: source, filename: `morva-${file}`, library: { p5: 'p5.js', three: 'three.js', glsl: 'GLSL' }[meta?.library] || 'JS' };
}

// The Code button: opens a terminal window with the code for the current visual.
export function CodeButton({ engine }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-[12px]"><Code2 className="size-3.5" /> Code</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[88vh] w-[calc(100%-2rem)] max-w-3xl gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-2xl sm:max-w-3xl">
        <Terminal engine={engine} />
      </DialogContent>
    </Dialog>
  );
}

// Fixed terminal colours: a light, paper-like terminal in both themes.
const TERM = {
  bg: '#fbfbf9', bar: '#f0f0ec', line: '#e2e2dd', text: '#1d1d1b', dim: '#77766f', faint: '#b3b2ab', prompt: '#e8431a', ok: '#3d8a2a',
};

function Terminal({ engine }) {
  const { mode } = engine;
  const code = useCode(engine);
  const lines = code.text ? code.text.split('\n') : [];
  const command = code.kind === 'standalone' ? `morva export ${mode.id} --with-settings` : `morva source ${mode.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.text);
      toast(code.kind === 'standalone' ? 'Copied. Paste it into an empty .html file and open it in a browser.' : 'Copied the source.');
    } catch {
      toast('Copying was blocked. Use Download instead.');
    }
  };

  return (
    <div className="flex max-h-[88vh] min-h-0 flex-col overflow-hidden rounded-[10px] font-mono text-[12px] ring-1 ring-black/10" style={{ background: TERM.bg, color: TERM.text }}>
      {/* Title bar: one working close button */}
      <div className="flex shrink-0 items-center gap-3 px-3.5 py-2.5" style={{ background: TERM.bar, borderBottom: `1px solid ${TERM.line}` }}>
        <DialogClose
          aria-label="Close"
          className="group grid size-3.5 place-items-center rounded-full bg-[#ff5f57] ring-1 ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1b]/50"
        >
          <X className="size-2.5 text-black/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={3} />
        </DialogClose>
        <DialogTitle className="min-w-0 flex-1 truncate text-center font-mono text-[12px] font-normal" style={{ color: TERM.dim }}>
          morva — {code.filename}
        </DialogTitle>
        <DialogDescription className="sr-only">Code for {mode.name}</DialogDescription>
        <div className="size-3.5" aria-hidden="true" />
      </div>

      {/* Prompt */}
      <div className="shrink-0 px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 truncate"><span style={{ color: TERM.prompt }}>$</span> {command}</p>
          <div className="flex gap-1">
            <TermButton onClick={copy} disabled={!code.text}><Copy className="size-3.5" /> copy</TermButton>
            <TermButton onClick={() => save(code.text, code.filename, code.kind === 'standalone' ? 'text/html' : 'text/javascript')} disabled={!code.text}><Download className="size-3.5" /> download</TermButton>
          </div>
        </div>
        <p className="mt-1" style={{ color: TERM.dim }}>
          <span style={{ color: TERM.ok }}>✓</span>{' '}
          {code.kind === 'standalone'
            ? `${code.library} · ${lines.length} lines · runs on its own with your current settings · grain, glow and text left out`
            : `${code.library} · Morva's source for ${mode.name} · runs inside Morva, not on its own`}
        </p>
      </div>

      {/* Code with line numbers (select any part to copy it) */}
      <div className="min-h-0 flex-1 overflow-auto" style={{ borderTop: `1px solid ${TERM.line}` }}>
        {code.text ? (
          <pre className="py-3 leading-[1.6]">
            <code className="grid grid-cols-[auto_minmax(0,1fr)] selection:bg-[#ff5a2e]/20">
              {lines.map((ln, i) => (
                <span key={i} className="contents">
                  <span className="select-none pl-4 pr-4 text-right tabular-nums" style={{ color: TERM.faint }}>{i + 1}</span>
                  <span className="whitespace-pre pr-6">{ln || ' '}</span>
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <p className="px-4 py-3" style={{ color: TERM.dim }}>
            loading<span className="morva-cursor ml-1 inline-block h-3.5 w-2 align-[-2px]" style={{ background: TERM.text }} />
          </p>
        )}
      </div>
    </div>
  );
}

function TermButton({ children, ...props }) {
  return (
    <button type="button" {...props}
      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[11px] transition-colors hover:bg-black/5 focus-visible:outline-1 focus-visible:outline-black/40 disabled:opacity-40"
      style={{ color: TERM.text, border: `1px solid ${TERM.line}` }}>
      {children}
    </button>
  );
}
