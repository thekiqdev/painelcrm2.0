import type { OutboxEventRow } from '../outboxTypes.js';

export type PassiveConsumerContext = {
  shadow: boolean;
  workerId: string;
};

export type PassiveConsumerHandler = (
  event: OutboxEventRow,
  ctx: PassiveConsumerContext,
) => Promise<void>;

export type PassiveConsumerRegistration = {
  name: string;
  eventKeys: string[] | '*';
  handle: PassiveConsumerHandler;
};
