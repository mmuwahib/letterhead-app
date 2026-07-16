import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, FileText, Upload, Archive, ClipboardList, Settings,
  UserCheck, Users, Compass, Sun, Moon, Languages, FileIcon, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useT } from '@/i18n';
import { useAppTour } from '@/components/tour/AppTour';
import { useRecentDocuments } from '@/hooks/useRecentDocuments';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global ⌘K command palette: jump to any accessible page, run quick actions,
 * or open a recent document.
 */
export default function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { role, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale } = useT();
  const { start } = useAppTour();
  const { rows: recents } = useRecentDocuments(5, open);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const isStaff = role === 'admin' || role === 'manager';

  const navItems = useMemo(() => {
    const items: Array<{ to: string; label: string; icon: any; show: boolean }> = [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true },
      { to: '/upload', label: 'Upload Document', icon: Upload, show: hasPermission('upload') },
      { to: '/archive', label: 'Document Archive', icon: Archive, show: hasPermission('view_archive') },
      { to: '/templates', label: 'Letterhead Templates', icon: FileText, show: hasPermission('manage_templates') || isStaff },
      { to: '/logs', label: 'Activity Logs', icon: ClipboardList, show: hasPermission('view_logs') || isStaff },
      { to: '/approvals', label: 'Approvals', icon: UserCheck, show: hasPermission('approve_users') || role === 'admin' },
      { to: '/users', label: 'User Management', icon: Users, show: role === 'admin' },
      { to: '/admin', label: 'Admin Portal', icon: Settings, show: role === 'admin' },
    ];
    return items.filter((i) => i.show);
  }, [hasPermission, role, isStaff]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search pages, documents, or actions…"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {navItems.map((i) => (
            <CommandItem key={i.to} value={`page ${i.label} ${i.to}`} onSelect={() => go(i.to)}>
              <i.icon className="mr-2 h-4 w-4" />
              {i.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {recents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent documents">
              {recents.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`doc ${d.serial_number ?? ''} ${d.original_filename ?? ''} ${d.template_name ?? ''}`}
                  onSelect={() => go('/archive')}
                >
                  <FileIcon className="mr-2 h-4 w-4" />
                  <span className="truncate">{d.original_filename ?? d.serial_number ?? 'Document'}</span>
                  {d.serial_number && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{d.serial_number}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          {hasPermission('upload') && (
            <CommandItem value="action upload new document" onSelect={() => go('/upload')}>
              <Upload className="mr-2 h-4 w-4" />
              New document upload
            </CommandItem>
          )}
          <CommandItem
            value="action start tour guide"
            onSelect={() => {
              onOpenChange(false);
              setTimeout(() => void start('overview'), 200);
            }}
          >
            <Compass className="mr-2 h-4 w-4" />
            Start the overview tour
          </CommandItem>
          <CommandItem
            value="action toggle theme dark light"
            onSelect={() => {
              toggleTheme();
              onOpenChange(false);
            }}
          >
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </CommandItem>
          <CommandItem
            value="action switch language arabic english"
            onSelect={() => {
              setLocale(locale === 'en' ? 'ar' : 'en');
              onOpenChange(false);
            }}
          >
            <Languages className="mr-2 h-4 w-4" />
            Switch to {locale === 'en' ? 'العربية' : 'English'}
          </CommandItem>
          <CommandItem
            value="action whats new sparkles"
            onSelect={() => {
              onOpenChange(false);
              setTimeout(() => void start('overview'), 200);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            What's new — quick recap
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}