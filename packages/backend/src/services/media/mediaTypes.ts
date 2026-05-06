export type MediaScope =
  | 'whatsapp_avatar'
  | 'user_avatar'
  | 'tenant_logo'
  | 'store_logo'
  | 'product_image'
  | 'chat_attachment'
  | 'contract_document'
  | 'invoice_document';

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
}

export interface SaveMediaResult {
  storageKey: string;
  relativeUrl: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}
