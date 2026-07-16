import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Upload, X, RotateCcw, Settings2, Eye, EyeOff, Hash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LetterheadTemplate, OverlayBlock, OverlayConfig } from '@/lib/types';
import { letterheadFileToPng, DEFAULT_OVERLAY_CONFIG } from '@/lib/letterhead-import';
import { toast } from '@/hooks/use-toast';
import { fetchSerialSettings } from '@/lib/storage';

type FormData = Omit<LetterheadTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>;

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSave: () => void;
  editingId: string | null;
}

export default function UploadedTemplateForm({ form, setForm, onSave, editingId }: Props) {
  const [importing, setImporting] = useState(false);
  const [serialPreview, setSerialPreview] = useState<string>('');
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: keyof OverlayConfig; startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    fetchSerialSettings().then(s => {
      const now = new Date();
      const parts = [s.prefix];
      if (s.includeLegalEntity) parts.push('GCKW');
      if (s.includeSite) parts.push('RUH');
      parts.push(now.getFullYear().toString());
      if (s.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
      parts.push('1'.padStart(s.padding, '0'));
      setSerialPreview(parts.join(s.separator));
    }).catch(() => {});
  }, []);

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const png = await letterheadFileToPng(file);
      setForm(f => ({
        ...f,
        backgroundUrl: png,
        overlayConfig: f.overlayConfig && Object.keys(f.overlayConfig).length > 1
          ? f.overlayConfig
          : DEFAULT_OVERLAY_CONFIG,
      }));
      toast({ title: 'Letterhead loaded', description: 'Drag the fields in the preview to reposition them.' });
    } catch (err: any) {
      toast({ title: 'Could not import file', description: err?.message || 'Unsupported file', variant: 'destructive' });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const overlay: OverlayConfig = { ...DEFAULT_OVERLAY_CONFIG, ...(form.overlayConfig ?? {}) };

  const updateBlock = (key: keyof OverlayConfig, patch: Partial<OverlayBlock>) => {
    setForm(f => {
      const cur = { ...DEFAULT_OVERLAY_CONFIG, ...(f.overlayConfig ?? {}) };
      const block = { ...(cur[key] as OverlayBlock), ...patch };
      return { ...f, overlayConfig: { ...cur, [key]: block } };
    });
  };

  const startDrag = (key: keyof OverlayConfig) => (e: React.PointerEvent) => {
    if (!previewRef.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const block = overlay[key] as OverlayBlock;
    dragRef.current = { key, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y };
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    const x = Math.max(0, Math.min(95, dragRef.current.origX + dx));
    const y = Math.max(0, Math.min(98, dragRef.current.origY + dy));
    updateBlock(dragRef.current.key, { x, y });
  };

  const endDrag = () => { dragRef.current = null; };

  const resetPositions = () => {
    setForm(f => ({ ...f, overlayConfig: { ...DEFAULT_OVERLAY_CONFIG, applyToAllPages: f.overlayConfig?.applyToAllPages ?? false } }));
  };

  const usingBackground = !!form.backgroundUrl;

  const overlayBlocks: { key: keyof OverlayConfig; label: string; text: string }[] = [
    { key: 'companyName', label: 'Company Name', text: form.companyName || 'Company Name' },
    { key: 'address', label: 'Address', text: form.address || 'Address' },
    { key: 'contact', label: 'Phone / Email', text: [form.phone, form.email].filter(Boolean).join('  •  ') || 'Phone • Email' },
    { key: 'serialNumber', label: 'Serial Number', text: 'GC-2026-02-0001' },
    { key: 'footerText', label: 'Footer', text: form.footerText || 'Footer text' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-2">
        <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4" /> Upload letterhead file
          </Label>
          <p className="text-xs text-muted-foreground">
            Upload a PDF, Word, PNG or JPG. The first page becomes the template background. Drag fields in the preview to position them.
          </p>
          <Input
            type="file"
            accept=".pdf,.docx,image/png,image/jpeg"
            onChange={handleBackgroundUpload}
            disabled={importing}
          />
          {importing && <p className="text-xs text-muted-foreground">Importing…</p>}
          {usingBackground && (
            <div className="flex items-center gap-3">
              <img src={form.backgroundUrl} alt="Letterhead background" className="h-16 rounded border bg-background object-contain" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="apply-all-up"
                    checked={!!overlay.applyToAllPages}
                    onCheckedChange={(v) => setForm(f => ({ ...f, overlayConfig: { ...overlay, applyToAllPages: v } }))}
                  />
                  <Label htmlFor="apply-all-up" className="text-xs">Apply background to all pages</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={resetPositions}>
                    <RotateCcw className="mr-1 h-3 w-3" /> Reset positions
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, backgroundUrl: '' }))}>
                    <X className="mr-1 h-3 w-3" /> Remove
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Template Name *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Imported Letterhead" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Company Name (overlay)</Label>
            <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Address (overlay)</Label>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Footer Text (overlay)</Label>
          <Input value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} />
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: Leave overlay fields blank if your uploaded letterhead already includes them — then hide the matching draggable block in the preview.
        </p>

        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Hash className="h-3 w-3" /> Reference number on generated documents
          </div>
          <p className="mt-1 font-mono text-sm font-semibold">{serialPreview || 'Loading…'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Same format as Built templates. Configure in Reference Number Format below.
          </p>
        </div>

        <Button className="w-full" onClick={onSave} disabled={!usingBackground}>
          {editingId ? 'Update' : 'Create'} Template
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">
          Live Preview {usingBackground && <span className="ml-2 text-xs">(drag fields to reposition)</span>}
        </Label>
        <div className="sticky top-0 rounded-lg border bg-card p-4">
          <div
            ref={previewRef}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            className="relative mx-auto aspect-[8.5/11] w-full max-w-sm overflow-hidden border bg-background shadow-sm"
          >
            {usingBackground ? (
              <>
                <img src={form.backgroundUrl} alt="Letterhead" className="absolute inset-0 h-full w-full object-contain" />
                {overlayBlocks.map(b => {
                  const block = overlay[b.key] as OverlayBlock;
                  if (!block?.visible) return null;
                  return (
                    <div
                      key={b.key}
                      className="group absolute select-none"
                      style={{
                        left: `${block.x}%`,
                        top: `${block.y}%`,
                        fontSize: `${block.fontSize * 0.6}px`,
                        textAlign: block.align ?? 'left',
                        maxWidth: '60%',
                      }}
                    >
                      <div
                        onPointerDown={startDrag(b.key)}
                        className="cursor-move rounded border border-transparent bg-background/70 px-1 leading-tight text-foreground hover:border-primary"
                        title={`Drag to reposition ${b.label}`}
                      >
                        {b.text}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="absolute -right-3 -top-3 hidden h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow group-hover:flex"
                          >
                            <Settings2 className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 space-y-3" side="right">
                          <div className="text-xs font-medium">{b.label}</div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Font size</span><span>{block.fontSize}pt</span>
                            </div>
                            <Slider value={[block.fontSize]} min={6} max={32} step={1} onValueChange={([v]) => updateBlock(b.key, { fontSize: v })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Alignment</Label>
                            <Select value={block.align ?? 'left'} onValueChange={(v) => updateBlock(b.key, { align: v as any })}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => updateBlock(b.key, { visible: false })}>
                            <EyeOff className="mr-1 h-3 w-3" /> Hide field
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  );
                })}
                <div className="absolute bottom-1 right-1 flex flex-wrap justify-end gap-1">
                  {overlayBlocks.filter(b => !(overlay[b.key] as OverlayBlock)?.visible).map(b => (
                    <button
                      key={b.key}
                      type="button"
                      className="rounded bg-muted px-1 text-[8px] text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => updateBlock(b.key, { visible: true })}
                    >
                      <Eye className="mr-0.5 inline h-2 w-2" />{b.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground p-6">
                Upload a letterhead file to see the preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}