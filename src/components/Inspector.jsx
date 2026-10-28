import { Dices } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PALETTES, MODES } from '../../js/engine.js';
import { controlSections } from '../../js/modes/controls.js';
import { FONTS } from '../../js/shared/typeLayer.js';
import { useEngine } from '../useEngine.js';
import { ParamField, Section, SelectField, SliderField, SwitchField, TextField } from './Field.jsx';
import LayoutPicker from './LayoutPicker.jsx';
import { cn } from '@/lib/utils';

const COLOR_KEYS = [['bg', 'Background'], ['ink', 'Ink'], ['c1', 'Accent 1'], ['c2', 'Accent 2'], ['c3', 'Accent 3'], ['c4', 'Accent 4']];

// One-click looks for 3D + shader modes. Each preset sets every effect.
const FX_ZERO = { bloom: 0, soft: 0, halftone: false, halftoneSize: 7, dither: false, ditherLevels: 3, threshold: false, grain: 0, chroma: 0, rgbShift: 0, pixelate: 0, vignette: 0 };
const FX_PRESETS = {
  'Clean':      { grain: 0.12 },
  'Soft print': { soft: 0.5, grain: 0.22, vignette: 0.3 },
  'Dreamy':     { bloom: 1, soft: 0.6, grain: 0.15 },
  'Halftone':   { halftone: true, halftoneSize: 7, grain: 0.08 },
  'Riso':       { dither: true, ditherLevels: 3, grain: 0.25, chroma: 0.6 },
  '2-colour':   { threshold: true, dither: true },
  'Glitch':     { rgbShift: 1.5, chroma: 1.2, grain: 0.2 },
  'Pixel':      { pixelate: 10, dither: true, ditherLevels: 4 },
};
const presetValues = (name) => ({ ...FX_ZERO, ...FX_PRESETS[name] });
const matchPreset = (fx) => Object.keys(FX_PRESETS).find((n) => Object.entries(presetValues(n)).every(([k, v]) => fx[k] === v));

function ShapeTab({ engine }) {
  const { state, mode } = engine;
  const values = state.params[mode.id];
  const sections = controlSections(mode);
  return (
    <>
      {sections.map((s) => (
        <Section key={s.title} title={s.title} collapsible={!s.essential} defaultOpen={s.essential}>
          {s.keys.map((k) => (
            <ParamField key={k} def={mode.params[k]} value={values[k]} onChange={(v) => engine.setParam(k, v)} />
          ))}
        </Section>
      ))}
      <Section title="Motion">
        <SliderField label="Speed" value={state.motion.speed} min={0} max={3} step={0.01} onChange={(v) => engine.setMotion('speed', v)} />
        <SliderField label="Mouse power" value={state.motion.mouse} min={0} max={3} step={0.01} onChange={(v) => engine.setMotion('mouse', v)} />
      </Section>
      <Section title="Variation" defaultOpen>
        <div className="flex items-center gap-2">
          <Input type="number" value={state.seed} min={0} max={99999} onChange={(e) => engine.setSeed(Number(e.target.value) || 0)} className="h-8 font-mono text-[12px]" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => engine.randomise()}><Dices className="size-3.5" /> New</Button>
        </div>
      </Section>
    </>
  );
}

function ColourTab({ engine }) {
  const { state } = engine;
  return (
    <>
      <Section title="Palette" collapsible={false}>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PALETTES).map(([name, p]) => (
            <button
              key={name}
              onClick={() => engine.setPalette(name)}
              className={cn('overflow-hidden rounded-md border text-left transition', state.palette === name ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400')}
            >
              <div className="flex h-7">{[p.bg, p.c1, p.c2, p.c3, p.c4, p.ink].map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}</div>
              <div className="px-2 py-1 text-[11px] text-neutral-600">{name}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Fine-tune colours">
        <div className="space-y-1">
          {COLOR_KEYS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-neutral-50">
              <span className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: state.colors[k] }}>
                <input type="color" value={state.colors[k]} onChange={(e) => engine.setColor(k, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
              </span>
              <span className="flex-1 text-[12px] text-neutral-600">{label}</span>
              <span className="font-mono text-[11px] uppercase text-neutral-400">{state.colors[k]}</span>
            </label>
          ))}
        </div>
      </Section>
    </>
  );
}

function TypeTab({ engine }) {
  const { state } = engine;
  const t = state.text;
  const owns = engine.mode?.ownsText;
  return (
    <>
      <Section title="Words" collapsible={false} aside={<Switch checked={t.show} onCheckedChange={(v) => engine.setText('show', v)} />}>
        {owns && <p className="mb-2 rounded-md bg-neutral-50 px-2.5 py-2 text-[11px] leading-relaxed text-neutral-500">This mode sets the words inside the artwork itself.</p>}
        <Input value={t.lines.title} onChange={(e) => engine.setText('title', e.target.value)} placeholder="Title" className="mb-1.5 h-9 text-[14px] font-medium" />
        <TextField value={t.lines.subtitle} placeholder="Subtitle" onChange={(v) => engine.setText('subtitle', v)} />
        <div className="grid grid-cols-2 gap-2">
          <TextField value={t.lines.date} placeholder="Date" onChange={(v) => engine.setText('date', v)} />
          <TextField value={t.lines.venue} placeholder="Venue" onChange={(v) => engine.setText('venue', v)} />
        </div>
        <TextField value={t.lines.footer} placeholder="Footer" onChange={(v) => engine.setText('footer', v)} />
      </Section>
      <Section title="Layout" defaultOpen aside={
        <label className="flex items-center gap-1.5 text-[11px] normal-case tracking-normal text-neutral-500" onClick={(e) => e.stopPropagation()}>
          Grid <Switch checked={t.grid} onCheckedChange={(v) => engine.setText('grid', v)} className="scale-75" />
        </label>
      }>
        <LayoutPicker state={state} onPick={(l) => engine.setText('layout', l)} />
      </Section>
      <Section title="Typeface" defaultOpen>
        <SelectField label="Font" value={t.font} options={FONTS} onChange={(v) => engine.setText('font', v)} />
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-[12px] text-neutral-600">Weight</span>
          <ToggleGroup type="single" variant="outline" size="sm" value={String(t.weight)} onValueChange={(v) => v && engine.setText('weight', Number(v))}>
            {[[400, 'Rg'], [500, 'Md'], [700, 'Bd'], [900, 'Bk']].map(([w, l]) => <ToggleGroupItem key={w} value={String(w)} className="px-2.5 text-[11px]">{l}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <SliderField label="Size" value={t.size} min={0.4} max={2.5} step={0.01} onChange={(v) => engine.setText('size', v)} />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-[12px] text-neutral-600">Colour</span>
          <div className="flex gap-1.5">
            {COLOR_KEYS.map(([k, label]) => (
              <button key={k} title={label} onClick={() => engine.setText('color', k)}
                className={cn('size-5 rounded-full ring-1 ring-black/10', t.color === k && 'ring-2 ring-neutral-900 ring-offset-2')}
                style={{ background: state.colors[k] }} />
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

function FinishTab({ engine }) {
  const { state, mode } = engine;
  if (mode.engine !== 'three') {
    return (
      <>
        <Section title="Background" collapsible={false}>
          <SliderField label="Gradient bloom" value={state.bloom.amount} min={0} max={1} step={0.01} onChange={(v) => engine.setBloom('amount', v)} />
          <SliderField label="Bloom blobs" value={state.bloom.count} min={1} max={6} step={1} onChange={(v) => engine.setBloom('count', v)} />
        </Section>
        <Section title="Texture" collapsible={false}>
          <SliderField label="Film grain" value={state.grain} min={0} max={1} step={0.01} onChange={(v) => engine.setGrain(v)} />
        </Section>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-neutral-400">Halftone, dither, glow and other print effects are available in the 3D and Shader modes.</p>
      </>
    );
  }
  const fx = state.fx;
  const active = matchPreset(fx);
  const set = (k) => (v) => engine.setFx(k, v);
  return (
    <>
      <Section title="Look" collapsible={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(FX_PRESETS).map((name) => (
            <Button key={name} variant={active === name ? 'default' : 'outline'} size="sm" className="h-8 justify-start text-[12px] font-normal"
              onClick={() => engine.applyFx(presetValues(name))}>{name}</Button>
          ))}
        </div>
        {!active && <p className="mt-2 text-[11px] text-neutral-400">Custom mix</p>}
      </Section>
      <Section title="Light">
        <SliderField label="Glow" value={fx.bloom} min={0} max={3} step={0.01} onChange={set('bloom')} />
        <SliderField label="Soft focus" value={fx.soft} min={0} max={2} step={0.01} onChange={set('soft')} />
        <SliderField label="Vignette" value={fx.vignette} min={0} max={1} step={0.01} onChange={set('vignette')} />
      </Section>
      <Section title="Print">
        <SwitchField label="Halftone" value={fx.halftone} onChange={set('halftone')} />
        {fx.halftone && <SliderField label="Dot size" value={fx.halftoneSize} min={3} max={30} step={1} onChange={set('halftoneSize')} />}
        <SwitchField label="Dither" value={fx.dither} onChange={set('dither')} />
        {fx.dither && <SliderField label="Levels" value={fx.ditherLevels} min={2} max={8} step={1} onChange={set('ditherLevels')} />}
        <SwitchField label="2-colour" value={fx.threshold} onChange={set('threshold')} />
        <SliderField label="Film grain" value={fx.grain} min={0} max={1} step={0.01} onChange={set('grain')} />
      </Section>
      <Section title="Distort">
        <SliderField label="Chromatic edge" value={fx.chroma} min={0} max={3} step={0.01} onChange={set('chroma')} />
        <SliderField label="Glitch" value={fx.rgbShift} min={0} max={3} step={0.01} onChange={set('rgbShift')} />
        <SliderField label="Pixelate" value={fx.pixelate} min={0} max={40} step={1} onChange={set('pixelate')} />
      </Section>
    </>
  );
}

export default function Inspector() {
  const engine = useEngine();
  const mode = engine.mode;
  if (!mode) return <aside className="w-[300px] shrink-0 border-l border-neutral-200 bg-white" />;
  const group = MODES.find((m) => m.id === mode.id)?.group;
  return (
    <aside className="flex h-[45vh] w-full shrink-0 flex-col border-t border-neutral-200 bg-white md:h-auto md:w-[300px] md:border-l md:border-t-0">
      <div className="px-4 pb-3 pt-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">{group}</div>
        <h2 className="text-[15px] font-semibold tracking-tight">{mode.name}</h2>
        {mode.hint && <p className="mt-0.5 text-[12px] text-neutral-500">{mode.hint}</p>}
      </div>
      <Tabs defaultValue="shape" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="px-4 pb-1">
          <TabsList className="grid h-8 w-full grid-cols-4">
            {['shape', 'colour', 'type', 'finish'].map((t) => (
              <TabsTrigger key={t} value={t} className="text-[12px] capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="shape" className="mt-0"><ShapeTab engine={engine} /></TabsContent>
          <TabsContent value="colour" className="mt-0"><ColourTab engine={engine} /></TabsContent>
          <TabsContent value="type" className="mt-0"><TypeTab engine={engine} /></TabsContent>
          <TabsContent value="finish" className="mt-0"><FinishTab engine={engine} /></TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
