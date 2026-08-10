export type MediaScope =
  | 'whatsapp_avatar'
  | 'user_avatar'
  | 'tenant_logo'
  | 'store_logo'
  | 'product_image'
  /** S33 — Media Library tenant (≠ flow_inbound_temp / D32.2). */
  | 'library'
  | 'chat_attachment'
  | 'contract_document'
  | 'invoice_document'
  /** S32.1 — cópia temp do wait_input (≠ Media Library / produtos). */
  | 'flow_inbound_temp';

export type MediaOwnerType =
  | 'conversation'
  | 'client'
  | 'lead'
  | 'user'
  | 'tenant'
  | 'store'
  | 'product'
  | 'chat_message'
  | 'contract'
  | 'invoice'
  | 'unassigned';

export interface SaveMediaFromBufferInput {
  tenantId: string;
  ownerType: MediaOwnerType;
  ownerId?: string | null;
  scope: MediaScope;
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
  /** Força indexação em media_assets mesmo com flag global desligada. */
  writeAssetRecord?: boolean;
  /** Override do limite global MEDIA_MAX_FILE_BYTES (ex.: flow inbound temp). */
  maxBytes?: number;
  /** Opcional: utilizador que criou o asset (media_assets.created_by). */
  createdBy?: string | null;
}

export interface SaveMediaResult {
  storageKey: string;
  relativeUrl: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  /** Presente quando writeAssetRecord gravou linha em media_assets. */
  assetId?: string | null;
}
