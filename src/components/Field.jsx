import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

function fmt(v, step) {
  if (typeof v !== 'number') return v;
  if (!step || step >= 1) return Math.round(v).toLocaleString();
  const d = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));
  return v.toFixed(d);
}

export function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-2.5 py-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-normal text-muted-foreground">{label}</Label>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{fmt(value, step)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step ?? (max - min) / 100} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

export function SwitchField({ label, value, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </label>
  );
}

export function SelectField({ label, value, options, onChange }) {
  // options: array of strings, or [{ value, label }]
  const items = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="shrink-0 text-[12px] font-normal text-muted-foreground">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(items.find((i) => String(i.value) === v)?.value ?? v)}>
        <SelectTrigger size="sm" className="h-8 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {items.map((i) => <SelectItem key={String(i.value)} value={String(i.value)} className="text-[12px]">{i.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <div className="space-y-1.5 py-1">
      {label && <Label className="text-[12px] font-normal text-muted-foreground">{label}</Label>}
      <Input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-8 text-[12px]" />
    </div>
  );
}

// Renders the right control for a mode parameter definition.
export function ParamField({ def, value, onChange }) {
  const label = def.label;
  if (def.options) return <SelectField label={label} value={value} options={def.options} onChange={onChange} />;
  if (typeof def.value === 'boolean') return <SwitchField label={label} value={value} onChange={onChange} />;
  if (typeof def.value === 'string') return <TextField label={label} value={value} onChange={onChange} />;
  return <SliderField label={label} value={value} min={def.min} max={def.max} step={def.step} onChange={onChange} />;
}

// A titled group. Essentials sit open with no header chrome; other groups fold.
export function Section({ title, children, defaultOpen = false, collapsible = true, aside }) {
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  return (
    <section className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          disabled={!collapsible}
          onClick={() => setOpen(!open)}
          className={cn('flex flex-1 items-center gap-1.5 text-left', collapsible ? 'cursor-pointer' : 'cursor-default')}
        >
          {collapsible && <ChevronRight className={cn('size-3.5 text-muted-foreground/70 transition-transform', open && 'rotate-90')} />}
          <span className="text-[12px] font-medium text-foreground">{title}</span>
        </button>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
