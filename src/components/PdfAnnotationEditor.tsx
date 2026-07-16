import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Plus, Trash2, GripVertical, AlignLeft, AlignCenter, AlignRight, Bold } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation, LayoutOptions } from '@/lib/pdf-types';
import LetterheadAdjustPanel from './LetterheadAdjustPanel';
import DocumentFitPanel from './DocumentFitPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfAnnotationEditorProps {
  pdfBytes: ArrayBuffer;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  layout: LayoutOptions;
  onLayoutChange: (layout: LayoutOptions) => void;
  allowAnnotations?: boolean;
}

export default function PdfAnnotationEditor({
  pdfBytes,
  annotations,
  onAnnotationsChange,
  layout,
  onLayoutChange,
  allowAnnotations = true,
}: PdfAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
      if (!cancelled) {
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    const renderPage = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      const page = await pdfDoc.getPage(currentPage);
      if (cancelled) return;
      const scale = 1.4;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch {}
    };
    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  const pageAnnotations = annotations.filter(a => a.pageIndex === currentPage - 1);

  const addAnnotation = () => {
    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      text: 'New text',
      x: 10,
      y: 10,
      fontSize: 12,
      pageIndex: currentPage - 1,
      align: 'left',
      bold: false,
    };
    onAnnotationsChange([...annotations, newAnnotation]);
    setEditingId(newAnnotation.id);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    onAnnotationsChange(annotations.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const removeAnnotation = (id: string) => {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ann = annotations.find(a => a.id === id);
    if (!ann) return;
    const annPxX = (ann.x / 100) * canvasSize.width;
    const annPxY = (ann.y / 100) * canvasSize.height;
    setDragging({
      id,
      offsetX: e.clientX - rect.left - annPxX,
      offsetY: e.clientY - rect.top - annPxY,
    });
  }, [annotations, canvasSize]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragging.offsetX) / canvasSize.width) * 100;
    const y = ((e.clientY - rect.top - dragging.offsetY) / canvasSize.height) * 100;
    updateAnnotation(dragging.id, {
      x: Math.max(0, Math.min(90, x)),
      y: Math.max(0, Math.min(95, y)),
    });
  }, [dragging, canvasSize]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {allowAnnotations && (
          <Button variant="outline" size="sm" onClick={addAnnotation}>
            <Plus className="h-3 w-3 mr-1" /> Add Text
          </Button>
        )}
        <div className="flex-1" />
        <DocumentFitPanel layout={layout} onChange={onLayoutChange} />
        <LetterheadAdjustPanel layout={layout} onChange={onLayoutChange} />
      </div>

      {/* Canvas with annotation overlay */}
      <div
        ref={containerRef}
        className="relative w-full overflow-auto rounded border bg-muted/30 flex justify-center"
        style={{ maxHeight: 500 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block max-w-full h-auto" />
          {/* Document safe-area guide */}
          {(layout.docTopInset > 0 || layout.docBottomInset > 0 || layout.docHorizontalPad > 0) &&
            (layout.docInsetAllPages || currentPage === 1) && (
              <div
                className="absolute pointer-events-none border-2 border-dashed border-primary/50 bg-primary/5"
                style={{
                  left: `${layout.docHorizontalPad * 100}%`,
                  right: `${layout.docHorizontalPad * 100}%`,
                  top: `${layout.docTopInset * 100}%`,
                  bottom: `${layout.docBottomInset * 100}%`,
                }}
              />
            )}
          {/* Annotation overlays */}
          {allowAnnotations && pageAnnotations.map(ann => (
            <div
              key={ann.id}
              className="absolute group"
              style={{
                left: `${ann.x}%`,
                top: `${ann.y}%`,
                cursor: dragging?.id === ann.id ? 'grabbing' : 'grab',
              }}
            >
              <div className="flex items-start gap-0.5">
                <div
                  className="p-0.5 cursor-grab text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => handleMouseDown(e, ann.id)}
                >
                  <GripVertical className="h-3 w-3" />
                </div>
                <div className="flex flex-col gap-0.5">
                  {editingId === ann.id ? (
                    <div className="flex items-center gap-1 bg-background border rounded p-1 shadow-md">
                      <Input
                        value={ann.text}
                        onChange={(e) => updateAnnotation(ann.id, { text: e.target.value })}
                        className="h-6 text-xs w-32"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                      />
                      <select
                        value={ann.fontSize}
                        onChange={(e) => updateAnnotation(ann.id, { fontSize: Number(e.target.value) })}
                        className="h-6 text-xs border rounded bg-background px-1"
                      >
                        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map(s => (
                          <option key={s} value={s}>{s}pt</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-0.5 border rounded px-0.5">
                        <Button variant={ann.align === 'left' || !ann.align ? 'secondary' : 'ghost'} size="icon" className="h-5 w-5" onClick={() => updateAnnotation(ann.id, { align: 'left' })} title="Align left">
                          <AlignLeft className="h-3 w-3" />
                        </Button>
                        <Button variant={ann.align === 'center' ? 'secondary' : 'ghost'} size="icon" className="h-5 w-5" onClick={() => updateAnnotation(ann.id, { align: 'center' })} title="Align center">
                          <AlignCenter className="h-3 w-3" />
                        </Button>
                        <Button variant={ann.align === 'right' ? 'secondary' : 'ghost'} size="icon" className="h-5 w-5" onClick={() => updateAnnotation(ann.id, { align: 'right' })} title="Align right">
                          <AlignRight className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant={ann.bold ? 'secondary' : 'ghost'} size="icon" className="h-5 w-5" onClick={() => updateAnnotation(ann.id, { bold: !ann.bold })} title="Bold">
                        <Bold className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeAnnotation(ann.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingId(null)}>
                        ✓
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="px-1 py-0.5 rounded bg-primary/10 border border-primary/30 text-foreground cursor-pointer select-none"
                      style={{
                        fontSize: `${Math.max(8, ann.fontSize * 0.8)}px`,
                        textAlign: ann.align ?? 'left',
                        fontWeight: ann.bold ? 700 : 400,
                        minWidth: 40,
                      }}
                      onDoubleClick={() => setEditingId(ann.id)}
                    >
                      {ann.text}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 inline-flex"
                        onClick={() => removeAnnotation(ann.id)}
                      >
                        <Trash2 className="h-2.5 w-2.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {pageAnnotations.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Double-click an annotation to edit • Drag to reposition
        </p>
      )}
    </div>
  );
}
