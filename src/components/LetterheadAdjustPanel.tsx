import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Settings2, ChevronDown } from 'lucide-react';
import type { LayoutOptions } from '@/lib/pdf-types';
import { DEFAULT_LAYOUT } from '@/lib/pdf-types';
import { useState } from 'react';

interface LetterheadAdjustPanelProps {
  layout: LayoutOptions;
  onChange: (layout: LayoutOptions) => void;
}

export default function LetterheadAdjustPanel({ layout, onChange }: LetterheadAdjustPanelProps) {
  const [open, setOpen] = useState(false);

  const update = (key: keyof LayoutOptions, value: number) => {
    onChange({ ...layout, [key]: value });
  };

  const reset = () => onChange({ ...DEFAULT_LAYOUT });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Adjust Letterhead Layout
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4 px-1">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Header Top Margin</Label>
            <span className="text-xs text-muted-foreground">{layout.headerTopMargin}px</span>
          </div>
          <Slider
            value={[layout.headerTopMargin]}
            onValueChange={([v]) => update('headerTopMargin', v)}
            min={0}
            max={60}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Footer Height</Label>
            <span className="text-xs text-muted-foreground">{layout.footerHeight}px</span>
          </div>
          <Slider
            value={[layout.footerHeight]}
            onValueChange={([v]) => update('footerHeight', v)}
            min={20}
            max={100}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Logo Scale</Label>
            <span className="text-xs text-muted-foreground">{(layout.logoScale * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[layout.logoScale * 100]}
            onValueChange={([v]) => update('logoScale', v / 100)}
            min={30}
            max={200}
            step={5}
          />
        </div>

        <Button variant="ghost" size="sm" onClick={reset} className="w-full text-xs">
          Reset to Defaults
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
