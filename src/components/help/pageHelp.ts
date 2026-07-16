export interface PageHelp {
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  /** Optional tour id to launch from the drawer. */
  tourId?: 'overview' | 'upload' | 'archive' | 'logs';
}

/**
 * Per-page contextual help. Keyed by route path. Pages can also pass a custom
 * `helpKey` via usePageMeta if a page wants to share help with another route.
 */
export const PAGE_HELP: Record<string, PageHelp> = {
  '/': {
    title: 'Dashboard',
    summary:
      'Your home base. See your scope, recent activity, and shortcuts to the things you do most.',
    steps: [
      'Use the cards at the top to jump straight to common tasks.',
      'Scroll down for charts and breakdowns by entity, site, or department.',
      'Click any recent document to open it in the archive.',
    ],
    tips: ['Press ⌘K (or Ctrl+K) anywhere to jump to a page or document.'],
    tourId: 'overview',
  },
  '/upload': {
    title: 'Create a letterhead',
    summary: 'Pick a template, attach your file, preview, then download the finalized PDF.',
    steps: [
      'Choose a letterhead template that matches your entity or site.',
      'Drop or select a PDF, Word, image, or text file.',
      'Click "Build preview" and review the result on the right.',
      'Download the finalized PDF — it will appear in the archive automatically.',
    ],
    tips: ['Templates with higher resolution print sharper. Use the "Re-render HD" action on the Templates page if a logo looks fuzzy.'],
    tourId: 'upload',
  },
  '/templates': {
    title: 'Letterhead templates',
    summary: 'Manage the templates everyone uses to generate documents.',
    steps: [
      'Click a template card to edit its content and layout.',
      'Use "Re-render HD" to refresh the background at higher resolution.',
      'Set the scope (entity / site) so only the right people see it.',
    ],
  },
  '/archive': {
    title: 'Document archive',
    summary: 'Find, filter and re-download every document you have access to.',
    steps: [
      'Use the search bar to find by serial, file name, or user.',
      'Combine filters (entity, site, date) to narrow the list.',
      'Use "Export CSV" to download the filtered list.',
    ],
    tourId: 'archive',
  },
  '/logs': {
    title: 'Activity logs',
    summary: 'Audit every action across the system.',
    steps: [
      'Filter by action type (create, download, approval...) or by date.',
      'Click an event to see who, what, and where.',
    ],
    tourId: 'logs',
  },
  '/approvals': {
    title: 'User approvals',
    summary: 'Review users waiting for access and approve or reject them.',
    steps: [
      'Pending users show their entity and department so you can verify scope.',
      'Approve to grant immediate access. Reject to remove the request.',
    ],
  },
  '/users': {
    title: 'User management',
    summary: 'View and manage existing users, their roles, and their scopes.',
    steps: [
      'Click a user to edit their roles and scope.',
      'Suspend a user to revoke access without deleting their history.',
    ],
  },
  '/admin': {
    title: 'Admin portal',
    summary: 'Manage entities, sites, and departments that drive scoping across the app.',
    steps: [
      'Add or rename legal entities, office sites, and departments here.',
      'Changes here propagate to user profiles and templates immediately.',
    ],
  },
};

export function getPageHelp(key: string | undefined | null): PageHelp | null {
  if (!key) return null;
  return PAGE_HELP[key] ?? null;
}