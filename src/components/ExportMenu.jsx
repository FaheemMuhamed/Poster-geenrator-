import { useState } from 'react';
import { Code2, Copy, Download, FileCode, Image, Link2, Video, ClipboardPaste, Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useEngine } from '../useEngine.js';

const SIZES = [['Screen', 'Screen'], ['2K', '2K (2048px)'], ['4K', '4K (4096px)'], ['6K', '6K (6144px)']];

function Row({ icon: Icon, children, onClick, hint }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100">
      <Icon className="size-4 text-neutral-400" />
      <span>{children}</span>
      {hint && <span className="ml-auto text-[11px] text-neutral-400">{hint}</span>}
    </button>
  );
}

function Heading({ children }) {
  return <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">{children}</div>;
}

export default function ExportMenu() {
  const engine = useEngine();
  const [size, setSize] = useState('4K (4096px)');
  const [seconds, setSeconds] = useState(8);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5"><Download className="size-3.5" /> Export</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Heading>Image</Heading>
        <div className="px-2 pb-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={size} onValueChange={(v) => v && setSize(v)} className="w-full">
            {SIZES.map(([short, full]) => <ToggleGroupItem key={full} value={full} className="flex-1 text-[12px]">{short}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <Row icon={Image} hint="S" onClick={() => engine.savePNG(size)}>Save PNG</Row>
        <Row icon={Copy} onClick={() => engine.copyImage(size)}>Copy image</Row>

        <Separator className="my-2" />
        <Heading>Video</Heading>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <Slider value={[seconds]} min={2} max={30} step={1} onValueChange={([v]) => setSeconds(v)} />
          <span className="w-8 text-right font-mono text-[11px] text-neutral-500">{seconds}s</span>
        </div>
        <Row icon={Video} onClick={() => engine.recordVideo(seconds)}>{engine.recording ? 'Recording…' : 'Record video'}</Row>

        <Separator className="my-2" />
        <Heading>Share & code</Heading>
        <Row icon={Link2} onClick={() => engine.copyLink()}>Copy share link</Row>
        <Row icon={Code2} onClick={() => engine.copyEmbed()}>Copy embed code</Row>
        <Row icon={FileCode} onClick={() => engine.downloadHTML()}>Download HTML file</Row>
        <Row icon={Braces} onClick={() => engine.copySettings()}>Copy settings JSON</Row>
        <Row icon={ClipboardPaste} onClick={() => engine.pasteSettings()}>Paste settings JSON</Row>
      </PopoverContent>
    </Popover>
  );
}
