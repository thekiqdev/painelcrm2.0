import {
  claimDueScheduledMessages,
  markScheduledMessageFailed,
  markScheduledMessageSent,
  resetStaleProcessingScheduledMessages,
} from './chatScheduledMessagesService.js';
import { executeScheduledChatMessageDelivery } from '../controllers/chatController.js';

function logEv(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

export async function processChatScheduledMessagesWorkerTick(batchSize = 15): Promise<void> {
  try {
    const n = await resetStaleProcessingScheduledMessages();
    if (n > 0) {
      logEv('scheduled_message_stale_processing_reset', { count: n });
    }
  } catch (e) {
    console.warn('[chatScheduledMessagesWorker] reset stale failed', e);
  }

  let rows: Awaited<ReturnType<typeof claimDueScheduledMessages>>;
  try {
    rows = await claimDueScheduledMessages(batchSize);
  } catch (e) {
    console.error('[chatScheduledMessagesWorker] claim error', e);
    return;
  }

  for (const row of rows) {
    logEv('scheduled_message_send_started', {
      scheduled_message_id: row.id,
      tenant_id: row.tenant_id,
      conversation_id: row.conversation_id,
    });
    try {
      const result = await executeScheduledChatMessageDelivery({
        id: row.id,
        tenant_id: row.tenant_id,
        conversation_id: row.conversation_id,
        message_text: row.message_text,
      });
      if (!result.ok) {
        await markScheduledMessageFailed(row.id, result.reason);
        logEv('scheduled_message_failed', {
          scheduled_message_id: row.id,
          reason: result.reason,
        });
        continue;
      }
      await markScheduledMessageSent(row.id, result.externalId);
      logEv('scheduled_message_sent', {
        scheduled_message_id: row.id,
        provider_message_id: result.externalId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markScheduledMessageFailed(row.id, msg);
      logEv('scheduled_message_failed', {
        scheduled_message_id: row.id,
        reason: msg,
      });
    }
  }
}
