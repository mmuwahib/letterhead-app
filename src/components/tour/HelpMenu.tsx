import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { HelpCircle, Compass, FileUp, Archive, ClipboardList, Mail, Sparkles, BookOpen, Search } from 'lucide-react';
import { useAppTour, type TourId } from './AppTour';
import GuidePickerDialog from './GuidePickerDialog';
import { useT } from '@/i18n';

const ICONS: Record<TourId, any> = {
  overview: Compass,
  upload: FileUp,
  archive: Archive,
  logs: ClipboardList,
};
const TITLE_KEYS: Record<TourId, string> = {
  overview: 'tour.guide.overview.title',
  upload: 'tour.guide.upload.title',
  archive: 'tour.guide.archive.title',
  logs: 'tour.guide.logs.title',
};

interface Props {
  onOpenPageHelp?: () => void;
  onOpenCommandPalette?: () => void;
}

export default function HelpMenu({ onOpenPageHelp, onOpenCommandPalette }: Props = {}) {
  const { start, available } = useAppTour();
  const { t } = useT();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" data-tour="help" title={t('tour.help')}>
            <HelpCircle className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {onOpenPageHelp && (
            <DropdownMenuItem onClick={onOpenPageHelp}>
              <BookOpen className="mr-2 h-4 w-4" />
              About this page
            </DropdownMenuItem>
          )}
          {onOpenCommandPalette && (
            <DropdownMenuItem onClick={onOpenCommandPalette}>
              <Search className="mr-2 h-4 w-4" />
              Search & quick actions
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
            </DropdownMenuItem>
          )}
          {(onOpenPageHelp || onOpenCommandPalette) && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => setPickerOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('tour.picker.title')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {available.map((id) => {
            const Icon = ICONS[id];
            return (
              <DropdownMenuItem key={id} onClick={() => { void start(id); }}>
                <Icon className="mr-2 h-4 w-4" />
                {t(TITLE_KEYS[id])}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="mailto:?subject=Gulf%20Cryo%20Document%20Manager%20-%20Help">
              <Mail className="mr-2 h-4 w-4" />
              {t('tour.contactAdmin')}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <GuidePickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}