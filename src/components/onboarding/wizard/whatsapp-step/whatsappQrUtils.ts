function normalizeQrDataUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.base64 === 'string') return normalizeQrDataUrl(obj.base64);
    if (typeof obj.code === 'string') return normalizeQrDataUrl(obj.code);
    return null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (str.startsWith('data:image')) return str;
  return `data:image/png;base64,${str}`;
}

export function extractQrFromProviderPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const instance =
    p.instance && typeof p.instance === 'object' ? (p.instance as Record<string, unknown>) : null;

  const candidates = [
    instance?.qrcode,
    p.qrcode,
    p.code,
    instance?.code,
  ];

  for (const c of candidates) {
    const url = normalizeQrDataUrl(c);
    if (url) return url;
  }
  return null;
}

export function isProviderConnectedPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  const instance =
    p.instance && typeof p.instance === 'object' ? (p.instance as Record<string, unknown>) : null;
  const state = String(instance?.state ?? instance?.status ?? p.status ?? '').toLowerCase();
  if (p.connected === true || p.loggedIn === true) return true;
  if (instance?.connected === true || instance?.loggedIn === true) return true;
  return ['open', 'connected', 'online'].includes(state);
}

export function extractConnectedPhone(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const instance =
    p.instance && typeof p.instance === 'object' ? (p.instance as Record<string, unknown>) : null;
  const phone =
    p.phone ??
    p.connected_phone ??
    instance?.phone ??
    instance?.connected_phone ??
    (p.metadata as Record<string, unknown> | undefined)?.connectedPhone;
  return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function extractProfileName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const instance =
    p.instance && typeof p.instance === 'object' ? (p.instance as Record<string, unknown>) : null;
  const meta = (instance?.metadata ?? p.metadata) as Record<string, unknown> | undefined;
  return pickString(
    p.profile_name,
    p.profileName,
    p.pushName,
    p.pushname,
    p.displayName,
    p.display_name,
    instance?.profile_name,
    instance?.profileName,
    instance?.pushName,
    instance?.pushname,
    meta?.connectedProfileName,
    meta?.profile_name,
    meta?.profileName,
    meta?.pushname,
    meta?.pushName,
    meta?.displayName,
    meta?.display_name,
  );
}

export function extractProfilePictureUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const instance =
    p.instance && typeof p.instance === 'object' ? (p.instance as Record<string, unknown>) : null;
  const meta = (instance?.metadata ?? p.metadata) as Record<string, unknown> | undefined;
  const lastConnect = meta?.lastConnect as Record<string, unknown> | undefined;
  const lastStatus = meta?.lastStatusCheck as Record<string, unknown> | undefined;
  const lcInst = lastConnect?.instance as Record<string, unknown> | undefined;
  const lsInst = lastStatus?.instance as Record<string, unknown> | undefined;

  return pickString(
    p.profilePictureUrl,
    p.profilePicUrl,
    p.profile_picture_url,
    p.pictureUrl,
    p.avatarUrl,
    p.avatar,
    instance?.profilePictureUrl,
    instance?.profilePicUrl,
    instance?.profile_picture_url,
    instance?.pictureUrl,
    meta?.connectedProfilePicUrl,
    meta?.profilePicUrl,
    meta?.profilePicture,
    meta?.profilePictureUrl,
    meta?.pictureUrl,
    meta?.avatarUrl,
    lcInst?.profilePicUrl,
    lcInst?.profilePicture,
    lcInst?.pictureUrl,
    lcInst?.profile_pic_url,
    lcInst?.avatar,
    lsInst?.profilePicUrl,
    lsInst?.profilePicture,
    lsInst?.pictureUrl,
    lsInst?.profile_pic_url,
    lsInst?.avatar,
    lastConnect?.profilePicUrl,
    lastStatus?.profilePicUrl,
  );
}
