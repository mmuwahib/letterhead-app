import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  Download, Search, Archive as ArchiveIcon, FileText, Filter, Loader2, Eye, Copy,
  ArrowUpDown, ArrowUp, ArrowDown, X, FileDown, Package, Calendar, Layers, Users,
  Building2, MapPin, ChevronLeft, ChevronRight, ExternalLink, Clock, Settings2,
} from 'lucide-react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchDocuments, getDocumentSignedUrl, fetchDownloadCounts, addLogToDb, fetchDocumentLogs, fetchDocumentPdfData,
} from '@/lib/storage';
import PdfCanvasPreview from '@/components/PdfCanvasPreview';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

type DocRow = Awaited<ReturnType<typeof fetchDocuments>>[number];
type LogRow = Awaited<ReturnType<typeof fetchDocumentLogs>>[number];

const FILTERS_KEY = 'archive.filters.v1';
const COLS_KEY = 'archive.cols.v1';

type SortKey = 'serial_number' | 'created_at' | 'downloads' | 'template_name' | 'user_name';
type ColKey = 'serial' | 'file' | 'template' | 'user' | 'department' | 'entity' | 'site' | 'downloads' | 'date';

const DEFAULT_COLS: Record<ColKey, boolean> = {
  serial: true, file: true, template: true, user: true,
  department: true, entity: true, site: true, downloads: true, date: true,
};

function base64ToBlob(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DocumentArchive() {
  usePageMeta({ title: 'Document archive', description: 'Find, filter and re-download every document you have access to.', helpKey: '/archive' });
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Filters (persisted)
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [dateRange, setDateRange] = useState<'all' | '7' | '30' | '90'>('all');
  const [mineOnly, setMineOnly] = useState(false);

  // Sort & pagination
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Selection & columns
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);

  // Preview drawer
  const [previewDoc, setPreviewDoc] = useState<DocRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [previewLogs, setPreviewLogs] = useState<LogRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load persisted state
  useEffect(() => {
    const serialParam = searchParams.get('serial');
    if (serialParam) {
      setSearch(serialParam);
      // strip the param so refreshes don't re-apply it
      const next = new URLSearchParams(searchParams);
      next.delete('serial');
      setSearchParams(next, { replace: true });
      return;
    }
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const f = JSON.parse(raw);
        setSearch(f.search ?? '');
        setEntityFilter(f.entityFilter ?? 'all');
        setSiteFilter(f.siteFilter ?? 'all');
        setDeptFilter(f.deptFilter ?? 'all');
        setTemplateFilter(f.templateFilter ?? 'all');
        setDateRange(f.dateRange ?? 'all');
        setMineOnly(!!f.mineOnly);
        setPageSize(f.pageSize ?? 25);
      }
      const c = localStorage.getItem(COLS_KEY);
      if (c) setCols({ ...DEFAULT_COLS, ...JSON.parse(c) });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      search, entityFilter, siteFilter, deptFilter, templateFilter, dateRange, mineOnly, pageSize,
    }));
  }, [search, entityFilter, siteFilter, deptFilter, templateFilter, dateRange, mineOnly, pageSize]);

  useEffect(() => {
    localStorage.setItem(COLS_KEY, JSON.stringify(cols));
  }, [cols]);

  const reload = () =>
    Promise.all([fetchDocuments(), fetchDownloadCounts()])
      .then(([d, c]) => { setDocs(d); setCounts(c); })
      .catch(e => { console.error(e); toast.error('Failed to load documents'); });

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const entityOptions = useMemo(
    () => Array.from(new Set(docs.map(d => (d as any).legal_entity_name).filter(Boolean))).sort() as string[],
    [docs],
  );
  const siteOptions = useMemo(
    () => Array.from(new Set(docs.map(d => (d as any).office_site_name).filter(Boolean))).sort() as string[],
    [docs],
  );
  const deptOptions = useMemo(
    () => Array.from(new Set(docs.map(d => d.department_name).filter(Boolean))).sort() as string[],
    [docs],
  );
  const templateOptions = useMemo(
    () => Array.from(new Set(docs.map(d => d.template_name).filter(Boolean))).sort() as string[],
    [docs],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const cutoff = dateRange === 'all' ? null : subDays(new Date(), Number(dateRange));
    return docs.filter(d => {
      if (mineOnly && d.user_id !== user?.id) return false;
      if (entityFilter !== 'all' && (d as any).legal_entity_name !== entityFilter) return false;
      if (siteFilter !== 'all' && (d as any).office_site_name !== siteFilter) return false;
      if (deptFilter !== 'all' && d.department_name !== deptFilter) return false;
      if (templateFilter !== 'all' && d.template_name !== templateFilter) return false;
      if (cutoff && new Date(d.created_at) < cutoff) return false;
      if (!q) return true;
      const norm = (v: unknown) => (v == null ? '' : String(v)).trim().toLowerCase();
      return (
        norm(d.serial_number).includes(q) ||
        norm(d.original_filename).includes(q) ||
        norm(d.template_name).includes(q) ||
        norm((d as any).document_title).includes(q) ||
        norm((d as any).assigned_to).includes(q) ||
        norm(d.user_name).includes(q) ||
        norm(d.department_name).includes(q) ||
        norm((d as any).legal_entity_name).includes(q) ||
        norm((d as any).office_site_name).includes(q)
      );
    });
  }, [docs, search, entityFilter, siteFilter, deptFilter, templateFilter, dateRange, mineOnly, user?.id]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'downloads') {
        av = counts[a.serial_number] ?? 0; bv = counts[b.serial_number] ?? 0;
      } else if (sortKey === 'created_at') {
        av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime();
      } else {
        av = (a as any)[sortKey] ?? ''; bv = (b as any)[sortKey] ?? '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, counts]);

  const totalDownloads = useMemo(
    () => filtered.reduce((acc, d) => acc + (counts[d.serial_number] ?? 0), 0),
    [filtered, counts],
  );
  const uniqueTemplates = useMemo(
    () => new Set(filtered.map(d => d.template_name)).size,
    [filtered],
  );
  const docsThisMonth = useMemo(() => {
    const now = new Date();
    return filtered.filter(d => {
      const dd = new Date(d.created_at);
      return dd.getFullYear() === now.getFullYear() && dd.getMonth() === now.getMonth();
    }).length;
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sorted.length);
  const pageRows = sorted.slice(pageStart, pageEnd);

  useEffect(() => { setPage(1); }, [search, entityFilter, siteFilter, deptFilter, templateFilter, dateRange, mineOnly, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'created_at' || k === 'downloads' ? 'desc' : 'asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k
      ? <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />
      : sortDir === 'asc'
        ? <ArrowUp className="ml-1 inline h-3 w-3" />
        : <ArrowDown className="ml-1 inline h-3 w-3" />;

  // Selection
  const allOnPageSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
  const someOnPageSelected = pageRows.some(r => selected.has(r.id));
  const toggleAllOnPage = (val: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      pageRows.forEach(r => { if (val) next.add(r.id); else next.delete(r.id); });
      return next;
    });
  };
  const toggleOne = (id: string, val: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedRows = useMemo(() => sorted.filter(d => selected.has(d.id)), [sorted, selected]);

  const logDownload = async (doc: DocRow, action: 'download' | 'bulk_download') => {
    if (!user) return;
    try {
      await addLogToDb({
        action,
        description: `${action === 'bulk_download' ? 'Bulk' : 'Re'}-downloaded ${doc.serial_number} from archive`,
        serialNumber: doc.serial_number,
        userId: user.id,
        userName: profile?.fullName ?? null,
        departmentId: profile?.departmentId ?? null,
        departmentName: doc.department_name ?? null,
        legalEntityId: profile?.legalEntityId ?? null,
        legalEntityName: (doc as any).legal_entity_name ?? null,
        officeSiteId: profile?.officeSiteId ?? null,
        officeSiteName: (doc as any).office_site_name ?? null,
        targetType: 'document',
        targetId: doc.serial_number,
      });
      setCounts(c => ({ ...c, [doc.serial_number]: (c[doc.serial_number] ?? 0) + 1 }));
    } catch (e) { console.warn('log download failed', e); }
  };

  const fetchPdfBlob = async (doc: DocRow): Promise<Blob | null> => {
    if (doc.pdf_path) {
      const url = await getDocumentSignedUrl(doc.pdf_path, 120);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch PDF');
      return await res.blob();
    }
    const legacy = await fetchDocumentPdfData(doc.id);
    if (legacy) return base64ToBlob(legacy);
    return null;
  };

  const handleDownload = async (doc: DocRow) => {
    setDownloadingId(doc.id);
    try {
      const blob = await fetchPdfBlob(doc);
      if (!blob) { toast.error('No PDF available for this document'); return; }
      downloadBlob(blob, `${doc.serial_number}.pdf`);
      await logDownload(doc, 'download');
      toast.success(`Downloaded ${doc.serial_number}`);
    } catch (e) {
      console.error(e); toast.error('Download failed');
    } finally { setDownloadingId(null); }
  };

  const handleBulkZip = async () => {
    if (selectedRows.length === 0) return;
    setBulkBusy(true);
    const zip = new JSZip();
    let ok = 0, fail = 0;
    // small concurrency
    const queue = [...selectedRows];
    const workers = Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const doc = queue.shift()!;
        try {
          const blob = await fetchPdfBlob(doc);
          if (blob) {
            zip.file(`${doc.serial_number}.pdf`, blob);
            await logDownload(doc, 'bulk_download');
            ok++;
          } else { fail++; }
        } catch { fail++; }
      }
    });
    try {
      await Promise.all(workers);
      if (ok === 0) { toast.error('No files could be downloaded'); return; }
      const out = await zip.generateAsync({ type: 'blob' });
      downloadBlob(out, `documents-${format(new Date(), 'yyyyMMdd-HHmm')}.zip`);
      toast.success(`Zipped ${ok} document${ok === 1 ? '' : 's'}${fail ? ` · ${fail} failed` : ''}`);
    } catch (e) {
      console.error(e); toast.error('Bulk download failed');
    } finally { setBulkBusy(false); }
  };

  const handleExportCsv = () => {
    const rows = selectedRows.length ? selectedRows : sorted;
    if (!rows.length) { toast.info('Nothing to export'); return; }
    const header = ['Serial', 'Original File', 'Document Title', 'Assigned To', 'Sensitivity', 'Template', 'User', 'Department', 'Legal Entity', 'Site', 'Downloads', 'Created At'];
    const lines = [header.join(',')];
    rows.forEach(d => {
      lines.push([
        d.serial_number, d.original_filename,
        (d as any).document_title ?? '', (d as any).assigned_to ?? '', (d as any).sensitivity ?? '',
        d.template_name,
        d.user_name ?? '', d.department_name ?? '',
        (d as any).legal_entity_name ?? '', (d as any).office_site_name ?? '',
        counts[d.serial_number] ?? 0,
        new Date(d.created_at).toISOString(),
      ].map(csvEscape).join(','));
    });
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `documents-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  };

  const copySerial = async (sn: string) => {
    try { await navigator.clipboard.writeText(sn); toast.success('Serial copied'); }
    catch { toast.error('Copy failed'); }
  };

  const openPreview = async (doc: DocRow) => {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewBytes(null);
    setPreviewLogs([]);
    setPreviewLoading(true);
    try {
      const [result, logs] = await Promise.all([
        (async (): Promise<{ url: string; bytes: ArrayBuffer | null }> => {
          if (doc.pdf_path) {
            const signed = await getDocumentSignedUrl(doc.pdf_path, 300);
            try {
              const res = await fetch(signed);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const buf = await res.arrayBuffer();
              const blob = new Blob([buf], { type: 'application/pdf' });
              return { url: URL.createObjectURL(blob), bytes: buf };
            } catch {
              return { url: signed, bytes: null };
            }
          }
          const legacy = await fetchDocumentPdfData(doc.id);
          if (legacy) {
            const blob = base64ToBlob(legacy);
            const buf = await blob.arrayBuffer();
            return { url: URL.createObjectURL(blob), bytes: buf };
          }
          return { url: '', bytes: null };
        })(),
        fetchDocumentLogs(doc.serial_number, 20),
      ]);
      setPreviewUrl(result.url || null);
      setPreviewBytes(result.bytes);
      setPreviewLogs(logs);
    } catch (e) {
      console.error(e); toast.error('Preview failed to load');
    } finally { setPreviewLoading(false); }
  };

  const resetFilters = () => {
    setEntityFilter('all'); setSiteFilter('all'); setDeptFilter('all');
    setTemplateFilter('all'); setDateRange('all'); setMineOnly(false); setSearch('');
  };

  const activeFilterChips: { label: string; onClear: () => void }[] = [];
  if (search) activeFilterChips.push({ label: `Search: "${search}"`, onClear: () => setSearch('') });
  if (entityFilter !== 'all') activeFilterChips.push({ label: `Entity: ${entityFilter}`, onClear: () => setEntityFilter('all') });
  if (siteFilter !== 'all') activeFilterChips.push({ label: `Site: ${siteFilter}`, onClear: () => setSiteFilter('all') });
  if (deptFilter !== 'all') activeFilterChips.push({ label: `Dept: ${deptFilter}`, onClear: () => setDeptFilter('all') });
  if (templateFilter !== 'all') activeFilterChips.push({ label: `Template: ${templateFilter}`, onClear: () => setTemplateFilter('all') });
  if (dateRange !== 'all') activeFilterChips.push({ label: `Last ${dateRange}d`, onClear: () => setDateRange('all') });
  if (mineOnly) activeFilterChips.push({ label: 'My documents', onClear: () => setMineOnly(false) });

  const KPI = ({ icon: Icon, label, value, hint }: { icon: any; label: string; value: React.ReactNode; hint?: string }) => (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArchiveIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Document Archive</h1>
              <p className="text-sm text-muted-foreground">Browse, preview, and re-download every generated document.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button data-tour="archive-export" variant="outline" size="sm" onClick={handleExportCsv} className="h-8 gap-1.5 text-xs">
              <FileDown className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div data-tour="archive-stats" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI icon={FileText} label="Documents" value={filtered.length} hint={filtered.length === docs.length ? 'All documents' : `of ${docs.length} total`} />
          <KPI icon={Download} label="Downloads" value={totalDownloads} hint="Across filtered docs" />
          <KPI icon={Layers} label="Templates Used" value={uniqueTemplates} />
          <KPI icon={Calendar} label="This Month" value={docsThisMonth} hint={format(new Date(), 'MMMM yyyy')} />
        </div>

        {/* Filters */}
        <Card data-tour="archive-filters">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-muted-foreground" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search serial, filename, user, department, entity…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Legal entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All legal entities</SelectItem>
                  {entityOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Office site" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {siteOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {deptOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All templates</SelectItem>
                  {templateOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Date range" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between rounded-md border bg-background px-3">
                <Label htmlFor="mine-only" className="text-sm font-normal cursor-pointer">My documents only</Label>
                <Switch id="mine-only" checked={mineOnly} onCheckedChange={setMineOnly} />
              </div>
            </div>

            {(activeFilterChips.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {activeFilterChips.map((c, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 text-[11px] font-normal">
                    {c.label}
                    <button onClick={c.onClear} className="rounded-full p-0.5 hover:bg-background/60" aria-label="Clear">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-[11px]">
                  Reset all
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Documents</CardTitle>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Settings2 className="h-3.5 w-3.5" /> Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(DEFAULT_COLS) as ColKey[]).map(k => (
                    <DropdownMenuCheckboxItem
                      key={k}
                      checked={cols[k]}
                      onCheckedChange={v => setCols(prev => ({ ...prev, [k]: !!v }))}
                      className="text-xs capitalize"
                    >
                      {k}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">
                  {docs.length === 0 ? 'No documents yet' : 'No documents match your filters'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {docs.length === 0 ? 'Generate one from the Upload Document page.' : 'Try adjusting your search or filters.'}
                </p>
                {docs.length > 0 && (
                  <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3 h-8 text-xs">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="max-h-[60vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
                            onCheckedChange={v => toggleAllOnPage(!!v)}
                            aria-label="Select all on page"
                          />
                        </TableHead>
                        {cols.serial && (
                          <TableHead className="cursor-pointer text-xs select-none" onClick={() => toggleSort('serial_number')}>
                            Serial<SortIcon k="serial_number" />
                          </TableHead>
                        )}
                        <TableHead className="text-xs">Document Name</TableHead>
                        <TableHead className="text-xs">Assigned To</TableHead>
                        {cols.file && <TableHead className="text-xs">Original File</TableHead>}
                        {cols.template && (
                          <TableHead className="cursor-pointer text-xs select-none" onClick={() => toggleSort('template_name')}>
                            Template<SortIcon k="template_name" />
                          </TableHead>
                        )}
                        {cols.user && (
                          <TableHead className="cursor-pointer text-xs select-none" onClick={() => toggleSort('user_name')}>
                            User<SortIcon k="user_name" />
                          </TableHead>
                        )}
                        {cols.department && <TableHead className="text-xs">Department</TableHead>}
                        {cols.entity && <TableHead className="text-xs">Legal Entity</TableHead>}
                        {cols.site && <TableHead className="text-xs">Site</TableHead>}
                        {cols.downloads && (
                          <TableHead className="cursor-pointer text-center text-xs select-none" onClick={() => toggleSort('downloads')}>
                            Downloads<SortIcon k="downloads" />
                          </TableHead>
                        )}
                        {cols.date && (
                          <TableHead className="cursor-pointer text-xs select-none" onClick={() => toggleSort('created_at')}>
                            Date<SortIcon k="created_at" />
                          </TableHead>
                        )}
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((doc, idx) => {
                        const c = counts[doc.serial_number] ?? 0;
                        const isSelected = selected.has(doc.id);
                        return (
                          <TableRow
                            key={doc.id}
                            className={cn(idx % 2 === 1 && 'bg-muted/30', isSelected && 'bg-primary/5')}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={v => toggleOne(doc.id, !!v)}
                                aria-label="Select row"
                              />
                            </TableCell>
                            {cols.serial && (
                              <TableCell className="font-mono text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span>{doc.serial_number}</span>
                                  {(() => {
                                    const s = (doc as any).sensitivity as string | null;
                                    if (!s || s === 'general') return null;
                                    const label = s === 'highly_confidential' ? 'Highly Conf.' : 'Confidential';
                                    const cls = s === 'highly_confidential'
                                      ? 'border-destructive/60 text-destructive'
                                      : 'border-amber-500/60 text-amber-600 dark:text-amber-400';
                                    return (
                                      <Badge variant="outline" className={cn('text-[9px] px-1 py-0 font-sans', cls)}>
                                        {label}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="max-w-[180px] truncate text-sm" title={(doc as any).document_title ?? ''}>
                              {(doc as any).document_title ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-sm" title={(doc as any).assigned_to ?? ''}>
                              {(doc as any).assigned_to ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            {cols.file && <TableCell className="max-w-[200px] truncate text-sm" title={doc.original_filename}>{doc.original_filename}</TableCell>}
                            {cols.template && <TableCell className="text-sm">{doc.template_name}</TableCell>}
                            {cols.user && <TableCell className="text-sm">{doc.user_name ?? '—'}</TableCell>}
                            {cols.department && <TableCell className="text-sm">{doc.department_name ?? '—'}</TableCell>}
                            {cols.entity && <TableCell className="text-sm">{(doc as any).legal_entity_name ?? '—'}</TableCell>}
                            {cols.site && <TableCell className="text-sm">{(doc as any).office_site_name ?? '—'}</TableCell>}
                            {cols.downloads && (
                              <TableCell className="text-center">
                                <Badge variant={c > 0 ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">{c}</Badge>
                              </TableCell>
                            )}
                            {cols.date && (
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground" title={format(new Date(doc.created_at), 'PPpp')}>
                                {format(new Date(doc.created_at), 'MMM d, yyyy')}
                                <div className="text-[10px] opacity-70">{format(new Date(doc.created_at), 'HH:mm')}</div>
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPreview(doc)} aria-label="Preview">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Preview</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copySerial(doc.serial_number)} aria-label="Copy serial">
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Copy serial</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon" className="h-8 w-8"
                                      onClick={() => handleDownload(doc)}
                                      disabled={downloadingId === doc.id}
                                      aria-label="Download"
                                    >
                                      {downloadingId === doc.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Download className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <div>
                    Showing <span className="font-medium text-foreground">{sorted.length === 0 ? 0 : pageStart + 1}</span>
                    –<span className="font-medium text-foreground">{pageEnd}</span> of{' '}
                    <span className="font-medium text-foreground">{sorted.length}</span>
                    {selected.size > 0 && <> · <span className="font-medium text-foreground">{selected.size}</span> selected</>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                      <SelectTrigger className="h-7 w-[88px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[60px] text-center text-xs">{safePage} / {totalPages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <div className="text-sm">
              <span className="font-semibold">{selected.size}</span> document{selected.size === 1 ? '' : 's'} selected
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleExportCsv}>
                <FileDown className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleBulkZip} disabled={bulkBusy}>
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                Download ZIP
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Preview drawer */}
        <Sheet open={!!previewDoc} onOpenChange={o => { if (!o) { setPreviewDoc(null); setPreviewUrl(null); setPreviewBytes(null); setPreviewLogs([]); } }}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
            {previewDoc && (
              <>
                <SheetHeader className="border-b px-5 py-4">
                  <SheetTitle className="font-mono text-sm">{previewDoc.serial_number}</SheetTitle>
                  <SheetDescription className="truncate text-xs">{previewDoc.original_filename}</SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs">
                    <Meta icon={Layers} label="Template" value={previewDoc.template_name} />
                    <Meta icon={Users} label="User" value={previewDoc.user_name ?? '—'} />
                    <Meta icon={Building2} label="Legal Entity" value={(previewDoc as any).legal_entity_name ?? '—'} />
                    <Meta icon={MapPin} label="Office Site" value={(previewDoc as any).office_site_name ?? '—'} />
                    <Meta icon={Filter} label="Department" value={previewDoc.department_name ?? '—'} />
                    <Meta icon={Download} label="Downloads" value={String(counts[previewDoc.serial_number] ?? 0)} />
                    <Meta icon={Calendar} label="Created" value={format(new Date(previewDoc.created_at), 'PPpp')} />
                  </div>

                  <Separator />

                  {/* PDF preview */}
                  <div className="px-5 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                      <div className="flex items-center gap-1">
                        {previewUrl && (
                          <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                            <a href={previewUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </a>
                          </Button>
                        )}
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => handleDownload(previewDoc)} disabled={downloadingId === previewDoc.id}>
                          {downloadingId === previewDoc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </Button>
                      </div>
                    </div>
                    <div className="w-full overflow-hidden rounded-md border bg-muted">
                      {previewLoading || (!previewBytes && !previewUrl) ? (
                        <div className="flex aspect-[4/5] items-center justify-center text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : previewBytes ? (
                        <div className="p-2">
                          <PdfCanvasPreview pdfBytes={previewBytes} />
                        </div>
                      ) : (
                        <iframe src={previewUrl!} title="PDF preview" className="aspect-[4/5] h-full w-full" />
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Activity */}
                  <div className="px-5 py-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
                    {previewLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                      </div>
                    ) : previewLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {previewLogs.map(l => (
                          <li key={l.id} className="flex items-start gap-2 rounded-md border bg-card p-2 text-xs">
                            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium capitalize">{l.action.replace(/_/g, ' ')}</span>
                                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                              </div>
                              <p className="truncate text-muted-foreground">{l.user_name ?? 'Unknown'} · {l.description}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function Meta({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}
