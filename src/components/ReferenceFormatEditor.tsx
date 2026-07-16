import { ChevronUp, ChevronDown, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import type { ReferenceFormat, ReferenceSegment } from '@/lib/types';
import { DEFAULT_REFERENCE_FORMAT } from '@/lib/types';

const ALL_SEGMENTS: { id: ReferenceSegment; label: string; sample: (ctx: SampleCtx) => string }[] = [
  { id: 'PREFIX',  label: 'Prefix',         sample: (c) => c.prefix },
  { id: 'COMPANY', label: 'Company code',   sample: (c) => c.company || 'GCKW' },
  { id: 'DEPT',    label: 'Department code', sample: () => '0010' },
  { id: 'DATE',    label: 'Date (YYYYMMDD)', sample: () => {
      const d = new Date();
      return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    }
  },
  { id: 'COUNTER', label: 'Counter',        sample: (c) => '1'.padStart(c.padding, '0') },
];

interface SampleCtx { prefix: string; padding: number; company?: string; }

interface Props {
  value: ReferenceFormat;
  onChange: (v: ReferenceFormat) => void;
  companyCode?: string;
  companyName?: string;
  siteCode?: string;
  fallbackPrefix: string;
  fallbackSeparator: string;
  fallbackPadding: number;
}

export default function ReferenceFormatEditor({ value, onChange, companyCode, companyName, siteCode, fallbackPrefix, fallbackSeparator, fallbackPadding }: Props) {
  const segments = value.segments?.length ? value.segments : DEFAULT_REFERENCE_FORMAT.segments;
  const prefix = value.prefix?.trim() || fallbackPrefix;
  const separator = value.separator?.trim() || fallbackSeparator;
  const padding = (value.padding && value.padding > 0) ? value.padding : fallbackPadding;

  const overrideOn = !!(value.prefix || value.separator || value.padding);

  const toggleSegment = (id: ReferenceSegment, on: boolean) => {
    if (on && !segments.includes(id)) {
      // Insert in canonical position to preserve a sensible default
      const order: ReferenceSegment[] = ['PREFIX','COMPANY','DEPT','DATE','COUNTER'];
      const next = order.filter(s => segments.includes(s) || s === id);
      onChange({ ...value, segments: next });
    } else if (!on) {
      onChange({ ...value, segments: segments.filter(s => s !== id) });
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...segments];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...value, segments: next });
  };

  const ctx: SampleCtx = { prefix, padding, company: companyCode };
  const preview = segments
    .map(s => ALL_SEGMENTS.find(x => x.id === s)?.sample(ctx) ?? '')
    .filter(Boolean)
    .join(separator);

  const companyMissing = segments.includes('COMPANY') && !companyCode?.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Hash className="h-3.5 w-3.5 text-primary" />
        <Label className="text-xs font-semibold">Reference Number Format (this template)</Label>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-1">
        Choose which segments to include and in what order. Unchecked segments are omitted from the reference number.
      </p>

      <div className="space-y-1.5">
        {segments.map((id, idx) => {
          const meta = ALL_SEGMENTS.find(x => x.id === id);
          if (!meta) return null;
          return (
            <div key={id} className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
              <Checkbox checked onCheckedChange={(v) => toggleSegment(id, !!v)} />
              <span className="flex-1 text-xs font-medium">{meta.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{meta.sample(ctx)}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => move(idx, +1)} disabled={idx === segments.length - 1}>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
        {ALL_SEGMENTS.filter(s => !segments.includes(s.id)).map(meta => (
          <div key={meta.id} className="flex items-center gap-2 rounded border border-dashed bg-muted/30 px-2 py-1.5">
            <Checkbox checked={false} onCheckedChange={(v) => toggleSegment(meta.id, !!v)} />
            <span className="flex-1 text-xs text-muted-foreground">{meta.label}</span>
            <span className="text-[10px] font-mono text-muted-foreground/60">excluded</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="ref-overrides"
          checked={overrideOn}
          onCheckedChange={(on) => {
            if (on) {
              onChange({ ...value, prefix: fallbackPrefix, separator: fallbackSeparator, padding: fallbackPadding });
            } else {
              onChange({ segments: value.segments });
            }
          }}
        />
        <Label htmlFor="ref-overrides" className="text-xs">Override prefix / separator / padding for this template</Label>
      </div>
      {overrideOn && (
        <div className="grid gap-2 sm:grid-cols-3 pl-7">
          <div className="space-y-1">
            <Label className="text-[10px]">Prefix</Label>
            <Input className="h-8 text-sm" value={value.prefix ?? ''} onChange={e => onChange({ ...value, prefix: e.target.value })} placeholder={fallbackPrefix} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Separator</Label>
            <Input className="h-8 text-sm" maxLength={3} value={value.separator ?? ''} onChange={e => onChange({ ...value, separator: e.target.value })} placeholder={fallbackSeparator} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Counter digits</Label>
            <Input type="number" min={1} max={10} className="h-8 text-sm" value={value.padding ?? ''} onChange={e => onChange({ ...value, padding: Number(e.target.value) || undefined })} placeholder={String(fallbackPadding)} />
          </div>
        </div>
      )}

      <div className="rounded-md border bg-muted/50 p-2">
        <p className="text-[10px] text-muted-foreground">Preview</p>
        <p className="text-sm font-mono font-semibold break-all">{preview || '—'}</p>
        {companyMissing && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            {companyName
              ? `${companyName} has no short code — the COMPANY segment is using a sample value. Add a code in Admin → Legal Entities.`
              : 'No issuing legal entity selected — COMPANY uses a sample value.'}
          </p>
        )}
      </div>
    </div>
  );
}