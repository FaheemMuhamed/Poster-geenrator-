import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createUniverse } from './Universe.js';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;
const GROUPS = ['All', '2D', '3D', 'Shader'];
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Explore({ onOpen }) {
  const mountRef = useRef(null);
  const labelRef = useRef(null);
  const uniRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [group, setGroup] = useState('All');
  const [tag, setTag] = useState(null);

  useEffect(() => {
    fetch(`${BASE}examples/examples.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData, () => setError(true));
  }, []);

  useEffect(() => {
    if (!data || !mountRef.current) return;
    let uni;
    try {
      uni = createUniverse(mountRef.current, data, `${BASE}examples/atlas.webp`, {
        onHover: setHovered, onSelect: setSelected, reducedMotion,
      });
    } catch (e) { console.error(e); setError(true); return; }
    uniRef.current = uni;
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
  }, [data]);

  // Esc closes the open poster.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === 'Escape') uniRef.current?.select(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  useEffect(() => {
    uniRef.current?.setFilter((e) => (group === 'All' || e.group === group) && (!tag || e.tags.includes(tag)));
  }, [group, tag, data]);

  const tags = useMemo(() => {
    if (!data) return [];
    const count = {};
    data.examples.forEach((e) => e.tags.forEach((t) => { count[t] = (count[t] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
  }, [data]);

  // The fog takes on the colours of whatever you're looking at.
  const focus = selected || hovered;
  const glow = focus
    ? `radial-gradient(50% 45% at 35% 40%, ${focus.colors.c1}55, transparent 70%), radial-gradient(45% 40% at 70% 65%, ${focus.colors.c3}44, transparent 70%), radial-gradient(60% 60% at 50% 50%, ${focus.colors.bg}, #eceef0)`
    : 'radial-gradient(60% 60% at 50% 50%, #f6f7f8, #e6e8eb)';

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[13px] text-neutral-500">
        <div>
          <p>The example posters haven't been generated yet.</p>
          <p className="mt-1 text-[12px] text-neutral-400">Run capture.html in development to create them.</p>
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
          <h1 className="text-[22px] font-semibold tracking-tight">{data ? data.examples.length : '…'} posters, all made here</h1>
          <p className="mt-1 text-[13px] leading-snug text-neutral-600">Drag to drift through them. Click one to look closer and open it in the editor.</p>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5 sm:max-w-[420px] sm:justify-end">
          {GROUPS.map((g) => (
            <button key={g} onClick={() => setGroup(g)}
              className={cn('rounded-full px-3 py-1 text-[12px] backdrop-blur transition-colors', group === g ? 'bg-neutral-900 text-white' : 'bg-white/70 text-neutral-700 hover:bg-white')}>
              {g}
            </button>
          ))}
          <span className="mx-1 hidden w-px bg-neutral-300 sm:block" />
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)}
              className={cn('rounded-full px-3 py-1 text-[12px] backdrop-blur transition-colors', tag === t ? 'bg-neutral-900 text-white' : 'bg-white/50 text-neutral-600 hover:bg-white')}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Hover label */}
      <div ref={labelRef} className={cn('pointer-events-none absolute left-0 top-0 rounded-md bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur transition-opacity duration-150', hovered && !selected ? 'opacity-100' : 'opacity-0')}>
        <div className="text-[12px] font-medium">{hovered?.title}</div>
        <div className="text-[11px] text-neutral-500">{hovered?.name} · {hovered?.palette}</div>
      </div>

      {/* Selected poster */}
      <aside className={cn(
        'absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col bg-white/95 shadow-2xl backdrop-blur transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] sm:w-[380px]',
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
              <p className="mt-1 text-[13px] text-neutral-600">{selected.name} · {selected.palette} palette</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {selected.tags.map((t) => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{t}</span>)}
              </div>
            </div>
            <div className="p-5">
              <Button className="h-10 w-full gap-2" onClick={() => onOpen(selected.settings)}>
                <PenLine className="size-4" /> Open in editor
              </Button>
              <p className="mt-2 text-center text-[11px] text-neutral-400">It opens live, with every setting ready to change.</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
