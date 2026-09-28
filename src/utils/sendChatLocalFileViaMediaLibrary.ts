import { chatService } from '@/services/chat';
import {
  uploadMediaLibraryFile,
  type MediaLibraryAsset,
} from '@/services/mediaLibrary';
import { humanizeMediaUploadError } from '@/utils/humanizeMediaUploadError';
import {
  classifyChatOutgoingFile,
  inferDocumentMimeForSend,
  validateChatOutgoingFileSize,
  type ChatOutgoingFileKind,
} from '@/utils/chatComposerOutgoingFile';

export type SendChatLocalFileResult = {
  kind: ChatOutgoingFileKind;
  asset: MediaLibraryAsset;
};

/**
 * Envio local no composer: multipart → Media Library, depois chat com `assetId`
 * (evita `fileBase64` grande em JSON / 413 no nginx).
 */
export async function sendChatLocalFileViaMediaLibrary(
  conversationId: string,
  file: File,
  opts?: { caption?: string },
): Promise<SendChatLocalFileResult> {
  const sizeOk = validateChatOutgoingFileSize(file);
  if (!sizeOk.ok) {
    throw new Error(sizeOk.message);
  }

  const kind = classifyChatOutgoingFile(file);
  if (!kind) {
    throw new Error('Tipo de arquivo não suportado para envio pelo WhatsApp.');
  }

  let asset: MediaLibraryAsset;
  try {
    asset = await uploadMediaLibraryFile(file);
  } catch (err) {
    throw new Error(humanizeMediaUploadError(err, { fallback: 'Erro no upload da mídia.' }));
  }

  const caption = opts?.caption?.trim() || undefined;

  try {
    if (kind === 'image') {
      await chatService.sendImageMessage(conversationId, {
        assetId: asset.id,
        mimeType: asset.mimeType || file.type || 'image/jpeg',
        caption,
      });
    } else {
      await chatService.sendDocumentMessage(conversationId, {
        assetId: asset.id,
        mimeType: asset.mimeType || inferDocumentMimeForSend(file),
        fileName: asset.originalFilename || file.name,
        caption,
      });
    }
  } catch (err) {
    throw new Error(
      humanizeMediaUploadError(err, {
        fallback: kind === 'image' ? 'Não foi possível enviar a imagem.' : 'Não foi possível enviar o documento.',
      }),
    );
  }

  return { kind, asset };
}
