import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, FileUp, Eye, FileText, RotateCcw, FileCheck2, Check, Copy, Sparkles, Info, Loader2, AlertCircle, ExternalLink, CheckCircle2, Sparkle, ChevronsUpDown, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PdfAnnotationEditor from '@/components/PdfAnnotationEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogTrigger, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { fetchTemplates, generateSerialNumber, addDocumentToDb, addLogToDb, uploadDocumentPdf } from '@/lib/storage';
import type { LetterheadTemplate } from '@/lib/types';
import type { Annotation, LayoutOptions } from '@/lib/pdf-types';
import { DEFAULT_LAYOUT } from '@/lib/pdf-types';
import { toast } from '@/hooks/use-toast';
import * as pdfjsLib from 'pdfjs-dist';
import { DEFAULT_OVERLAY_CONFIG } from '@/lib/letterhead-import';
import type { OverlayBlock, OverlayConfig } from '@/lib/types';
import { SENSITIVITY_LABELS, type DocumentSensitivity } from '@/lib/types';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  fileToPdfBytes,
  extractTextFromFile,
  isTextEditable,
  isImage,
  fileKindLabel,
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_FILE_REGEX,
} from '@/lib/document-to-pdf';
import { renderStyledBodyToPdf, textToBodyContent, docxToBodyContent, isDocx } from '@/lib/document-to-pdf';
import type { BodyContent } from '@/lib/pdf-types';
import DocumentContentEditor from '@/components/DocumentContentEditor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  PDFDocument,
  rgb,
  StandardFonts,
} from 'pdf-lib';

/**
 * Inspect a letterhead background image and estimate the printed header band
 * (top) and footer band (bottom) heights as fractions of total page height.
 * Walks rows from the top until a sufficiently empty row is found, then from
 * the bottom upward. Returns conservative values clamped to the same ranges
 * the DocumentFitPanel allows so the user can still tweak afterwards.
 */
async function detectLetterheadSafeAreas(
  backgroundUrl: string
): Promise<{ top: number; bottom: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = backgroundUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    // A row is "inked" if at least 0.4% of its pixels are clearly non-white.
    const inkThreshold = Math.max(4, Math.floor(w * 0.004));
    const rowIsInked = (y: number) => {
      let inked = 0;
      const base = y * w * 4;
      for (let x = 0; x < w; x++) {
        const i = base + x * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 32) continue;
        if (r < 235 || g < 235 || b < 235) {
          inked++;
          if (inked >= inkThreshold) return true;
        }
      }
      return false;
    };

    // Top band: scan first 40% from the top, find the LAST inked row in that
    // region followed by ~2% of consistently-clear rows.
    const maxTopScan = Math.floor(h * 0.4);
    let topBand = 0;
    let lastInkedTop = -1;
    for (let y = 0; y < maxTopScan; y++) {
      if (rowIsInked(y)) lastInkedTop = y;
    }
    if (lastInkedTop >= 0) topBand = lastInkedTop;

    // Bottom band: scan last 25% from the bottom upward.
    const maxBotScan = Math.floor(h * 0.25);
    let botBand = 0;
    let lastInkedBot = -1;
    for (let y = h - 1; y >= h - maxBotScan; y--) {
      if (rowIsInked(y)) lastInkedBot = h - 1 - y;
    }
    if (lastInkedBot >= 0) botBand = lastInkedBot;

    return {
      top: Math.max(0, Math.min(0.4, topBand / h)),
      bottom: Math.max(0, Math.min(0.25, botBand / h)),
    };
  } catch (e) {
    console.warn('[safe-area] detection failed', e);
    return null;
  }
}

async function applyLetterhead(
  pdfBytes: ArrayBuffer,
  template: LetterheadTemplate,
  serialNumber?: string,
  layoutOpts?: LayoutOptions,
  annotations?: Annotation[],
  watermark?: boolean,
  sensitivity?: DocumentSensitivity,
  generatedAt?: Date,
  sensitivityPosition?: 'above-line' | 'on-line',
  sensitivityYOffset?: number,
): Promise<Uint8Array> {
  const lo = layoutOpts ?? DEFAULT_LAYOUT;
  const sensPos: 'above-line' | 'on-line' = sensitivityPosition ?? 'above-line';
  // Positive moves the label UP (away from the footer); negative moves it DOWN.
  const sensYOffset = Math.max(-80, Math.min(120, sensitivityYOffset ?? 0));
  const issuedDate = generatedAt ?? new Date();
  const formattedDate = issuedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const wmPages: 'first' | 'last' | 'all' = template.watermarkPages ?? 'all';

  // Helpers ────────────────────────────────────────────────────────────────────
  // Decode any image URL (data: or http(s)) into raw bytes.
  const loadImageBytes = async (url: string): Promise<ArrayBuffer> => {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      const meta = url.slice(5, comma); // e.g. "image/png;base64"
      const payload = url.slice(comma + 1).trim();
      if (meta.includes('base64')) {
        const bin = atob(payload.replace(/\s/g, ''));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8.buffer;
      }
      return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
    return r.arrayBuffer();
  };
  const detectImageMime = (bytes: ArrayBuffer) => {
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'image/png';
    if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'image/jpeg';
    return 'image/png';
  };
  const bytesToDataUrl = (bytes: ArrayBuffer, mime = detectImageMime(bytes)) => {
    const u8 = new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  };
  const embedImageSmart = async (doc: PDFDocument, bytes: ArrayBuffer) => {
    const u8 = new Uint8Array(bytes);
    const isPng = u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
    const isJpg = u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff;
    if (isPng) return doc.embedPng(bytes);
    if (isJpg) return doc.embedJpg(bytes);
    try { return await doc.embedPng(bytes); } catch { return doc.embedJpg(bytes); }
  };
  const makeWhiteTransparentPng = async (bytes: ArrayBuffer): Promise<ArrayBuffer> => {
    const img = new Image();
    img.src = bytesToDataUrl(bytes);
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 245 && g > 245 && b > 245) data[i + 3] = 0;
      else if (r > 235 && g > 235 && b > 235) data[i + 3] = Math.min(data[i + 3], 70);
    }
    ctx.putImageData(imageData, 0, 0);
    return loadImageBytes(canvas.toDataURL('image/png'));
  };
  const containedRect = (image: { width: number; height: number }, pw: number, ph: number) => {
    const imageRatio = image.width / image.height;
    const pageRatio = pw / ph;
    if (imageRatio > pageRatio) {
      const width = pw;
      const height = width / imageRatio;
      return { x: 0, y: (ph - height) / 2, width, height };
    }
    const height = ph;
    const width = height * imageRatio;
    return { x: (pw - width) / 2, y: 0, width, height };
  };

  const watermarkSrc = template.watermarkImageUrl || template.logoUrl;
  const watermarkOpacity = Math.max(0, Math.min(1, template.watermarkOpacity ?? 0.12));
  const watermarkActive = !!watermark && watermarkOpacity > 0;

  // ════════════════════════════════════════════════════════════════════════════
  // PATH A — Template has an uploaded background letterhead.
  // Build a fresh document so we never fall through to the classic header.
  // ════════════════════════════════════════════════════════════════════════════
  if (template.backgroundUrl) {
    const overlay: OverlayConfig = { ...DEFAULT_OVERLAY_CONFIG, ...(template.overlayConfig ?? {}) };
    const legacyDefaultBlocks: Partial<Record<keyof OverlayConfig, OverlayBlock>> = {
      companyName: { x: 8, y: 5, fontSize: 16, visible: true, align: 'left' },
      address: { x: 8, y: 11, fontSize: 9, visible: true, align: 'left' },
      contact: { x: 8, y: 15, fontSize: 9, visible: true, align: 'left' },
      footerText: { x: 8, y: 95, fontSize: 8, visible: true, align: 'left' },
    };
    const blockMatches = (a: OverlayBlock | undefined, b: OverlayBlock | undefined) =>
      !!a && !!b && a.x === b.x && a.y === b.y && a.fontSize === b.fontSize && a.visible === b.visible && (a.align ?? 'left') === (b.align ?? 'left');
    const hasOnlyLegacyDefaultTextOverlays = (['companyName', 'address', 'contact', 'footerText'] as (keyof OverlayConfig)[])
      .every((key) => blockMatches((overlay as any)[key], legacyDefaultBlocks[key]));
    // Force-disable any legacy footer reference saved on existing templates,
    // and ensure the top-right serial block exists with safe defaults.
    overlay.serialNumberFooter = { ...(overlay.serialNumberFooter ?? DEFAULT_OVERLAY_CONFIG.serialNumberFooter), visible: false };
    // Always force the reference number into the bottom-left corner with a
    // small font, regardless of any legacy saved overlay config.
    // Reference number is now rendered inline next to the sensitivity label
    // at the bottom-center of every page (see per-page loop below). Disable
    // the standalone serialNumber block so it doesn't also draw in a corner.
    overlay.serialNumber = {
      ...DEFAULT_OVERLAY_CONFIG.serialNumber,
      ...(overlay.serialNumber ?? {}),
      visible: false,
    };
    const newDoc = await PDFDocument.create();
    const newFont = await newDoc.embedFont(StandardFonts.Helvetica);
    const newBold = await newDoc.embedFont(StandardFonts.HelveticaBold);
    const newOblique = await newDoc.embedFont(StandardFonts.HelveticaOblique);

    // 1. Background image
    let bgImage: Awaited<ReturnType<typeof newDoc.embedPng>>;
    let bgOverlayImage: Awaited<ReturnType<typeof newDoc.embedPng>> | null = null;
    try {
      const bgBytes = await loadImageBytes(template.backgroundUrl);
      bgImage = await embedImageSmart(newDoc, bgBytes) as any;
      bgOverlayImage = await newDoc.embedPng(await makeWhiteTransparentPng(bgBytes)) as any;
    } catch (e) {
      console.error('Background letterhead load failed:', e);
      try { toast({ title: "Couldn't load template background", description: (e as Error)?.message || 'Returning the original document.', variant: 'destructive' }); } catch {}
      return new Uint8Array(pdfBytes.slice(0));
    }

    // 2. Optional watermark image
    let wmImage: Awaited<ReturnType<typeof newDoc.embedPng>> | null = null;
    if (watermarkActive && watermarkSrc) {
      try {
        const wmBytes = await loadImageBytes(watermarkSrc);
        wmImage = await newDoc.embedPng(await makeWhiteTransparentPng(wmBytes)) as any;
      } catch (e) {
        console.warn('Watermark image load failed:', e);
        try { toast({ title: 'Watermark not applied', description: 'The watermark image could not be loaded.', variant: 'destructive' }); } catch {}
      }
    }

    // 3. Source-document pages — try embedPages, fall back to rasterisation.
    type PageRender = {
      width: number;
      height: number;
      draw: (page: ReturnType<typeof newDoc.addPage>) => void;
      embedded?: Awaited<ReturnType<typeof newDoc.embedPages>>[number];
      image?: Awaited<ReturnType<typeof newDoc.embedPng>>;
    };
    const renders: PageRender[] = [];
    try {
      const srcDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
      const srcPages = srcDoc.getPages();
      const embeddedPages = await newDoc.embedPages(srcPages);
      embeddedPages.forEach((embedded, idx) => {
        const { width, height } = srcPages[idx].getSize();
        renders.push({
          width, height,
          embedded,
          draw: (p) => p.drawPage(embedded, { x: 0, y: 0, width, height }),
        });
      });
    } catch (e) {
      console.warn('embedPages failed, falling back to rasterisation:', e);
      try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) }).promise;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          // Rasterisation fallback at print quality (~288 DPI). Clamped to a
          // safe canvas pixel budget so we don't exceed the browser limit.
          const baseVp = page.getViewport({ scale: 1 });
          const PIXEL_BUDGET = 16_000_000;
          const want = 4;
          const px = baseVp.width * baseVp.height * want * want;
          const safeScale = px > PIXEL_BUDGET
            ? Math.sqrt(PIXEL_BUDGET / (baseVp.width * baseVp.height))
            : want;
          const viewport = page.getViewport({ scale: safeScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          const bin = atob(dataUrl.split(',')[1]);
          const u8 = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
          const img = await newDoc.embedPng(u8);
          // Convert rendered pixel dims back to PDF points using the actual
          // scale factor, so the page is laid out at its true size.
          const w = viewport.width / safeScale;
          const h = viewport.height / safeScale;
          renders.push({
            width: w, height: h,
            image: img,
            draw: (p) => p.drawImage(img, { x: 0, y: 0, width: w, height: h }),
          });
        }
      } catch (e2) {
        console.error('Rasterisation fallback also failed:', e2);
        try { toast({ title: "Couldn't read uploaded document", description: 'The file may be encrypted or unsupported.', variant: 'destructive' }); } catch {}
        return new Uint8Array(pdfBytes.slice(0));
      }
    }

    renders.forEach((r, idx) => {
      const { width: pw, height: ph } = r;
      const newPage = newDoc.addPage([pw, ph]);

      // Letterhead background is applied to every page so multi-page documents
      // remain branded throughout, not just on page 1.
      const shouldApplyTemplate = true;
      newPage.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(1, 1, 1) });
      // Always draw the full letterhead background first so the header band,
      // logo, footer band, and footer text are visible on every page.
      newPage.drawImage(bgImage, containedRect(bgImage, pw, ph));

      // Document safe-area inset: scale the source page into a sub-rectangle so the
      // letterhead's printed header/footer band doesn't cover document text.
      // Inset (header/footer safe area) must apply on every page too — otherwise
      // pages 2+ would have their content drawn over the repeated letterhead band.
      const applyInsetHere = true;
      // Enforce a minimum safe area whenever an uploaded letterhead background
      // exists. Without this floor the source page is drawn full-bleed and
      // completely covers the letterhead's header/footer artwork on pages 2+,
      // because the white-to-transparent overlay re-stamp can't restore light
      // or low-contrast header/footer ink.
      const MIN_TOP_INSET_FOR_BACKGROUND = 0.12; // ~12% of page height
      const MIN_BOT_INSET_FOR_BACKGROUND = 0.08; // ~8% of page height
      const topInset = applyInsetHere
        ? Math.max(MIN_TOP_INSET_FOR_BACKGROUND, Math.min(0.4, lo.docTopInset))
        : 0;
      const botInset = applyInsetHere
        ? Math.max(MIN_BOT_INSET_FOR_BACKGROUND, Math.min(0.25, lo.docBottomInset))
        : 0;
      const hPad = applyInsetHere ? Math.max(0, Math.min(0.1, lo.docHorizontalPad)) : 0;
      const hasInset = topInset > 0 || botInset > 0 || hPad > 0;

      // Compute safe-area regardless — used by Ref/Date alignment below.
      const safeX = pw * hPad;
      const safeW = pw * (1 - 2 * hPad);
      const safeY = ph * botInset;
      const safeH = ph * (1 - topInset - botInset);
      let bodyLeftX = 0;
      if (!hasInset) {
        r.draw(newPage);
        bodyLeftX = 0;
      } else {
        // Draw the document body INSIDE the safe area between the letterhead's
        // header and footer bands. The body is scaled to fit while keeping its
        // aspect ratio (no distortion), and centered horizontally and vertically
        // within the safe rectangle. Then we re-stamp the letterhead background
        // on top — but only the header and footer slices — so the letterhead
        // artwork is guaranteed to stay visible regardless of source page size.
        const emb: any = (r as any).embedded;
        const img: any = (r as any).image;
        const srcW = emb ? emb.width : img ? img.width : pw;
        const srcH = emb ? emb.height : img ? img.height : ph;
        // Contain-fit: preserve the source page's aspect ratio inside the
        // safe rectangle. Centered horizontally and vertically. This avoids
        // distorting the document or pushing content into the header/footer
        // bands (which previously caused layout breakage when fitting by
        // width forced the body taller than the safe area).
        const srcRatio = srcW / srcH;
        const safeRatio = safeW / safeH;
        let drawW: number;
        let drawH: number;
        if (srcRatio > safeRatio) {
          drawW = safeW;
          drawH = safeW / srcRatio;
        } else {
          drawH = safeH;
          drawW = safeH * srcRatio;
        }
        const align = lo.docHorizontalAlign ?? 'center';
        const drawX =
          align === 'left'
            ? safeX
            : align === 'right'
            ? safeX + (safeW - drawW)
            : safeX + (safeW - drawW) / 2;
        const drawY = safeY + (safeH - drawH) / 2;
        bodyLeftX = drawX;
        if (emb) {
          newPage.drawPage(emb, { x: drawX, y: drawY, width: drawW, height: drawH });
        } else if (img) {
          newPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        } else {
          r.draw(newPage);
        }

        // Re-stamp the entire letterhead background ON TOP, then mask the
        // body region back in by re-drawing the body. This is the only
        // reliable cross-renderer way to ensure the letterhead's header /
        // footer bands remain visible even if the source page extends into
        // them. drawImage stacks: bg-on-top covers the body's top/bottom
        // edges; the second body draw restores the body in the safe area.
        const bgRect = containedRect(bgImage, pw, ph);
        newPage.drawImage(bgImage, bgRect);
        if (emb) {
          newPage.drawPage(emb, { x: drawX, y: drawY, width: drawW, height: drawH });
        } else if (img) {
          newPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        }
      }

      if (wmImage && (
        wmPages === 'all' ||
        (wmPages === 'first' && idx === 0) ||
        (wmPages === 'last' && idx === renders.length - 1)
      )) {
        // Bottom-right placement, just above the footer safe-area band.
        // Size = native image size (1px = 1pt), scaled DOWN only if it
        // exceeds a sensible page-relative max box. Small watermarks stay
        // small; oversized ones are constrained.
        const MAX_FRACTION_W = 0.45;
        const MAX_FRACTION_H = 0.30;
        const maxW = pw * MAX_FRACTION_W;
        const maxH = ph * MAX_FRACTION_H;
        const scale = Math.min(1, maxW / wmImage.width, maxH / wmImage.height);
        const targetW = wmImage.width * scale;
        const targetH = wmImage.height * scale;
        const rightMargin = pw * 0.04;
        const footerBand = ph * Math.max(0, Math.min(0.25, lo.docBottomInset));
        const gapAboveFooter = 6;
        newPage.drawImage(wmImage, {
          x: pw - targetW - rightMargin,
          y: footerBand + gapAboveFooter,
          width: targetW,
          height: targetH,
          opacity: watermarkOpacity,
        });
      }

      // Note: the white-to-transparent overlay re-stamp has been removed.
      // With a guaranteed safe area on every page (see topInset/botInset
      // floors above), the source page can never cover the letterhead's
      // header/footer bands, so the overlay is no longer needed and only
      // caused double-printing / haze when partially active.

      if (idx === 0) {
        const drawBlock = (block: OverlayBlock | undefined, text: string, useBold = false) => {
          if (!block?.visible || !text) return;
          const f = useBold ? newBold : newFont;
          const size = block.fontSize;
          let y = ph - (block.y / 100) * ph;
          for (const line of String(text).split('\n')) {
            const tw = f.widthOfTextAtSize(line, size);
            let x = (block.x / 100) * pw;
            if (block.align === 'center') x -= tw / 2;
            else if (block.align === 'right') x -= tw;
            newPage.drawText(line, { x, y, size, font: f, color: rgb(0, 0, 0) });
            y -= size * 1.2;
          }
        };
        if (!hasOnlyLegacyDefaultTextOverlays) {
          drawBlock(overlay.companyName, template.companyName, true);
          drawBlock(overlay.address, template.address);
          drawBlock(overlay.contact, [template.phone, template.email].filter(Boolean).join('  •  '));
        }
        if (serialNumber) drawBlock(overlay.serialNumber, serialNumber, false);
        if (!hasOnlyLegacyDefaultTextOverlays) drawBlock(overlay.footerText, template.footerText);

        // Reference + Date — top-left, with proper clearance from the printed
        // header band, aligned to the document body's left edge.
        {
          const topInsetForRef = Math.max(0, Math.min(0.4, lo.docTopInset));
          const refSize = 8.5;
          const refColor = rgb(0.25, 0.25, 0.25);
          const indent = Math.max(0, Math.min(0.25, lo.docBodyIndent ?? 0.08));
          const x = pw * indent;
          let y = ph * (1 - topInsetForRef) - 12 - refSize;
          if (serialNumber) {
            newPage.drawText(`Ref: ${serialNumber}`, { x, y, size: refSize, font: newFont, color: refColor });
            y -= refSize * 1.4;
          }
          newPage.drawText(`Date: ${formattedDate}`, { x, y, size: refSize, font: newFont, color: refColor });
        }
      }

      // Reference number is rendered once on page 1 (top-right) only.

      if (annotations) {
        for (const ann of annotations) {
          if (ann.pageIndex !== idx) continue;
          const f = ann.bold ? newBold : newFont;
          for (const line of String(ann.text).split('\n')) {
            const tw = f.widthOfTextAtSize(line, ann.fontSize);
            let x = (ann.x / 100) * pw;
            if (ann.align === 'center') x -= tw / 2;
            else if (ann.align === 'right') x -= tw;
            const y = ph - (ann.y / 100) * ph;
            newPage.drawText(line, { x, y, size: ann.fontSize, font: f, color: rgb(0, 0, 0) });
          }
        }
      }

      // Bottom-center stamp: sensitivity label only (reference is top-left).
      {
        const label = sensitivity ? (SENSITIVITY_LABELS[sensitivity] ?? '').toUpperCase() : '';
        if (label) {
          const size = 7;
          const labelColor =
            sensitivity === 'highly_confidential' ? rgb(0.78, 0.13, 0.13)
            : sensitivity === 'confidential' ? rgb(0.85, 0.55, 0.1)
            : rgb(0.45, 0.45, 0.45);
          const labelW = newBold.widthOfTextAtSize(label, size);
          // Honor the user-selected position:
          // - 'above-line' sits just above the footer safe-area band so it
          //   clears any printed footer artwork on the letterhead.
          // - 'on-line' sits at the very bottom margin (over any footer line).
          const footerBand = ph * Math.max(0, Math.min(0.25, lo.docBottomInset));
          const labelY = sensPos === 'above-line'
            ? Math.max(footerBand + 4 + sensYOffset, 6)
            : Math.max(6 + sensYOffset, 2);
          newPage.drawText(label, { x: (pw - labelW) / 2, y: labelY, size, font: newBold, color: labelColor });
        }
      }

      // System disclaimer — stamped on every page, centered at the very
      // bottom edge so it never collides with the letterhead footer band.
      {
        const disclaimer = 'This is an electronically generated print and does not require physical stamping or signature.';
        const dSize = 6.5;
        const dColor = rgb(0.45, 0.45, 0.45);
        const dW = newOblique.widthOfTextAtSize(disclaimer, dSize);
        newPage.drawText(disclaimer, {
          x: (pw - dW) / 2,
          y: 6,
          size: dSize,
          font: newOblique,
          color: dColor,
        });
      }
    });

    return newDoc.save();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PATH B — Classic built template (logo + header + footer text).
  // ════════════════════════════════════════════════════════════════════════════
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const obliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Optional letterhead background — drawn first so the white header/footer
  // bands below mask the corresponding strips of the source artwork.
  let bgImageB: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (template.backgroundUrl) {
    try {
      const bgBytes = await loadImageBytes(template.backgroundUrl);
      bgImageB = (await embedImageSmart(pdfDoc, bgBytes)) as any;
    } catch (e) {
      console.warn('Built-template background load failed:', e);
      try { toast({ title: "Couldn't load template background", description: (e as Error)?.message || 'Continuing without background.', variant: 'destructive' }); } catch {}
    }
  }
  if (bgImageB) {
    pages.forEach((page) => {
      const { width: pw, height: ph } = page.getSize();
      page.drawImage(bgImageB!, containedRect(bgImageB!, pw, ph));
    });
  }

  if (watermarkActive && watermarkSrc) {
    try {
      const wmBytes = await loadImageBytes(watermarkSrc);
      const wmImage = await pdfDoc.embedPng(await makeWhiteTransparentPng(wmBytes));
      pages.forEach((page, idx) => {
        const draw =
          wmPages === 'all' ||
          (wmPages === 'first' && idx === 0) ||
          (wmPages === 'last' && idx === pages.length - 1);
        if (!draw) return;
        const { width: pw, height: ph } = page.getSize();
        // Bottom-right placement, just above the footer band.
        // Size = native image size, scaled DOWN only if it exceeds a max box.
        const MAX_FRACTION_W = 0.45;
        const MAX_FRACTION_H = 0.30;
        const maxW = pw * MAX_FRACTION_W;
        const maxH = ph * MAX_FRACTION_H;
        const scale = Math.min(1, maxW / wmImage.width, maxH / wmImage.height);
        const targetW = wmImage.width * scale;
        const targetH = wmImage.height * scale;
        const rightMargin = pw * 0.04;
        const gapAboveFooter = 6;
        page.drawImage(wmImage, {
          x: pw - targetW - rightMargin,
          y: lo.footerHeight + gapAboveFooter,
          width: targetW,
          height: targetH,
          opacity: watermarkOpacity,
        });
      });
    } catch (e) { console.warn('Watermark failed:', e); }
  }

  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();
  const footerHeight = lo.footerHeight;

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (template.logoUrl) {
    try {
      const logoResponse = await fetch(template.logoUrl);
      const logoBytes = await logoResponse.arrayBuffer();
      const logoUint8 = new Uint8Array(logoBytes);
      const isPng = template.logoUrl.includes('image/png') || (logoUint8[0] === 0x89 && logoUint8[1] === 0x50);
      logoImage = isPng ? await pdfDoc.embedPng(logoBytes) : await pdfDoc.embedJpg(logoBytes);
    } catch (e) { console.warn('Could not embed logo:', e); }
  }

  const headerLines = [
    template.address,
    [template.phone, template.email].filter(Boolean).join('  |  '),
    template.website,
  ].filter(Boolean);

  const titleLineHeight = 18;
  const contactLineHeight = 11;
  const baseLogoH = 40;
  const logoH = logoImage ? baseLogoH * lo.logoScale : 0;
  const textBlockHeight = titleLineHeight + headerLines.length * contactLineHeight;
  const contentHeight = Math.max(logoH + 5, textBlockHeight);
  const headerPadding = 25;
  const headerHeight = contentHeight + headerPadding + 5;
  const topOffset = lo.headerTopMargin;

  const textStartX = logoImage ? 100 : 50;

  // Header band (white background, logo, company name, contact lines, divider)
  // is now drawn on every page so multi-page documents stay branded throughout.
  pages.forEach((page, pageIdx) => {
    const { width: pw, height: ph } = page.getSize();
    page.drawRectangle({ x: 0, y: ph - headerHeight - topOffset + 15, width: pw, height: headerHeight + topOffset, color: rgb(1, 1, 1) });
    if (logoImage) {
      const logoDims = logoImage.scale(1);
      const logoW = (logoDims.width / logoDims.height) * logoH;
      page.drawImage(logoImage, { x: 45, y: ph - topOffset - logoH, width: logoW, height: logoH });
    }
    page.drawText(template.companyName, { x: textStartX, y: ph - topOffset - 13, size: 14, font: boldFont, color: rgb(0.1, 0.3, 0.6) });
    headerLines.forEach((line, i) => {
      page.drawText(line, { x: textStartX, y: ph - topOffset - 29 - i * contactLineHeight, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    });
    page.drawLine({ start: { x: 40, y: ph - headerHeight - topOffset + 20 }, end: { x: pw - 40, y: ph - headerHeight - topOffset + 20 }, thickness: 1.5, color: rgb(0.1, 0.3, 0.6) });

    // Reference + Date — only on first page, with proper clearance below
    // the header divider, aligned to the logo column.
    if (pageIdx === 0) {
      const refSize = 8.5;
      const refColor = rgb(0.25, 0.25, 0.25);
      const indent = Math.max(0, Math.min(0.25, lo.docBodyIndent ?? 0.08));
      const x = pw * indent;
      let y = ph - headerHeight - topOffset + 20 - 12 - refSize;
      if (serialNumber) {
        page.drawText(`Ref: ${serialNumber}`, { x, y, size: refSize, font, color: refColor });
        y -= refSize * 1.4;
      }
      page.drawText(`Date: ${formattedDate}`, { x, y, size: refSize, font, color: refColor });
    }
  });

  pages.forEach(page => {
    const { width: pw } = page.getSize();
    // Reserve a dedicated strip ABOVE the footer band for the sensitivity
    // label so it can never overlap the footer text/website lines.
    const sensSize = 7;
    const sensStripHeight = sensitivity && sensPos === 'above-line' ? sensSize + 6 : 0;
    const bandHeight = footerHeight + sensStripHeight;

    page.drawRectangle({ x: 0, y: 0, width: pw, height: bandHeight, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: 40, y: footerHeight - 5 }, end: { x: pw - 40, y: footerHeight - 5 }, thickness: 0.75, color: rgb(0.1, 0.3, 0.6) });
    if (template.footerText) {
      page.drawText(template.footerText, { x: 50, y: 25, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
    }
    if (template.website) {
      page.drawText(template.website, { x: 50, y: 12, size: 6, font, color: rgb(0.6, 0.6, 0.6) });
    }
    {
      const label = sensitivity ? (SENSITIVITY_LABELS[sensitivity] ?? '').toUpperCase() : '';
      if (label) {
        const labelColor =
          sensitivity === 'highly_confidential' ? rgb(0.78, 0.13, 0.13)
          : sensitivity === 'confidential' ? rgb(0.85, 0.55, 0.1)
          : rgb(0.45, 0.45, 0.45);
        const labelW = boldFont.widthOfTextAtSize(label, sensSize);
        // Position above the divider OR centered ON the divider line.
        // Divider line sits at y = footerHeight - 5.
        if (sensPos === 'on-line') {
          const lineY = footerHeight - 5;
          const labelY = lineY - sensSize / 2 + 1 + sensYOffset;
          // Mask the divider behind the label so the line doesn't strike through it.
          const padX = 6;
          page.drawRectangle({
            x: (pw - labelW) / 2 - padX,
            y: labelY - 2,
            width: labelW + padX * 2,
            height: sensSize + 4,
            color: rgb(1, 1, 1),
          });
          page.drawText(label, { x: (pw - labelW) / 2, y: labelY, size: sensSize, font: boldFont, color: labelColor });
        } else {
          const labelY = footerHeight + 3 + sensYOffset;
          page.drawText(label, { x: (pw - labelW) / 2, y: labelY, size: sensSize, font: boldFont, color: labelColor });
        }
      }
    }

    // System disclaimer — every page, centered at the very bottom edge.
    {
      const disclaimer = 'This is an electronically generated print and does not require physical stamping or signature.';
      const dSize = 6.5;
      const dColor = rgb(0.45, 0.45, 0.45);
      const dW = obliqueFont.widthOfTextAtSize(disclaimer, dSize);
      page.drawText(disclaimer, {
        x: (pw - dW) / 2,
        y: 4,
        size: dSize,
        font: obliqueFont,
        color: dColor,
      });
    }
  });

  // Burn annotations into PDF
  if (annotations && annotations.length > 0) {
    for (const ann of annotations) {
      if (ann.pageIndex >= pages.length) continue;
      const page = pages[ann.pageIndex];
      const { width: pw, height: ph } = page.getSize();
      const f = ann.bold ? boldFont : font;
      for (const line of String(ann.text).split('\n')) {
        const tw = f.widthOfTextAtSize(line, ann.fontSize);
        let x = (ann.x / 100) * pw;
        if (ann.align === 'center') x -= tw / 2;
        else if (ann.align === 'right') x -= tw;
        const y = ph - (ann.y / 100) * ph;
        page.drawText(line, { x, y, size: ann.fontSize, font: f, color: rgb(0, 0, 0) });
      }
    }
  }

  return pdfDoc.save();
}

export default function UploadDocument() {
  usePageMeta({ title: 'Create a letterhead', description: 'Pick a template, attach a file, then download the finalized PDF.', helpKey: '/upload' });
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewPdfBytes, setPreviewPdfBytes] = useState<ArrayBuffer | null>(null);
  const [generatedSerial, setGeneratedSerial] = useState('');
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [departmentCode, setDepartmentCode] = useState<string>('');
  const [legalEntityCode, setLegalEntityCode] = useState<string>('');
  const [siteCode, setSiteCode] = useState<string>('');
  const [legalEntityName, setLegalEntityName] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('');
  const rawPdfBytesRef = useRef<ArrayBuffer | null>(null);
  const templateCardRef = useRef<HTMLDivElement>(null);
  const uploadCardRef = useRef<HTMLDivElement>(null);
  const [highlightedSection, setHighlightedSection] = useState<'template' | 'upload' | null>(null);

  // Editing state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [layout, setLayout] = useState<LayoutOptions>({ ...DEFAULT_LAYOUT });
  const [docxText, setDocxText] = useState<string | null>(null);
  const [editedDocxText, setEditedDocxText] = useState<string>('');
  const [docxFileBuffer, setDocxFileBuffer] = useState<ArrayBuffer | null>(null);
  // Structured editable body model for the new in-preview editor.
  const [bodyContent, setBodyContent] = useState<BodyContent | null>(null);
  const [originalBodyContent, setOriginalBodyContent] = useState<BodyContent | null>(null);
  const [bodyEdited, setBodyEdited] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('general');
  const [sensitivityPosition, setSensitivityPosition] = useState<'above-line' | 'on-line'>('above-line');
  const [sensitivityYOffset, setSensitivityYOffset] = useState<number>(0);
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  // Typography: unify body font with letterhead header (Selawik / Segoe UI).
  const [unifyFont, setUnifyFont] = useState<boolean>(true);
  const [bodyFontSizePt, setBodyFontSizePt] = useState<10 | 11 | 12>(11);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<{ title: string; message: string } | null>(null);
  const [lastGenerated, setLastGenerated] = useState<{
    serial: string;
    filename: string;
    templateName: string;
    at: string;
  } | null>(null);

  const LAST_TPL_KEY = user ? `lastTemplateId:${user.id}` : '';

  useEffect(() => {
    fetchTemplates().then(t => {
      setTemplates(t);
      // Hydrate last-used template first, fall back to default.
      const stored = LAST_TPL_KEY ? localStorage.getItem(LAST_TPL_KEY) : null;
      const fromStorage = stored && t.find(x => x.id === stored);
      if (fromStorage) {
        setSelectedTemplateId(stored);
      } else {
        const def = t.find(x => x.isDefault);
        if (def) setSelectedTemplateId(def.id);
      }
    }).catch(console.error);
  }, [LAST_TPL_KEY]);

  // Persist template choice per user
  useEffect(() => {
    if (LAST_TPL_KEY && selectedTemplateId) {
      localStorage.setItem(LAST_TPL_KEY, selectedTemplateId);
    }
  }, [LAST_TPL_KEY, selectedTemplateId]);

  // Auto-detect the printed header/footer bands of the selected template's
  // letterhead background and pre-fill the document safe-area insets. The
  // user can still override these via the "Adjust Document Fit" panel.
  const autoDetectedFor = useRef<string | null>(null);
  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl?.backgroundUrl) return;
    if (autoDetectedFor.current === tpl.id) return;
    autoDetectedFor.current = tpl.id;
    let cancelled = false;
    detectLetterheadSafeAreas(tpl.backgroundUrl).then((bands) => {
      if (cancelled || !bands) return;
      setLayout((prev) => ({
        ...prev,
        docTopInset: bands.top,
        docBottomInset: bands.bottom,
        docInsetAllPages: true,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId, templates]);

  const lastUsedTemplateId = LAST_TPL_KEY ? localStorage.getItem(LAST_TPL_KEY) : null;

  // Scroll-to-section helper for the interactive checklist & CTA
  const focusSection = (which: 'template' | 'upload') => {
    const el = which === 'template' ? templateCardRef.current : uploadCardRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedSection(which);
    window.setTimeout(() => setHighlightedSection(null), 1600);
    if (which === 'upload') {
      window.setTimeout(() => document.getElementById('file-input')?.click(), 350);
    }
  };

  useEffect(() => {
    if (!profile?.departmentId) {
      setDepartmentName(null);
      setDepartmentCode('');
      return;
    }
    supabase.from('departments').select('name, code').eq('id', profile.departmentId).single()
      .then(({ data }) => {
        if (data) {
          setDepartmentName((data as any).name);
          setDepartmentCode(String((data as any).code ?? '').trim());
        }
      });
  }, [profile?.departmentId]);

  useEffect(() => {
    if (profile?.legalEntityId) {
      supabase.from('legal_entities').select('code, name').eq('id', profile.legalEntityId).single()
        .then(({ data }) => {
          setLegalEntityCode((data as any)?.code ?? '');
          setLegalEntityName((data as any)?.name ?? '');
        });
    }
    if (profile?.officeSiteId) {
      supabase.from('office_sites').select('code, name').eq('id', profile.officeSiteId).single()
        .then(({ data }) => {
          setSiteCode((data as any)?.code ?? '');
          setSiteName((data as any)?.name ?? '');
        });
    }
  }, [profile?.legalEntityId, profile?.officeSiteId]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Default watermark on per template settings
  useEffect(() => {
    if (selectedTemplate?.watermarkEnabled) {
      // If the template has a dedicated watermark image, default the toggle on.
      const hasWmImage = !!selectedTemplate.watermarkImageUrl;
      setWatermark(hasWmImage || !!selectedTemplate.watermarkDefaultOn);
    } else {
      setWatermark(false);
    }
  }, [selectedTemplateId, selectedTemplate?.watermarkEnabled, selectedTemplate?.watermarkDefaultOn, selectedTemplate?.watermarkImageUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Guard: if the user re-selects the same file (e.g. after downloading),
    // don't clobber the existing preview/serial — they may want to re-download.
    if (file && f.name === file.name && f.size === file.size && f.lastModified === file.lastModified) {
      e.target.value = '';
      return;
    }
    setFileError(null);
    setFile(f);
    setPreviewPdfBytes(null);
    setGeneratedSerial('');
    setLastGenerated(null);
    setAnnotations([]);
    setDocxText(null);
    await loadEditableText(f);
  };

  const loadEditableText = async (f: File) => {
    if (!isTextEditable(f)) {
      setDocxFileBuffer(null);
      setBodyContent(null);
      setOriginalBodyContent(null);
      setBodyEdited(false);
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      setDocxFileBuffer(buf);
      const text = await extractTextFromFile(f);
      setDocxText(text);
      setEditedDocxText(text);
      const initial = isDocx(f)
        ? await docxToBodyContent(f, { fontSize: bodyFontSizePt })
        : textToBodyContent(text, { fontSize: bodyFontSizePt });
      setBodyContent(initial);
      setOriginalBodyContent(initial);
      setBodyEdited(false);
    } catch (err) {
      console.error('Text extraction failed:', err);
      const message = err instanceof Error ? err.message : 'Could not read the document.';
      setFileError({ title: 'Could not read file', message });
      toast({ title: 'Could not read file', description: message, variant: 'destructive' });
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!ACCEPTED_FILE_REGEX.test(f.name)) {
      setFileError({
        title: 'Unsupported file type',
        message: `"${f.name}" can't be used. Supported types: PDF, DOCX, DOC, TXT, MD, RTF, PNG, JPG, WEBP.`,
      });
      return;
    }
    if (file && f.name === file.name && f.size === file.size && f.lastModified === file.lastModified) {
      return;
    }
    setFileError(null);
      setFile(f);
      setPreviewPdfBytes(null);
      setGeneratedSerial('');
    setLastGenerated(null);
      setAnnotations([]);
      setDocxText(null);
      await loadEditableText(f);
      try { toast({ title: 'File loaded', description: f.name }); } catch {}
  }, [file]);

  const handleReset = () => {
    setFile(null);
    setPreviewPdfBytes(null);
    setGeneratedSerial('');
    setLastGenerated(null);
    setFileError(null);
    setAnnotations([]);
    setLayout({ ...DEFAULT_LAYOUT });
    setDocxText(null);
    setEditedDocxText('');
    setDocxFileBuffer(null);
    setBodyContent(null);
    setOriginalBodyContent(null);
    setBodyEdited(false);
    setDocumentTitle('');
    setAssignedTo('');
    rawPdfBytesRef.current = null;
    const input = document.getElementById('file-input') as HTMLInputElement;
    if (input) input.value = '';
  };

  const logAction = async (action: string, description: string, serialNumber?: string) => {
    if (!user) return;
    try {
      await addLogToDb({
        action, description, serialNumber,
        userId: user.id,
        userName: profile?.fullName ?? null,
        departmentId: profile?.departmentId ?? null,
        departmentName,
        legalEntityId: profile?.legalEntityId ?? null,
        legalEntityName: legalEntityName || null,
        officeSiteId: profile?.officeSiteId ?? null,
        officeSiteName: siteName || null,
        targetType: serialNumber ? 'document' : null,
        targetId: serialNumber ?? null,
      });
    } catch (e) { console.error('Failed to log action:', e); }
  };

  const handlePreview = async () => {
    if (!file || !selectedTemplate || !user) return;
    setFileError(null);
    setGenerating(true);
    try {
      // If the user has applied edits in the new content editor, render
      // through the structured body renderer so font/size/alignment match
      // exactly what they see in the editor. Otherwise fall back to the
      // standard pipeline (high-fidelity DOCX render preserves layout).
      let pdfBytes: ArrayBuffer;
      if (bodyEdited && bodyContent && isTextEditable(file)) {
        pdfBytes = await renderStyledBodyToPdf(bodyContent);
      } else {
        pdfBytes = await fileToPdfBytes(file, undefined, { unifyFont, bodyFontSizePt });
      }
      rawPdfBytesRef.current = pdfBytes;
      const resultBytes = await applyLetterhead(pdfBytes, selectedTemplate, 'PREVIEW-REF', layout, annotations, watermark, sensitivity, undefined, sensitivityPosition, sensitivityYOffset);
      setPreviewPdfBytes(resultBytes.buffer as ArrayBuffer);
      setGeneratedSerial('');
    } catch (err) {
      console.error('Preview generation failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      setFileError({ title: 'Could not build preview', message: message || 'Unsupported or corrupted file.' });
      toast({ title: 'Could not build preview', description: message || 'Unsupported or corrupted file.', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // Re-render preview when layout or annotations change (if already previewing)
  useEffect(() => {
    if (!previewPdfBytes || !rawPdfBytesRef.current || !selectedTemplate || generatedSerial) return;
    let cancelled = false;
    const rebuild = async () => {
      try {
        const resultBytes = await applyLetterhead(rawPdfBytesRef.current!, selectedTemplate, 'PREVIEW-REF', layout, annotations, watermark, sensitivity, undefined, sensitivityPosition, sensitivityYOffset);
        if (!cancelled) setPreviewPdfBytes(resultBytes.buffer as ArrayBuffer);
      } catch {}
    };
    const timeout = setTimeout(rebuild, 300);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [layout, annotations, selectedTemplate, watermark, sensitivity, sensitivityPosition, sensitivityYOffset]);

  // When the user toggles font unification or changes body size after the
  // first preview, re-convert the source file (the typography only takes
  // effect during DOCX → PDF conversion) and re-apply the letterhead.
  useEffect(() => {
    if (!previewPdfBytes || !file || !selectedTemplate || generatedSerial) return;
    let cancelled = false;
    const reconvert = async () => {
      try {
        let pdfBytes: ArrayBuffer;
        if (bodyEdited && bodyContent && isTextEditable(file)) {
          pdfBytes = await renderStyledBodyToPdf(bodyContent);
        } else {
          pdfBytes = await fileToPdfBytes(file, undefined, { unifyFont, bodyFontSizePt });
        }
        if (cancelled) return;
        rawPdfBytesRef.current = pdfBytes;
        const resultBytes = await applyLetterhead(
          pdfBytes, selectedTemplate, 'PREVIEW-REF', layout, annotations, watermark,
          sensitivity, undefined, sensitivityPosition, sensitivityYOffset,
        );
        if (!cancelled) setPreviewPdfBytes(resultBytes.buffer as ArrayBuffer);
      } catch (err) {
        console.warn('[upload] font re-convert failed', err);
      }
    };
    const t = setTimeout(reconvert, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifyFont, bodyFontSizePt, bodyContent, bodyEdited]);

  const handleDownload = async () => {
    if (!rawPdfBytesRef.current || !selectedTemplate || !user || !file) return;
    if (!documentTitle.trim() || !assignedTo.trim()) {
      toast({
        title: 'Missing details',
        description: 'Please fill in both Document name and Assigned to before generating.',
        variant: 'destructive',
      });
      return;
    }
    setDownloading(true);
    try {
      // Reference number is template-driven: it represents the entity / site
      // the document is being issued FROM (matching the letterhead branding),
      // not the user who generated it. We fall back to the user's own
      // entity/site if the template has none assigned (e.g. a global template).
      let leCode = '';
      let stCode = '';
      let leId: string | null = selectedTemplate.legalEntityId ?? null;
      let leName: string | null = null;
      let stId: string | null = selectedTemplate.officeSiteId ?? null;
      let stName: string | null = null;
      try {
        const leLookupId = leId ?? profile?.legalEntityId ?? null;
        if (leLookupId) {
          const { data } = await supabase.from('legal_entities').select('code, name').eq('id', leLookupId).single();
          if (data) {
            leCode = (data as { code?: string }).code ?? '';
            leName = (data as { name?: string }).name ?? null;
            if (!leId) leId = leLookupId;
          }
        }
        const stLookupId = stId ?? profile?.officeSiteId ?? null;
        if (stLookupId) {
          const { data } = await supabase.from('office_sites').select('code, name').eq('id', stLookupId).single();
          if (data) {
            stCode = (data as { code?: string }).code ?? '';
            stName = (data as { name?: string }).name ?? null;
            if (!stId) stId = stLookupId;
          }
        }
      } catch (e) {
        console.warn('Could not resolve entity/site codes for serial:', e);
      }
      if (!leCode) {
        const tplEntityNote = selectedTemplate.legalEntityId
          ? `Template's legal entity has no short code set.`
          : `No legal entity is set on this template, and your profile's entity has no code.`;
        toast({
          title: 'Missing company code',
          description: `${tplEntityNote} The reference number will skip the COMPANY segment. Ask an admin to add codes in Admin → Legal Entities.`,
        });
      }
      let resolvedDepartmentCode = departmentCode.trim();
      let resolvedDepartmentName = departmentName;
      if (profile?.departmentId) {
        try {
          const { data } = await supabase.from('departments').select('name, code').eq('id', profile.departmentId).single();
          if (data) {
            resolvedDepartmentCode = String((data as { code?: string }).code ?? '').trim();
            resolvedDepartmentName = (data as { name?: string }).name ?? resolvedDepartmentName;
            setDepartmentCode(resolvedDepartmentCode);
            setDepartmentName(resolvedDepartmentName);
          }
        } catch (e) {
          console.warn('Could not resolve department code for serial:', e);
        }
      }
      if (!resolvedDepartmentCode) {
        toast({
          title: 'Missing department code',
          description: 'Your department needs a numeric code before you can generate a reference number. Ask an admin to set one in Departments.',
          variant: 'destructive',
        });
        setDownloading(false);
        setGenerating(false);
        return;
      }
      // Guarantee DEPT is part of the reference even if the template's custom
      // format omitted it. Clone so we don't mutate the saved template.
      const baseFormat = selectedTemplate.referenceFormat ?? { segments: ['PREFIX','COMPANY','DEPT','DATE','COUNTER'] as const };
      const segments = Array.isArray((baseFormat as any).segments) ? [...(baseFormat as any).segments] : ['PREFIX','COMPANY','DEPT','DATE','COUNTER'];
      if (!segments.includes('DEPT')) {
        const companyIdx = segments.indexOf('COMPANY');
        const insertAt = companyIdx >= 0 ? companyIdx + 1 : Math.max(1, segments.length - 2);
        segments.splice(insertAt, 0, 'DEPT');
      }
      const effectiveFormat = { ...(baseFormat as any), segments };
      const serial = await generateSerialNumber({
        legalEntityCode: leCode,
        siteCode: stCode,
        deptCode: resolvedDepartmentCode,
        referenceFormat: effectiveFormat,
      });
      const finalPdfBytes = await applyLetterhead(rawPdfBytesRef.current, selectedTemplate, serial, layout, annotations, watermark, sensitivity, undefined, sensitivityPosition, sensitivityYOffset);

      const blob = new Blob([finalPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${serial}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Upload to storage (best-effort) and record in documents table
      let pdfPath = '';
      try {
        pdfPath = await uploadDocumentPdf(user.id, serial, finalPdfBytes);
      } catch (e) {
        console.warn('Storage upload failed, falling back to inline base64:', e);
      }

      await addDocumentToDb({
        serialNumber: serial,
        originalFilename: file.name,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        pdfPath,
        userId: user.id,
        userName: profile?.fullName ?? null,
        departmentId: profile?.departmentId ?? null,
        departmentName: resolvedDepartmentName,
        // Tag the document with the template's entity/site (the "issuing" org),
        // falling back to the user's profile values when the template is global.
        legalEntityId: leId ?? profile?.legalEntityId ?? null,
        legalEntityName: leName ?? legalEntityName ?? null,
        officeSiteId: stId ?? profile?.officeSiteId ?? null,
        officeSiteName: stName ?? siteName ?? null,
        sensitivity,
        documentTitle: documentTitle.trim() || null,
        assignedTo: assignedTo.trim() || null,
      });

      const titlePart = documentTitle.trim() ? ` "${documentTitle.trim()}"` : '';
      const assigneePart = assignedTo.trim() ? ` — assigned to ${assignedTo.trim()}` : '';
      await logAction('create', `Generated document${titlePart} from "${file.name}" [${SENSITIVITY_LABELS[sensitivity]}]${assigneePart}`, serial);
      await logAction('download', `Downloaded document ${serial}`, serial);
      setGeneratedSerial(serial);
      setPreviewPdfBytes(finalPdfBytes.buffer as ArrayBuffer);
      setLastGenerated({
        serial,
        filename: file.name,
        templateName: selectedTemplate.name,
        at: new Date().toISOString(),
      });
      toast({ title: 'Document Generated & Downloaded', description: `Serial: ${serial}` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to generate document.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  // Re-download the already-finalized PDF using the same serial number.
  // Does NOT generate a new serial or create a new document row.
  const handleRedownload = () => {
    if (!previewPdfBytes || !generatedSerial) return;
    const blob = new Blob([previewPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedSerial}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    logAction('download', `Re-downloaded document ${generatedSerial}`, generatedSerial);
    toast({ title: 'Downloaded', description: `Same serial: ${generatedSerial}` });
  };

  // ── derived UI state ────────────────────────────────────────────────────────
  const stepDone = {
    template: !!selectedTemplateId,
    document: !!file,
    preview: !!previewPdfBytes,
  };
  const currentStep = !stepDone.template ? 1 : !stepDone.document ? 2 : !stepDone.preview ? 3 : 3;
  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };
  const fileExt = file ? (file.name.split('.').pop() || '').toUpperCase() : '';
  const tplThumb = selectedTemplate?.backgroundUrl || selectedTemplate?.logoUrl || '';
  const copySerial = async () => {
    if (!generatedSerial) return;
    try { await navigator.clipboard.writeText(generatedSerial); toast({ title: 'Copied', description: generatedSerial }); }
    catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
  };
  const docxStats = (() => {
    const t = editedDocxText ?? '';
    return { chars: t.length, words: t.trim() ? t.trim().split(/\s+/).length : 0 };
  })();

  const Stepper = () => {
    const steps = [
      { n: 1, label: 'Template', done: stepDone.template },
      { n: 2, label: 'Document', done: stepDone.document },
      { n: 3, label: 'Preview & Download', done: stepDone.preview },
    ];
    return (
      <div className="flex items-center gap-2 overflow-x-auto rounded-lg border bg-card p-2">
        {steps.map((s, i) => {
          const active = currentStep === s.n;
          return (
            <div key={s.n} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : s.done ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? 'bg-primary-foreground/20' : s.done ? 'bg-primary/20' : 'bg-background'}`}>
                  {s.done && !active ? <Check className="h-3 w-3" /> : s.n}
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          );
        })}
      </div>
    );
  };

  // Contextual primary CTA (#2)
  const primaryCta = (() => {
    if (generating) return { label: 'Building Preview…', icon: <Loader2 className="mr-2 h-4 w-4 animate-spin" />, onClick: () => {}, disabled: true };
    if (!selectedTemplateId) return { label: 'Select a template', icon: <FileText className="mr-2 h-4 w-4" />, onClick: () => focusSection('template'), disabled: false };
    if (!file) return { label: 'Upload a document', icon: <FileUp className="mr-2 h-4 w-4" />, onClick: () => focusSection('upload'), disabled: false };
    return { label: 'Preview with Letterhead', icon: <Eye className="mr-2 h-4 w-4" />, onClick: handlePreview, disabled: false };
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Upload Document</h1>
            <p className="text-sm text-muted-foreground">Apply a letterhead and generate a unique serial number.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {stepDone.preview ? (generatedSerial ? 'Finalized' : 'Ready to download') : `Step ${currentStep} of 3`}
          </Badge>
          {file && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> New Document
            </Button>
          )}
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No letterhead templates yet</h3>
            <p className="mb-4 mt-1 max-w-sm text-sm text-muted-foreground">Create or upload at least one letterhead before you can apply it to documents.</p>
            <Button asChild size="sm"><Link to="/templates">Create Template</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Stepper />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
            {/* Left column ─ Setup */}
            <div className="space-y-4">
              <Card
                ref={templateCardRef}
                data-tour="tpl-card"
                className={highlightedSection === 'template' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : 'transition-shadow'}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">1. Select Template</CardTitle>
                  <CardDescription className="text-xs">Choose which letterhead to apply.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={templatePickerOpen}
                        className="h-10 w-full justify-between font-normal"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {selectedTemplate ? selectedTemplate.name : 'Choose a template'}
                          </span>
                          {selectedTemplate?.isDefault && (
                            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">Default</Badge>
                          )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search templates by name…" />
                        <CommandList>
                          <CommandEmpty>No templates found.</CommandEmpty>
                          {(() => {
                            const scopeOf = (t: LetterheadTemplate) =>
                              t.visibility === 'legal_entity' ? 'By Legal Entity'
                              : t.visibility === 'site' ? 'By Site'
                              : 'Available to all';
                            const grouped = templates.reduce<Record<string, LetterheadTemplate[]>>((acc, t) => {
                              const k = scopeOf(t);
                              (acc[k] ||= []).push(t);
                              return acc;
                            }, {});
                            const order = ['Available to all', 'By Legal Entity', 'By Site'];
                            return order
                              .filter(k => grouped[k]?.length)
                              .map(k => (
                                <CommandGroup key={k} heading={k}>
                                  {grouped[k].map(t => (
                                    <CommandItem
                                      key={t.id}
                                      value={`${t.name} ${k}`}
                                      onSelect={() => {
                                        setSelectedTemplateId(t.id);
                                        setTemplatePickerOpen(false);
                                      }}
                                      className="flex items-center gap-2"
                                    >
                                      <Check className={cn('h-4 w-4', selectedTemplateId === t.id ? 'opacity-100' : 'opacity-0')} />
                                      <span className="truncate">{t.name}</span>
                                      <span className="ml-auto flex items-center gap-1">
                                        {t.isDefault && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Default</Badge>}
                                        {lastUsedTemplateId === t.id && (
                                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Last used</Badge>
                                        )}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ));
                          })()}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {selectedTemplate && (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2.5">
                      {tplThumb ? (
                        <img src={tplThumb} alt={selectedTemplate.name} className="h-12 w-16 rounded border bg-background object-contain" />
                      ) : (
                        <div className="flex h-12 w-16 items-center justify-center rounded border bg-background">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{selectedTemplate.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{selectedTemplate.backgroundUrl ? 'Uploaded' : 'Built'}</Badge>
                          {selectedTemplate.watermarkEnabled && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Watermark</Badge>}
                          {selectedTemplate.visibility && selectedTemplate.visibility !== 'all' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{selectedTemplate.visibility === 'legal_entity' ? 'Entity' : 'Site'}</Badge>
                          )}
                          {lastUsedTemplateId === selectedTemplate.id && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Last used</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTemplate?.watermarkEnabled && (() => {
                    const wmSrc = selectedTemplate?.watermarkImageUrl || selectedTemplate?.logoUrl;
                    return (
                      <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-accent/40 p-3">
                        <Switch id="watermark" checked={watermark} onCheckedChange={setWatermark} disabled={!wmSrc} />
                        <div className="flex-1">
                          <Label htmlFor="watermark" className="flex items-center gap-1.5 text-sm">
                            <Sparkles className="h-3.5 w-3.5 text-primary" /> Add watermark
                          </Label>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {wmSrc ? (selectedTemplate.watermarkImageUrl ? 'Watermark image will appear faintly on every page.' : 'Template logo will appear faintly on every page.') : 'No watermark image or logo on this template.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                    <div>
                      <Label htmlFor="document-title" className="text-sm font-medium">
                        Document name <span className="text-destructive">*</span>
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        A short, friendly title for this document.
                      </p>
                      <Input
                        id="document-title"
                        className="mt-1.5 h-9"
                        placeholder="e.g. Q3 audit cover letter"
                        maxLength={200}
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="assigned-to" className="text-sm font-medium">
                        Assigned to <span className="text-destructive">*</span>
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Person or party this document is addressed / assigned to.
                      </p>
                      <Input
                        id="assigned-to"
                        className="mt-1.5 h-9"
                        placeholder="e.g. Acme Corp – John Smith"
                        maxLength={200}
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="mb-2">
                      <Label className="text-sm font-medium">Document sensitivity</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Printed at the bottom of every page.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['general', 'confidential', 'highly_confidential'] as DocumentSensitivity[]).map((s) => {
                        const active = sensitivity === s;
                        const tone =
                          s === 'highly_confidential'
                            ? 'border-destructive/60 text-destructive'
                            : s === 'confidential'
                              ? 'border-amber-500/60 text-amber-600 dark:text-amber-400'
                              : 'border-muted-foreground/30 text-muted-foreground';
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSensitivity(s)}
                            className={cn(
                              'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                              tone,
                              active
                                ? 'bg-background ring-2 ring-primary ring-offset-1 ring-offset-background'
                                : 'bg-background/40 hover:bg-background',
                            )}
                          >
                            {SENSITIVITY_LABELS[s]}
                          </button>
                        );
                      })}
                    </div>
                    {sensitivity !== 'general' || true ? (
                      <div className="mt-3">
                        <Label className="text-xs font-medium text-muted-foreground">Position</Label>
                        <div className="mt-1 grid grid-cols-2 gap-1.5">
                          {([
                            { id: 'above-line', label: 'Above the line' },
                            { id: 'on-line', label: 'On the line' },
                          ] as const).map((opt) => {
                            const active = sensitivityPosition === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setSensitivityPosition(opt.id)}
                                className={cn(
                                  'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                                  active
                                    ? 'border-primary bg-background ring-2 ring-primary ring-offset-1 ring-offset-background'
                                    : 'border-border bg-background/40 text-muted-foreground hover:bg-background',
                                )}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground">
                              Vertical position
                            </Label>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {sensitivityYOffset > 0 ? `+${sensitivityYOffset}` : sensitivityYOffset} pt
                            </span>
                          </div>
                          <Slider
                            value={[sensitivityYOffset]}
                            min={-40}
                            max={120}
                            step={1}
                            onValueChange={(v) => setSensitivityYOffset(v[0] ?? 0)}
                            className="mt-2"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Move the sensitivity label up (away from the footer) or down.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Typography</CardTitle>
                  <CardDescription className="text-xs">
                    Match the body text to the letterhead header. Applies to DOCX uploads only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Match header font (Selawik)</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Re-renders body text in Segoe UI–compatible font.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={unifyFont}
                      onClick={() => setUnifyFont(v => !v)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
                        unifyFont ? 'bg-primary border-primary' : 'bg-muted border-border',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
                          unifyFont ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Body font size</Label>
                    <div className="mt-1 grid grid-cols-3 gap-1.5">
                      {([10, 11, 12] as const).map((size) => {
                        const active = bodyFontSizePt === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            disabled={!unifyFont}
                            onClick={() => setBodyFontSizePt(size)}
                            className={cn(
                              'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                              active
                                ? 'border-primary bg-background ring-2 ring-primary ring-offset-1 ring-offset-background'
                                : 'border-border bg-background/40 text-muted-foreground hover:bg-background',
                              !unifyFont && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {size} pt
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                ref={uploadCardRef}
                data-tour="upload-card"
                className={highlightedSection === 'upload' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow' : 'transition-shadow'}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">2. Upload Document</CardTitle>
                  <CardDescription className="text-xs">Drag & drop or click to select a PDF, Word, text or image file.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Upload document"
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-input')?.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('file-input')?.click(); } }}
                    className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[1.01]'
                        : file
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-input hover:border-primary hover:bg-muted/30'
                    }`}
                  >
                    {file ? (
                      <>
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <FileCheck2 className="h-6 w-6" />
                        </div>
                        <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{fileExt}</Badge>
                          <span>{formatBytes(file.size)}</span>
                        </div>
                        <span className="mt-3 text-xs text-primary underline">Click to replace</span>
                      </>
                    ) : (
                      <>
                        <FileUp className={`mb-3 h-10 w-10 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className="text-sm font-medium">{isDragging ? 'Drop your file here' : 'Click or drag a file here'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Supported: PDF, DOCX, DOC, TXT, MD, RTF, PNG, JPG, WEBP</p>
                      </>
                    )}
                    <input id="file-input" type="file" accept={ACCEPTED_FILE_EXTENSIONS} className="hidden" onChange={handleFileChange} />
                  </div>

                  {fileError && (
                    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-destructive">{fileError.title}</p>
                        <p className="mt-0.5 break-words text-xs text-destructive/90">{fileError.message}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setFileError(null); document.getElementById('file-input')?.click(); }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Try another file
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(`${fileError.title}: ${fileError.message}`);
                                toast({ title: 'Error copied', description: 'Paste it when reporting the issue.' });
                              } catch { /* ignore */ }
                            }}
                          >
                            <Copy className="mr-1 h-3 w-3" /> Copy
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {docxText !== null && (
                    <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-2.5">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="flex-1">
                        <p className="text-xs font-medium">Editable text detected</p>
                        <p className="text-xs text-muted-foreground">
                          After you generate the preview, use the <strong>Edit Content</strong> tab above the preview to change text, font, size, and alignment.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-1.5" data-tour="primary-cta">
                <Button className="w-full" size="lg" disabled={primaryCta.disabled} onClick={primaryCta.onClick}>
                  {primaryCta.icon}
                  {primaryCta.label}
                </Button>
                {(!file || !selectedTemplateId) && !generating && (
                  <p className="text-center text-xs text-muted-foreground">
                    Tap the button to jump to the next step.
                  </p>
                )}
              </div>
            </div>

            {/* Right column ─ Preview */}
            <div className="space-y-4" data-tour="preview-panel">
              {lastGenerated && (
                <Card data-tour="finalized" className="border-primary/40 bg-primary/5 lg:sticky lg:top-4">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Document finalized</p>
                        <p className="text-xs text-muted-foreground">
                          From <span className="font-medium text-foreground">{lastGenerated.filename}</span> · {lastGenerated.templateName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                      <span className="font-mono text-sm font-semibold tracking-tight">{lastGenerated.serial}</span>
                      <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={copySerial} aria-label="Copy serial">
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
                        <Download className="mr-1 h-3.5 w-3.5" /> Download again
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/archive?serial=${encodeURIComponent(lastGenerated.serial)}`)}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in Archive
                      </Button>
                      <Button size="sm" onClick={handleReset}>
                        <Sparkle className="mr-1 h-3.5 w-3.5" /> Generate another
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className={`xl:min-h-[80vh] ${lastGenerated ? '' : 'lg:sticky lg:top-4'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Preview</CardTitle>
                      <CardDescription className="text-xs">
                        {generatedSerial ? 'Document finalized.' : previewPdfBytes ? 'Review before generating the serial.' : 'Live preview will appear here.'}
                      </CardDescription>
                    </div>
                    {previewPdfBytes && (
                      <Badge variant={generatedSerial ? 'default' : 'secondary'} className="text-[10px] px-2 py-0.5">
                        {generatedSerial ? 'Finalized' : 'Draft'}
                      </Badge>
                    )}
                  </div>
                  {generatedSerial && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                      <span className="font-mono text-xs">{generatedSerial}</span>
                      <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={copySerial} aria-label="Copy serial">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {generating && !previewPdfBytes ? (
                    <div className="flex h-[400px] flex-col items-center justify-center gap-3 rounded-md border bg-muted/20">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Building preview…</p>
                    </div>
                  ) : previewPdfBytes ? (
                    <>
                      <Tabs defaultValue="content" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="content">
                            <FileText className="mr-1.5 h-3.5 w-3.5" /> Edit Content
                          </TabsTrigger>
                          <TabsTrigger value="overlay">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Add Overlays
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="content" className="mt-3">
                          <DocumentContentEditor
                            value={bodyContent}
                            original={originalBodyContent}
                            editable={file ? isTextEditable(file) : false}
                            fileLabel={file ? fileKindLabel(file) : undefined}
                            onApply={(b) => { setBodyContent(b); setBodyEdited(true); }}
                          />
                        </TabsContent>
                        <TabsContent value="overlay" className="mt-3">
                          <p className="mb-2 text-xs text-muted-foreground">
                            Drag editable text boxes onto the preview below — useful for corrections, stamps, or notes that should sit on top of the document.
                          </p>
                        </TabsContent>
                      </Tabs>
                      <PdfAnnotationEditor
                        pdfBytes={previewPdfBytes}
                        annotations={annotations}
                        onAnnotationsChange={setAnnotations}
                        layout={layout}
                        onLayoutChange={setLayout}
                        allowAnnotations={true}
                      />
                      <div className="border-t pt-3">
                        {!generatedSerial ? (
                          <Button className="w-full" size="lg" onClick={handleDownload} disabled={downloading}>
                            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            {downloading ? 'Generating…' : 'Download & Generate Serial'}
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button className="flex-1" disabled={downloading}>
                                    {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {downloading ? 'Generating…' : 'Generate New Copy'}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Generate a new serial number?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will create a brand-new document with a fresh serial number and save it to the archive. The current document ({generatedSerial}) will not be affected. If you just want to download the existing PDF again, use “Download Copy” instead.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDownload}>Generate new copy</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <Button variant="outline" onClick={handleRedownload} className="flex-1" disabled={downloading}>
                                <Download className="mr-2 h-4 w-4" />Download Copy
                              </Button>
                            </div>
                            <div className="flex gap-2 text-[11px] text-muted-foreground">
                              <p className="flex-1">Creates a new serial number.</p>
                              <p className="flex-1">Same serial: {generatedSerial}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-[400px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/10 p-6 text-center">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                        <Eye className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">No preview yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">Complete the steps to see your document here.</p>
                      <ul className="mt-4 w-full max-w-[260px] space-y-1.5 text-left text-xs">
                        <li>
                          <button
                            type="button"
                            onClick={() => focusSection('template')}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 transition-colors ${stepDone.template ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                          >
                            {stepDone.template ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5 rounded-full border" />}
                            Pick a template
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            onClick={() => focusSection('upload')}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 transition-colors ${stepDone.document ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                          >
                            {stepDone.document ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5 rounded-full border" />}
                            Upload a file
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            disabled={!stepDone.template || !stepDone.document}
                            onClick={handlePreview}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          >
                            <span className="h-3.5 w-3.5 rounded-full border" />
                            Preview with Letterhead
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
