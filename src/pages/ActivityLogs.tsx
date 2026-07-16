import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardList, Search, Upload, Download, Printer, FileText, Shield, Filter, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchLogs } from '@/lib/storage';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';

type LogRow = Awaited<ReturnType<typeof fetchLogs>>[number];

const actionLabels: Record<string, string> = {
  upload: 'Upload',
  download: 'Download',
  print: 'Print',
  template_create: 'Template Created',
  template_update: 'Template Updated',
  template_delete: 'Template Deleted',
  user_approve: 'User Approved',
  user_ban: 'User Banned',
  user_role: 'Role Updated',
};

const actionColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  upload: 'default',
  download: 'secondary',
  print: 'outline',
  template_create: 'default',
  template_update: 'secondary',
  template_delete: 'destructive',
  user_approve: 'default',
  user_ban: 'destructive',
  user_role: 'secondary',
};

const actionIcons: Record<string, any> = {
  upload: Upload,
  download: Download,
  print: Printer,
  template_create: FileText,
  template_update: FileText,
  template_delete: FileText,
  user_approve: Shield,
  user_ban: Shield,
  user_role: Shield,
};

export default function ActivityLogs() {
  usePageMeta({ title: 'Activity logs', description: 'Audit every action across the system.', helpKey: '/logs' });
  const { role, hasPermission, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Everyone approved can reach this page. Regular users see only their own
  // events (enforced by the "Users can view own logs" RLS policy on
  // activity_logs); managers see their department; admins see everything.
  const allowed = true;
  const isPersonal = role !== 'admin' && role !== 'manager' && !hasPermission('view_logs');

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    fetchLogs().then(setLogs).catch(console.error).finally(() => setLoading(false));
  }, [allowed]);

  if (!authLoading && !allowed) return <Navigate to="/" replace />;

  const entityOptions = useMemo(
    () => Array.from(new Set(logs.map(l => (l as any).legal_entity_name).filter(Boolean))) as string[],
    [logs],
  );
  const siteOptions = useMemo(
    () => Array.from(new Set(logs.map(l => (l as any).office_site_name).filter(Boolean))) as string[],
    [logs],
  );

  // Action types a regular user can actually generate. Hide management/admin
  // actions from the dropdown when in personal scope to avoid empty filters.
  const personalActionKeys = new Set(['upload', 'download', 'print']);
  const visibleActionEntries = isPersonal
    ? Object.entries(actionLabels).filter(([k]) => personalActionKeys.has(k))
    : Object.entries(actionLabels);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cutoff = rangeFilter === 'all' ? null : subDays(new Date(), Number(rangeFilter));
    return logs.filter(l => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (entityFilter !== 'all' && (l as any).legal_entity_name !== entityFilter) return false;
      if (siteFilter !== 'all' && (l as any).office_site_name !== siteFilter) return false;
      if (cutoff && new Date(l.created_at) < cutoff) return false;
      if (q && ![l.description, l.serial_number, l.user_name, l.department_name, (l as any).legal_entity_name, (l as any).office_site_name]
        .some(v => (v ?? '').toString().toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, actionFilter, entityFilter, siteFilter, rangeFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isPersonal ? 'My Activity' : 'Activity Logs'}</h1>
            <p className="text-sm text-muted-foreground">
              {isPersonal
                ? "A log of actions you've performed — uploads, downloads and prints."
                : 'Track every action taken across documents, templates, and users.'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">{filtered.length} events</Badge>
      </div>

      <Card data-tour="logs-filters">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-muted-foreground" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-3 sm:grid-cols-2 ${isPersonal ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search description, serial, user…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {visibleActionEntries.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isPersonal && (
              <>
                <Select value={entityFilter} onValueChange={setEntityFilter}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Legal entity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All entities</SelectItem>
                    {entityOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Site" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {siteOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            <Select value={rangeFilter} onValueChange={setRangeFilter}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-9 justify-self-start text-xs"
              onClick={() => { setActionFilter('all'); setEntityFilter('all'); setSiteFilter('all'); setRangeFilter('all'); setSearch(''); }}>
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-tour="logs-events">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No activity logs match your filters.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(log => {
                const Icon = actionIcons[log.action] ?? ClipboardList;
                const meta = [
                  log.serial_number,
                  log.user_name && `by ${log.user_name}`,
                  log.department_name,
                  (log as any).legal_entity_name,
                  (log as any).office_site_name,
                ].filter(Boolean);
                return (
                  <div key={log.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="flex flex-1 items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={actionColors[log.action] ?? 'default'} className="text-[10px] px-1.5 py-0">
                            {actionLabels[log.action] ?? log.action}
                          </Badge>
                          <span className="truncate text-sm font-medium">{log.description}</span>
                        </div>
                        {meta.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                            {meta.map((m, i) => <span key={i} className={i === 0 && log.serial_number ? 'font-mono' : ''}>{m}{i < meta.length - 1 ? ' ·' : ''}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
