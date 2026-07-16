import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2, Eye, EyeOff } from 'lucide-react';
import { useRef } from 'react';
import type { LetterheadTemplate, OverlayBlock, OverlayConfig } from '@/lib/types';
import { DEFAULT_OVERLAY_CONFIG } from '@/lib/letterhead-import';

type FormData = Omit<LetterheadTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>;

interface Props {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSave: () => void;
  editingId: string | null;
}

const fontSizeMap = { small: 'text-[8px]', medium: 'text-sm', large: 'text-base' } as const;
const fontSizeMapTitle = { small: 'text-xs', medium: 'text-sm', large: 'text-lg' } as const;

function borderClass(style?: string) {
  if (!style || style === 'none') return 'border-transparent';
  if (style === 'dashed') return 'border-dashed border-border';
  return 'border-solid border-border';
}

export default function TemplateFormPreview({ form, setForm, onSave, editingId }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: keyof OverlayConfig; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSecondaryLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, secondaryLogoUrl: reader.result as string }));
    reader.readAsDataURL(file);
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

  const headerLayout = form.headerLayout ?? 'logo-left';
  const headerFontSize = form.headerFontSize ?? 'medium';
  const headerBorder = form.headerBorderStyle ?? 'solid';
  const footerBorder = form.footerBorderStyle ?? 'solid';
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
      {/* Form Column */}
      <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Template Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Office" />
          </div>
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} placeholder="Company address" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+971..." />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@gulfcryo.com" />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="www.gulfcryo.com" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Company Logo</Label>
            <Input type="file" accept="image/*" onChange={handleLogoUpload} />
            {form.logoUrl && <img src={form.logoUrl} alt="Logo preview" className="mt-1 h-12 object-contain" />}
          </div>
          <div className="space-y-2">
            <Label>Secondary Logo (optional)</Label>
            <Input type="file" accept="image/*" onChange={handleSecondaryLogoUpload} />
            {form.secondaryLogoUrl && <img src={form.secondaryLogoUrl} alt="Secondary logo" className="mt-1 h-12 object-contain" />}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Header Layout</Label>
            <Select value={headerLayout} onValueChange={v => setForm(f => ({ ...f, headerLayout: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="logo-left">Logo Left</SelectItem>
                <SelectItem value="logo-center">Logo Center</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Header Font Size</Label>
            <Select value={headerFontSize} onValueChange={v => setForm(f => ({ ...f, headerFontSize: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Header Border</Label>
            <Select value={headerBorder} onValueChange={v => setForm(f => ({ ...f, headerBorderStyle: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Footer Border</Label>
            <Select value={footerBorder} onValueChange={v => setForm(f => ({ ...f, footerBorderStyle: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Footer Text</Label>
          <Textarea value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} rows={2} placeholder="Registration details, disclaimer, etc." />
        </div>

        <Button className="w-full" onClick={onSave}>{editingId ? 'Update' : 'Create'} Template</Button>
      </div>

      {/* Live Preview Column */}
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
              {/* Toggles to show hidden blocks */}
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
          <div className="flex h-full flex-col p-4">
            {/* Header */}
            <div className={`pb-3 border-b ${borderClass(headerBorder)} ${headerLayout === 'logo-center' ? 'text-center' : ''}`}>
              <div className={`${headerLayout === 'logo-center' ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between gap-3'}`}>
                <div className={`${headerLayout === 'logo-center' ? 'flex flex-col items-center gap-2' : 'flex items-center gap-3'}`}>
                  {form.logoUrl && <img src={form.logoUrl} alt="" className="h-10 object-contain" />}
                  <div>
                    <p className={`font-bold ${fontSizeMapTitle[headerFontSize]}`}>{form.companyName || 'Company Name'}</p>
                    <p className={`text-muted-foreground ${fontSizeMap[headerFontSize]}`}>{form.address || 'Address'}</p>
                    <p className={`text-muted-foreground ${fontSizeMap[headerFontSize]}`}>{form.phone} {form.email}</p>
                  </div>
                </div>
                {form.secondaryLogoUrl && headerLayout === 'logo-left' && (
                  <img src={form.secondaryLogoUrl} alt="" className="h-8 object-contain" />
                )}
                {form.secondaryLogoUrl && headerLayout === 'logo-center' && (
                  <img src={form.secondaryLogoUrl} alt="" className="h-8 object-contain" />
                )}
              </div>
            </div>

            {/* Serial */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[7px] text-muted-foreground">Serial: GC-2026-02-0001</span>
            </div>

            {/* Body placeholder */}
            <div className="mt-4 flex-1 space-y-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-1.5 rounded bg-muted" style={{ width: `${60 + Math.random() * 40}%` }} />
              ))}
            </div>

            {/* Footer */}
            <div className={`border-t ${borderClass(footerBorder)} pt-2 text-[7px] text-center text-muted-foreground`}>
              {form.footerText || 'Footer text'} | {form.website}
            </div>
          </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
