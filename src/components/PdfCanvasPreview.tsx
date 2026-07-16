import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfCanvasPreviewProps {
  pdfBytes: ArrayBuffer;
}

export default function PdfCanvasPreview({ pdfBytes }: PdfCanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);

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
      const ctx = canvas.getContext('2d')!;

      const task = page.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try { await task.promise; } catch {}
    };

    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  return (
    <div className="space-y-2">
      <div className="w-full overflow-auto rounded border bg-muted/30 flex justify-center" style={{ maxHeight: 500 }}>
        <canvas ref={canvasRef} className="block max-w-full h-auto" />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
