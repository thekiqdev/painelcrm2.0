export const FLOATING_CHAT_LS_KEY = 'floating_chat_state_v1';

/** Janelas expandidas simultâneas (minimizadas não contam). */
export const FLOATING_CHAT_MAX_EXPANDED = 3;

/** Base: camada geral (abaixo de modais típicos z-50). */
export const FLOATING_Z_WINDOWS = 45;

/** Abaixo das janelas expandidas (45) para não cobrir o chat ao minimizar. */
export const FLOATING_Z_MINIMIZED = 43;

/** Acima das janelas e da bolha: lista sobrepõe o layout sem empurrar janelas. */
export const FLOATING_Z_LIST = 60;

/** Abaixo da lista; FAB permanece acessível quando a lista está fechada. */
export const FLOATING_Z_BUBBLE = 54;

/**
 * Espelho dos tokens CSS `--floating-chat-*` (src/index.css) para cálculos em TS.
 * Altere os dois lugares em conjunto.
 */
export const FLOATING_CHAT_BOTTOM_PX = 16;
export const FLOATING_CHAT_RIGHT_PX = 24;

/** Diâmetro da bolha (Button h-14 w-14). */
export const FLOATING_BUBBLE_DIAMETER_PX = 56;

/** Espaço horizontal entre pills e bolha, e entre colunas de janelas (px). */
export const FLOATING_GAP_PX = 12;

/**
 * Lista “Conversas” (position fixed): folga entre base da lista e topo da bolha.
 * O deslocamento vertical total usa também `FLOATING_LIST_STACK_ABOVE_BUBBLE_PX`.
 */
export const FLOATING_LIST_GAP_ABOVE_BUBBLE_PX = 12;

/** Altura reservada “acima da base” para posicionar a lista (especificação produto; FAB real = 56px). */
export const FLOATING_LIST_STACK_ABOVE_BUBBLE_PX = 64;

/** Base direita para empilhar janelas: margem + bolha + intervalo até a primeira janela. */
export const FLOATING_WINDOWS_RIGHT_BASE =
  FLOATING_CHAT_RIGHT_PX + FLOATING_BUBBLE_DIAMETER_PX + FLOATING_GAP_PX;

export const FLOATING_LIST_WIDTH_PX = 400;

export const FLOATING_WINDOW_WIDTH_PX = 340;

export const FLOATING_WINDOW_HEIGHT_PX = 460;
