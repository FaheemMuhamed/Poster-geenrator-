import { Dices, Pause, Play, Sun, SunDim, WandSparkles } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import SupportDialog from './SupportDialog.jsx';
import FeedbackDialog from './FeedbackDialog.jsx';
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

export default function TopBar({ view, onView }) {
  const engine = useEngine();
  const { state } = engine;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
      <div className="flex items-center gap-2 pl-1 pr-2">
        <div className="size-5 rounded-full bg-[conic-gradient(from_90deg,#ff3d4e,#ff9ccf,#20306b,#ffd43b,#ff3d4e)]" />
        <span className="hidden text-[13px] font-semibold tracking-tight lg:inline">Poster Generator</span>
      </div>

      <ToggleGroup type="single" value={view} onValueChange={(v) => v && onView(v)} className="rounded-md bg-neutral-100 p-0.5">
        <ToggleGroupItem value="create" className="h-7 rounded-[5px] px-3 text-[12px] data-[state=on]:bg-white data-[state=on]:shadow-sm">Create</ToggleGroupItem>
        <ToggleGroupItem value="explore" className="h-7 rounded-[5px] px-3 text-[12px] data-[state=on]:bg-white data-[state=on]:shadow-sm">Explore</ToggleGroupItem>
      </ToggleGroup>

      {/* On phones the mode list is hidden, so offer it here. */}
      {view === 'create' && <Select value={state.mode} onValueChange={(v) => engine.setMode(v)}>
        <SelectTrigger size="sm" className="h-8 w-[160px] text-[12px] md:hidden"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MODES.map((m) => <SelectItem key={m.id} value={m.id} className="text-[12px]">{m.group} · {m.name}</SelectItem>)}
        </SelectContent>
      </Select>}

      <div className={view === 'create' ? 'mx-auto flex items-center gap-1' : 'invisible mx-auto flex items-center gap-1'}>
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
        <IconButton label={state.ui.ambient ? 'Turn off ambient glow' : 'Turn on ambient glow'} onClick={() => engine.toggleAmbient()}>
          {state.ui.ambient ? <Sun /> : <SunDim className="opacity-50" />}
        </IconButton>
      </div>

      <div className="hidden items-center md:flex">
        <FeedbackDialog />
        <SupportDialog />
      </div>
      {view === 'create' && <ExportMenu />}
    </header>
  );
}
