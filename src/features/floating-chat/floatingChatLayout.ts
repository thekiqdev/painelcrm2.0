import {
  FLOATING_BUBBLE_DIAMETER_PX,
  FLOATING_CHAT_RIGHT_PX,
  FLOATING_GAP_PX,
  FLOATING_WINDOW_WIDTH_PX,
} from './constants';

/**
 * Ancora horizontal imediatamente à esquerda da bolha (margem + diâmetro + gap).
 * Borda direita do dock alinha-se aqui quando o dock encosta na bolha.
 */
export function getDockAnchorRightPx(): number {
  return FLOATING_CHAT_RIGHT_PX + FLOATING_BUBBLE_DIAMETER_PX + FLOATING_GAP_PX;
}

export type FloatingChatLayoutInput = {
  /** Largura medida do container do dock (0 se não há minimizadas). */
  dockWidthPx: number;
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
  const dockAnchor = getDockAnchorRightPx();
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
