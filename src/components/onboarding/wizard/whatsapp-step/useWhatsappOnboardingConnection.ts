import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { chatService } from '@/services/chat';
import { connectRealtime, REALTIME_EVENTS } from '@/services/realtimeClient';
import {
  extractConnectedPhone,
  extractProfileName,
  extractProfilePictureUrl,
  extractQrFromProviderPayload,
  isProviderConnectedPayload,
} from './whatsappQrUtils';

export type WhatsappConnectionPhase = 'idle' | 'aguardando' | 'conectando' | 'conectado' | 'erro';

export type WhatsappConnectedProfile = {
  connected: boolean;
  connection_name?: string;
  phone?: string | null;
  profile_name?: string | null;
  profile_picture_url?: string | null;
};

type Options = {
  sessionToken: string;
  connectionName: string;
  enabled: boolean;
  authToken: string | null;
  onConnected: (profile: WhatsappConnectedProfile, instanceId: string) => void;
};

const POLL_MS = 5000;

export function useWhatsappOnboardingConnection({
  sessionToken,
  connectionName,
  enabled,
  authToken,
  onConnected,
}: Options) {
  const [phase, setPhase] = useState<WhatsappConnectionPhase>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedRef = useRef(false);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyConnected = useCallback(
    async (instId: string, payload: unknown, name?: string) => {
      if (connectedRef.current) return;
      connectedRef.current = true;
      clearPoll();
      setPhase('conectado');
      setQrCode(null);
      setErrorMessage(null);

      let profile: WhatsappConnectedProfile = {
        connected: true,
        connection_name: name ?? connectionName.trim(),
        phone: extractConnectedPhone(payload),
        profile_name: extractProfileName(payload),
        profile_picture_url: extractProfilePictureUrl(payload),
      };

      try {
        const providerStatus = await chatService.getInstanceStatus(instId);
        profile = {
          connected: true,
          connection_name: name ?? connectionName.trim(),
          phone: extractConnectedPhone(providerStatus) ?? profile.phone,
          profile_name: extractProfileName(providerStatus) ?? profile.profile_name,
          profile_picture_url:
            extractProfilePictureUrl(providerStatus) ?? profile.profile_picture_url,
        };

        const statusRes = await apiClient.get<
          WhatsappConnectedProfile & { ok?: boolean; connection_name?: string }
        >(
          `/api/onboarding/wizard/whatsapp/status?session_token=${encodeURIComponent(sessionToken)}&instance_id=${instId}`,
        );
        if (statusRes.data?.connected) {
          profile = {
            connected: true,
            connection_name: statusRes.data.connection_name ?? profile.connection_name,
            phone: statusRes.data.phone ?? profile.phone,
            profile_name: statusRes.data.profile_name ?? profile.profile_name,
          };
        }
      } catch {
        /* mantém dados parciais do provider */
      }

      onConnectedRef.current(profile, instId);
    },
    [clearPoll, connectionName, sessionToken],
  );

  const pollInstance = useCallback(
    async (instId: string) => {
      if (connectedRef.current) return;
      try {
        const statusRes = await apiClient.get<WhatsappConnectedProfile & { ok?: boolean }>(
          `/api/onboarding/wizard/whatsapp/status?session_token=${encodeURIComponent(sessionToken)}&instance_id=${instId}`,
        );
        if (statusRes.data?.connected) {
          await applyConnected(instId, statusRes.data, statusRes.data.connection_name);
          return;
        }

        const providerStatus = await chatService.getInstanceStatus(instId);
        const nextQr = extractQrFromProviderPayload(providerStatus);
        if (nextQr) {
          setQrCode((prev) => (prev !== nextQr ? nextQr : prev));
          setPhase('aguardando');
        } else if (isProviderConnectedPayload(providerStatus)) {
          await applyConnected(instId, providerStatus);
          return;
        }

        const state = String(
          (providerStatus as Record<string, unknown>)?.status ??
            ((providerStatus as Record<string, unknown>)?.instance as Record<string, unknown> | undefined)?.state ??
            '',
        ).toLowerCase();
        if (state === 'connecting') setPhase('conectando');
        else setPhase((prev) => (prev === 'idle' ? 'aguardando' : prev));
      } catch {
        /* polling silencioso */
      }
    },
    [applyConnected, sessionToken],
  );

  const startPolling = useCallback(
    (instId: string) => {
      clearPoll();
      void pollInstance(instId);
      pollRef.current = setInterval(() => void pollInstance(instId), POLL_MS);
    },
    [clearPoll, pollInstance],
  );

  const startConnection = useCallback(async () => {
    if (!connectionName.trim()) {
      setErrorMessage('Informe o nome da conexão.');
      setPhase('erro');
      return;
    }
    setStarting(true);
    setErrorMessage(null);
    connectedRef.current = false;
    try {
      const inst = await chatService.createInstance({
        name: connectionName.trim(),
        metadata: { source: 'onboarding_wizard' },
      });
      setInstanceId(inst.id);
      setPhase('conectando');

      const connectResponse = await chatService.connectInstance(inst.id);
      if (isProviderConnectedPayload(connectResponse)) {
        await applyConnected(inst.id, connectResponse);
        return;
      }

      const qr = extractQrFromProviderPayload(connectResponse);
      if (qr) {
        setQrCode(qr);
        setPhase('aguardando');
        startPolling(inst.id);
        return;
      }

      setPhase('aguardando');
      startPolling(inst.id);
    } catch (err) {
      setPhase('erro');
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao iniciar conexão');
    } finally {
      setStarting(false);
    }
  }, [applyConnected, connectionName, startPolling]);

  useEffect(() => {
    if (!enabled || !authToken || !instanceId || connectedRef.current) return;

    const socket = connectRealtime(authToken);

    const onStatus = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      const channelId = typeof p.channel_id === 'string' ? p.channel_id : null;
      const status = typeof p.status === 'string' ? p.status : null;
      if (channelId !== instanceId) return;
      if (status === 'connected' || status === 'open' || status === 'online') {
        void pollInstance(instanceId);
      }
    };

    socket.on(REALTIME_EVENTS.channelStatusChanged, onStatus);
    return () => {
      socket.off(REALTIME_EVENTS.channelStatusChanged, onStatus);
    };
  }, [authToken, enabled, instanceId, pollInstance]);

  useEffect(() => () => clearPoll(), [clearPoll]);

  return {
    phase,
    qrCode,
    instanceId,
    errorMessage,
    starting,
    startConnection,
    clearPoll,
  };
}
