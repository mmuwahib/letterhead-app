import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Move, ChevronDown, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { LayoutOptions } from '@/lib/pdf-types';
import { DEFAULT_LAYOUT } from '@/lib/pdf-types';
import { useState } from 'react';

interface DocumentFitPanelProps {
  layout: LayoutOptions;
  onChange: (layout: LayoutOptions) => void;
}

export default function DocumentFitPanel({ layout, onChange }: DocumentFitPanelProps) {
  const [open, setOpen] = useState(false);

  const update = <K extends keyof LayoutOptions>(key: K, value: LayoutOptions[K]) => {
    onChange({ ...layout, [key]: value });
  };

  const reset = () =>
    onChange({
      ...layout,
      docTopInset: DEFAULT_LAYOUT.docTopInset,
      docBottomInset: DEFAULT_LAYOUT.docBottomInset,
      docHorizontalPad: DEFAULT_LAYOUT.docHorizontalPad,
      docInsetAllPages: DEFAULT_LAYOUT.docInsetAllPages,
      docBodyIndent: DEFAULT_LAYOUT.docBodyIndent,
      docHorizontalAlign: DEFAULT_LAYOUT.docHorizontalAlign,
    });

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // A4 width in mm = 210; fraction-of-width → mm for a quick visual cue.
  const mm = (v: number) => `${Math.round(v * 210)}mm`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Move className="h-4 w-4" />
            Adjust Document Fit
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4 px-1">
        <p className="text-xs text-muted-foreground">
          If the letterhead header or footer covers your document text, increase the top or bottom safe area to push the content into the clear zone.
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Top safe area</Label>
            <span className="text-xs text-muted-foreground">{pct(Math.max(0.12, layout.docTopInset))}</span>
          </div>
          <Slider
            value={[Math.round(Math.max(0.12, layout.docTopInset) * 100)]}
            onValueChange={([v]) => update('docTopInset', v / 100)}
            min={12}
            max={40}
            step={1}
          />
          <p className="text-[10px] text-muted-foreground">
            Reserved space at the top so the letterhead header is visible on every page.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Bottom safe area</Label>
            <span className="text-xs text-muted-foreground">{pct(Math.max(0.08, layout.docBottomInset))}</span>
          </div>
          <Slider
            value={[Math.round(Math.max(0.08, layout.docBottomInset) * 100)]}
            onValueChange={([v]) => update('docBottomInset', v / 100)}
            min={8}
            max={25}
            step={1}
          />
          <p className="text-[10px] text-muted-foreground">
            Reserved space at the bottom so the letterhead footer is visible on every page.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Horizontal padding</Label>
            <span className="text-xs text-muted-foreground">{pct(layout.docHorizontalPad)}</span>
          </div>
          <Slider
            value={[Math.round(layout.docHorizontalPad * 100)]}
            onValueChange={([v]) => update('docHorizontalPad', v / 100)}
            min={0}
            max={10}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Document alignment</Label>
          <ToggleGroup
            type="single"
            value={layout.docHorizontalAlign ?? 'center'}
            onValueChange={(v) => {
              if (v === 'left' || v === 'center' || v === 'right') {
                update('docHorizontalAlign', v);
              }
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="left" aria-label="Align left" size="sm">
              <AlignLeft className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Align center" size="sm">
              <AlignCenter className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Align right" size="sm">
              <AlignRight className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-[10px] text-muted-foreground">
            Aligns your uploaded document body left, center, or right inside the letterhead safe area.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Ref / Date indent</Label>
            <span className="text-xs text-muted-foreground">
              {pct(layout.docBodyIndent ?? DEFAULT_LAYOUT.docBodyIndent)} · {mm(layout.docBodyIndent ?? DEFAULT_LAYOUT.docBodyIndent)}
            </span>
          </div>
          <Slider
            value={[Math.round((layout.docBodyIndent ?? DEFAULT_LAYOUT.docBodyIndent) * 200)]}
            onValueChange={([v]) => update('docBodyIndent', v / 200)}
            min={0}
            max={50}
            step={1}
          />
          <p className="text-[10px] text-muted-foreground">
            Aligns the Ref and Date stamp with your document's left text margin.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Apply to all pages</Label>
          <Switch
            checked={layout.docInsetAllPages}
            onCheckedChange={(v) => update('docInsetAllPages', v)}
          />
        </div>

        <Button variant="ghost" size="sm" onClick={reset} className="w-full text-xs">
          Reset document fit
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}