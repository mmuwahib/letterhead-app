export interface OverlayBlock {
  x: number; // % of width
  y: number; // % of height
  fontSize: number; // px in preview, also used for PDF size
  visible: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface OverlayConfig {
  applyToAllPages?: boolean;
  companyName?: OverlayBlock;
  address?: OverlayBlock;
  contact?: OverlayBlock;
  footerText?: OverlayBlock;
  serialNumber?: OverlayBlock;
  serialNumberFooter?: OverlayBlock;
}

export type DocumentSensitivity = 'general' | 'confidential' | 'highly_confidential';

export const SENSITIVITY_LABELS: Record<DocumentSensitivity, string> = {
  general: 'General',
  confidential: 'Confidential',
  highly_confidential: 'Highly Confidential',
};

export type ReferenceSegment = 'PREFIX' | 'COMPANY' | 'DEPT' | 'DATE' | 'COUNTER';

export interface ReferenceFormat {
  segments: ReferenceSegment[];
  // Optional per-template overrides; when undefined, the global app_settings value is used.
  prefix?: string;
  separator?: string;
  padding?: number;
}

export const DEFAULT_REFERENCE_FORMAT: ReferenceFormat = {
  segments: ['PREFIX', 'COMPANY', 'DEPT', 'DATE', 'COUNTER'],
};

export interface LetterheadTemplate {
  id: string;
  name: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string; // base64 data URL
  footerText: string;
  headerLayout?: 'logo-left' | 'logo-center';
  headerFontSize?: 'small' | 'medium' | 'large';
  headerBorderStyle?: 'solid' | 'dashed' | 'none';
  footerBorderStyle?: 'solid' | 'dashed' | 'none';
  secondaryLogoUrl?: string;
  backgroundUrl?: string; // base64 PNG data URL of uploaded letterhead
  overlayConfig?: OverlayConfig;
  isDefault: boolean;
  watermarkEnabled?: boolean;
  watermarkDefaultOn?: boolean;
  watermarkOpacity?: number;
  watermarkImageUrl?: string;
  watermarkPages?: 'first' | 'last' | 'all';
  referenceFormat?: ReferenceFormat;
  legalEntityId?: string | null;
  officeSiteId?: string | null;
  visibility?: 'all' | 'legal_entity' | 'site';
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocument {
  id: string;
  serialNumber: string;
  originalFilename: string;
  templateId: string;
  templateName: string;
  createdAt: string;
  pdfData: string; // base64
  sensitivity?: DocumentSensitivity;
}

export interface ActivityLog {
  id: string;
  action: 'upload' | 'download' | 'print' | 'template_create' | 'template_update' | 'template_delete';
  description: string;
  serialNumber?: string;
  timestamp: string;
}
