import { useEffect, useRef } from 'react';
import { drawType, LAYOUT_GROUPS, LAYOUT_INFO } from '../../js/shared/typeLayer.js';
import { aspectOf } from '../../js/engine.js';
import { cn } from '@/lib/utils';

// A tiny live preview of one layout with the user's own text and colours.
function Thumb({ layout, text, colors, aspect, active, onClick }) {
  const ref = useRef(null);
  const W = 64, H = Math.round(W / aspect);
  useEffect(() => {
    const c = ref.current;
    const dpr = 2;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
    drawType(ctx, W, H, { ...text, show: true, layout }, colors, { showGrid: true });
  }, [layout, text, colors, aspect, W, H]);
  return (
    <button onClick={onClick} title={LAYOUT_INFO[layout]} className="group flex flex-col items-center gap-1.5">
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        className={cn('rounded-[3px] ring-1 transition', active ? 'ring-2 ring-foreground ring-offset-2' : 'ring-border group-hover:ring-foreground/40')}
      />
      <span className={cn('w-full truncate text-center text-[10.5px]', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{layout}</span>
    </button>
  );
}

export default function LayoutPicker({ state, onPick }) {
  const aspect = aspectOf(state);
  // Fresh copies so thumbnails redraw when text or colours change.
  const text = { ...state.text, lines: { ...state.text.lines } };
  const colors = { ...state.colors };
  return (
    <div className="space-y-4">
      {LAYOUT_GROUPS.map((g) => (
        <div key={g.name}>
          <div className="mb-2 text-[11px] text-muted-foreground/70">{g.name}</div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-3">
            {Object.keys(g.layouts).map((l) => (
              <Thumb key={l} layout={l} text={text} colors={colors} aspect={aspect} active={state.text.layout === l} onClick={() => onPick(l)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
