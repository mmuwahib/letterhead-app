export interface Annotation {
  id: string;
  text: string;
  x: number; // % of page width
  y: number; // % of page height
  fontSize: number;
  pageIndex: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

export interface LayoutOptions {
  headerTopMargin: number; // default 15
  footerHeight: number;    // default 50
  logoScale: number;       // default 1.0
  // Document safe-area insets (fractions of page size, 0..1)
  docTopInset: number;       // default 0
  docBottomInset: number;    // default 0
  docHorizontalPad: number;  // default 0
  docInsetAllPages: boolean; // default true
  // Left indent (fraction of page width, 0..0.25) used to align the
  // Ref / Date stamp with the source document's body left margin.
  docBodyIndent: number;     // default 0.08 (~1" on A4)
  // Horizontal alignment of the user's document body inside the safe area.
  // 'left' / 'center' / 'right'. Default 'center'.
  docHorizontalAlign: 'left' | 'center' | 'right';
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  headerTopMargin: 15,
  footerHeight: 50,
  logoScale: 1.0,
  docTopInset: 0,
  docBottomInset: 0,
  docHorizontalPad: 0,
  docInsetAllPages: true,
  docBodyIndent: 0.08,
  docHorizontalAlign: 'center',
};

// ============ Editable body content model ============

export type BodyFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier' | 'SegoeUI';
export type BodyAlign = 'left' | 'center' | 'right' | 'justify';

export interface BodyRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface BodyParagraph {
  runs: BodyRun[];
  align: BodyAlign;
  fontSize: number;       // points
  spacingAfter: number;   // points
  /** Left indent in points (1" = 72pt). Optional; defaults to 0. */
  indentLeft?: number;
  /** Right indent in points. Optional; defaults to 0. */
  indentRight?: number;
  /** Extra indent for the first line only, in points. Optional; defaults to 0. */
  indentFirstLine?: number;
}

export interface BodyContent {
  font: BodyFontFamily;
  lineHeight: number;     // multiplier (e.g. 1.15)
  paragraphs: BodyParagraph[];
  /** Page margins in points (1" = 72pt). Default 60pt all sides. */
  pageMarginLeft?: number;
  pageMarginRight?: number;
  pageMarginTop?: number;
  pageMarginBottom?: number;
}

export const DEFAULT_BODY_CONTENT: Omit<BodyContent, 'paragraphs'> = {
  font: 'Helvetica',
  lineHeight: 1.15,
};
