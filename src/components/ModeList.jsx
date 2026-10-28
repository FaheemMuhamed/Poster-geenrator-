import { Shapes, Box, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MODES } from '../../js/engine.js';
import { useEngine } from '../useEngine.js';
import { cn } from '@/lib/utils';

const GROUPS = [
  { id: '2D', label: '2D', icon: Shapes },
  { id: '3D', label: '3D', icon: Box },
  { id: 'Shader', label: 'Shader', icon: Sparkles },
];

export default function ModeList() {
  const engine = useEngine();
  const current = engine.state.mode;
  return (
    <aside className="hidden w-[208px] shrink-0 border-r border-neutral-200 bg-white md:block">
      <ScrollArea className="h-full">
        <nav className="space-y-5 p-3 pt-4">
          {GROUPS.map(({ id, label, icon: Icon }) => (
            <div key={id}>
              <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                <Icon className="size-3.5" /> {label}
              </div>
              {MODES.filter((m) => m.group === id).map((m) => (
                <button
                  key={m.id}
                  onClick={() => engine.setMode(m.id)}
                  className={cn(
                    'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                    current === m.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100',
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
