import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createUniverse } from './Universe.js';
import { cn } from '@/lib/utils';
import { ALL_TAGS, CATEGORIES, MODES } from '../../js/modes/index.js';
import IndexView from './IndexView.jsx';
import { themeColor, useTheme } from '../useTheme.js';

const BASE = import.meta.env.BASE_URL;
const categoryOf = Object.fromEntries(MODES.map((m) => [m.id, m.category]));
// Universe or Index, remembered for the session so Back from the editor returns to the same one.
const LAYOUT_KEY = 'morva-explore-layout';
const readLayout = () => { try { return sessionStorage.getItem(LAYOUT_KEY) || 'universe'; } catch { return 'universe'; } };
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Explore({ onOpen, onOpenMode, initialSelected = null }) {
  const mountRef = useRef(null);
  const labelRef = useRef(null);
  const uniRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [group, setGroup] = useState('All');
  const [tag, setTag] = useState(null);
  const theme = useTheme();
  const [layout, setLayoutState] = useState(readLayout);
  const setLayout = (l) => { setLayoutState(l); setSelected(null); setHovered(null); try { sessionStorage.setItem(LAYOUT_KEY, l); } catch {} };
  const isIndex = layout === 'index';

  useEffect(() => {
    fetch(`${BASE}examples/examples.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData, () => setError(true));
  }, []);

  useEffect(() => {
    if (!data || isIndex || !mountRef.current) return;
    let uni;
    try {
      uni = createUniverse(mountRef.current, data, `${BASE}examples/atlas.webp`, {
        onHover: setHovered, onSelect: setSelected, reducedMotion, fog: themeColor('--stage'),
      });
    } catch (e) { console.error(e); setError(true); return; }
    uniRef.current = uni;
    // Coming back from the editor: reopen the poster you left from.
    const back = data.examples.findIndex((e) => e.id === initialSelected);
    if (back >= 0) uni.select(back);
    // Keep the hover label pinned above the hovered poster.
    let raf;
    const follow = () => {
      const l = labelRef.current;
      if (l && uni.hovered >= 0) {
        const s = uni.screenOf(uni.hovered);
        l.style.transform = `translate(${s.x}px, ${s.y - s.h / 2 - 10}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => { cancelAnimationFrame(raf); uni.dispose(); uniRef.current = null; };
  }, [data, isIndex]);

  // Esc closes the open poster.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === 'Escape') uniRef.current?.select(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  useEffect(() => {
    uniRef.current?.setFilter((e) => (group === 'All' || categoryOf[e.mode] === group) && (!tag || e.tags.includes(tag)));
  }, [group, tag, data, isIndex]);

  useEffect(() => { uniRef.current?.setFog(themeColor('--stage')); }, [theme, data, isIndex]);

  // Only categories that have examples get a filter chip.
  const groups = useMemo(() => ['All', ...CATEGORIES.map((c) => c.id).filter((c) => (isIndex ? MODES.some((m) => m.category === c) : data?.examples.some((e) => categoryOf[e.mode] === c)))], [data, isIndex]);

  const tags = useMemo(() => {
    if (isIndex) return ALL_TAGS.slice(0, 7);
    if (!data) return [];
    const count = {};
    data.examples.forEach((e) => e.tags.forEach((t) => { count[t] = (count[t] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
  }, [data, isIndex]);

  // The fog takes on the colours of whatever you're looking at.
  const focus = selected || hovered;
  const glow = focus
    ? `radial-gradient(50% 45% at 35% 40%, ${focus.colors.c1}55, transparent 70%), radial-gradient(45% 40% at 70% 65%, ${focus.colors.c3}44, transparent 70%), radial-gradient(60% 60% at 50% 50%, ${focus.colors.bg}, var(--stage))`
    : 'radial-gradient(60% 60% at 50% 50%, var(--background), var(--stage))';

  const switcher = (
    <div role="tablist" aria-label="Explore view" className="mb-3 inline-flex rounded-md bg-muted p-0.5">
      {[['universe', 'Universe'], ['index', 'Index']].map(([id, label]) => (
        <button key={id} role="tab" aria-selected={layout === id} onClick={() => setLayout(id)}
          className={cn('h-7 rounded-[3px] px-3 text-[12px] transition-colors', layout === id ? 'bg-card text-foreground shadow-sm dark:bg-accent' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );

  const filters = (
    <div className="pointer-events-auto flex flex-wrap gap-1.5 sm:max-w-[420px] sm:justify-end">
      {groups.map((g) => (
        <button key={g} onClick={() => setGroup(g)}
          className={cn('rounded-full px-3 py-1 text-[12px] backdrop-blur transition-colors', group === g ? 'bg-foreground text-background' : 'bg-card/70 text-foreground hover:bg-card')}>
          {g}
        </button>
      ))}
      <span className="mx-1 hidden w-px bg-border sm:block" />
      {tags.map((t) => (
        <button key={t} onClick={() => setTag(tag === t ? null : t)}
          className={cn('rounded-full px-3 py-1 text-[12px] backdrop-blur transition-colors', tag === t ? 'bg-foreground text-background' : 'bg-card/50 text-muted-foreground hover:bg-card')}>
          {t}
        </button>
      ))}
    </div>
  );

  if (isIndex) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-5">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              {switcher}
              <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">The index</h1>
              <p className="mt-2 text-[13px] leading-snug text-muted-foreground">Every entry in Morva, numbered. Hover one to see it move, click to open it in the editor.</p>
            </div>
            {filters}
          </div>
          <IndexView group={group} tag={tag} onOpenMode={onOpenMode} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[13px] text-muted-foreground">
        <div>
          <p>The example visuals haven't been generated yet.</p>
          <p className="mt-1 text-[12px] text-muted-foreground/70">Run capture.html in development to create them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 transition-[background] duration-700 ease-out" style={{ background: glow }} />
      <div ref={mountRef} className="absolute inset-0" />

      {/* Intro + filters */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto max-w-sm">
          {switcher}
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">{data ? data.examples.length : '…'} visuals, all made in Morva</h1>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">Drag to drift through them. Click one to look closer and open it in the editor.</p>
        </div>
        {filters}
      </div>

      {/* Hover label */}
      <div ref={labelRef} className={cn('pointer-events-none absolute left-0 top-0 rounded-md bg-card/90 px-2.5 py-1.5 shadow-sm backdrop-blur transition-opacity duration-150', hovered && !selected ? 'opacity-100' : 'opacity-0')}>
        <div className="text-[12px] font-medium">{hovered?.title}</div>
        <div className="text-[11px] text-muted-foreground">{hovered?.name} · {hovered?.palette}</div>
      </div>

      {/* Selected poster */}
      <aside className={cn(
        'absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col bg-card/95 shadow-2xl backdrop-blur transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] sm:w-[380px]',
        selected ? 'translate-x-0' : 'invisible translate-x-full',
      )}>
        {selected && (
          <>
            <div className="flex items-center justify-between p-4">
              <Button variant="ghost" size="sm" className="gap-1.5 text-[12px]" onClick={() => uniRef.current?.select(-1)}>
                <ArrowLeft className="size-3.5" /> Back to all
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5">
              <img src={`${BASE}examples/e-${selected.id}.webp`} alt={`${selected.title} poster`} className="w-full rounded-sm shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]" />
              <h2 className="mt-5 text-[18px] font-semibold tracking-tight">{selected.title}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{selected.name} · {selected.palette} palette</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {selected.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}
              </div>
            </div>
            <div className="p-5">
              <Button className="h-10 w-full gap-2" onClick={() => onOpen(selected)}>
                <PenLine className="size-4" /> Open in editor
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground/70">It opens live, with every setting ready to change.</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
