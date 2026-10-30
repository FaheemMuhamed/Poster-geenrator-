import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FONTS_LIBRARY, FONT_CATEGORIES, fontByName } from '../../js/shared/fonts.js';
import { cn } from '@/lib/utils';

const sample = (f) => `400 16px "${f.family}"`;

// Fonts only download when shown, so warm up the visible list once the picker opens.
function useWarmFonts(open, list) {
  useEffect(() => {
    if (!open) return;
    list.forEach((f) => document.fonts.load(sample(f)).catch(() => {}));
  }, [open, list]);
}

export default function FontPicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState('All');
  const list = cat === 'All' ? FONTS_LIBRARY : FONTS_LIBRARY.filter((f) => f.category === cat);
  useWarmFonts(open, list);
  const current = fontByName(value);

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-[12px] text-neutral-600">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-8 w-[170px] items-center justify-between rounded-md border border-neutral-200 bg-white px-2.5 text-left text-[13px] hover:border-neutral-400">
            <span className="truncate" style={{ fontFamily: `"${current?.family || value}"` }}>{current?.name || value}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-neutral-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search typefaces" className="text-[12px]" />
            <div className="flex flex-wrap gap-1 border-b border-neutral-100 px-2 py-2">
              {['All', ...FONT_CATEGORIES].map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  className={cn('rounded-full px-2 py-0.5 text-[11px]', cat === c ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100')}>
                  {c}
                </button>
              ))}
            </div>
            <CommandList className="max-h-[340px]">
              <CommandEmpty className="py-6 text-center text-[12px] text-neutral-500">No typeface with that name.</CommandEmpty>
              <CommandGroup>
                {list.map((f) => (
                  <CommandItem key={f.name} value={`${f.name} ${f.foundry} ${f.category}`} onSelect={() => { onChange(f.name); setOpen(false); }} className="flex items-center gap-2 py-2">
                    <Check className={cn('size-3.5 shrink-0', value === f.name ? 'opacity-100' : 'opacity-0')} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] leading-tight" style={{ fontFamily: `"${f.family}", Inter` }}>{f.name}</div>
                      <div className="truncate text-[10.5px] text-neutral-400">{f.foundry.replace(/\s*\(.*\)$/, '')} · {f.category}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
