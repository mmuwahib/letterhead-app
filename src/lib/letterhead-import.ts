import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';

// Use Vite's worker import so pdf.js loads from the local bundle, not a CDN.
pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
  { type: 'module' }
);

async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function pdfFirstPageToPng(arrayBuffer: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await doc.getPage(1);
  // Render at very-high print quality (~576 DPI for A4). PDF.js's base
  // viewport is 72 DPI, so scale=8 ≈ 576 DPI. We clamp the resulting canvas
  // to a safe pixel budget so we never hit the browser canvas limit on very
  // large source pages. Chrome's hard ceiling is ~268M px; 40M leaves plenty
  // of headroom for the rest of the export pipeline.
  const baseViewport = page.getViewport({ scale: 1 });
  const PIXEL_BUDGET = 80_000_000;
  const desiredScale = 12;
  const wantedPx = baseViewport.width * baseViewport.height * desiredScale * desiredScale;
  const safeScale = wantedPx > PIXEL_BUDGET
    ? Math.sqrt(PIXEL_BUDGET / (baseViewport.width * baseViewport.height))
    : desiredScale;
  const viewport = page.getViewport({ scale: safeScale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

async function htmlToPng(html: string): Promise<string> {
  // Render the docx-converted HTML inside an offscreen iframe-like div, then snapshot via canvas.
  // Lightweight approach: draw text lines onto a canvas (no external html2canvas dep).
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.innerText || tmp.textContent || '';
  const canvas = document.createElement('canvas');
  // A4 at 96 dpi-ish ratio
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = '20px Helvetica, Arial, sans-serif';
  const lineHeight = 28;
  const margin = 100;
  const maxWidth = canvas.width - margin * 2;
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  }
  let y = margin;
  for (const line of lines) {
    if (y > canvas.height - margin) break;
    ctx.fillText(line, margin, y);
    y += lineHeight;
  }
  return canvas.toDataURL('image/png');
}

/**
 * Render a DOCX (including its headers, footers, and inline images) to a PNG
 * data URL by mounting it offscreen with docx-preview and snapshotting page 1.
 * Falls back to the legacy mammoth text path on failure.
 */
async function docxToPng(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const container = document.createElement('div');
  // Render off-screen but fully laid out and visible to the layout engine.
  // Anything with opacity:0 / display:none breaks html2canvas measurements.
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:900px;background:#ffffff;pointer-events:none;z-index:-1;';
  document.body.appendChild(container);
  try {
    await renderAsync(buffer, container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: false,
      renderEndnotes: false,
      useBase64URL: true,
    } as any);

    try {
      if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    } catch {}
    // Wait for ALL images (including header/footer logos and CSS background
    // images on absolutely-positioned overlays) to finish loading.
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => new Promise<void>((resolve) => {
      const image = img as HTMLImageElement;
      if (image.complete && image.naturalWidth > 0) return resolve();
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      setTimeout(done, 3000);
    })));
    // Two extra paint cycles + a small grace period so docx-preview's async
    // header/footer mounting has fully settled before we snapshot.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise<void>((r) => setTimeout(r, 250));

    // Snapshot the FIRST page section. docx-preview lays each page out as a
    // <section class="docx"> with header/footer mounted inside it.
    const sections = Array.from(
      container.querySelectorAll('.docx-wrapper > section, section.docx')
    ) as HTMLElement[];
    const page: HTMLElement =
      sections[0] ||
      (container.querySelector('.docx-wrapper') as HTMLElement | null) ||
      container;

    // Ensure header/footer regions are visible AND in-flow for html2canvas.
    // docx-preview often positions them absolutely with negative offsets that
    // sit outside the section's bounding rect, which causes them to be
    // clipped by the snapshot. Forcing position:relative pulls them back into
    // the captured area without changing their visual order on the page.
    page.querySelectorAll('header, footer').forEach((el) => {
      const e = el as HTMLElement;
      e.style.display = 'block';
      e.style.visibility = 'visible';
      e.style.opacity = '1';
    });

    // Determine the intended PAGE size from docx-preview's inline styles
    // (it copies the .docx <sectPr> page dimensions there). Fall back to the
    // section's scroll size, then to A4 at 96dpi (794 x 1123 CSS px).
    const parsePx = (v: string | null | undefined): number => {
      if (!v) return 0;
      const n = parseFloat(v);
      return isFinite(n) ? n : 0;
    };
    const inlineW = parsePx(page.style.width);
    const inlineH = parsePx(page.style.height) || parsePx(page.style.minHeight);
    const width = Math.ceil(inlineW || page.scrollWidth || page.getBoundingClientRect().width || 794);
    const height = Math.ceil(inlineH || page.scrollHeight || page.getBoundingClientRect().height || 1123);

    // Pin the section to its intended page box so headers/footers can't sit
    // outside the snapshot rectangle.
    const prevStyle = page.getAttribute('style') || '';
    page.style.width = `${width}px`;
    page.style.minHeight = `${height}px`;
    page.style.height = `${height}px`;
    page.style.position = 'relative';
    page.style.overflow = 'visible';

    // Single robust pass — foreignObjectRendering is known to drop
    // absolutely-positioned <header>/<footer> in Chromium, so we use the
    // DOM walker with explicit visibility CSS injected into the clone.
    const canvas = await html2canvas(page, {
      // Very-high print quality snapshot. ~6x CSS pixels ≈ 576 DPI for an
      // A4 sheet rendered at 794 CSS px wide. Clamped below a 40M-pixel
      // canvas budget so we don't blow past the browser limit.
      scale: (() => {
        const PIXEL_BUDGET = 80_000_000;
        const want = 9;
        const px = width * height * want * want;
        return px > PIXEL_BUDGET ? Math.sqrt(PIXEL_BUDGET / (width * height)) : want;
      })(),
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      onclone: (doc) => {
        const styles = doc.createElement('style');
        styles.textContent = `
          .docx-wrapper, .docx-wrapper section { background: #ffffff !important; }
          header, footer,
          .docx-wrapper header, .docx-wrapper footer {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: relative !important;
            top: auto !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            transform: none !important;
          }
        `;
        doc.head.appendChild(styles);
      },
    });

    // Restore the section's original inline style so we don't leak layout
    // changes into anything that re-uses the container.
    page.setAttribute('style', prevStyle);

    return canvas.toDataURL('image/png');
  } finally {
    container.remove();
  }
}

/**
 * Convert any uploaded letterhead file (PDF / DOCX / PNG / JPG) into a PNG data URL
 * usable as a template background. Only the first page is captured for PDF/DOCX.
 */
export async function letterheadFileToPng(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type.startsWith('image/')) {
    // For JPGs we re-encode through a canvas to PNG so downstream can rely on a single format.
    const dataUrl = await fileToDataUrl(file);
    if (dataUrl.startsWith('data:image/png')) return dataUrl;
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return pdfFirstPageToPng(await file.arrayBuffer());
  }
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    try {
      return await docxToPng(file);
    } catch (err) {
      console.warn('[letterhead-import] docx-preview failed, falling back to mammoth text', err);
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      return htmlToPng(html);
    }
  }
  throw new Error('Unsupported file type — please upload PDF, DOCX, PNG, or JPG.');
}

export const DEFAULT_OVERLAY_CONFIG = {
  applyToAllPages: false,
  companyName: { x: 8, y: 5, fontSize: 16, visible: true, align: 'left' as const },
  address:     { x: 8, y: 11, fontSize: 9,  visible: true, align: 'left' as const },
  contact:     { x: 8, y: 15, fontSize: 9,  visible: true, align: 'left' as const },
  serialNumber:{ x: 97, y: 3, fontSize: 6,  visible: true, align: 'right' as const },
  serialNumberFooter: { x: 92, y: 96, fontSize: 7, visible: false, align: 'right' as const },
  footerText:  { x: 8, y: 95, fontSize: 8,  visible: true, align: 'left' as const },
};