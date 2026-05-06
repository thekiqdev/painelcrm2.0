# MEDIA_ASSETS Base (Prompt 3)

## Objetivo

Introduzir indexação de mídia com `media_assets` sem migrar módulos atuais (chat, catálogo/produtos, avatar).

## O que foi criado

- Migration: `database/init/205_media_assets.sql`
- Migration Supabase: `supabase/migrations/20260701120000_media_assets.sql`
- Ordem de migração atualizada em `packages/backend/src/migrate.ts`
- Registro opcional de assets no `saveFromBuffer` (`mediaService`)

## Regras de escrita em `media_assets`

`saveFromBuffer` grava em `media_assets` somente quando:

- `MEDIA_ASSETS_WRITE_ENABLED=true`, **ou**
- `writeAssetRecord=true` no input da função.

Se a gravação falhar (tabela ausente/erro pontual), upload não quebra (log de warning).

## Endpoints adicionados (Super Admin)

- `POST /api/superadmin/advanced/media/test-save-buffer`
  - aceita `writeAssetRecord=true|false`
  - retorna `storageKey`, `relativeUrl`, `checksum`, `sizeBytes`
- `GET /api/superadmin/advanced/media/assets?limit=20`
  - lista últimos assets indexados

## UI simples

Em `Super Admin > Avançado > Scripts` foi adicionado bloco simples:

- "Mídia — indexação (`media_assets`)"
- tabela com últimos assets
- botão "Atualizar assets"

## Avatar WhatsApp e `media_assets`

Com `MEDIA_AVATAR_WHATSAPP_ENABLED=true` (apenas local/staging até validação), o cache de avatar via MediaService pode registar linhas com `scope = 'whatsapp_avatar'`. Checklist de validação (Network, SQL, política de produção): **`docs/MEDIA_SERVICE_BASE.md`** → secção *Validação controlada — avatar WhatsApp*.

## O que NÃO foi feito

- Sem migração automática de chat attachments.
- Sem migração de catálogo/produtos.
- Sem backfill automático de avatars antigos (apenas fluxo novo quando as flags permitem).
- Sem quebra de endpoints antigos.

## Rollback

1. Desligar flag: `MEDIA_ASSETS_WRITE_ENABLED=false`.
2. Remover montagem dos endpoints de assets em `superadminRoutes`.
3. Remover bloco de UI em `SuperAdminAdvancedScriptsPage` (apenas visual).
4. Se necessário, remover migration `205_media_assets.sql` de ambientes novos antes de aplicar.
   - Em ambientes já migrados, manter tabela é seguro (não interfere em módulos legados).
