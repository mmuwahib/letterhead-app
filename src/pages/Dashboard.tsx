import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  FileText, Upload, Archive, Activity, Users, Building2, MapPin, Briefcase,
  TrendingUp, LayoutDashboard, ClipboardList, Settings, Loader2,
} from 'lucide-react';
import { Compass, Sparkles, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchTemplates, fetchDocuments, fetchLogs } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { format, subDays, startOfDay, formatDistanceToNow } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type Doc = Awaited<ReturnType<typeof fetchDocuments>>[number];
type Log = Awaited<ReturnType<typeof fetchLogs>>[number];

function topGroup<T>(rows: T[], key: (r: T) => string | null | undefined, limit = 5) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function BreakdownCard({ title, icon: Icon, items, total, loading }: { title: string; icon: any; items: [string, number][]; total: number; loading: boolean; }) {
  return (
    <Card className="border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Icon className="h-3.5 w-3.5" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map(([name, count], idx) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <li key={name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium">{name}</span>
                    </div>
                    <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">{count} · {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  usePageMeta({ title: 'Dashboard', description: 'Quick stats, recent activity, and shortcuts.', helpKey: '/' });
  const { profile, role, hasPermission } = useAuth();
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('gc.dashboard.welcome.dismissed') === '1';
  });
  const isNewcomer = !profile?.tourCompletedAt && !welcomeDismissed;
  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try { localStorage.setItem('gc.dashboard.welcome.dismissed', '1'); } catch {}
  };
  const [docs, setDocs] = useState<Doc[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchTemplates(), fetchDocuments(), fetchLogs(500)])
      .then(([t, d, l]) => {
        if (cancelled) return;
        if (t.status === 'fulfilled') setTemplateCount(t.value.length);
        if (d.status === 'fulfilled') setDocs(d.value as Doc[]);
        if (l.status === 'fulfilled') setLogs(l.value as Log[]);
        const errs = [t, d, l].filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        if (errs.length) setError(errs[0].reason?.message ?? 'Failed to load some data');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const now = useMemo(() => new Date(), []);
  const cutoff30 = useMemo(() => subDays(now, 30), [now]);
  const cutoff7 = useMemo(() => subDays(now, 7), [now]);
  const docs30 = useMemo(() => docs.filter(d => new Date(d.created_at) >= cutoff30), [docs, cutoff30]);
  const docs7 = useMemo(() => docs.filter(d => new Date(d.created_at) >= cutoff7), [docs, cutoff7]);
  const distinctUsers30 = useMemo(() => new Set(docs30.map(d => d.user_id)).size, [docs30]);

  const myDocs = useMemo(
    () => (profile?.userId ? docs.filter(d => d.user_id === profile.userId) : []),
    [docs, profile?.userId]
  );
  const myRecent = useMemo(() => myDocs.slice(0, 5), [myDocs]);
  const showMyUploads = role !== 'admin' && hasPermission('upload');

  const series14 = useMemo(() => {
    const days: { date: string; downloads: number; uploads: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = startOfDay(subDays(now, i));
      days.push({ date: format(d, 'MMM d'), downloads: 0, uploads: 0 });
    }
    const idx = (ts: string) => 13 - Math.floor((now.getTime() - new Date(ts).getTime()) / 86400000);
    for (const l of logs) {
      const i = idx(l.created_at);
      if (i < 0 || i > 13) continue;
      if (l.action === 'download') days[i].downloads++;
      else if (l.action === 'upload' || l.action === 'create') days[i].uploads++;
    }
    return days;
  }, [logs, now]);

  const byDept = useMemo(() => topGroup(docs, d => d.department_name), [docs]);
  const bySite = useMemo(() => topGroup(docs, d => (d as any).office_site_name), [docs]);
  const byEntity = useMemo(() => topGroup(docs, d => (d as any).legal_entity_name), [docs]);
  const byUser = useMemo(() => topGroup(docs, d => d.user_name), [docs]);
  const total = docs.length;
  const downloadCount = useMemo(() => logs.filter(l => l.action === 'download').length, [logs]);
  const uploadCount7 = useMemo(() => docs7.length, [docs7]);

  const lastActivityByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs) {
      const k = l.user_name ?? '—';
      if (!m.has(k)) m.set(k, l.created_at);
    }
    return m;
  }, [logs]);

  const stats = [
    { label: 'Total Documents', value: docs.length, icon: Archive, hint: `${docs30.length} in last 30 days`, tone: 'primary' as const },
    { label: 'Uploads (7d)', value: uploadCount7, icon: Upload, hint: 'recent activity', tone: 'success' as const },
    { label: 'Downloads', value: downloadCount, icon: TrendingUp, hint: 'all-time', tone: 'info' as const },
    { label: 'Active Users', value: distinctUsers30, icon: Users, hint: 'last 30 days', tone: 'accent' as const },
    { label: 'Templates', value: templateCount, icon: FileText, hint: 'available', tone: 'warning' as const },
  ];
  const toneStyles: Record<'primary' | 'success' | 'info' | 'accent' | 'warning', { stripe: string; tile: string }> = {
    primary: { stripe: 'border-l-primary', tile: 'bg-primary/10 text-primary ring-primary/20' },
    success: { stripe: 'border-l-success', tile: 'bg-success/10 text-success ring-success/20' },
    info:    { stripe: 'border-l-info',    tile: 'bg-info/10 text-info ring-info/20' },
    accent:  { stripe: 'border-l-accent',  tile: 'bg-accent/10 text-accent ring-accent/20' },
    warning: { stripe: 'border-l-warning', tile: 'bg-warning/15 text-warning ring-warning/25' },
  };

  const recentLogs = logs.slice(0, 6);
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();
  const firstName = (() => {
    const raw = profile?.fullName?.trim();
    if (!raw) return '';
    // If the stored "full name" is actually an email (default seeded by the
    // signup trigger when no name was provided), use the local-part and
    // title-case it instead of showing the whole address in the greeting.
    const source = raw.includes('@') ? raw.split('@')[0] : raw;
    const first = source.split(/[\s._-]+/).filter(Boolean)[0] ?? '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  })();

  const quickActions = [
    hasPermission('upload') && { to: '/upload', icon: Upload, label: 'Upload Document', primary: true },
    hasPermission('view_archive') && { to: '/archive', icon: Archive, label: 'Browse Archive' },
    hasPermission('manage_templates') && { to: '/templates', icon: FileText, label: 'Templates' },
    hasPermission('view_logs') && { to: '/logs', icon: ClipboardList, label: 'Activity Logs' },
    role === 'admin' && { to: '/admin', icon: Settings, label: 'Admin Portal' },
  ].filter(Boolean) as { to: string; icon: any; label: string; primary?: boolean }[];

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-elegant">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {greeting}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-sm text-primary-foreground/80">
                {format(now, "EEEE, MMM d")} · An overview of your document workflow.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.slice(0, 3).map(a => (
              <Button
                key={a.to}
                asChild
                size="sm"
                variant={a.primary ? 'secondary' : 'ghost'}
                className={a.primary
                  ? 'bg-white text-primary hover:bg-white/90'
                  : 'border border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground'}
              >
                <Link to={a.to}><a.icon className="mr-2 h-3.5 w-3.5" />{a.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Some data failed to load: {error}
        </div>
      )}

      {isNewcomer && (
        <Card className="relative overflow-hidden border-primary/20 bg-primary/[0.03]">
          <button
            onClick={dismissWelcome}
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <CardTitle className="text-base">Welcome — let's get you started</CardTitle>
            </div>
            <CardDescription>Three quick things to make this feel like home.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Link
              to="#"
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('gc.start-tour', { detail: 'overview' })); }}
              className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-accent/40"
            >
              <Compass className="mb-2 h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Take the 60-sec tour</p>
              <p className="text-xs text-muted-foreground">See where everything lives.</p>
            </Link>
            {hasPermission('upload') && (
              <Link
                to="/upload"
                className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <Upload className="mb-2 h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Create your first document</p>
                <p className="text-xs text-muted-foreground">Pick a template, drop a file, done.</p>
              </Link>
            )}
            {(hasPermission('manage_templates') || role === 'admin' || role === 'manager') && (
              <Link
                to="/templates"
                className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <FileText className="mb-2 h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Browse templates</p>
                <p className="text-xs text-muted-foreground">See what letterheads exist.</p>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(s => {
          const t = toneStyles[s.tone];
          return (
            <Card
              key={s.label}
              className={`group border-l-4 ${t.stripe} border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elegant`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${t.tile}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  {loading ? (
                    <Skeleton className="mt-1 h-8 w-14" />
                  ) : (
                    <p className="text-3xl font-bold leading-tight tracking-tight">{s.value.toLocaleString()}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{s.hint}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Activity chart */}
      <Card className="border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Activity (last 14 days)</CardTitle>
              <CardDescription className="text-xs">Daily uploads and downloads.</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Downloads
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Uploads
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series14} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAccent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: 'var(--shadow-md)',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="downloads" name="Downloads" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradPrimary)" />
                  <Area type="monotone" dataKey="uploads" name="Uploads" stroke="hsl(var(--accent))" strokeWidth={2} fill="url(#gradAccent)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BreakdownCard title="By Department" icon={Briefcase} items={byDept} total={total} loading={loading} />
        <BreakdownCard title="By Office Site" icon={MapPin} items={bySite} total={total} loading={loading} />
        <BreakdownCard title="By Legal Entity" icon={Building2} items={byEntity} total={total} loading={loading} />
      </div>

      {/* Top users + Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <Users className="h-3.5 w-3.5" />
              </span>
              Top Users by Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : byUser.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No users yet.</p>
            ) : (
              <ul className="space-y-2">
                {byUser.map(([name, count]) => {
                  const initials = name.split(' ').slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
                  const last = lastActivityByUser.get(name);
                  return (
                    <li key={name} className="flex items-center gap-3 rounded-md border border-border/60 bg-card/50 p-2.5 transition-colors hover:bg-accent-soft/40">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-semibold text-primary-foreground shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        {last && <p className="text-[11px] text-muted-foreground">Last active {formatDistanceToNow(new Date(last), { addSuffix: true })}</p>}
                      </div>
                      <Badge variant="secondary" className="text-[11px]">{count}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-inset ring-accent/15">
                <Activity className="h-3.5 w-3.5" />
              </span>
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentLogs.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {recentLogs.map(log => {
                  const dot =
                    log.action === 'download' ? 'bg-info'
                    : log.action === 'upload' ? 'bg-success'
                    : log.action === 'create' ? 'bg-primary'
                    : 'bg-muted-foreground/40';
                  return (
                    <div key={log.id} className="flex items-start gap-3 rounded-md border border-border/60 bg-card/50 p-2.5 transition-colors hover:bg-accent-soft/40">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{log.description}</p>
                        <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                          {log.serial_number && <span className="font-mono">{log.serial_number}</span>}
                          {log.user_name && <span>by {log.user_name}</span>}
                          {log.department_name && <span>· {log.department_name}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground" title={format(new Date(log.created_at), 'PPpp')}>
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My recent uploads (non-admin) */}
      {showMyUploads && (
        <Card className="border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-primary" />
                My Recent Uploads
                {!loading && myDocs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[11px] font-normal">
                    {Math.min(myRecent.length, myDocs.length)} of {myDocs.length}
                  </Badge>
                )}
              </CardTitle>
              {hasPermission('view_archive') && myDocs.length > myRecent.length && (
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                  <Link to="/archive">View all my uploads</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : myRecent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                You haven't uploaded any documents yet.
                {hasPermission('upload') && <> <Link to="/upload" className="text-primary underline">Upload your first document</Link>.</>}
              </p>
            ) : (
              <div className="space-y-2">
                {myRecent.map(doc => (
                  <div key={doc.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card/50 p-2.5 transition-colors hover:bg-accent-soft/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-secondary px-1.5 font-mono text-[11px] text-secondary-foreground">{doc.serial_number}</span>
                        <span className="truncate text-sm font-medium">{doc.original_filename}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{doc.template_name}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={format(new Date(doc.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent documents */}
      <Card className="overflow-hidden border-border/60 bg-[image:var(--gradient-subtle)] shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <FileText className="h-3.5 w-3.5" />
              </span>
              Recent Documents
              {!loading && docs.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[11px] font-normal">
                  {Math.min(6, docs.length)} of {docs.length}
                </Badge>
              )}
            </CardTitle>
            {hasPermission('view_archive') && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary">
                <Link to="/archive">View all →</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No documents yet</p>
              {hasPermission('upload') && (
                <Button asChild size="sm" className="mt-1">
                  <Link to="/upload"><Upload className="mr-2 h-3.5 w-3.5" />Upload your first document</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serial</TableHead>
                      <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">File</TableHead>
                      <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Template</TableHead>
                      <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">User</TableHead>
                      <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Department</TableHead>
                      <TableHead className="h-9 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.slice(0, 6).map(doc => {
                      const initials = (doc.user_name ?? '?').split(' ').slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
                      return (
                        <TableRow key={doc.id} className="group border-border/60 transition-colors hover:bg-accent-soft/40">
                          <TableCell>
                            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">{doc.serial_number}</span>
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <FileText className="h-3.5 w-3.5" />
                              </span>
                              <span className="truncate text-sm font-medium">{doc.original_filename}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{doc.template_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-[10px] font-semibold text-primary-foreground">
                                {initials}
                              </span>
                              <span className="truncate text-sm">{doc.user_name ?? '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {doc.department_name ? (
                              <Badge variant="outline" className="border-border/60 text-[11px] font-normal">{doc.department_name}</Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground" title={format(new Date(doc.created_at), 'PPpp')}>
                            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 p-3 md:hidden">
                {docs.slice(0, 6).map(doc => {
                  const initials = (doc.user_name ?? '?').split(' ').slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
                  return (
                    <div key={doc.id} className="rounded-md border border-border/60 bg-card/60 p-3 transition-colors hover:bg-accent-soft/40">
                      <div className="flex items-start gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{doc.original_filename}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="rounded bg-secondary px-1.5 font-mono text-secondary-foreground">{doc.serial_number}</span>
                            <span>· {doc.template_name}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-[9px] font-semibold text-primary-foreground">{initials}</span>
                              <span className="truncate text-xs">{doc.user_name ?? '—'}</span>
                              {doc.department_name && <Badge variant="outline" className="border-border/60 text-[10px] font-normal">{doc.department_name}</Badge>}
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
