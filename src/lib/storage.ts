import { supabase } from '@/integrations/supabase/client';
import type { LetterheadTemplate, OverlayConfig, DocumentSensitivity, ReferenceFormat } from './types';
import { DEFAULT_REFERENCE_FORMAT } from './types';

// Templates - database
export async function fetchTemplates(): Promise<LetterheadTemplate[]> {
  const { data, error } = await supabase
    .from('letterhead_templates')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRowToTemplate);
}

export async function saveTemplate(template: Omit<LetterheadTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<LetterheadTemplate> {
  const { data, error } = await supabase
    .from('letterhead_templates')
    .insert({
      name: template.name,
      company_name: template.companyName,
      address: template.address,
      phone: template.phone,
      email: template.email,
      website: template.website,
      logo_url: template.logoUrl,
      footer_text: template.footerText,
      header_layout: template.headerLayout ?? 'logo-left',
      header_font_size: template.headerFontSize ?? 'medium',
      header_border_style: template.headerBorderStyle ?? 'solid',
      footer_border_style: template.footerBorderStyle ?? 'solid',
      secondary_logo_url: template.secondaryLogoUrl ?? '',
      background_url: template.backgroundUrl ?? '',
      overlay_config: (template.overlayConfig ?? {}) as never,
      is_default: template.isDefault,
      watermark_enabled: template.watermarkEnabled ?? false,
      watermark_default_on: template.watermarkDefaultOn ?? false,
      watermark_opacity: template.watermarkOpacity ?? 0.12,
      watermark_image_url: template.watermarkImageUrl ?? '',
      watermark_pages: template.watermarkPages ?? 'all',
      reference_format: (template.referenceFormat ?? DEFAULT_REFERENCE_FORMAT) as never,
      legal_entity_id: template.legalEntityId ?? null,
      office_site_id: template.officeSiteId ?? null,
      visibility: template.visibility ?? 'all',
    })
    .select()
    .single();
  if (error) throw error;
  return mapRowToTemplate(data);
}

export async function updateTemplate(id: string, template: Partial<Omit<LetterheadTemplate, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (template.name !== undefined) updates.name = template.name;
  if (template.companyName !== undefined) updates.company_name = template.companyName;
  if (template.address !== undefined) updates.address = template.address;
  if (template.phone !== undefined) updates.phone = template.phone;
  if (template.email !== undefined) updates.email = template.email;
  if (template.website !== undefined) updates.website = template.website;
  if (template.logoUrl !== undefined) updates.logo_url = template.logoUrl;
  if (template.footerText !== undefined) updates.footer_text = template.footerText;
  if (template.headerLayout !== undefined) updates.header_layout = template.headerLayout;
  if (template.headerFontSize !== undefined) updates.header_font_size = template.headerFontSize;
  if (template.headerBorderStyle !== undefined) updates.header_border_style = template.headerBorderStyle;
  if (template.footerBorderStyle !== undefined) updates.footer_border_style = template.footerBorderStyle;
  if (template.secondaryLogoUrl !== undefined) updates.secondary_logo_url = template.secondaryLogoUrl;
  if (template.backgroundUrl !== undefined) updates.background_url = template.backgroundUrl;
  if (template.overlayConfig !== undefined) updates.overlay_config = template.overlayConfig;
  if (template.isDefault !== undefined) updates.is_default = template.isDefault;
  if (template.watermarkEnabled !== undefined) updates.watermark_enabled = template.watermarkEnabled;
  if (template.watermarkDefaultOn !== undefined) updates.watermark_default_on = template.watermarkDefaultOn;
  if (template.watermarkOpacity !== undefined) updates.watermark_opacity = template.watermarkOpacity;
  if (template.watermarkImageUrl !== undefined) updates.watermark_image_url = template.watermarkImageUrl;
  if (template.watermarkPages !== undefined) updates.watermark_pages = template.watermarkPages;
  if (template.referenceFormat !== undefined) updates.reference_format = template.referenceFormat;
  if (template.legalEntityId !== undefined) updates.legal_entity_id = template.legalEntityId;
  if (template.officeSiteId !== undefined) updates.office_site_id = template.officeSiteId;
  if (template.visibility !== undefined) updates.visibility = template.visibility;

  const { error } = await supabase
    .from('letterhead_templates')
    .update(updates as never)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('letterhead_templates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getDefaultTemplate(): Promise<LetterheadTemplate | undefined> {
  const templates = await fetchTemplates();
  return templates.find(t => t.isDefault);
}

function mapRowToTemplate(row: any): LetterheadTemplate {
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    logoUrl: row.logo_url,
    footerText: row.footer_text,
    headerLayout: row.header_layout,
    headerFontSize: row.header_font_size,
    headerBorderStyle: row.header_border_style,
    footerBorderStyle: row.footer_border_style,
    secondaryLogoUrl: row.secondary_logo_url,
    backgroundUrl: row.background_url ?? '',
    overlayConfig: (row.overlay_config ?? {}) as OverlayConfig,
    isDefault: row.is_default,
    watermarkEnabled: row.watermark_enabled ?? false,
    watermarkDefaultOn: row.watermark_default_on ?? false,
    watermarkOpacity: Number(row.watermark_opacity ?? 0.12),
    watermarkImageUrl: row.watermark_image_url ?? '',
    watermarkPages: (row.watermark_pages ?? 'all') as LetterheadTemplate['watermarkPages'],
    referenceFormat: (row.reference_format ?? DEFAULT_REFERENCE_FORMAT) as ReferenceFormat,
    legalEntityId: row.legal_entity_id ?? null,
    officeSiteId: row.office_site_id ?? null,
    visibility: (row.visibility ?? 'all') as LetterheadTemplate['visibility'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Documents - database
export async function addDocumentToDb(doc: {
  serialNumber: string;
  originalFilename: string;
  templateId: string;
  templateName: string;
  pdfData?: string;
  pdfPath?: string;
  userId: string;
  userName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  legalEntityId: string | null;
  legalEntityName?: string | null;
  officeSiteId?: string | null;
  officeSiteName?: string | null;
  sensitivity?: DocumentSensitivity;
  documentTitle?: string | null;
  assignedTo?: string | null;
}) {
  const { error } = await supabase.from('documents').insert({
    serial_number: doc.serialNumber,
    original_filename: doc.originalFilename,
    template_id: doc.templateId,
    template_name: doc.templateName,
    pdf_data: doc.pdfData ?? null,
    pdf_path: doc.pdfPath ?? '',
    user_id: doc.userId,
    user_name: doc.userName,
    department_id: doc.departmentId,
    department_name: doc.departmentName,
    legal_entity_id: doc.legalEntityId,
    legal_entity_name: doc.legalEntityName ?? null,
    office_site_id: doc.officeSiteId ?? null,
    office_site_name: doc.officeSiteName ?? null,
    sensitivity: doc.sensitivity ?? 'general',
    document_title: doc.documentTitle ?? null,
    assigned_to: doc.assignedTo ?? null,
  } as never);
  if (error) throw error;
}

export async function uploadDocumentPdf(userId: string, serialNumber: string, bytes: Uint8Array): Promise<string> {
  const path = `${userId}/${serialNumber}.pdf`;
  const { error } = await supabase.storage.from('documents').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function getDocumentSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

// Watermark image upload (public bucket)
export async function uploadWatermarkImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('watermarks').upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('watermarks').getPublicUrl(path);
  return data.publicUrl;
}

// List documents WITHOUT the heavy `pdf_data` (base64) column. The PDF blob is
// fetched on demand from Supabase Storage when previewing/downloading. This
// dramatically reduces payload size on the dashboard and archive pages.
const DOCUMENT_LIST_COLUMNS =
  'id, serial_number, original_filename, template_id, template_name, pdf_path, ' +
  'user_id, user_name, department_id, department_name, legal_entity_id, ' +
  'legal_entity_name, office_site_id, office_site_name, sensitivity, ' +
  'document_title, assigned_to, created_at';

export type DocumentListRow = {
  id: string;
  serial_number: string;
  original_filename: string;
  template_id: string;
  template_name: string;
  pdf_path: string;
  user_id: string;
  user_name: string | null;
  department_id: string | null;
  department_name: string | null;
  legal_entity_id: string | null;
  legal_entity_name: string | null;
  office_site_id: string | null;
  office_site_name: string | null;
  sensitivity: DocumentSensitivity | null;
  document_title: string | null;
  assigned_to: string | null;
  created_at: string;
};

export async function fetchDocuments(limit?: number): Promise<DocumentListRow[]> {
  let q = supabase
    .from('documents')
    .select(DOCUMENT_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DocumentListRow[];
}

// Fetch the legacy inline base64 PDF for documents that don't have a storage path.
export async function fetchDocumentPdfData(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('pdf_data')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.pdf_data ?? null;
}

// Activity Logs - database
export async function addLogToDb(log: {
  action: string;
  description: string;
  serialNumber?: string;
  userId?: string;
  userName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  legalEntityId?: string | null;
  legalEntityName?: string | null;
  officeSiteId?: string | null;
  officeSiteName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
}) {
  // Server-side validated insert via SECURITY DEFINER RPC.
  // user/department/entity fields are derived from the caller's profile.
  const { error } = await supabase.rpc('log_activity', {
    _action: log.action,
    _description: log.description,
    _serial_number: log.serialNumber ?? null,
    _target_type: log.targetType ?? null,
    _target_id: log.targetId ?? null,
  } as never);
  if (error) throw error;
}

export async function fetchLogs(limit = 500) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Recent activity log entries for a specific document serial number
export async function fetchDocumentLogs(serialNumber: string, limit = 20) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('serial_number', serialNumber)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Aggregated download counts grouped by serial number
export async function fetchDownloadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('serial_number')
    .eq('action', 'download');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const sn = (row as any).serial_number as string | null;
    if (!sn) continue;
    counts[sn] = (counts[sn] ?? 0) + 1;
  }
  return counts;
}

// Serial Number - database (atomic)
export async function generateSerialNumber(opts?: {
  legalEntityCode?: string;
  siteCode?: string;
  deptCode?: string;
  referenceFormat?: ReferenceFormat;
}): Promise<string> {
  // Fetch settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'serial_prefix','serial_separator','serial_include_month','serial_padding','serial_include_timestamp',
      'serial_include_legal_entity','serial_include_site',
    ]);

  const settingsMap: Record<string, any> = {};
  (settings ?? []).forEach(s => { settingsMap[s.key] = s.value; });

  const globalPrefix = (settingsMap.serial_prefix as string) ?? 'GC';
  const globalSeparator = (settingsMap.serial_separator as string) ?? '-';
  const globalPadding = (settingsMap.serial_padding as number) ?? 4;

  const fmt = opts?.referenceFormat;
  // If a template provides a custom format, it fully overrides global flags.
  const prefix = fmt?.prefix?.trim() ? fmt.prefix.trim() : globalPrefix;
  const separator = fmt?.separator?.trim() ? fmt.separator.trim() : globalSeparator;
  const padding = typeof fmt?.padding === 'number' && fmt.padding > 0 ? fmt.padding : globalPadding;

  // Always call the RPC with full LE+DEPT+date scope so the counter is reserved
  // atomically. We then recompose the visible reference string from the chosen
  // segments and the counter value the RPC returned.
  const { data, error } = await supabase.rpc('generate_serial_number', {
    _prefix: prefix,
    _separator: separator,
    _include_month: true,
    _padding: padding,
    _include_timestamp: false,
    _legal_entity_code: opts?.legalEntityCode ?? '',
    _site_code: opts?.siteCode ?? '',
    _include_legal_entity: true,
    _include_site: false,
    _dept_code: opts?.deptCode ?? '',
  });

  if (error) throw error;
  const rpcResult = data as string;

  if (!fmt || !Array.isArray(fmt.segments) || fmt.segments.length === 0) {
    return rpcResult;
  }

  // Counter = last segment of the RPC result (split by separator the RPC used).
  const parts = rpcResult.split(separator);
  const counter = parts[parts.length - 1] ?? '';

  const now = new Date();
  const yyyymmdd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const out: string[] = [];
  // Defensive: if a deptCode was provided but the format omits DEPT, inject it
  // so the reference always includes the department segment.
  const effectiveSegments = [...fmt.segments];
  if ((opts?.deptCode ?? '') && !effectiveSegments.includes('DEPT')) {
    const companyIdx = effectiveSegments.indexOf('COMPANY');
    const insertAt = companyIdx >= 0 ? companyIdx + 1 : Math.max(1, effectiveSegments.length - 2);
    effectiveSegments.splice(insertAt, 0, 'DEPT');
  }
  for (const seg of effectiveSegments) {
    let val = '';
    switch (seg) {
      case 'PREFIX':  val = prefix; break;
      case 'COMPANY': val = opts?.legalEntityCode ?? ''; break;
      case 'DEPT':    val = opts?.deptCode ?? ''; break;
      case 'DATE':    val = yyyymmdd; break;
      case 'COUNTER': val = counter; break;
    }
    if (val) out.push(val);
  }
  return out.join(separator);
}

// Settings helpers
export async function fetchSerialSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'serial_prefix','serial_separator','serial_include_month','serial_padding','serial_include_timestamp',
      'serial_include_legal_entity','serial_include_site',
    ]);
  if (error) throw error;

  const map: Record<string, any> = {};
  (data ?? []).forEach(s => { map[s.key] = s.value; });

  return {
    prefix: (map.serial_prefix as string) ?? 'GC',
    separator: (map.serial_separator as string) ?? '-',
    includeMonth: map.serial_include_month ?? true,
    padding: (map.serial_padding as number) ?? 4,
    includeTimestamp: map.serial_include_timestamp ?? false,
    includeLegalEntity: map.serial_include_legal_entity ?? false,
    includeSite: map.serial_include_site ?? false,
  };
}

export async function updateSerialSettings(settings: {
  prefix: string;
  separator: string;
  includeMonth: boolean;
  padding: number;
  includeTimestamp: boolean;
  includeLegalEntity: boolean;
  includeSite: boolean;
}) {
  const updates = [
    { key: 'serial_prefix', value: JSON.stringify(settings.prefix) },
    { key: 'serial_separator', value: JSON.stringify(settings.separator) },
    { key: 'serial_include_month', value: JSON.stringify(settings.includeMonth) },
    { key: 'serial_padding', value: JSON.stringify(settings.padding) },
    { key: 'serial_include_timestamp', value: JSON.stringify(settings.includeTimestamp) },
    { key: 'serial_include_legal_entity', value: JSON.stringify(settings.includeLegalEntity) },
    { key: 'serial_include_site', value: JSON.stringify(settings.includeSite) },
  ];

  for (const u of updates) {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: u.key, value: JSON.parse(u.value) }, { onConflict: 'key' });
    if (error) throw error;
  }
}
