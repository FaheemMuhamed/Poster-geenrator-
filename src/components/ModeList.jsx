import { useMemo, useState } from 'react';
import { Image, Sparkles, Search, Type, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CATEGORIES, MODES, ALL_TAGS, previewUrl } from '../../js/modes/index.js';
import { useEngine } from '../useEngine.js';
import { cn } from '@/lib/utils';

const ICONS = { Generative: Sparkles, Type, Image };
const GROUPS = CATEGORIES.map((c) => ({ ...c, icon: ICONS[c.id] || Sparkles }));
const LIB = { p5: 'p5', three: 'three', glsl: 'GLSL' };

// Card shown while hovering a mode: a looping clip of the mode plus what it is.
function Preview({ mode }) {
  const [videoOk, setVideoOk] = useState(true);
  return (
    <div className="w-[260px]">
      <div className="relative aspect-[1/1.414] overflow-hidden rounded-md bg-muted">
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
        <p className="text-[12px] leading-snug text-muted-foreground">{mode.description}</p>
        <p className="text-[11px] leading-snug text-muted-foreground/70">{mode.technique}</p>
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
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="space-y-2.5 border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search effects"
            className="h-8 w-full rounded-md border border-border bg-muted/50 pl-8 pr-7 text-[12px] outline-none focus:border-foreground/40 focus:bg-card"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground">
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
                tag === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/40',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="space-y-5 p-3">
          {GROUPS.map(({ id, description, icon: Icon }) => {
            const items = visible.filter((m) => m.category === id);
            const filtering = query || tag;
            if (!items.length && filtering) return null;
            return (
              <div key={id}>
                <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground" title={description}>
                  <Icon className="size-3.5" /> {id}
                  <span className="ml-auto tabular-nums">{items.length || ''}</span>
                </div>
                {!items.length && <p className="px-2 text-[12px] text-muted-foreground/70">Coming soon</p>}
                {items.map((m) => (
                  <HoverCard key={m.id} openDelay={250} closeDelay={60}>
                    <HoverCardTrigger asChild>
                      <button
                        onClick={() => engine.setMode(m.id)}
                        className={cn(
                          'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                          current === m.id ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        <span className={cn('ml-2 font-mono text-[10px]', current === m.id ? 'text-background/60' : 'text-muted-foreground/70')}>{LIB[m.library]}</span>
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
            <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">
              Nothing matches “{query || tag}”.{' '}
              <button className="underline" onClick={() => { setQuery(''); setTag(null); }}>Show all</button>
            </div>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
