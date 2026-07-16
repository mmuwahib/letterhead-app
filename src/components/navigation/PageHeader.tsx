import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPageMeta, subscribePageMeta, type PageMeta } from '@/hooks/usePageMeta';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/upload': 'Upload Document',
  '/archive': 'Document Archive',
  '/templates': 'Letterhead Templates',
  '/logs': 'Activity Logs',
  '/users': 'User Management',
  '/approvals': 'Approvals',
  '/admin': 'Admin Portal',
};

interface Props {
  onOpenHelp: () => void;
}

/**
 * Renders breadcrumbs + page title + description above each page's content.
 * Pages opt-in by calling `usePageMeta(...)`; absent that, we fall back to
 * the route label.
 */
export default function PageHeader({ onOpenHelp }: Props) {
  const { pathname } = useLocation();
  const [meta, setMeta] = useState<PageMeta | null>(getPageMeta());

  useEffect(() => subscribePageMeta(() => setMeta(getPageMeta())), []);

  const fallbackTitle = ROUTE_LABELS[pathname] ?? '';
  const title = meta?.title ?? fallbackTitle;
  if (!title) return null;

  return (
    <div className="border-b bg-background/60 px-4 py-3 lg:px-6">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-foreground">
          <Home className="h-3 w-3" />
          Home
        </Link>
        {pathname !== '/' && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{title}</span>
          </>
        )}
      </nav>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {meta?.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onOpenHelp}
        >
          <HelpCircle className="mr-1.5 h-4 w-4" />
          About this page
        </Button>
      </div>
    </div>
  );
}