/**
 * Ordem dos transports do Socket.IO no browser.
 * `polling` primeiro evita falhas atrás de reverse proxies (Nginx, CDNs) que não fazem
 * upgrade WebSocket corretamente ou fecham o WSS; o engine faz upgrade para `websocket`
 * quando o caminho está disponível.
 */
export const SOCKET_IO_CLIENT_TRANSPORTS: Array<'polling' | 'websocket'> = ['polling', 'websocket'];
