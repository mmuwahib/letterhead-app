import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, Underline, RotateCcw, Check, FileText, IndentDecrease, IndentIncrease, Eraser } from 'lucide-react';
import type { BodyContent, BodyAlign, BodyFontFamily, BodyParagraph } from '@/lib/pdf-types';

interface DocumentContentEditorProps {
  /** Current body model (or null when not yet available). */
  value: BodyContent | null;
  /** Original body model for reset. */
  original: BodyContent | null;
  onApply: (body: BodyContent) => void;
  /** Whether the file is text-editable. PDFs/images get a friendly fallback. */
  editable: boolean;
  fileLabel?: string;
}

const FONT_OPTIONS: { value: BodyFontFamily; label: string }[] = [
  { value: 'Helvetica', label: 'Helvetica (sans-serif)' },
  { value: 'SegoeUI', label: 'Segoe UI (sans-serif)' },
  { value: 'TimesRoman', label: 'Times (serif)' },
  { value: 'Courier', label: 'Courier (mono)' },
];

const SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
const LINE_HEIGHT_OPTIONS = [
  { value: 1.0, label: '1.0' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2.0, label: '2.0' },
];

/** Indent options expressed in inches (UI label) → points (model value). 1" = 72pt. */
const INDENT_OPTIONS = [
  { value: 0, label: '0"' },
  { value: 18, label: '0.25"' },
  { value: 36, label: '0.5"' },
  { value: 54, label: '0.75"' },
  { value: 72, label: '1"' },
  { value: 108, label: '1.5"' },
  { value: 144, label: '2"' },
];
const FIRST_LINE_OPTIONS = [
  { value: 0, label: '0"' },
  { value: 18, label: '0.25"' },
  { value: 36, label: '0.5"' },
  { value: 54, label: '0.75"' },
];
const INDENT_STEP_PT = 18; // 0.25"

/** Page margin presets in points (1" = 72pt). */
const PAGE_MARGIN_OPTIONS = [
  { value: 18, label: '0.25"' },
  { value: 36, label: '0.5"' },
  { value: 54, label: '0.75"' },
  { value: 60, label: 'Default' },
  { value: 72, label: '1"' },
  { value: 90, label: '1.25"' },
  { value: 108, label: '1.5"' },
];

/** Convert a points indent value to a CSS px string for the editable surface. */
const ptToPx = (pt: number) => `${pt * 1.333}px`;

/** Serialize the contentEditable DOM back into BodyParagraph[] preserving inline runs. */
function domToParagraphs(root: HTMLElement, defaultFontSize: number, defaultAlign: BodyAlign): BodyParagraph[] {
  const out: BodyParagraph[] = [];
  const blockEls = Array.from(root.querySelectorAll<HTMLElement>(':scope > p, :scope > div'));
  const blocks = blockEls.length ? blockEls : [root];
  for (const block of blocks) {
    const align = (block.dataset.align as BodyAlign) || (block.style.textAlign as BodyAlign) || defaultAlign;
    const fontSize = Number(block.dataset.fontSize) || defaultFontSize;
    const indentLeft = Number(block.dataset.indentLeft) || 0;
    const indentRight = Number(block.dataset.indentRight) || 0;
    const indentFirstLine = Number(block.dataset.indentFirst) || 0;
    const runs: BodyParagraph['runs'] = [];
    const walk = (node: Node, ctx: { bold: boolean; italic: boolean; underline: boolean }) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (text.length === 0) return;
        runs.push({ text, bold: ctx.bold || undefined, italic: ctx.italic || undefined, underline: ctx.underline || undefined });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const next = {
        bold: ctx.bold || tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600,
        italic: ctx.italic || tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic',
        underline: ctx.underline || tag === 'u' || el.style.textDecoration?.includes('underline'),
      };
      if (tag === 'br') { runs.push({ text: ' ' }); return; }
      el.childNodes.forEach((c) => walk(c, next));
    };
    block.childNodes.forEach((c) => walk(c, { bold: false, italic: false, underline: false }));
    if (runs.length === 0) runs.push({ text: '' });
    out.push({
      runs,
      align: ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left',
      fontSize,
      spacingAfter: 6,
      indentLeft: indentLeft || undefined,
      indentRight: indentRight || undefined,
      indentFirstLine: indentFirstLine || undefined,
    });
  }
  return out.length ? out : [{ runs: [{ text: '' }], align: defaultAlign, fontSize: defaultFontSize, spacingAfter: 6 }];
}

/** Build initial HTML for the contentEditable from a BodyContent. */
function paragraphsToHtml(body: BodyContent): string {
  return body.paragraphs.map((p) => {
    const inner = p.runs.map((r) => {
      let html = escapeHtml(r.text || '');
      if (r.underline) html = `<u>${html}</u>`;
      if (r.italic) html = `<em>${html}</em>`;
      if (r.bold) html = `<strong>${html}</strong>`;
      return html;
    }).join('');
    const il = p.indentLeft || 0;
    const ir = p.indentRight || 0;
    const ifl = p.indentFirstLine || 0;
    const style = [
      `text-align:${p.align}`,
      `font-size:${p.fontSize}pt`,
      `margin:0 0 ${p.spacingAfter}pt 0`,
      `padding-left:${ptToPx(il)}`,
      `padding-right:${ptToPx(ir)}`,
      `text-indent:${ptToPx(ifl)}`,
    ].join(';');
    return `<p data-align="${p.align}" data-font-size="${p.fontSize}" data-indent-left="${il}" data-indent-right="${ir}" data-indent-first="${ifl}" style="${style};">${inner || '<br/>'}</p>`;
  }).join('');
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function DocumentContentEditor({ value, original, onApply, editable, fileLabel }: DocumentContentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<BodyFontFamily>(value?.font ?? 'Helvetica');
  const [fontSize, setFontSize] = useState<number>(value?.paragraphs[0]?.fontSize ?? 11);
  const [lineHeight, setLineHeight] = useState<number>(value?.lineHeight ?? 1.15);
  const [align, setAlign] = useState<BodyAlign>('left');
  // Current selection's paragraph indents (drives the dropdown displays).
  const [indentLeft, setIndentLeftState] = useState<number>(0);
  const [indentRight, setIndentRightState] = useState<number>(0);
  const [indentFirst, setIndentFirstState] = useState<number>(0);
  // Page margins (points)
  const [pageMarginLeft, setPageMarginLeft] = useState<number>(value?.pageMarginLeft ?? 60);
  const [pageMarginRight, setPageMarginRight] = useState<number>(value?.pageMarginRight ?? 60);
  const [dirty, setDirty] = useState(false);

  // Sync editor HTML when the source body changes (e.g. new file).
  useEffect(() => {
    if (!editable || !value || !editorRef.current) return;
    editorRef.current.innerHTML = paragraphsToHtml(value);
    setFont(value.font);
    setFontSize(value.paragraphs[0]?.fontSize ?? 11);
    setLineHeight(value.lineHeight);
    setIndentLeftState(value.paragraphs[0]?.indentLeft ?? 0);
    setIndentRightState(value.paragraphs[0]?.indentRight ?? 0);
    setIndentFirstState(value.paragraphs[0]?.indentFirstLine ?? 0);
    setPageMarginLeft(value.pageMarginLeft ?? 60);
    setPageMarginRight(value.pageMarginRight ?? 60);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === null, editable, original]);

  const exec = (cmd: string) => {
    document.execCommand(cmd, false);
    editorRef.current?.focus();
    setDirty(true);
  };

  /** Find paragraph blocks intersecting the current selection (or all blocks if none). */
  const getSelectedBlocks = (): HTMLElement[] => {
    const root = editorRef.current;
    if (!root) return [];
    const sel = window.getSelection();
    const allBlocks = Array.from(root.querySelectorAll<HTMLElement>(':scope > p, :scope > div'));
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      return allBlocks.length ? [allBlocks[0]] : [];
    }
    const range = sel.getRangeAt(0);
    const inRange = allBlocks.filter((b) => range.intersectsNode(b));
    return inRange.length ? inRange : allBlocks.slice(0, 1);
  };

  /** Apply an indent value (pt) to currently-selected paragraphs. */
  const applyIndent = (kind: 'left' | 'right' | 'first', valuePt: number) => {
    const blocks = getSelectedBlocks();
    if (blocks.length === 0) return;
    const safe = Math.max(0, valuePt);
    blocks.forEach((b) => {
      if (kind === 'left') {
        b.dataset.indentLeft = String(safe);
        b.style.paddingLeft = ptToPx(safe);
      } else if (kind === 'right') {
        b.dataset.indentRight = String(safe);
        b.style.paddingRight = ptToPx(safe);
      } else {
        b.dataset.indentFirst = String(safe);
        b.style.textIndent = ptToPx(safe);
      }
    });
    if (kind === 'left') setIndentLeftState(safe);
    else if (kind === 'right') setIndentRightState(safe);
    else setIndentFirstState(safe);
    setDirty(true);
    editorRef.current?.focus();
  };

  /** Increase / decrease left indent on selected paragraphs by one step. */
  const stepIndent = (delta: number) => {
    const blocks = getSelectedBlocks();
    if (blocks.length === 0) return;
    blocks.forEach((b) => {
      const cur = Number(b.dataset.indentLeft) || 0;
      const next = Math.max(0, Math.min(216, cur + delta));
      b.dataset.indentLeft = String(next);
      b.style.paddingLeft = ptToPx(next);
    });
    const first = blocks[0];
    setIndentLeftState(Number(first.dataset.indentLeft) || 0);
    setDirty(true);
    editorRef.current?.focus();
  };

  /** Update toolbar dropdowns when caret moves into a different paragraph. */
  const refreshIndentFromSelection = () => {
    const [first] = getSelectedBlocks();
    if (!first) return;
    setIndentLeftState(Number(first.dataset.indentLeft) || 0);
    setIndentRightState(Number(first.dataset.indentRight) || 0);
    setIndentFirstState(Number(first.dataset.indentFirst) || 0);
  };

  const setBlockAlign = (a: BodyAlign) => {
    setAlign(a);
    document.execCommand(
      a === 'left' ? 'justifyLeft' : a === 'center' ? 'justifyCenter' : a === 'right' ? 'justifyRight' : 'justifyFull',
      false,
    );
    // Also annotate selected blocks with data-align so we keep it on serialize.
    if (editorRef.current) {
      editorRef.current.querySelectorAll<HTMLElement>('p, div').forEach((el) => {
        if (el.style.textAlign) el.dataset.align = el.style.textAlign;
      });
    }
    setDirty(true);
  };

  const apply = () => {
    if (!editorRef.current || !value) return;
    const paragraphs = domToParagraphs(editorRef.current, fontSize, align);
    // Override font size on every paragraph so the size selector controls the whole body.
    paragraphs.forEach((p) => { p.fontSize = fontSize; });
    onApply({
      font,
      lineHeight,
      paragraphs,
      pageMarginLeft,
      pageMarginRight,
      pageMarginTop: value.pageMarginTop ?? 60,
      pageMarginBottom: value.pageMarginBottom ?? 60,
    });
    setDirty(false);
  };

  const reset = () => {
    if (!original || !editorRef.current) return;
    editorRef.current.innerHTML = paragraphsToHtml(original);
    setFont(original.font);
    setFontSize(original.paragraphs[0]?.fontSize ?? 11);
    setLineHeight(original.lineHeight);
    setAlign('left');
    setPageMarginLeft(original.pageMarginLeft ?? 60);
    setPageMarginRight(original.pageMarginRight ?? 60);
    onApply(original);
    setDirty(false);
  };

  /** Strip left/right/first-line indents from EVERY paragraph in the editor. */
  const clearAllParagraphIndents = () => {
    const root = editorRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>(':scope > p, :scope > div').forEach((b) => {
      b.dataset.indentLeft = '0';
      b.dataset.indentRight = '0';
      b.dataset.indentFirst = '0';
      b.style.paddingLeft = '0px';
      b.style.paddingRight = '0px';
      b.style.textIndent = '0px';
    });
    setIndentLeftState(0);
    setIndentRightState(0);
    setIndentFirstState(0);
    setDirty(true);
  };

  if (!editable) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{fileLabel ?? 'This file type'} can't be edited as text</p>
            <p className="text-xs text-muted-foreground mt-1">
              We can't safely re-flow the text inside PDFs or images. Switch to the <strong>Add Overlays</strong> tab to place editable text boxes on top of the document.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        Upload a DOCX, TXT, MD, or RTF file to start editing the text content.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">Font</Label>
          <Select value={font} onValueChange={(v) => { setFont(v as BodyFontFamily); setDirty(true); }}>
            <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">Size</Label>
          <Select value={String(fontSize)} onValueChange={(v) => { setFontSize(Number(v)); setDirty(true); }}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{s}pt</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">Line</Label>
          <Select value={String(lineHeight)} onValueChange={(v) => { setLineHeight(Number(v)); setDirty(true); }}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINE_HEIGHT_OPTIONS.map((s) => <SelectItem key={s.value} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-0.5 rounded border px-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('bold')} title="Bold"><Bold className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('italic')} title="Italic"><Italic className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('underline')} title="Underline"><Underline className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex items-center gap-0.5 rounded border px-0.5">
          <Button variant={align === 'left' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setBlockAlign('left')} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></Button>
          <Button variant={align === 'center' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setBlockAlign('center')} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></Button>
          <Button variant={align === 'right' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setBlockAlign('right')} title="Align right"><AlignRight className="h-3.5 w-3.5" /></Button>
          <Button variant={align === 'justify' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setBlockAlign('justify')} title="Justify"><AlignJustify className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex items-center gap-0.5 rounded border px-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepIndent(-INDENT_STEP_PT)} title="Decrease indent"><IndentDecrease className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepIndent(INDENT_STEP_PT)} title="Increase indent"><IndentIncrease className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground" title="Left indent for the selected paragraph(s)">L</Label>
          <Select value={String(indentLeft)} onValueChange={(v) => applyIndent('left', Number(v))}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDENT_OPTIONS.map((s) => <SelectItem key={s.value} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground" title="Right indent for the selected paragraph(s)">R</Label>
          <Select value={String(indentRight)} onValueChange={(v) => applyIndent('right', Number(v))}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDENT_OPTIONS.map((s) => <SelectItem key={s.value} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground" title="Extra indent for the first line of the paragraph">1st</Label>
          <Select value={String(indentFirst)} onValueChange={(v) => applyIndent('first', Number(v))}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIRST_LINE_OPTIONS.map((s) => <SelectItem key={s.value} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={reset} title="Reset to original">
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={apply} disabled={!dirty}>
            <Check className="mr-1 h-3 w-3" /> Apply changes
          </Button>
        </div>
      </div>

      {/* Page-level controls: margins + clear indents */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Label className="text-xs font-medium text-muted-foreground">Page margins:</Label>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground" title="Left page margin (whitespace from page edge)">Left</Label>
          <Select value={String(pageMarginLeft)} onValueChange={(v) => { setPageMarginLeft(Number(v)); setDirty(true); }}>
            <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_MARGIN_OPTIONS.map((s) => <SelectItem key={`pml-${s.value}`} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground" title="Right page margin">Right</Label>
          <Select value={String(pageMarginRight)} onValueChange={(v) => { setPageMarginRight(Number(v)); setDirty(true); }}>
            <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_MARGIN_OPTIONS.map((s) => <SelectItem key={`pmr-${s.value}`} value={String(s.value)} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={clearAllParagraphIndents} title="Remove L/R/first-line indents from every paragraph">
          <Eraser className="mr-1 h-3 w-3" /> Clear all paragraph indents
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Reduce page margins or clear paragraph indents if your content is being pushed too far from the left edge.
        </p>
      </div>

      {/* Editable surface */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[260px] max-h-[420px] overflow-auto rounded border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        style={{
          fontFamily:
            font === 'TimesRoman'
              ? 'Times, serif'
              : font === 'Courier'
              ? 'monospace'
              : font === 'SegoeUI'
              ? '"Selawik", "Segoe UI", system-ui, sans-serif'
              : 'system-ui, sans-serif',
          lineHeight,
        }}
        onInput={() => setDirty(true)}
        onKeyUp={refreshIndentFromSelection}
        onMouseUp={refreshIndentFromSelection}
        onBlur={() => {/* keep dirty state */}}
      />
      <p className="text-[11px] text-muted-foreground">
        Edit the text directly. Use the toolbar to change font, size, alignment, indentation, or styling. Indent controls (L / R / 1st) apply to the paragraph your cursor is in. Click <strong>Apply changes</strong> to update the preview below.
      </p>
    </div>
  );
}