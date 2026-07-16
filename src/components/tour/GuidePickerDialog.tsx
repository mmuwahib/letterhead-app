import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { Sparkles, Compass, FileUp, Archive, ClipboardList, ChevronRight } from 'lucide-react';
import { useAppTour, type TourId } from './AppTour';

const META: Record<TourId, { icon: any; minutes: number; titleKey: string; bodyKey: string }> = {
  overview: { icon: Compass, minutes: 1, titleKey: 'tour.guide.overview.title', bodyKey: 'tour.guide.overview.body' },
  upload:   { icon: FileUp, minutes: 2, titleKey: 'tour.guide.upload.title',   bodyKey: 'tour.guide.upload.body' },
  archive:  { icon: Archive, minutes: 1, titleKey: 'tour.guide.archive.title', bodyKey: 'tour.guide.archive.body' },
  logs:     { icon: ClipboardList, minutes: 1, titleKey: 'tour.guide.logs.title', bodyKey: 'tour.guide.logs.body' },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GuidePickerDialog({ open, onClose }: Props) {
  const { t } = useT();
  const { available, start } = useAppTour();

  const launch = (id: TourId) => {
    onClose();
    setTimeout(() => { void start(id); }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">{t('tour.picker.title')}</DialogTitle>
          <DialogDescription className="text-center">{t('tour.picker.body')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {available.map((id) => {
            const m = META[id];
            const Icon = m.icon;
            return (
              <button
                key={id}
                onClick={() => launch(id)}
                className="group flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(m.titleKey)}</p>
                  <p className="truncate text-xs text-muted-foreground">{t(m.bodyKey)}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {m.minutes} {t('tour.picker.minutes')}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={onClose}>{t('tour.picker.skip')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}