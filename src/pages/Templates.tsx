import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2, Star, Edit2, FileText, Hash, Save, Upload, Eye, Sparkles } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { fetchTemplates, saveTemplate, updateTemplate, deleteTemplate, addLogToDb, fetchSerialSettings, updateSerialSettings } from '@/lib/storage';
import { uploadWatermarkImage } from '@/lib/storage';
import type { LetterheadTemplate } from '@/lib/types';
import { DEFAULT_REFERENCE_FORMAT } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import TemplateFormPreview from '@/components/TemplateFormPreview';
import UploadedTemplateForm from '@/components/UploadedTemplateForm';
import ReferenceFormatEditor from '@/components/ReferenceFormatEditor';
import { Separator } from '@/components/ui/separator';
import { DEFAULT_OVERLAY_CONFIG } from '@/lib/letterhead-import';
import { letterheadFileToPng } from '@/lib/letterhead-import';
import { usePageMeta } from '@/hooks/usePageMeta';

type FormData = Omit<LetterheadTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>;

const emptyTemplate: FormData = {
  name: '',
  companyName: 'Gulf Cryo',
  address: '',
  phone: '',
  email: '',
  website: '',
  logoUrl: '',
  footerText: '',
  headerLayout: 'logo-left',
  headerFontSize: 'medium',
  headerBorderStyle: 'solid',
  footerBorderStyle: 'solid',
  secondaryLogoUrl: '',
  backgroundUrl: '',
  overlayConfig: DEFAULT_OVERLAY_CONFIG,
  watermarkEnabled: false,
  watermarkDefaultOn: false,
  watermarkOpacity: 0.12,
  watermarkImageUrl: '',
  watermarkPages: 'all',
  referenceFormat: DEFAULT_REFERENCE_FORMAT,
  legalEntityId: null,
  officeSiteId: null,
  visibility: 'all',
};

interface Entity { id: string; name: string; code: string; }
interface Site { id: string; name: string; code: string; legal_entity_id: string; }

export default function Templates() {
  usePageMeta({ title: 'Letterhead templates', description: 'Manage the templates everyone uses to generate documents.', helpKey: '/templates' });
  const { role, user, profile, hasPermission } = useAuth();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  /** Re-rasterise an existing template's background at the current
   *  high-resolution settings. Replaces letterhead_templates.background_url
   *  with a freshly-rendered PNG of the user-picked source file. */
  const refreshTemplateBackground = async (t: LetterheadTemplate) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.png,.jpg,.jpeg,image/*,application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setRefreshingId(t.id);
      try {
        const png = await letterheadFileToPng(file);
        await updateTemplate(t.id, { backgroundUrl: png });
        toast({
          title: 'Letterhead refreshed',
          description: 'Re-rendered at high resolution. Existing documents are unchanged; new exports will use the sharper image.',
        });
        await loadAll();
      } catch (err: any) {
        toast({
          title: "Couldn't refresh letterhead",
          description: err?.message || 'Unsupported file or render failure.',
          variant: 'destructive',
        });
      } finally {
        setRefreshingId(null);
      }
    };
    input.click();
  };
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyTemplate);
  const [departmentName, setDepartmentName] = useState<string | null>(null);

  // Serial settings
  const [serialPrefix, setSerialPrefix] = useState('GC');
  const [serialSeparator, setSerialSeparator] = useState('-');
  const [serialIncludeMonth, setSerialIncludeMonth] = useState(true);
  const [serialPadding, setSerialPadding] = useState(4);
  const [serialIncludeTimestamp, setSerialIncludeTimestamp] = useState(false);
  const [serialIncludeLegalEntity, setSerialIncludeLegalEntity] = useState(false);
  const [serialIncludeSite, setSerialIncludeSite] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!profile?.departmentId) return;
    supabase.from('departments').select('name').eq('id', profile.departmentId).single()
      .then(({ data }) => { if (data) setDepartmentName(data.name); });
  }, [profile?.departmentId]);

  const logAction = async (action: string, description: string) => {
    if (!user) return;
    try {
      await addLogToDb({ action, description, userId: user.id, userName: profile?.fullName ?? null, departmentId: profile?.departmentId ?? null, departmentName });
    } catch (e) { console.error(e); }
  };

  const loadAll = async () => {
    try {
      const [t, eRes, sRes] = await Promise.all([
        fetchTemplates(),
        supabase.from('legal_entities').select('id, name, code'),
        supabase.from('office_sites').select('id, name, code, legal_entity_id'),
      ]);
      setTemplates(t);
      setEntities((eRes.data ?? []) as Entity[]);
      setSites((sRes.data ?? []) as Site[]);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSerialSettings = async () => {
    try {
      const s = await fetchSerialSettings();
      setSerialPrefix(s.prefix);
      setSerialSeparator(s.separator);
      setSerialIncludeMonth(s.includeMonth);
      setSerialPadding(s.padding);
      setSerialIncludeTimestamp(s.includeTimestamp);
      setSerialIncludeLegalEntity(!!s.includeLegalEntity);
      setSerialIncludeSite(!!s.includeSite);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadAll(); loadSerialSettings(); }, []);

  if (!hasPermission('manage_templates')) return <Navigate to="/" replace />;

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        await updateTemplate(editingId, form);
        logAction('template_update', `Updated template "${form.name}"`);
      } else {
        await saveTemplate({ ...form, isDefault: templates.length === 0 });
        logAction('template_create', `Created template "${form.name}"`);
      }
      await loadAll();
      setDialogOpen(false);
      setUploadDialogOpen(false);
      setEditingId(null);
      setForm(emptyTemplate);
      toast({ title: 'Success', description: editingId ? 'Template updated' : 'Template created' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    const t = templates.find(t => t.id === id);
    try {
      await deleteTemplate(id);
      logAction('template_delete', `Deleted template "${t?.name}"`);
      const remaining = templates.filter(x => x.id !== id);
      if (t?.isDefault && remaining.length > 0) await updateTemplate(remaining[0].id, { isDefault: true });
      await loadAll();
      toast({ title: 'Deleted', description: 'Template removed' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const setDefault = async (id: string) => {
    try {
      for (const t of templates) if (t.isDefault) await updateTemplate(t.id, { isDefault: false });
      await updateTemplate(id, { isDefault: true });
      await loadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to set default', variant: 'destructive' });
    }
  };

  const openEdit = (t: LetterheadTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name, companyName: t.companyName, address: t.address, phone: t.phone,
      email: t.email, website: t.website, logoUrl: t.logoUrl, footerText: t.footerText,
      headerLayout: t.headerLayout ?? 'logo-left',
      headerFontSize: t.headerFontSize ?? 'medium',
      headerBorderStyle: t.headerBorderStyle ?? 'solid',
      footerBorderStyle: t.footerBorderStyle ?? 'solid',
      secondaryLogoUrl: t.secondaryLogoUrl ?? '',
      backgroundUrl: t.backgroundUrl ?? '',
      overlayConfig: { ...DEFAULT_OVERLAY_CONFIG, ...(t.overlayConfig ?? {}) },
      watermarkEnabled: !!t.watermarkEnabled,
      watermarkDefaultOn: !!t.watermarkDefaultOn,
      watermarkOpacity: t.watermarkOpacity ?? 0.12,
      watermarkImageUrl: t.watermarkImageUrl ?? '',
      watermarkPages: t.watermarkPages ?? 'all',
      referenceFormat: t.referenceFormat ?? DEFAULT_REFERENCE_FORMAT,
      legalEntityId: t.legalEntityId ?? null,
      officeSiteId: t.officeSiteId ?? null,
      visibility: t.visibility ?? 'all',
    });
    if (t.backgroundUrl) setUploadDialogOpen(true);
    else setDialogOpen(true);
  };

  const handleSaveSerialSettings = async () => {
    setSavingSettings(true);
    try {
      await updateSerialSettings({
        prefix: serialPrefix,
        separator: serialSeparator,
        includeMonth: serialIncludeMonth,
        padding: serialPadding,
        includeTimestamp: serialIncludeTimestamp,
        includeLegalEntity: serialIncludeLegalEntity,
        includeSite: serialIncludeSite,
      });
      toast({ title: 'Saved', description: 'Reference number format updated' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const now = new Date();
  const previewParts = [serialPrefix];
  if (serialIncludeLegalEntity) previewParts.push('GCKW');
  if (serialIncludeSite) previewParts.push('RUH');
  previewParts.push(now.getFullYear().toString());
  if (serialIncludeMonth) previewParts.push(String(now.getMonth() + 1).padStart(2, '0'));
  if (serialIncludeTimestamp) {
    previewParts.push(
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0')
    );
  }
  previewParts.push('1'.padStart(serialPadding, '0'));
  const previewSerial = previewParts.join(serialSeparator);

  const filteredSites = sites.filter(s => !form.legalEntityId || s.legal_entity_id === form.legalEntityId);

  // Shared scope/watermark fields rendered inside both dialogs above the form
  const ScopeFields = () => (
    <div className="grid gap-2.5 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
      <div className="sm:col-span-2 -mb-1 flex items-center gap-2">
        <Hash className="h-3.5 w-3.5 text-primary" />
        <Label className="text-xs font-semibold">Issuing organization</Label>
        <span className="text-[10px] text-muted-foreground">— used in the reference number (Company / Site code).</span>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Legal Entity</Label>
        <Select
          value={form.legalEntityId ?? '__none__'}
          onValueChange={(v) =>
            setForm(f => ({
              ...f,
              legalEntityId: v === '__none__' ? null : v,
              officeSiteId: null,
            }))
          }
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None (use uploader's entity)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None — fall back to uploader's entity</SelectItem>
            {entities.map(e => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}{e.code ? ` (${e.code})` : ' — no code'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(() => {
          const ent = entities.find(e => e.id === form.legalEntityId);
          if (!form.legalEntityId) return (
            <p className="text-[10px] text-muted-foreground">Reference will use the document uploader's legal entity code.</p>
          );
          if (ent && !ent.code?.trim()) return (
            <p className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{ent.name} has no short code yet. Add one in Admin → Legal Entities so it appears in the reference number.</span>
            </p>
          );
          return ent?.code ? (
            <p className="text-[10px] text-muted-foreground">Company code in reference: <span className="font-mono font-semibold text-foreground">{ent.code}</span></p>
          ) : null;
        })()}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Office Site (optional)</Label>
        <Select
          value={form.officeSiteId ?? '__none__'}
          onValueChange={(v) => setForm(f => ({ ...f, officeSiteId: v === '__none__' ? null : v }))}
          disabled={!form.legalEntityId}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={form.legalEntityId ? 'None' : 'Pick legal entity first'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {filteredSites.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}{s.code ? ` (${s.code})` : ' — no code'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2 mt-1 -mb-1 flex items-center gap-2 border-t pt-2">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <Label className="text-xs font-semibold">Visibility</Label>
        <span className="text-[10px] text-muted-foreground">— who can pick this template when uploading.</span>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Visibility</Label>
        <Select
          value={form.visibility ?? 'all'}
          onValueChange={(v) => setForm(f => ({ ...f, visibility: v as any }))}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="legal_entity">Legal entity only</SelectItem>
            <SelectItem value="site">Site only</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {(() => {
            const v = form.visibility ?? 'all';
            if (v === 'all') return 'Will be visible to: All users.';
            const ent = entities.find(e => e.id === form.legalEntityId)?.name;
            if (v === 'legal_entity') return ent ? `Will be visible to: Users in ${ent}.` : 'Pick a legal entity above.';
            const site = sites.find(s => s.id === form.officeSiteId)?.name;
            if (!ent) return 'Pick a legal entity above.';
            if (!site) return `Pick a site within ${ent}.`;
            return `Will be visible to: Users at ${site} (${ent}).`;
          })()}
        </p>
      </div>
      <div className="sm:col-span-2 space-y-2 border-t pt-2">
        <div className="flex items-center gap-3">
          <Switch
            id="watermark-enabled"
            checked={!!form.watermarkEnabled}
            onCheckedChange={(v) => setForm(f => ({ ...f, watermarkEnabled: v, watermarkDefaultOn: v ? f.watermarkDefaultOn : false }))}
          />
          <Label htmlFor="watermark-enabled" className="text-xs">Allow watermark on generated documents</Label>
        </div>
        {form.watermarkEnabled && (
          <>
            <div className="flex items-center gap-3 pl-7">
              <Switch
                id="watermark-default"
                checked={!!form.watermarkDefaultOn}
                onCheckedChange={(v) => setForm(f => ({ ...f, watermarkDefaultOn: v }))}
              />
              <Label htmlFor="watermark-default" className="text-xs text-muted-foreground">Turn watermark on by default</Label>
            </div>
            <div className="pl-7 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Opacity</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {Math.round((form.watermarkOpacity ?? 0.12) * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round((form.watermarkOpacity ?? 0.12) * 100)]}
                onValueChange={(v) => setForm(f => ({ ...f, watermarkOpacity: (v[0] ?? 12) / 100 }))}
              />
              <p className="text-[10px] text-muted-foreground">0% = original (no watermark drawn) · 100% = fully opaque.</p>
              {/* Live mini-preview */}
              <div className="relative h-24 w-full rounded border bg-background overflow-hidden">
                <div className="absolute inset-0 p-3 text-[10px] leading-snug text-foreground/70">
                  <p className="font-semibold mb-1">Sample document</p>
                  <p>The watermark below previews on top of letterhead content.</p>
                  <p className="mt-1">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                </div>
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                  style={{ opacity: form.watermarkOpacity ?? 0.12 }}
                >
                  {form.watermarkImageUrl ? (
                    <img src={form.watermarkImageUrl} alt="" className="max-h-16 max-w-[60%] object-contain" />
                  ) : (
                    <span className="text-3xl font-black tracking-widest text-foreground rotate-[-20deg]">
                      {(form.companyName || 'WATERMARK').toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="pl-7 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Apply watermark on</Label>
              <Select
                value={form.watermarkPages ?? 'all'}
                onValueChange={(v) => setForm(f => ({ ...f, watermarkPages: v as 'first' | 'last' | 'all' }))}
              >
                <SelectTrigger className="h-8 text-sm w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All pages</SelectItem>
                  <SelectItem value="first">First page only</SelectItem>
                  <SelectItem value="last">Last page only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pl-7 space-y-2">
              <Label className="text-xs text-muted-foreground">Watermark image (optional — falls back to logo)</Label>
              <div className="flex items-center gap-3">
                {form.watermarkImageUrl && (
                  <img src={form.watermarkImageUrl} alt="Watermark" className="h-12 w-12 rounded border object-contain bg-background" />
                )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="h-8"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadWatermarkImage(file);
                      setForm(f => ({ ...f, watermarkImageUrl: url }));
                      toast({ title: 'Watermark uploaded' });
                    } catch (err: any) {
                      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
                {form.watermarkImageUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, watermarkImageUrl: '' }))}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2 border-t pt-2">
        <ReferenceFormatEditor
          value={form.referenceFormat ?? DEFAULT_REFERENCE_FORMAT}
          onChange={(rf) => setForm(f => ({ ...f, referenceFormat: rf }))}
          companyCode={entities.find(e => e.id === form.legalEntityId)?.code}
          companyName={entities.find(e => e.id === form.legalEntityId)?.name}
          siteCode={sites.find(s => s.id === form.officeSiteId)?.code}
          fallbackPrefix={serialPrefix}
          fallbackSeparator={serialSeparator}
          fallbackPadding={serialPadding}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Letterhead Templates</h1>
          <p className="text-sm text-muted-foreground">Design templates or upload existing letterheads, then control who can use each one.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={(o) => { setUploadDialogOpen(o); if (!o) { setEditingId(null); setForm(emptyTemplate); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-sm"><Upload className="mr-2 h-3.5 w-3.5" />Upload Letterhead</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit' : 'Upload'} Letterhead Template</DialogTitle>
              </DialogHeader>
              <ScopeFields />
              <UploadedTemplateForm form={form} setForm={setForm} onSave={handleSave} editingId={editingId} />
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm(emptyTemplate); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-sm"><Plus className="mr-2 h-3.5 w-3.5" />Build Template</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit' : 'Build'} Template</DialogTitle>
              </DialogHeader>
              <ScopeFields />
              <TemplateFormPreview form={form} setForm={setForm} onSave={handleSave} editingId={editingId} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading templates...</p></CardContent></Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No templates yet. Build or upload your first letterhead template to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map(t => (
            <Card key={t.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight truncate">{t.name}</CardTitle>
                    <CardDescription className="text-xs truncate">{t.companyName}</CardDescription>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="h-2.5 w-2.5" />
                      {(() => {
                        if (!t.visibility || t.visibility === 'all') return 'Visible to: All users';
                        const ent = entities.find(e => e.id === t.legalEntityId)?.name ?? '—';
                        if (t.visibility === 'legal_entity') return `Visible to: Users in ${ent}`;
                        const site = sites.find(s => s.id === t.officeSiteId)?.name ?? '—';
                        return `Visible to: Users at ${site} (${ent})`;
                      })()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {t.isDefault && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.backgroundUrl ? 'Uploaded' : 'Built'}</Badge>
                    {t.watermarkEnabled && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Watermark</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {t.backgroundUrl
                  ? <img src={t.backgroundUrl} alt="Letterhead" className="h-14 w-full rounded border bg-background object-contain" />
                  : t.logoUrl && <img src={t.logoUrl} alt="Logo" className="h-7 object-contain" />}
                <p className="text-[11px] text-muted-foreground line-clamp-2 min-h-[2em]">{t.address}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(t)}><Edit2 className="mr-1 h-3 w-3" />Edit</Button>
                  {t.backgroundUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={refreshingId === t.id}
                      onClick={() => refreshTemplateBackground(t)}
                      title="Re-upload the letterhead source to re-render at the current high-resolution setting."
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      {refreshingId === t.id ? 'Refreshing…' : 'Re-render HD'}
                    </Button>
                  )}
                  {!t.isDefault && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDefault(t.id)}><Star className="mr-1 h-3 w-3" />Set Default</Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Reference Number Format</CardTitle>
          </div>
          <CardDescription className="text-xs">Configure how document reference numbers are generated. Codes for legal entity and site come from the user's profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="serial-prefix" className="text-xs">Prefix</Label>
              <Input id="serial-prefix" className="h-8 text-sm" value={serialPrefix} onChange={e => setSerialPrefix(e.target.value)} placeholder="GC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serial-separator" className="text-xs">Separator</Label>
              <Select value={serialSeparator} onValueChange={setSerialSeparator}>
                <SelectTrigger id="serial-separator" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">Dash ( - )</SelectItem>
                  <SelectItem value="/">Slash ( / )</SelectItem>
                  <SelectItem value=".">Dot ( . )</SelectItem>
                  <SelectItem value="_">Underscore ( _ )</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="serial-month" checked={serialIncludeMonth} onCheckedChange={setSerialIncludeMonth} />
              <Label htmlFor="serial-month" className="text-sm">Include Month</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="serial-timestamp" checked={serialIncludeTimestamp} onCheckedChange={setSerialIncludeTimestamp} />
              <Label htmlFor="serial-timestamp" className="text-sm">Include Timestamp</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="serial-le" checked={serialIncludeLegalEntity} onCheckedChange={setSerialIncludeLegalEntity} />
              <Label htmlFor="serial-le" className="text-sm">Include Legal Entity code</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="serial-site" checked={serialIncludeSite} onCheckedChange={setSerialIncludeSite} />
              <Label htmlFor="serial-site" className="text-sm">Include Office Site code</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serial-padding" className="text-xs">Counter Digits</Label>
              <Select value={String(serialPadding)} onValueChange={v => setSerialPadding(Number(v))}>
                <SelectTrigger id="serial-padding" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 digits (001)</SelectItem>
                  <SelectItem value="4">4 digits (0001)</SelectItem>
                  <SelectItem value="5">5 digits (00001)</SelectItem>
                  <SelectItem value="6">6 digits (000001)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Preview:</p>
            <p className="text-base font-mono font-semibold">{previewSerial}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Codes shown (GCKW / RUH) are samples — actual values come from each uploader's profile.</p>
          </div>
          <Button size="sm" onClick={handleSaveSerialSettings} disabled={savingSettings}>
            <Save className="mr-2 h-3.5 w-3.5" />{savingSettings ? 'Saving...' : 'Save Format'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
