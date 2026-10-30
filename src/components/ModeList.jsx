import { useMemo, useState } from 'react';
import { Shapes, Box, Sparkles, Search, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { MODES, ALL_TAGS, previewUrl } from '../../js/modes/index.js';
import { useEngine } from '../useEngine.js';
import { cn } from '@/lib/utils';

const GROUPS = [
  { id: '2D', label: '2D · p5.js', icon: Shapes },
  { id: '3D', label: '3D · three.js', icon: Box },
  { id: 'Shader', label: 'Shaders · GLSL', icon: Sparkles },
];

// Card shown while hovering a mode: a looping clip of the mode plus what it is.
function Preview({ mode }) {
  const [videoOk, setVideoOk] = useState(true);
  return (
    <div className="w-[260px]">
      <div className="relative aspect-[1/1.414] overflow-hidden rounded-md bg-neutral-100">
        <img src={previewUrl(mode.id, 'jpg')} alt="" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        {videoOk && (
          <video
            src={previewUrl(mode.id, 'mp4')} autoPlay muted loop playsInline
            className="absolute inset-0 size-full object-cover"
            onError={() => setVideoOk(false)}
          />
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="text-[13px] font-semibold">{mode.name}</div>
        <p className="text-[12px] leading-snug text-neutral-600">{mode.description}</p>
        <p className="text-[11px] leading-snug text-neutral-400">{mode.technique}</p>
      </div>
    </div>
  );
}

export default function ModeList() {
  const engine = useEngine();
  const current = engine.state.mode;
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MODES.filter((m) =>
      (!tag || m.tags.includes(tag)) &&
      (!q || [m.name, m.description, m.technique, ...m.tags].join(' ').toLowerCase().includes(q)));
  }, [query, tag]);

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
      <div className="space-y-2.5 border-b border-neutral-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search effects"
            className="h-8 w-full rounded-md border border-neutral-200 bg-neutral-50 pl-8 pr-7 text-[12px] outline-none focus:border-neutral-400 focus:bg-white"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_TAGS.slice(0, 10).map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                tag === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-400',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="space-y-5 p-3">
          {GROUPS.map(({ id, label, icon: Icon }) => {
            const items = visible.filter((m) => m.group === id);
            if (!items.length) return null;
            return (
              <div key={id}>
                <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] text-neutral-400">
                  <Icon className="size-3.5" /> {label}
                  <span className="ml-auto tabular-nums">{items.length}</span>
                </div>
                {items.map((m) => (
                  <HoverCard key={m.id} openDelay={250} closeDelay={60}>
                    <HoverCardTrigger asChild>
                      <button
                        onClick={() => engine.setMode(m.id)}
                        className={cn(
                          'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                          current === m.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100',
                        )}
                      >
                        {m.name}
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent side="right" align="start" sideOffset={12} className="w-auto p-3">
                      <Preview mode={m} />
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            );
          })}
          {!visible.length && (
            <div className="px-2 py-6 text-center text-[12px] text-neutral-500">
              Nothing matches “{query || tag}”.{' '}
              <button className="underline" onClick={() => { setQuery(''); setTag(null); }}>Show all</button>
            </div>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
