import { Heart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FONTS_LIBRARY } from '../../js/shared/fonts.js';
import { CONFIG } from '../config.js';

export default function SupportDialog() {
  const ready = !!CONFIG.DONATE_URL;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12px]">
          <Heart className="size-3.5" /> Support
        </Button>
      </DialogTrigger>
      {/* minmax(0,1fr): long credit lines truncate instead of widening the dialog */}
      <DialogContent className="max-w-md grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 p-6 pb-4">
          <DialogTitle className="text-[17px]">Support Poster Generator</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            It's free and open source. If it saved you an afternoon, a small contribution keeps new effects and typefaces coming.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          {ready ? (
            <>
              <Button asChild className="h-10 w-full gap-2">
                <a href={CONFIG.DONATE_URL} target="_blank" rel="noreferrer"><Heart className="size-4" /> Support on Gumroad</a>
              </Button>
              <p className="mt-2 text-[11px] text-neutral-400">You choose the amount. Payment opens in a new tab and is handled securely by Gumroad.</p>
            </>
          ) : (
            <p className="rounded-md bg-neutral-50 p-3 text-[12px] text-neutral-500">Donations open soon.</p>
          )}
          <Button variant="ghost" asChild className="mt-3 w-full gap-2 text-[12px]">
            <a href={CONFIG.REPO_URL} target="_blank" rel="noreferrer"><Star className="size-4" /> Star it on GitHub</a>
          </Button>
        </div>

        <div className="mt-4 border-t border-neutral-100 px-6 pb-6 pt-4">
          <div className="mb-2 text-[12px] font-medium">Typefaces & credits</div>
          <ScrollArea className="h-44 pr-3">
            <ul className="space-y-1.5 text-[12px]">
              {FONTS_LIBRARY.map((f) => (
                <li key={f.name} className="flex min-w-0 items-baseline gap-2">
                  <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0 hover:underline" style={{ fontFamily: `"${f.family}", Inter` }}>{f.name}</a>
                  <span className="min-w-0 truncate text-[11px] text-neutral-400">{f.foundry} · {f.license}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">Built with p5.js, three.js and shadcn/ui.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
