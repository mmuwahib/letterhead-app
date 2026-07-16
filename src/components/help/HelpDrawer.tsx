import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { BookOpen, Compass, Mail, CheckCircle2, Lightbulb } from 'lucide-react';
import { getPageHelp } from './pageHelp';
import { useAppTour, type TourId } from '@/components/tour/AppTour';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  helpKey: string | null;
  onOpenCommandPalette: () => void;
}

/**
 * Right-side sheet that surfaces page-specific guidance, plus generic shortcuts
 * (start tour, command palette, contact admin).
 */
export default function HelpDrawer({ open, onOpenChange, helpKey, onOpenCommandPalette }: Props) {
  const help = getPageHelp(helpKey);
  const { start, available } = useAppTour();

  const tourAvailable = help?.tourId && available.includes(help.tourId as TourId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <SheetTitle>{help?.title ?? 'Help'}</SheetTitle>
          <SheetDescription>
            {help?.summary ?? 'Tips and shortcuts for getting around Gulf Cryo Document Manager.'}
          </SheetDescription>
        </SheetHeader>

        {help && (
          <div className="mt-6 space-y-6">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                How this page works
              </h4>
              <ul className="space-y-2">
                {help.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>

            {help.tips && help.tips.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tips
                </h4>
                <ul className="space-y-2">
                  {help.tips.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="mt-6 space-y-2 border-t pt-6">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shortcuts
          </h4>
          {tourAvailable && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onOpenChange(false);
                setTimeout(() => void start(help!.tourId as TourId), 200);
              }}
            >
              <Compass className="mr-2 h-4 w-4" />
              Take the guided tour for this page
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => {
              onOpenChange(false);
              onOpenCommandPalette();
            }}
          >
            <span className="flex items-center gap-2">
              <Compass className="h-4 w-4" />
              Open command palette
            </span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href="mailto:?subject=Gulf%20Cryo%20Document%20Manager%20-%20Help">
              <Mail className="mr-2 h-4 w-4" />
              Email an admin
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}