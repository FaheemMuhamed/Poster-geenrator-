import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useEngine } from '../useEngine.js';
import { CONFIG } from '../config.js';

export default function FeedbackDialog() {
  const engine = useEngine();
  // Hidden fields so feedback arrives with the mode and a link to the poster in question.
  const params = new URLSearchParams({
    hideTitle: '1', transparentBackground: '1', dynamicHeight: '1',
    mode: engine.state.mode, poster: location.href,
  });
  const mail = `mailto:${CONFIG.FEEDBACK_EMAIL}?subject=${encodeURIComponent('Poster Generator feedback')}&body=${encodeURIComponent(`\n\n—\nMode: ${engine.state.mode}\nPoster: ${location.href}`)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12px]">
          <MessageSquare className="size-3.5" /> Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[17px]">Send feedback</DialogTitle>
          <DialogDescription className="text-[13px]">Ideas for new effects, bugs, or posters you made. Your current mode and poster link are attached.</DialogDescription>
        </DialogHeader>
        {CONFIG.TALLY_FORM_ID ? (
          <iframe
            title="Feedback form"
            src={`https://tally.so/embed/${CONFIG.TALLY_FORM_ID}?${params}`}
            className="h-[min(560px,70vh)] w-full rounded-md border-0"
            loading="lazy"
          />
        ) : CONFIG.FEEDBACK_EMAIL ? (
          <Button asChild className="w-full"><a href={mail}>Write an email</a></Button>
        ) : (
          <p className="rounded-md bg-neutral-50 p-3 text-[12px] text-neutral-500">
            The feedback form isn't connected yet. Add a Tally form id in <code>src/config.js</code>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
