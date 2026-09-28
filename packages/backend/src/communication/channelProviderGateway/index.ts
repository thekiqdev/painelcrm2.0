export {
  sendMessage,
  sendTemplate,
  sendTransactionalMessage,
  startConversation,
  getProviderHealth,
} from './channelProviderGateway.js';

export { resolveCommunicationRouting } from './communicationRoutingService.js';
export { getProviderAdapter, listRegisteredProviders } from './providerRegistry.js';
export {
  getProviderCapabilities,
  providerSupportsCapability,
  assertProviderCapabilities,
} from './providerCapabilityRegistry.js';
export type { ICommunicationProviderAdapter } from './providerContracts.js';
