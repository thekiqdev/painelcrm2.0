/**
 * MB-015 — Bootstrap dos workers densos (pode embutir no HTTP ou processo aparte).
 *
 * Env:
 *   HTTP_SKIP_DENSE_WORKERS=1  → index HTTP não agenda estes workers
 *   Processo: npm run workers:dense
 * Rollback: não definir HTTP_SKIP_DENSE_WORKERS (embed no HTTP, comportamento pré-Phase4).
 */

import type { Pool } from 'pg';
import { appLogger } from '../observability/appLogger.js';
import { processDueKanbanScheduledMovesBatch } from '../services/kanbanScheduledMoveService.js';
import { processAnnouncementSendRecipientsBatch } from '../services/announcements/announcementSendWorker.js';
import { runChatSlaAutomationTick } from '../services/chatSlaWorkerService.js';
import { processChatScheduledMessagesWorkerTick } from '../services/chatScheduledMessagesWorker.js';
import { processDueChatbotFlowDelaysBatch } from '../services/chatbotFlows/chatbotFlowsRuntimeRunner.js';
import { startWhatsappAvatarCacheWorkerInterval } from '../services/whatsappAvatarCacheWorker.js';
import { getChatAutomationWorkerPollMs } from '../config/chatAutomationEnv.js';
import { getAnnouncementsSendPollMs } from '../config/announcementsWorkerEnv.js';

export function isHttpSkipDenseWorkers(): boolean {
  return String(process.env.HTTP_SKIP_DENSE_WORKERS || '') === '1';
}

export type DenseWorkerHandles = {
  timers: ReturnType<typeof setInterval>[];
};

/**
 * Agenda workers densos (kanban, announcements, chat SLA, scheduled messages, avatar).
 * Retorna handles para shutdown opcional.
 */
export function startDenseBackgroundWorkers(pool: Pool): DenseWorkerHandles {
  const timers: ReturnType<typeof setInterval>[] = [];

  const kanbanPollMs = Math.max(5000, parseInt(process.env.KANBAN_SCHEDULED_MOVE_POLL_MS || '30000', 10));
  timers.push(
    setInterval(() => {
      void processDueKanbanScheduledMovesBatch(25).catch((err) =>
        appLogger.error('kanbanScheduledMove', 'batch error', { err: String(err) }),
      );
    }, kanbanPollMs),
  );

  const announcementsPollMs = getAnnouncementsSendPollMs();
  let announcementsBusy = false;
  timers.push(
    setInterval(() => {
      if (announcementsBusy) {
        appLogger.debug('announcements/send', 'skip overlapping tick');
        return;
      }
      announcementsBusy = true;
      void processAnnouncementSendRecipientsBatch(pool, 6)
        .catch((err) => appLogger.error('announcements/send', 'batch error', { err: String(err) }))
        .finally(() => {
          announcementsBusy = false;
        });
    }, announcementsPollMs),
  );

  const chatAutomationMs = getChatAutomationWorkerPollMs();
  let slaBusy = false;
  timers.push(
    setInterval(() => {
      if (slaBusy) {
        appLogger.debug('chat-sla-automation', 'skip overlapping tick');
        return;
      }
      slaBusy = true;
      void runChatSlaAutomationTick()
        .catch((err) => appLogger.error('chat-sla-automation', 'tick error', { err: String(err) }))
        .finally(() => {
          slaBusy = false;
        });
    }, chatAutomationMs),
  );

  const chatSchedMsgPollMs = Math.max(
    15_000,
    parseInt(process.env.CHAT_SCHEDULED_MESSAGES_POLL_MS || '30000', 10),
  );
  timers.push(
    setInterval(() => {
      void processChatScheduledMessagesWorkerTick(15).catch((err) =>
        appLogger.error('chat-scheduled-messages', 'tick error', { err: String(err) }),
      );
    }, chatSchedMsgPollMs),
  );

  const chatbotDelayPollMs = Math.max(
    10_000,
    parseInt(process.env.CHATBOT_FLOWS_DELAY_POLL_MS || '20000', 10),
  );
  timers.push(
    setInterval(() => {
      void processDueChatbotFlowDelaysBatch(20).catch((err) =>
        appLogger.error('chatbot-flows-delay', 'batch error', { err: String(err) }),
      );
    }, chatbotDelayPollMs),
  );

  startWhatsappAvatarCacheWorkerInterval();

  appLogger.boot('dense-workers', 'started', {
    kanbanPollMs,
    announcementsPollMs,
    chatAutomationMs,
    chatSchedMsgPollMs,
    chatbotDelayPollMs,
  });

  return { timers };
}

export function stopDenseBackgroundWorkers(handles: DenseWorkerHandles): void {
  for (const t of handles.timers) clearInterval(t);
  appLogger.boot('dense-workers', 'stopped');
}
