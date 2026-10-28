import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createEngine } from '../js/engine.js';
import { EngineContext } from './useEngine.js';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import TopBar from './components/TopBar.jsx';
import ModeList from './components/ModeList.jsx';
import Inspector from './components/Inspector.jsx';

// Embed mode (iframe / downloaded HTML): just the poster.
const EMBED = new URLSearchParams(location.search).has('embed') || !!window.POSTER_EMBED;

export default function App() {
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const typeRef = useRef(null);
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    const e = createEngine({
      els: { viewport: viewportRef.current, stage: stageRef.current, scene: sceneRef.current, typeCanvas: typeRef.current },
      notify: (msg) => toast(msg),
      embed: EMBED,
    });
    setEngine(e);
    return () => e.destroy();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!engine || EMBED) return;
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable], [role="slider"], [role="combobox"]') || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'r') engine.randomise();
      else if (k === 's') engine.savePNG('4K (4096px)');
      else if (e.key === ' ') { engine.togglePause(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') engine.stepMode(1);
      else if (e.key === 'ArrowLeft') engine.stepMode(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  const stage = (
    <div ref={viewportRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div ref={stageRef} id="stage" className={EMBED ? 'relative' : 'relative bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_48px_-16px_rgba(0,0,0,0.18)]'}>
        <div ref={sceneRef} className="absolute inset-0 cursor-crosshair touch-none" />
        <canvas ref={typeRef} id="type-layer" />
      </div>
    </div>
  );

  if (EMBED) return <div className="flex h-full bg-transparent">{stage}</div>;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        {engine && (
          <EngineContext.Provider value={engine}>
            <TopBar />
          </EngineContext.Provider>
        )}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {engine && (
            <EngineContext.Provider value={engine}>
              <ModeList />
            </EngineContext.Provider>
          )}
          <main className="flex min-h-[55vh] min-w-0 flex-1 bg-neutral-100/70">{stage}</main>
          {engine && (
            <EngineContext.Provider value={engine}>
              <Inspector />
            </EngineContext.Provider>
          )}
        </div>
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
