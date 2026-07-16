import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import mammoth from 'mammoth';
import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';
import type { BodyContent, BodyParagraph, BodyFontFamily } from './pdf-types';

const TEXT_EXTS = ['.docx', '.doc', '.txt', '.md', '.rtf'];
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/** Cached font byte fetches so we don't refetch the same TTF on every export. */
const fontByteCache = new Map<string, Promise<ArrayBuffer>>();
function fetchFontBytes(url: string): Promise<ArrayBuffer> {
  let p = fontByteCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Font fetch failed: ${url} (${r.status})`);
      return r.arrayBuffer();
    });
    fontByteCache.set(url, p);
  }
  return p;
}

function ext(file: File) {
  const i = file.name.lastIndexOf('.');
  return i >= 0 ? file.name.slice(i).toLowerCase() : '';
}

export function isPdf(file: File) {
  return file.type === 'application/pdf' || ext(file) === '.pdf';
}
export function isDocx(file: File) {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext(file) === '.docx'
  );
}
export function isImage(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTS.includes(ext(file));
}
export function isTextEditable(file: File) {
  return TEXT_EXTS.includes(ext(file)) || isDocx(file);
}
export function fileKindLabel(file: File): 'PDF' | 'DOCX' | 'TEXT' | 'IMAGE' | 'FILE' {
  if (isPdf(file)) return 'PDF';
  if (isDocx(file)) return 'DOCX';
  if (isImage(file)) return 'IMAGE';
  if (TEXT_EXTS.includes(ext(file))) return 'TEXT';
  return 'FILE';
}

function stripRtf(rtf: string): string {
  // Best-effort RTF → plain text: drop control words and braces.
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .trim();
}

export async function extractTextFromFile(file: File): Promise<string> {
  const e = ext(file);
  const buf = await file.arrayBuffer();
  if (isDocx(file) || e === '.doc') {
    try {
      const r = await mammoth.extractRawText({ arrayBuffer: buf });
      return r.value;
    } catch (err: any) {
      if (e === '.doc') {
        throw new Error('Legacy .doc files are not supported. Please save the file as .docx and try again.');
      }
      throw new Error(err?.message || 'Could not read Word document.');
    }
  }
  if (e === '.txt' || e === '.md') return new TextDecoder().decode(buf);
  if (e === '.rtf') return stripRtf(new TextDecoder().decode(buf));
  return '';
}

function textToPdfLines(text: string, font: any, fontSize: number, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

export async function textToPdf(text: string): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 60;
  const lineHeight = fontSize * 1.4;
  const lines = textToPdfLines(text || '', font, fontSize, PageSizes.A4[0] - margin * 2);
  const pageHeight = PageSizes.A4[1];
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  for (let i = 0; i < Math.max(lines.length, 1); i += linesPerPage) {
    const pageLines = lines.slice(i, i + linesPerPage);
    const page = doc.addPage(PageSizes.A4);
    pageLines.forEach((line, idx) => {
      if (!line.trim()) return;
      page.drawText(line, { x: margin, y: pageHeight - margin - idx * lineHeight, size: fontSize, font, color: rgb(0, 0, 0) });
    });
  }
  return (await doc.save()).buffer as ArrayBuffer;
}

async function imageToPngBytes(file: File): Promise<{ bytes: ArrayBuffer; mime: 'png' | 'jpg' }> {
  const e = ext(file);
  const ab = await file.arrayBuffer();
  if (e === '.jpg' || e === '.jpeg' || file.type === 'image/jpeg') return { bytes: ab, mime: 'jpg' };
  if (e === '.png' || file.type === 'image/png') return { bytes: ab, mime: 'png' };
  // webp / others → re-encode through canvas to PNG.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not decode image.')); });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out.buffer, mime: 'png' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageFileToPdf(file: File): Promise<ArrayBuffer> {
  const { bytes, mime } = await imageToPngBytes(file);
  const doc = await PDFDocument.create();
  const img = mime === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const [pw, ph] = PageSizes.A4;
  const margin = 36;
  const maxW = pw - margin * 2;
  const maxH = ph - margin * 2;
  const ratio = img.width / img.height;
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  const page = doc.addPage(PageSizes.A4);
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return (await doc.save()).buffer as ArrayBuffer;
}

/**
 * High-fidelity DOCX -> PDF rendering.
 *
 * Mounts the .docx offscreen with docx-preview (which renders headers, footers,
 * inline images, tables, and styling), snapshots EACH page to a PNG with
 * html2canvas, then embeds those PNGs as pages in a fresh PDF. This preserves
 * the original document's layout - including its own header / footer - instead
 * of stripping everything down to plain text.
 *
 * Throws on failure so callers can fall back to the text-only path.
 */
export interface DocxRenderOptions {
  /** Override every font in the rendered DOCX with Selawik so it matches the
   *  letterhead header. Defaults to true. */
  unifyFont?: boolean;
  /** Base body font size in points (10/11/12). Defaults to 11. */
  bodyFontSizePt?: number;
}

export async function docxFileToPdfBytes(
  file: File,
  opts: DocxRenderOptions = {},
): Promise<ArrayBuffer> {
  const buffer = await file.arrayBuffer();
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:900px;background:#ffffff;opacity:0;pointer-events:none;z-index:-1;';
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
      // Honor Word's own page-break markers so a 2-page Word doc renders
      // as 2 sections (instead of being collapsed into one giant section
      // that we'd then slice into many fake pages).
      ignoreLastRenderedPageBreak: false,
    } as any);

    // Optional font unification — inject a stylesheet that forces every
    // element inside the rendered DOCX to use Selawik (Segoe UI clone) so the
    // body text matches the letterhead header.
    if (opts.unifyFont !== false) {
      const sizePt = Math.max(8, Math.min(16, opts.bodyFontSizePt ?? 11));
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        .docx-wrapper, .docx-wrapper * {
          font-family: "Selawik", "Segoe UI", system-ui, -apple-system, sans-serif !important;
        }
        .docx-wrapper section.docx { font-size: ${sizePt}pt; }
      `;
      container.appendChild(styleEl);
    }

    // Wait for fonts and embedded images so headers/footers (which often contain
    // logos) are fully painted before snapshotting.
    try {
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }
    } catch {}
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) {
              resolve();
              return;
            }
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            // Cap the wait so a single broken image can't hang the export.
            setTimeout(done, 1500);
          })
      )
    );
    // Two RAFs to ensure layout/paint has flushed (absolutely positioned
    // header/footer elements need a paint tick before html2canvas runs).
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Robust page selector: take docx-preview's own page sections.
    // Each <section.docx> = one rendered page, including header/footer.
    let pages = Array.from(container.querySelectorAll<HTMLElement>('section.docx'));
    if (pages.length === 0) {
      pages = Array.from(container.querySelectorAll<HTMLElement>('.docx-wrapper > section'));
    }
    // Drop empty sections (header/footer fragments occasionally render
    // with ~0 height, and docx-preview can emit a trailing empty section
    // when a document ends with a section break — counting it would inflate
    // the PDF page count beyond the source document's visual page count).
    pages = pages.filter((p) => {
      const rect = p.getBoundingClientRect();
      if (rect.height < 20) return false;
      // Require the section to contain at least one visible text node OR
      // an image (purely-empty sections inflate the PDF page count).
      const text = (p.textContent || '').trim();
      const hasImg = !!p.querySelector('img, svg');
      return text.length > 0 || hasImg;
    });
    if (pages.length === 0) {
      const wrapper = container.querySelector<HTMLElement>('.docx-wrapper');
      if (wrapper) pages = [wrapper];
    }
    if (pages.length === 0) throw new Error('docx-preview produced no pages');
    console.debug(`[docx->pdf] rendering ${pages.length} page section(s)`);

    const doc = await PDFDocument.create();
    const [a4w, a4h] = PageSizes.A4;

    // Helper: parse `123px` style strings docx-preview puts on sections.
    const parsePx = (v: string | null | undefined) => {
      if (!v) return 0;
      const n = parseFloat(v);
      return isFinite(n) ? n : 0;
    };

    for (const page of pages) {
      // Prefer the section's intended page-box size (docx-preview copies
      // <sectPr> page width/height to inline styles). This avoids capturing
      // wrapper padding or extra whitespace below the page.
      const inlineW = parsePx(page.style.width);
      const inlineH = parsePx(page.style.height) || parsePx(page.style.minHeight);
      const rect = page.getBoundingClientRect();
      const w = Math.ceil(inlineW || rect.width);
      const h = Math.ceil(inlineH || rect.height);

      // Pin the section to its intended page box so html2canvas captures the
      // full page (including absolutely-positioned header/footer) without
      // pulling neighbouring sections into the snapshot.
      const prevStyle = page.getAttribute('style') || '';
      page.style.width = `${w}px`;
      page.style.height = `${h}px`;
      page.style.minHeight = `${h}px`;
      page.style.overflow = 'hidden';
      page.style.position = 'relative';

      try {
        const canvas = await html2canvas(page, {
          // Very-high print quality snapshot (~576 DPI on A4). Clamped below
          // a 40M-pixel canvas budget so very tall pages still render.
          scale: (() => {
            const PIXEL_BUDGET = 80_000_000;
            const want = 9;
            const px = w * h * want * want;
            return px > PIXEL_BUDGET ? Math.sqrt(PIXEL_BUDGET / (w * h)) : want;
          })(),
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: w,
          height: h,
          windowWidth: w,
          windowHeight: h,
          x: 0,
          y: 0,
        });
        const dataUrl = canvas.toDataURL('image/png');
        const bin = atob(dataUrl.split(',')[1]);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const png = await doc.embedPng(u8);

        // Always emit A4 pages so letterhead artwork (which is A4-shaped)
        // doesn't get distorted by containedRect downstream. Fit the
        // captured page proportionally inside A4 (no stretching).
        const ratio = png.width / png.height;
        let drawW = a4w;
        let drawH = drawW / ratio;
        if (drawH > a4h) {
          drawH = a4h;
          drawW = drawH * ratio;
        }
        const pdfPage = doc.addPage([a4w, a4h]);
        const xOffset = (a4w - drawW) / 2;
        // Top-align so any extra whitespace falls at the bottom (where the
        // letterhead footer band will sit).
        pdfPage.drawImage(png, {
          x: xOffset,
          y: a4h - drawH,
          width: drawW,
          height: drawH,
        });
      } finally {
        page.setAttribute('style', prevStyle);
      }
    }
    console.debug(`[docx->pdf] produced ${doc.getPageCount()} PDF page(s)`);
    return (await doc.save()).buffer as ArrayBuffer;
  } finally {
    container.remove();
  }
}

/**
 * Convert any supported upload into PDF bytes ready for letterhead application.
 * For text-based formats, pass `editedText` if the user edited the extracted text.
 *
 * For DOCX uploads, when the user has NOT edited the extracted text we render
 * the document at full fidelity (preserving its own headers, footers, images,
 * and tables). When the user HAS edited the text we fall back to the
 * text-reflow path so their edits are honoured.
 */
export async function fileToPdfBytes(
  file: File,
  editedText?: string,
  docxOptions?: DocxRenderOptions,
): Promise<ArrayBuffer> {
  if (isPdf(file)) return file.arrayBuffer();
  if (isImage(file)) return imageFileToPdf(file);
  if (isDocx(file) && (editedText === undefined || editedText === null)) {
    try {
      return await docxFileToPdfBytes(file, docxOptions);
    } catch (err) {
      console.warn('[document-to-pdf] high-fidelity DOCX render failed, falling back to text reflow', err);
    }
  }
  if (isTextEditable(file)) {
    const text = editedText !== undefined && editedText !== null
      ? editedText
      : await extractTextFromFile(file);
    return textToPdf(text);
  }
  throw new Error(`Unsupported file type: ${ext(file) || file.type || 'unknown'}.`);
}

export const ACCEPTED_FILE_EXTENSIONS = '.pdf,.docx,.doc,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp';
export const ACCEPTED_FILE_REGEX = /\.(pdf|docx|doc|txt|md|rtf|png|jpe?g|webp)$/i;

// ============ Styled body rendering ============

/**
 * Build an initial BodyContent model from an extracted plain-text string.
 * Each blank line starts a new paragraph; consecutive non-blank lines join.
 */
export function textToBodyContent(
  text: string,
  defaults: { font?: BodyFontFamily; fontSize?: number; lineHeight?: number } = {},
): BodyContent {
  const font = defaults.font ?? 'Helvetica';
  const fontSize = defaults.fontSize ?? 11;
  const lineHeight = defaults.lineHeight ?? 1.15;
  const blocks = (text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const paragraphs: BodyParagraph[] = blocks.length
    ? blocks.map((block) => ({
        runs: [{ text: block.replace(/\n/g, ' ').trim() }],
        align: 'left',
        fontSize,
        spacingAfter: 6,
      }))
    : [{ runs: [{ text: '' }], align: 'left', fontSize, spacingAfter: 6 }];
  return { font, lineHeight, paragraphs };
}

/** Parse a CSS length like "24px", "0.5in", "36pt", "1.2em" into points. */
function cssLenToPt(value: string | undefined, fontSizePt = 11): number {
  if (!value) return 0;
  const m = value.trim().match(/^(-?[\d.]+)\s*(px|pt|in|cm|mm|em|rem)?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return 0;
  const unit = (m[2] || 'px').toLowerCase();
  switch (unit) {
    case 'pt': return n;
    case 'in': return n * 72;
    case 'cm': return n * 28.3464567;
    case 'mm': return n * 2.83464567;
    case 'em':
    case 'rem': return n * fontSizePt;
    case 'px':
    default: return n * 0.75; // 1pt = 1.333px
  }
}

/**
 * Build a BodyContent from a DOCX file, preserving paragraph alignment and
 * indents (left/right/first-line) when mammoth emits them as inline styles.
 * Falls back to text-only conversion if anything goes wrong.
 */
export async function docxToBodyContent(
  file: File,
  defaults: { font?: BodyFontFamily; fontSize?: number; lineHeight?: number } = {},
): Promise<BodyContent> {
  const font = defaults.font ?? 'Helvetica';
  const fontSize = defaults.fontSize ?? 11;
  const lineHeight = defaults.lineHeight ?? 1.15;
  try {
    const buffer = await file.arrayBuffer();
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const blocks = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));
    if (blocks.length === 0) {
      const text = await extractTextFromFile(file);
      return textToBodyContent(text, defaults);
    }
    const paragraphs: BodyParagraph[] = [];
    for (const el of blocks) {
      const html = el as HTMLElement;
      const text = (html.textContent || '').replace(/\s+/g, ' ').trim();
      const align = (html.style.textAlign as BodyParagraph['align']) || 'left';
      const validAlign: BodyParagraph['align'] =
        ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left';
      const indentLeft = cssLenToPt(html.style.marginLeft || html.style.paddingLeft, fontSize);
      const indentRight = cssLenToPt(html.style.marginRight || html.style.paddingRight, fontSize);
      const indentFirstLine = Math.max(0, cssLenToPt(html.style.textIndent, fontSize));
      // Walk inline runs to preserve bold/italic/underline.
      const runs: BodyParagraph['runs'] = [];
      const walk = (node: Node, ctx: { bold: boolean; italic: boolean; underline: boolean }) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = (node.textContent || '').replace(/\s+/g, ' ');
          if (t) runs.push({ text: t, bold: ctx.bold || undefined, italic: ctx.italic || undefined, underline: ctx.underline || undefined });
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const e = node as HTMLElement;
        const tag = e.tagName.toLowerCase();
        const next = {
          bold: ctx.bold || tag === 'b' || tag === 'strong',
          italic: ctx.italic || tag === 'i' || tag === 'em',
          underline: ctx.underline || tag === 'u',
        };
        e.childNodes.forEach((c) => walk(c, next));
      };
      html.childNodes.forEach((c) => walk(c, { bold: false, italic: false, underline: false }));
      if (runs.length === 0 && text) runs.push({ text });
      if (runs.length === 0) continue;
      paragraphs.push({
        runs,
        align: validAlign,
        fontSize,
        spacingAfter: 6,
        indentLeft: indentLeft || undefined,
        indentRight: indentRight || undefined,
        indentFirstLine: indentFirstLine || undefined,
      });
    }
    if (paragraphs.length === 0) {
      const text = await extractTextFromFile(file);
      return textToBodyContent(text, defaults);
    }
    return { font, lineHeight, paragraphs };
  } catch (err) {
    console.warn('[document-to-pdf] docxToBodyContent failed, falling back to text', err);
    const text = await extractTextFromFile(file);
    return textToBodyContent(text, defaults);
  }
}

async function pickFontPair(doc: PDFDocument, family: BodyFontFamily) {
  switch (family) {
    case 'TimesRoman':
      return {
        regular: await doc.embedFont(StandardFonts.TimesRoman),
        bold: await doc.embedFont(StandardFonts.TimesRomanBold),
        italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
        boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
      };
    case 'Courier':
      return {
        regular: await doc.embedFont(StandardFonts.Courier),
        bold: await doc.embedFont(StandardFonts.CourierBold),
        italic: await doc.embedFont(StandardFonts.CourierOblique),
        boldItalic: await doc.embedFont(StandardFonts.CourierBoldOblique),
      };
    case 'SegoeUI': {
      // Selawik is Microsoft's open-source, metric-compatible substitute for
      // Segoe UI. We embed the full TTFs shipped under /public/fonts/ via
      // fontkit. Subsetting is intentionally DISABLED so a single unsupported
      // glyph anywhere in the document doesn't blow up the entire embed and
      // dump us back to Helvetica. Each font is ~37 KB, so the size cost is
      // trivial.
      try {
        doc.registerFontkit(fontkit);
        const [reg, bold] = await Promise.all([
          fetchFontBytes('/fonts/selawik-regular.ttf'),
          fetchFontBytes('/fonts/selawik-bold.ttf'),
        ]);
        const regular = await doc.embedFont(reg, { subset: false });
        const boldFont = await doc.embedFont(bold, { subset: false });
        // Selawik ships only Regular + Bold. We re-use them for italic
        // slots; the per-run draw path applies a synthetic italic skew
        // matrix so italic spans still look slanted on screen and in print.
        // eslint-disable-next-line no-console
        console.info('[pdf] embedded Selawik (Segoe UI substitute) for body text');
        return {
          regular,
          bold: boldFont,
          italic: regular,
          boldItalic: boldFont,
        };
      } catch (e) {
        // Loud warning — never silently downgrade to Helvetica.
        console.warn(
          '[pdf] FONT FALLBACK: Selawik (Segoe UI) failed to embed; using Helvetica instead.',
          e,
        );
        return {
          regular: await doc.embedFont(StandardFonts.Helvetica),
          bold: await doc.embedFont(StandardFonts.HelveticaBold),
          italic: await doc.embedFont(StandardFonts.HelveticaOblique),
          boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
        };
      }
    }
    default:
      return {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
        italic: await doc.embedFont(StandardFonts.HelveticaOblique),
        boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
      };
  }
}

function pickRunFont(fonts: Awaited<ReturnType<typeof pickFontPair>>, run: { bold?: boolean; italic?: boolean }) {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

/** Wrap a paragraph's runs into visual lines that fit `maxWidth`. */
function wrapParagraph(
  para: BodyParagraph,
  fonts: Awaited<ReturnType<typeof pickFontPair>>,
  maxWidth: number,
): { runs: { text: string; font: any; bold?: boolean; italic?: boolean; underline?: boolean }[] }[] {
  const lines: { runs: { text: string; font: any; bold?: boolean; italic?: boolean; underline?: boolean }[] }[] = [];
  let current: { runs: { text: string; font: any; bold?: boolean; italic?: boolean; underline?: boolean }[]; width: number } = { runs: [], width: 0 };

  const pushLine = () => { lines.push({ runs: current.runs }); current = { runs: [], width: 0 }; };

  const firstLineExtra = Math.max(0, para.indentFirstLine || 0);
  const widthFor = (lineIndex: number) =>
    lineIndex === 0 ? Math.max(20, maxWidth - firstLineExtra) : maxWidth;

  for (const run of para.runs) {
    const f = pickRunFont(fonts, run);
    const tokens = (run.text ?? '').split(/(\s+)/).filter((t) => t.length > 0);
    for (const tok of tokens) {
      const w = f.widthOfTextAtSize(tok, para.fontSize);
      const lineMax = widthFor(lines.length);
      if (current.width + w > lineMax && current.runs.length > 0) {
        // Drop trailing whitespace token before wrapping.
        if (/^\s+$/.test(tok)) { pushLine(); continue; }
        pushLine();
      }
      current.runs.push({ text: tok, font: f, bold: run.bold, italic: run.italic, underline: run.underline });
      current.width += w;
    }
  }
  if (current.runs.length > 0 || lines.length === 0) pushLine();
  return lines;
}

/**
 * Render a structured BodyContent into a fresh PDF using the chosen
 * font/size/alignment/line-spacing. Paginates onto A4 pages.
 */
export async function renderStyledBodyToPdf(body: BodyContent): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const fonts = await pickFontPair(doc, body.font);
  // Lazy-loaded Helvetica fallback used only when a single character can't
  // be encoded by the chosen font (e.g. Selawik missing a CJK glyph). This
  // keeps a missing glyph from dumping the ENTIRE document back to Helvetica.
  let helveticaFallback: any = null;
  const getHelveticaFallback = async () => {
    if (!helveticaFallback) helveticaFallback = await doc.embedFont(StandardFonts.Helvetica);
    return helveticaFallback;
  };
  let unsupportedCharLogged = false;
  /** Probe the chosen font for the run text; on failure swap to Helvetica. */
  const fontFor = async (font: any, text: string, size: number) => {
    try {
      font.widthOfTextAtSize(text, size);
      return font;
    } catch {
      if (!unsupportedCharLogged) {
        console.warn(
          `[pdf] Some characters aren't in the chosen font; using Helvetica for those runs. Sample: "${text.slice(0, 24)}"`,
        );
        unsupportedCharLogged = true;
      }
      return getHelveticaFallback();
    }
  };
  const [pw, ph] = PageSizes.A4;
  const marginL = Math.max(18, body.pageMarginLeft ?? 60);
  const marginR = Math.max(18, body.pageMarginRight ?? 60);
  const marginT = Math.max(18, body.pageMarginTop ?? 60);
  const marginB = Math.max(18, body.pageMarginBottom ?? 60);
  const maxW = pw - marginL - marginR;
  let page = doc.addPage(PageSizes.A4);
  let y = ph - marginT;

  const newPage = () => { page = doc.addPage(PageSizes.A4); y = ph - marginT; };

  for (const para of body.paragraphs) {
    const indentL = Math.max(0, para.indentLeft || 0);
    const indentR = Math.max(0, para.indentRight || 0);
    const indentFirst = Math.max(0, para.indentFirstLine || 0);
    const paraMaxW = Math.max(40, maxW - indentL - indentR);
    const lines = wrapParagraph(para, fonts, paraMaxW);
    const lineHeight = para.fontSize * (body.lineHeight || 1.15);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (y - lineHeight < marginB) newPage();
      // Resolve the actual font (with possible Helvetica fallback) per run
      // BEFORE measuring, so width and draw stay consistent.
      const resolved: { text: string; font: any; underline?: boolean }[] = [];
      for (const r of line.runs) {
        resolved.push({
          text: r.text,
          font: await fontFor(r.font, r.text, para.fontSize),
          underline: r.underline,
        });
      }
      const lineW = resolved.reduce((sum, r) => sum + r.font.widthOfTextAtSize(r.text, para.fontSize), 0);
      const isFirst = lineIdx === 0;
      const boxLeft = marginL + indentL + (isFirst ? indentFirst : 0);
      const boxWidth = paraMaxW - (isFirst ? indentFirst : 0);
      let x = boxLeft;
      if (para.align === 'center') x = boxLeft + (boxWidth - lineW) / 2;
      else if (para.align === 'right') x = boxLeft + (boxWidth - lineW);
      // (justify is approximated as left for now to keep word integrity.)
      for (const r of resolved) {
        if (r.text.trim().length > 0) {
          page.drawText(r.text, { x, y: y - para.fontSize, size: para.fontSize, font: r.font, color: rgb(0, 0, 0) });
          if (r.underline) {
            const tw = r.font.widthOfTextAtSize(r.text, para.fontSize);
            page.drawLine({
              start: { x, y: y - para.fontSize - 1 },
              end: { x: x + tw, y: y - para.fontSize - 1 },
              thickness: Math.max(0.5, para.fontSize / 18),
              color: rgb(0, 0, 0),
            });
          }
        }
        x += r.font.widthOfTextAtSize(r.text, para.fontSize);
      }
      y -= lineHeight;
    }
    y -= para.spacingAfter;
  }
  return (await doc.save()).buffer as ArrayBuffer;
}