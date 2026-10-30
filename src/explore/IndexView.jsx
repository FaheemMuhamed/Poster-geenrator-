import { CATEGORIES, MODES, previewUrl } from '../../js/modes/index.js';

const LIB = { p5: 'p5.js', three: 'three.js', glsl: 'GLSL' };
// Catalogue number: the entry's place in the archive, e.g. 007.
const no = (i) => String(i + 1).padStart(3, '0');

// One archive plate: a still that starts moving on hover.
function Plate({ mode, index, onOpen }) {
  const play = (e) => { const v = e.currentTarget.querySelector('video'); v?.play().catch(() => {}); };
  const stop = (e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } };
  return (
    <button
      onClick={() => onOpen(mode.id)} onMouseEnter={play} onMouseLeave={stop} onFocus={play} onBlur={stop}
      className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
    >
      <div className="relative aspect-[1/1.414] overflow-hidden rounded-[3px] bg-muted ring-1 ring-border transition-shadow group-hover:ring-foreground/40">
        <img src={previewUrl(mode.id, 'jpg')} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        <video src={previewUrl(mode.id, 'mp4')} muted loop playsInline preload="none" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </div>
      <div className="mt-2 flex justify-between gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
        <span>No. {no(index)}</span>
        <span>{LIB[mode.library]}</span>
      </div>
      <div className="text-[13px] leading-snug text-foreground group-hover:underline">{mode.name}</div>
      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{mode.description}</div>
    </button>
  );
}

// Every entry, numbered and grouped by what it makes. Filters come from Explore.
export default function IndexView({ group, tag, onOpenMode }) {
  const entries = MODES.map((m, i) => ({ m, i })).filter(({ m }) => (group === 'All' || m.category === group) && (!tag || m.tags.includes(tag)));
  const cats = CATEGORIES.filter((c) => group === 'All' || c.id === group);

  return (
    <div className="space-y-12">
      {cats.map((cat) => {
        const items = entries.filter(({ m }) => m.category === cat.id);
        const empty = !MODES.some((m) => m.category === cat.id);
        if (!items.length && (!empty || tag)) return null;
        return (
          <section key={cat.id} className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,9fr)]">
            <div>
              <h2 className="text-[17px] leading-tight font-semibold tracking-tight">{cat.id}</h2>
              <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{cat.description}</p>
            </div>
            {items.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
                {items.map(({ m, i }) => <Plate key={m.id} mode={m} index={i} onOpen={onOpenMode} />)}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Coming next: dithering, pixel sorting, displacement and more, applied to your own images.</p>
            )}
          </section>
        );
      })}
      {!entries.length && (
        <p className="text-[13px] text-muted-foreground">No entries match these filters.</p>
      )}
    </div>
  );
}
