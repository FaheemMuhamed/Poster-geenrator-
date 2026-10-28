import { Dices, Pause, Play, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { FORMATS, MODES } from '../../js/engine.js';
import { useEngine } from '../useEngine.js';
import ExportMenu from './ExportMenu.jsx';

function IconButton({ label, shortcut, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}{shortcut && <kbd className="ml-2 opacity-60">{shortcut}</kbd>}</TooltipContent>
    </Tooltip>
  );
}

export default function TopBar() {
  const engine = useEngine();
  const { state } = engine;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
      <div className="flex items-center gap-2 pl-1 pr-2">
        <div className="size-5 rounded-full bg-[conic-gradient(from_90deg,#ff3d4e,#ff9ccf,#20306b,#ffd43b,#ff3d4e)]" />
        <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">Poster Generator</span>
      </div>

      {/* On phones the mode list is hidden, so offer it here. */}
      <Select value={state.mode} onValueChange={(v) => engine.setMode(v)}>
        <SelectTrigger size="sm" className="h-8 w-[160px] text-[12px] md:hidden"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MODES.map((m) => <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.group} · {m.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="mx-auto flex items-center gap-1">
        <Select value={state.format} onValueChange={(v) => engine.setFormat(v)}>
          <SelectTrigger size="sm" className="h-8 w-[170px] border-none text-[12px] shadow-none hover:bg-neutral-100"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(FORMATS).map((f) => <SelectItem key={f} value={f} className="text-[12px]">{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <IconButton label={state.motion.paused ? 'Play' : 'Pause'} shortcut="Space" onClick={() => engine.togglePause()}>
          {state.motion.paused ? <Play /> : <Pause />}
        </IconButton>
        <IconButton label="New variation" shortcut="R" onClick={() => engine.randomise()}><Dices /></IconButton>
        <IconButton label="Surprise me: new settings + colours" onClick={() => engine.surprise()}><WandSparkles /></IconButton>
      </div>

      <ExportMenu />
    </header>
  );
}
