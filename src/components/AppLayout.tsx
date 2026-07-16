import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileText, Upload, Archive, ClipboardList, Menu, X, LogOut, User, Sun, Moon, Settings, Languages, Plus, HelpCircle, UserCheck, Search, Pin, PinOff, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useT } from '@/i18n';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import PendingApprovalsBanner from '@/components/PendingApprovalsBanner';
import HelpMenu from '@/components/tour/HelpMenu';
import GuidePickerDialog from '@/components/tour/GuidePickerDialog';
import { hasCompletedLocal, markTourCompletedLocal, useAppTour, type TourId } from '@/components/tour/AppTour';
import CommandPalette from '@/components/navigation/CommandPalette';
import PageHeader from '@/components/navigation/PageHeader';
import HelpDrawer from '@/components/help/HelpDrawer';
import { getPageMeta, subscribePageMeta } from '@/hooks/usePageMeta';
import { usePinnedNav } from '@/hooks/usePinnedNav';
import { useLocation } from 'react-router-dom';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, profile, role, signOut, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useT();
  const { count: pendingCount, canApprove } = usePendingApprovals();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpKey, setHelpKey] = useState<string | null>(null);
  const { pathname } = useLocation();
  const { pins, toggle: togglePin, isPinned } = usePinnedNav();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('gc.nav.collapsed') === '1';
  });
  const { start: startTour } = useAppTour();

  // Allow any descendant component to launch a tour via a window event.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<TourId>).detail ?? 'overview';
      void startTour(id);
    };
    window.addEventListener('gc.start-tour', handler);
    return () => window.removeEventListener('gc.start-tour', handler);
  }, [startTour]);

  // Track current help key from page meta so the drawer is contextual.
  useEffect(() => {
    const update = () => setHelpKey(getPageMeta()?.helpKey ?? pathname);
    update();
    return subscribePageMeta(update);
  }, [pathname]);

  // Global ⌘K / Ctrl+K shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const setCollapsedPersistent = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem('gc.nav.collapsed', v ? '1' : '0'); } catch {}
  };

  useEffect(() => {
    if (!profile) return;
    if (profile.tourCompletedAt) return;
    if (hasCompletedLocal()) return;
    const timer = setTimeout(() => setWelcomeOpen(true), 600);
    return () => clearTimeout(timer);
  }, [profile]);

  const isStaff = role === 'admin' || role === 'manager';
  const personalLogs = !isStaff && !hasPermission('view_logs');

  // Sidebar groups: "Work" = day-to-day actions, "Manage" = admin/oversight.
  // Templates appear under Work for managers (their primary task) and under
  // Manage for admins (governance).
  const groups = [
    {
      label: isStaff ? t('nav.work') : t('nav.myWorkspace'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), roles: ['admin', 'manager', 'user'] as const },
        { to: '/upload', icon: Upload, label: t('nav.upload'), roles: ['admin'] as const, permission: 'upload' },
        { to: '/archive', icon: Archive, label: t('nav.archive'), roles: ['admin'] as const, permission: 'view_archive' },
        { to: '/templates', icon: FileText, label: t('nav.templates'), roles: ['admin', 'manager'] as const, permission: 'manage_templates' },
      ],
    },
    {
      label: t('nav.manage'),
      items: [
        { to: '/logs', icon: ClipboardList, label: personalLogs ? 'My Activity' : t('nav.logs'), roles: ['admin', 'manager', 'user'] as const },
        { to: '/approvals', icon: UserCheck, label: 'Approvals', roles: ['admin'] as const, permission: 'approve_users', badge: pendingCount },
        { to: '/admin', icon: Settings, label: t('nav.admin'), roles: ['admin'] as const },
      ],
    },
  ];

  const visibleGroups = groups
    .map(g => ({
      ...g,
      items: g.items.filter(i =>
        (i.roles as readonly string[]).includes(role) ||
        ((i as any).permission && hasPermission((i as any).permission))
      ),
    }))
    .filter(g => g.items.length > 0);

  // Always show Approvals to anyone allowed to approve, even if perm bundle isn't named.
  if (canApprove && !visibleGroups.some(g => g.items.some(i => i.to === '/approvals'))) {
    const manageGroup = visibleGroups.find(g => g.label === t('nav.manage'));
    const item = { to: '/approvals', icon: UserCheck, label: 'Approvals', roles: ['admin','manager','user'] as any, permission: 'approve_users', badge: pendingCount } as any;
    if (manageGroup) manageGroup.items.push(item);
    else visibleGroups.push({ label: t('nav.manage'), items: [item] } as any);
  }

  // Quick action is now shown to everyone with upload permission (launchpad pattern).
  const showQuickCreate = hasPermission('upload');

  // Build pinned items from any visible nav item the user has pinned.
  const allItems = visibleGroups.flatMap((g) => g.items);
  const pinnedItems = pins
    .map((p) => allItems.find((i) => i.to === p))
    .filter(Boolean) as typeof allItems;
  const isSuspended = !!profile?.bannedAt;
  const isApproved = !!profile?.approvedAt || role === 'admin';
  const statusBadge = isSuspended
    ? { label: t('nav.statusSuspended'), cls: 'bg-destructive/15 text-destructive border-destructive/30' }
    : isApproved
    ? { label: t('nav.statusActive'), cls: 'bg-success/15 text-success border-success/30' }
    : { label: t('nav.statusPending'), cls: 'bg-warning/15 text-warning border-warning/30' };
  const scopeLine = [profile?.legalEntityName, profile?.officeSiteName, profile?.departmentName]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-foreground/50 lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground transition-all lg:static lg:translate-x-0",
          collapsed ? "lg:w-16" : "lg:w-64",
          "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn(
          "flex items-center gap-3 border-b border-sidebar-border py-5",
          collapsed ? "lg:justify-center lg:px-2 px-6" : "px-6",
        )}>
          <div data-tour="brand" className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            GC
          </div>
          <div className={cn(collapsed && "lg:hidden")}>
            <h1 className="text-sm font-bold text-sidebar-primary-foreground">Gulf Cryo</h1>
            <p className="text-xs text-sidebar-foreground/60">Document Manager</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-sidebar-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {showQuickCreate && (
            <Tooltip delayDuration={collapsed ? 100 : 1000}>
              <TooltipTrigger asChild>
                <NavLink
                  to="/upload"
                  data-tour="quick-create"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm transition-opacity hover:opacity-90",
                    collapsed ? "lg:justify-center lg:px-2 px-3 py-2.5" : "px-3 py-2.5",
                  )}
                >
                  <Plus className="h-4 w-4" />
                  <span className={cn(collapsed && "lg:hidden")}>{t('nav.quickCreate')}</span>
                </NavLink>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">{t('nav.quickCreate')}</TooltipContent>}
            </Tooltip>
          )}
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed ? "lg:justify-center lg:px-2 lg:py-2 px-3 py-2" : "px-3 py-2",
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("flex-1 text-left", collapsed && "lg:hidden")}>Search…</span>
            <kbd className={cn("rounded bg-sidebar-accent/60 px-1.5 py-0.5 font-mono text-[10px]", collapsed && "lg:hidden")}>⌘K</kbd>
          </button>

          {pinnedItems.length > 0 && (
            <div className="space-y-1">
              <p className={cn(
                "px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40",
                collapsed && "lg:hidden",
              )}>
                Pinned
              </p>
              {pinnedItems.map((item) => (
                <SidebarItem
                  key={`pin-${item.to}`}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  badge={(item as any).badge}
                  isPinned
                  collapsed={collapsed}
                  onTogglePin={() => togglePin(item.to)}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </div>
          )}
          {visibleGroups.map(group => (
            <div key={group.label} className="space-y-1">
              <p className={cn(
                "px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40",
                collapsed && "lg:hidden",
              )}>
                {group.label}
              </p>
              {group.items.map(item => (
                <SidebarItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  badge={(item as any).badge}
                  isPinned={isPinned(item.to)}
                  collapsed={collapsed}
                  onTogglePin={() => togglePin(item.to)}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </div>
          ))}
          {!isStaff && (
            <a
              href="mailto:?subject=Access%20request%20-%20Gulf%20Cryo%20Document%20Manager"
              className={cn(
                "mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                collapsed && "lg:hidden",
              )}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {t('nav.needAccess')}
            </a>
          )}
        </nav>

        {/* User info & logout */}
        <div className={cn("border-t border-sidebar-border p-4", collapsed && "lg:px-2")}>
          <button
            onClick={() => setCollapsedPersistent(!collapsed)}
            className="mb-3 hidden w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground lg:flex"
          >
            {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            <span className={cn(collapsed && "lg:hidden")}>Collapse</span>
          </button>
          <div data-tour="user" className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent">
              <User className="h-4 w-4 text-sidebar-foreground" />
            </div>
            <div className={cn("flex-1 min-w-0", collapsed && "lg:hidden")}>
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {profile?.fullName || user?.email}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-sidebar-foreground/50 capitalize">{role}</span>
                <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px] font-medium', statusBadge.cls)}>
                  {statusBadge.label}
                </Badge>
              </div>
            </div>
          </div>
          {scopeLine && !collapsed && (
            <p className="mb-3 truncate px-1 text-[11px] text-sidebar-foreground/50" title={scopeLine}>
              {scopeLine}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
              collapsed ? "lg:justify-center justify-start" : "justify-start",
            )}
            onClick={signOut}
            title={t('nav.signOut')}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            <span className={cn(collapsed && "lg:hidden")}>{t('nav.signOut')}</span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b px-4 py-3 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Gulf Cryo Document Letterhead Management
          </span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
            title="Search and run actions"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 md:ml-2" data-tour="header-actions">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setPaletteOpen(true)}
              title="Search"
            >
              <Search className="h-5 w-5" />
            </Button>
            <HelpMenu onOpenPageHelp={() => setHelpOpen(true)} onOpenCommandPalette={() => setPaletteOpen(true)} />
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
              title={locale === 'en' ? 'العربية' : 'English'}
            >
              <Languages className="h-5 w-5" />
            </Button>
          </div>
        </header>
        <PendingApprovalsBanner />
        <PageHeader onOpenHelp={() => setHelpOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <GuidePickerDialog
        open={welcomeOpen}
        onClose={() => { setWelcomeOpen(false); markTourCompletedLocal(); }}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <HelpDrawer
        open={helpOpen}
        onOpenChange={setHelpOpen}
        helpKey={helpKey}
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />
    </div>
  );
}

/* ----------------------------- Sidebar item ------------------------------ */

interface SidebarItemProps {
  to: string;
  icon: any;
  label: string;
  badge?: number | null;
  isPinned: boolean;
  collapsed: boolean;
  onTogglePin: () => void;
  onNavigate: () => void;
}

function SidebarItem({
  to, icon: Icon, label, badge, isPinned, collapsed, onTogglePin, onNavigate,
}: SidebarItemProps) {
  const link = (
    <NavLink
      to={to}
      data-tour={`nav-${to}`}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
          collapsed ? 'lg:justify-center lg:px-2 lg:py-2 px-3 py-2.5' : 'px-3 py-2.5',
          isActive
            ? 'bg-sidebar-accent text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
      {badge ? (
        <Badge className={cn(
          "h-5 min-w-[20px] justify-center bg-warning px-1.5 text-[10px] font-semibold text-warning-foreground hover:bg-warning",
          collapsed && "lg:hidden",
        )}>
          {badge}
        </Badge>
      ) : null}
      {isPinned && !collapsed && (
        <Pin className="h-3 w-3 shrink-0 text-sidebar-foreground/40" />
      )}
    </NavLink>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {collapsed ? (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onTogglePin}>
          {isPinned ? (
            <><PinOff className="mr-2 h-4 w-4" />Unpin from top</>
          ) : (
            <><Pin className="mr-2 h-4 w-4" />Pin to top</>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
