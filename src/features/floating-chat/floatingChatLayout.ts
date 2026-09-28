import {
  FLOATING_BUBBLE_DIAMETER_PX,
  FLOATING_CHAT_RIGHT_PX,
  FLOATING_GAP_PX,
  FLOATING_WINDOW_WIDTH_PX,
} from './constants';

/**
 * Distância da borda direita da viewport até a borda direita do dock,
 * de forma que o dock fique imediatamente à esquerda da pílula/bolha.
 * `bubbleWidthPx` = largura real do FAB (ex.: botão “Mensagens” em pílula).
 */
export function getDockAnchorRightPx(bubbleWidthPx: number = FLOATING_BUBBLE_DIAMETER_PX): number {
  return FLOATING_CHAT_RIGHT_PX + bubbleWidthPx + FLOATING_GAP_PX;
}

export type FloatingChatLayoutInput = {
  /** Largura medida do container do dock (0 se não há minimizadas). */
  dockWidthPx: number;
  /** Largura medida do botão flutuante (FAB), para ancorar dock e janelas à esquerda da pílula. */
  bubbleWidthPx: number;
};

export type FloatingChatLayout = {
  /** CSS `right` em px para o dock (borda direita do container). */
  dockRightPx: number;
  /** CSS `right` em px da janela no índice de pilha (0 = mais à direita, junto ao dock). */
  windowRightPx: (stackIndex: number) => number;
};

/**
 * Ordem visual da direita para a esquerda:
 * [ bolha ] [ dock minimizados ] [ janelas expandidas … ]
 *
 * O dock mantém-se encostado à bolha; as janelas começam à esquerda do dock (sem sobreposição).
 * A lista de conversas é `position: fixed` e não entra neste cálculo horizontal.
 */
export function getFloatingChatLayout(input: FloatingChatLayoutInput): FloatingChatLayout {
  const dockAnchor = getDockAnchorRightPx(input.bubbleWidthPx);
  const dockW = Math.max(0, input.dockWidthPx);
  const gapAfterDock = dockW > 0 ? FLOATING_GAP_PX : 0;

  /** Dock permanece encostado à bolha. */
  const dockRightPx = dockAnchor;

  const firstWindowRight = dockAnchor + dockW + gapAfterDock;

  const windowRightPx = (stackIndex: number) =>
    firstWindowRight + stackIndex * (FLOATING_WINDOW_WIDTH_PX + FLOATING_GAP_PX);

  return {
    dockRightPx,
    windowRightPx,
  };
}
