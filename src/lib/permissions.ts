export const PERMISSION_KEYS = [
  'upload',
  'view_archive',
  'manage_templates',
  'view_logs',
  'manage_users',
  'approve_users',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

export const PERMISSION_LABELS: Record<PermissionKey, { title: string; hint: string }> = {
  upload: { title: 'Upload documents', hint: 'Generate letterhead PDFs and serial numbers.' },
  view_archive: { title: 'View document archive', hint: 'Browse the global document archive.' },
  manage_templates: { title: 'Manage letterhead templates', hint: 'Create, edit, and delete templates.' },
  view_logs: { title: 'View activity logs', hint: 'Read the audit trail.' },
  manage_users: { title: 'Manage users', hint: 'Edit roles, scopes, departments, ban/unban.' },
  approve_users: { title: 'Approve pending users', hint: 'Approve or reject sign-ups.' },
};