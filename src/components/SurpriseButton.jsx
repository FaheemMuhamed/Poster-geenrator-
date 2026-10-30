import { useEffect, useRef } from 'react';
import { WandSparkles } from 'lucide-react';
import { useEngine } from '../useEngine.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.05, 0.7, 0.1, 1)';

// The one loud control in the top bar: new settings + colours, celebrated with a
// burst of the new palette. Also fired by the X shortcut (a 'morva:surprise' event).
export default function SurpriseButton() {
  const engine = useEngine();
  const btnRef = useRef(null);
  const iconRef = useRef(null);
  const burstRef = useRef(null);
  const running = useRef([]);

  const fire = () => {
    engine.surprise();
    if (reduced()) return;
    // Restart rather than stack when clicked repeatedly.
    running.current.forEach((a) => a.cancel());
    running.current = [
      btnRef.current.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.92)', offset: 0.25 }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      ),
      iconRef.current.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 600, easing: EASE_OUT }),
    ];
    const scene = document.getElementById('scene');
    scene?.animate([{ filter: 'brightness(1.35) saturate(1.25)' }, { filter: 'none' }], { duration: 360, easing: 'ease-out' });

    // Particles in the new palette's colours.
    const box = burstRef.current;
    if (!box || box.childElementCount > 48) return;
    const { colors } = engine.state;
    const palette = [colors.c1, colors.c2, colors.c3, colors.c4, colors.ink].filter(Boolean);
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement('span');
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 34;
      const size = 4 + Math.random() * 5;
      Object.assign(dot.style, {
        position: 'absolute', left: '50%', top: '50%', width: `${size}px`, height: `${size}px`,
        borderRadius: i % 3 ? '50%' : '1px', background: palette[i % palette.length], pointerEvents: 'none',
      });
      box.appendChild(dot);
      dot.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist * 0.7}px)) scale(0.2) rotate(${Math.random() * 180}deg)`, opacity: 0 },
        ],
        { duration: 560 + Math.random() * 220, easing: EASE_OUT },
      ).onfinish = () => dot.remove();
    }
  };

  const fireRef = useRef(fire);
  fireRef.current = fire;
  useEffect(() => {
    const on = () => fireRef.current();
    window.addEventListener('morva:surprise', on);
    return () => window.removeEventListener('morva:surprise', on);
  }, []);

  return (
    <span className="relative inline-flex">
      <span ref={burstRef} className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden="true" />
      <button
        ref={btnRef}
        onClick={fire}
        title="Surprise me: new settings and colours (X)"
        aria-label="Surprise me"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] bg-signal px-2.5 text-[12px] font-semibold text-signal-foreground transition-[filter] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <span ref={iconRef} className="inline-flex"><WandSparkles className="size-3.5" /></span>
        <span className="hidden lg:inline">Surprise me</span>
      </button>
    </span>
  );
}
