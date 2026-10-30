import { useRef } from 'react';
import { Camera, CameraOff, ImageUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SAMPLES } from '../../js/engine.js';
import { Section } from './Field.jsx';
import { cn } from '@/lib/utils';

// The picture an image effect works on. Uploads and the webcam never leave this device.
export default function SourcePicker({ engine, extra = null }) {
  const fileRef = useRef(null);
  const src = engine.source;
  const live = src.kind === 'webcam';

  return (
    <Section title="Image" defaultOpen>
      <div className="flex flex-wrap gap-1">
        {SAMPLES.map((s) => (
          <button key={s} onClick={() => engine.setSourceSample(s)}
            className={cn('rounded-[3px] px-2 py-1 text-[11px] ring-1 transition-colors',
              src.kind === 'sample' && src.sample === s ? 'bg-foreground text-background ring-foreground' : 'text-muted-foreground ring-border hover:text-foreground')}>
            {s}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => fileRef.current?.click()}>
          <ImageUp className="size-3.5" /> Upload
        </Button>
        <Button variant={live ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => (live ? engine.stopWebcam() : engine.startWebcam())}>
          {live ? <><CameraOff className="size-3.5" /> Stop camera</> : <><Camera className="size-3.5" /> Webcam</>}
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) engine.setSourceFile(f); e.target.value = ''; }} />
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {src.kind === 'upload' ? `Using ${src.name}. ` : ''}Drop an image onto the visual, or paste one. Your images stay on this device and aren't saved in share links.
      </p>
      {extra && <div className="mt-2">{extra}</div>}
    </Section>
  );
}
