# Verificações — exclusão total de instância WhatsApp (UazAPI)

Data de referência: 2026-05-09. Complementa a implementação de `deleteChatInstanceComplete` + webhook + UI.

## 1) Workers, sync em background, filas

| Processo | Onde | Comportamento após DELETE `chat_instances` |
|----------|------|---------------------------------------------|
| **Bootstrap sync** (`setImmediate` → `runBootstrapSyncJob`) | `chatController.ts` | Rele `SELECT * FROM chat_instances WHERE id = $1`. Se a linha foi apagada: **aborta sem UazAPI**; logs `bootstrap_sync_aborted` e **`sync_ignored_deleted_instance`**. |
| **scheduleBootstrapSyncIfNeeded** | Mesmo ficheiro | Usa `fetchInstanceForOperate`; se instância já não existe, não agenda. |
| **Avatar cache worker** (`runWhatsappAvatarCacheWorkerCycle`) | `whatsappAvatarCacheWorker.ts`, intervalo em `index.ts` | Seleciona apenas linhas existentes em `chat_conversations`. Conversas apagadas por CASCADE **deixam de existir** → não há retry órfão por `instance_id`. |
| **Billing / Kanban / outros `setInterval`** | `index.ts` | Não referenciam `chat_instances` por UUID salvo em fila; sem BullMQ no projeto para WhatsApp. |
| **Webhook async** (`processProviderWebhook`) | `chatController.ts` | Corre **depois** de `200 OK`; usa objeto `instance` da resolução atual. Se o cliente apagar a instância **durante** o mesmo request, edge case raro; próximo webhook sem linha → **`webhook_ignored_unknown_instance`**. |
| **Socket.IO** | `websocketService.ts` | Após DELETE bem-sucedido: **`whatsapp.instance_removed`** para `user:{id}` → cliente invalida caches (`useRealtimeEvents` + `resetWhatsAppIntegrationCaches`). |

**Conclusão:** não há job persistente com `instance_id` antigo; jobs em memória (`setImmediate`) falham cedo com instância ausente. Não há **retry_cancelled_deleted_instance** como fila nomeada — o equivalente é **`sync_ignored_deleted_instance`** no bootstrap.

## 2) Anexos / mídia órfã

| Armazenamento | Situação |
|---------------|----------|
| **`chat_messages.media`** | JSON (URLs CDN WhatsApp, paths internos). CASCADE remove a linha da mensagem. |
| **Catalog / MediaService** | Avatares/cache podem usar `catalog-media` ou `media_assets`; sem FK direta message→file em todos os fluxos. |
| **Risco** | Ficheiros gravados em disco referenciados só no JSON **podem** ficar sem referência se no futuro existir cópia local por mensagem. |

**Entregável código:** `packages/backend/src/services/whatsappChatMediaOrphansStub.ts` — TODO seguro e critérios para limpeza futura **scoped** por tenant + instance (sem automação agressiva).

## 3) QA manual (produção / staging)

Checklist obrigatório (executar em ambiente de teste):

1. Ligar instância → QR → mensagens reais → confirmar linhas em `chat_instances`, `chat_conversations`, `chat_messages`.
2. `DELETE /api/chat/instances/:id` (UI ou API).
3. Confirmar: sem linhas para esse `instance_id`; notificações órfãs removidas pelo serviço de delete.
4. Frontend: caches invalidados; opcionalmente segundo separador recebe `whatsapp.instance_removed`.
5. Simular webhook antigo (nome externo já não na BD): resposta **200 ignored**.
6. Opcional UazAPI: instância removida no provedor (best-effort).
7. Nova instância com o mesmo número:
   - Com ENV **omitida** ou qualquer valor que não seja `true`/`1`/`on`/`yes`: **nenhuma** herança; reconexão limpa (política padrão).
   - Com **`WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT=true`**: pode mover conversas de **outras** instâncias ativas do mesmo utilizador com o mesmo `phone_key` (modo legacy opcional).
8. Monitorizar logs: `webhook_ignored_unknown_instance`, `webhook_secret_rejected`, `inherit_skipped_by_default_policy`, `inherit_enabled_by_env`, `inherit_skipped_deleted_instance`, `sync_ignored_deleted_instance`.

## 4) Produção “segura para deploy”

- **Predefinição:** reconexão limpa — **não** é necessário definir ENV para desativar herança.
- Definir **`WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT=true`** apenas se um tenant ainda precisar explicitamente da herança legacy entre instâncias com o mesmo número.
