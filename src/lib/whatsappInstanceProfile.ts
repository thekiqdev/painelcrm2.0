import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ChatInstance, BootstrapSyncMeta } from '@/services/chat';

const isValidUrl = (url: unknown): url is string => typeof url === 'string' && url.trim().length > 0;

/**
 * Foto, nome e telefone a partir de `metadata` (Uazapi / instância).
 * Mesma lógica que a UI de detalhes — unificada para cards e modais.
 */
export function getWhatsAppInstanceProfileInfo(instance: ChatInstance): {
  phone: string | null;
  name: string | null;
  pictureUrl: string | null;
} {
  const metadata =
    instance.metadata && typeof instance.metadata === 'object' ? (instance.metadata as Record<string, unknown>) : null;

  let phone: string | null = null;
  if (metadata && typeof (metadata as { connectedPhone?: string }).connectedPhone === 'string') {
    phone = (metadata as { connectedPhone: string }).connectedPhone;
  } else if (instance.external_instance_name) {
    const match = instance.external_instance_name.match(/(\d+)$/);
    if (match) phone = match[1];
  } else if (metadata) {
    const m = metadata as { phone?: string; phoneNumber?: string; number?: string };
    phone = m.phone || m.phoneNumber || m.number || null;
  }

  const pickFirst = (...values: unknown[]): string | null => {
    for (const v of values) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  const i = instance as unknown as Record<string, unknown>;
  const lastConnect = (metadata as { lastConnect?: Record<string, unknown> } | null)?.lastConnect;
  const lastStatus = (metadata as { lastStatusCheck?: Record<string, unknown> } | null)?.lastStatusCheck;
  const lcInst = (lastConnect?.instance as Record<string, unknown> | undefined) ?? null;
  const lsInst = (lastStatus?.instance as Record<string, unknown> | undefined) ?? null;

  const name = pickFirst(
    (metadata as { connectedProfileName?: string } | null)?.connectedProfileName,
    (metadata as { profile_name?: string } | null)?.profile_name,
    (metadata as { profileName?: string } | null)?.profileName,
    (metadata as { push_name?: string } | null)?.push_name,
    (metadata as { pushName?: string } | null)?.pushName,
    (metadata as { contact_name?: string } | null)?.contact_name,
    (metadata as { contactName?: string } | null)?.contactName,
    (metadata as { display_name?: string } | null)?.display_name,
    (metadata as { displayName?: string } | null)?.displayName,
    lastConnect?.profile_name,
    lastConnect?.profileName,
    lastConnect?.push_name,
    lastConnect?.pushName,
    lastConnect?.contact_name,
    lastConnect?.contactName,
    lastConnect?.display_name,
    lastConnect?.displayName,
    lastConnect?.name,
    lcInst?.profile_name,
    lcInst?.profileName,
    lcInst?.push_name,
    lcInst?.pushName,
    lcInst?.contact_name,
    lcInst?.contactName,
    lcInst?.display_name,
    lcInst?.displayName,
    lcInst?.name,
    lastStatus?.profile_name,
    lastStatus?.profileName,
    lastStatus?.push_name,
    lastStatus?.pushName,
    lastStatus?.contact_name,
    lastStatus?.contactName,
    lastStatus?.display_name,
    lastStatus?.displayName,
    lastStatus?.name,
    lsInst?.profile_name,
    lsInst?.profileName,
    lsInst?.push_name,
    lsInst?.pushName,
    lsInst?.contact_name,
    lsInst?.contactName,
    lsInst?.display_name,
    lsInst?.displayName,
    lsInst?.name,
    i.profile_name,
    i.push_name,
    i.contact_name,
    i.display_name,
    i.phone_number,
    i.phoneNumber,
    i.instance_name,
    i.instanceName,
    i.external_instance_name,
    i.externalInstanceName,
    i.name
  );

  let pictureUrl: string | null = null;
  const meta = metadata as Record<string, unknown> | null;

  if (meta) {
    if (isValidUrl(meta.connectedProfilePicUrl)) pictureUrl = meta.connectedProfilePicUrl as string;
    else if (isValidUrl(meta.profilePicUrl)) pictureUrl = meta.profilePicUrl as string;
    else if (isValidUrl(meta.profilePicture)) pictureUrl = meta.profilePicture as string;
    else if (isValidUrl(meta.pictureUrl)) pictureUrl = meta.pictureUrl as string;
    else {
      const lastConnect = meta.lastConnect as Record<string, unknown> | undefined;
      const inst = lastConnect?.instance as Record<string, unknown> | undefined;
      if (inst) {
        if (isValidUrl(inst.profilePicUrl)) pictureUrl = inst.profilePicUrl as string;
        else if (isValidUrl(inst.profilePicture)) pictureUrl = inst.profilePicture as string;
        else if (isValidUrl(inst.pictureUrl)) pictureUrl = inst.pictureUrl as string;
        else if (isValidUrl(inst.profile_pic_url)) pictureUrl = inst.profile_pic_url as string;
        else if (isValidUrl(inst.avatar)) pictureUrl = inst.avatar as string;
        else if (isValidUrl(inst.image)) pictureUrl = inst.image as string;
      }
      if (!pictureUrl && lastConnect && isValidUrl((lastConnect as { profilePicUrl?: string }).profilePicUrl)) {
        pictureUrl = (lastConnect as { profilePicUrl: string }).profilePicUrl;
      }
      const lastStatus = meta.lastStatusCheck as Record<string, unknown> | undefined;
      const inst2 = lastStatus?.instance as Record<string, unknown> | undefined;
      if (!pictureUrl && inst2) {
        if (isValidUrl(inst2.profilePicUrl)) pictureUrl = inst2.profilePicUrl as string;
        else if (isValidUrl(inst2.profilePicture)) pictureUrl = inst2.profilePicture as string;
        else if (isValidUrl(inst2.pictureUrl)) pictureUrl = inst2.pictureUrl as string;
        else if (isValidUrl(inst2.profile_pic_url)) pictureUrl = inst2.profile_pic_url as string;
        else if (isValidUrl(inst2.avatar)) pictureUrl = inst2.avatar as string;
        else if (isValidUrl(inst2.image)) pictureUrl = inst2.image as string;
      }
      if (!pictureUrl && lastStatus && isValidUrl((lastStatus as { profilePicUrl?: string }).profilePicUrl)) {
        pictureUrl = (lastStatus as { profilePicUrl: string }).profilePicUrl;
      }
    }
  }

  return { phone, name, pictureUrl };
}

/** Formata dígitos para exibição BR (melhor esforço). */
export function formatWhatsappDisplayPhone(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return '—';
  const d = raw.replace(/\D/g, '');
  if (d.length === 0) return raw;
  if (d.length >= 12 && d.startsWith('55')) {
    const rest = d.slice(2);
    if (rest.length >= 10) {
      const area = rest.slice(0, 2);
      const p1 = rest.slice(2, 7);
      const p2 = rest.slice(7, 11);
      return `+55 ${area} ${p1}-${p2}`.replace(/\s+/g, ' ').trim();
    }
  }
  if (d.length === 11) {
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw;
}

function instanceStatusIsConnected(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'connected' || s === 'open';
}

/** Texto amigável para "última conexão" / atividade. */
export function getLastConnectionDisplay(instance: ChatInstance): string | null {
  if (!instanceStatusIsConnected(instance.status)) return null;
  const m = instance.metadata as { bootstrap_sync?: { finished_at?: string } } | null;
  const iso = m?.bootstrap_sync?.finished_at || instance.updated_at || instance.created_at;
  if (!iso) return null;
  try {
    return `Conectado em ${format(new Date(iso), "d MMM yyyy", { locale: ptBR })}`;
  } catch {
    return null;
  }
}

export function getActivityHint(instance: ChatInstance): string | null {
  if (!instanceStatusIsConnected(instance.status)) return null;
  if (!instance.updated_at) return 'Recebendo mensagens normalmente';
  try {
    const t = new Date(instance.updated_at).getTime();
    if (Number.isNaN(t)) return 'Recebendo mensagens normalmente';
    const diff = Date.now() - t;
    if (diff < 10 * 60 * 1000) {
      return `Última atividade: ${formatDistanceToNow(new Date(t), { addSuffix: true, locale: ptBR })}`;
    }
  } catch {
    /* empty */
  }
  return 'Recebendo mensagens normalmente';
}

export function getSyncStatusUserMessage(
  instance: ChatInstance
): { line: string; isError?: boolean } | null {
  const bs = instance.metadata?.bootstrap_sync as BootstrapSyncMeta | undefined;
  if (!bs?.status) return null;
  switch (bs.status) {
    case 'queued':
      return { line: 'Sincronização aguardando na fila' };
    case 'running':
      return { line: 'Sincronizando mensagens' };
    case 'completed':
      return { line: 'Tudo pronto para uso' };
    case 'failed':
      return { line: 'Não foi possível concluir a sincronização inicial', isError: true };
    default:
      return { line: String(bs.status) };
  }
}

export function getMessagesSyncedCount(instance: ChatInstance): number | null {
  const n = (instance.metadata?.bootstrap_sync as BootstrapSyncMeta | undefined)?.messages_synced;
  if (typeof n === 'number' && n >= 0) return n;
  return null;
}

/** Data curta para o indicador “Conectado em” (só quando há sessão ativa). */
export function getConnectedAtShortDate(instance: ChatInstance): string | null {
  if (!instanceStatusIsConnected(instance.status)) return null;
  const m = instance.metadata as { bootstrap_sync?: { finished_at?: string } } | null;
  const iso = m?.bootstrap_sync?.finished_at || instance.updated_at || instance.created_at;
  if (!iso) return null;
  try {
    return format(new Date(iso), "d 'de' MMMM yyyy", { locale: ptBR });
  } catch {
    return null;
  }
}

/**
 * Frase única para o estado operacional do canal (evita “Status: Tudo pronto…”). Combina
 * conexão Uazapi + fila de sincronização inicial quando existir.
 */
export function getFriendlyOperationalStatus(instance: ChatInstance): string {
  const st = instance.status.toLowerCase();
  const connected = instanceStatusIsConnected(instance.status);

  if (connected) {
    const bs = instance.metadata?.bootstrap_sync as BootstrapSyncMeta | undefined;
    switch (bs?.status) {
      case 'queued':
        return 'Sua sincronização inicial está na fila; em instantes começamos.';
      case 'running':
        return 'Estamos sincronizando suas conversas em segundo plano.';
      case 'failed':
        return 'Não foi possível concluir a sincronização inicial. Veja os detalhes técnicos ou contate o suporte.';
      case 'completed':
      default:
        return 'Seu WhatsApp está funcionando normalmente.';
    }
  }

  if (st === 'connecting') {
    return 'Estamos finalizando a conexão com seu número.';
  }
  return 'Este canal ainda não está conectado ao WhatsApp.';
}

/** Uma linha curta para resumo visual (settings / canal de atendimento). */
export function getShortOperationalPhrase(instance: ChatInstance): string {
  const st = instance.status.toLowerCase();
  const connected = instanceStatusIsConnected(instance.status);

  if (connected) {
    const bs = instance.metadata?.bootstrap_sync as BootstrapSyncMeta | undefined;
    switch (bs?.status) {
      case 'queued':
        return 'Sincronização na fila';
      case 'running':
        return 'Sincronizando conversas…';
      case 'failed':
        return 'Sincronização inicial incompleta';
      case 'completed':
      default:
        return 'Funcionando normalmente';
    }
  }

  if (st === 'connecting') return 'Conectando…';
  return 'Aguardando conexão';
}
