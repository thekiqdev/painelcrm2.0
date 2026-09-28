# Fase 3C — Plano técnico: SMTP no Super Admin (preparação)

Documento de **arquitetura e fases**; a implementação de código fica para etapas posteriores aprovadas.

**Restrições desta linha de trabalho (confirmadas):** não ativar envio real nas notificações transacionais ainda; não substituir WhatsApp; não integrar SES; não alterar templates nem o motor de despacho atual até a fase explícita de ativação.

---

## 1. Diagnóstico do estado atual

### Notificações da plataforma (`platform.*`)

- O motor da plataforma está orientado ao canal **WhatsApp** (instância em `chat_instances` + flags em `superadmin_settings`).  
- A UI consolidada está em `SuperAdminPlatformNotifications` e tabs extraídas em `src/components/superadmin/platform-notifications/` (Fase 3B).  
- **Não existe** painel Super Admin para SMTP nem envio de e-mail ligado a esse motor.

### Envio de e-mail genérico

- `packages/backend/src/services/messageService.ts`: envio por e-mail ainda é **stub** (TODO nodemailer/sendgrid), sem configuração SMTP operacional.

### Tabela “system_settings”

- **Não há** tabela nomeada `system_settings` nas migrações consultadas do repositório para este fim.  
- As configurações globais do Super Admin usam **`public.superadmin_settings`** (`key` TEXT PK, `value` TEXT, `updated_at`). Ver `database/init/31_superadmin_settings.sql`.

### Conclusão

- SMTP **ainda não está implantado** de forma produtiva.  
- O local natural para chaves SMTP é **`superadmin_settings`**, alinhado com `platform_notifications_*`, `notifications_engine_*`, billing, etc.

---

## 2. Arquivos atuais relacionados (referência)

| Área | Exemplos de ficheiros |
|------|------------------------|
| Definições globais plataforma | `packages/backend/src/services/platformNotifications/platformNotificationsGlobalSettingsService.ts`, `platformNotificationsEnv.ts` |
| Rotas Super Admin | `packages/backend/src/routes/superadminRoutes.ts` |
| UI notificações plataforma | `src/pages/superadmin/SuperAdminPlatformNotifications.tsx`, `src/components/superadmin/platform-notifications/*` |
| Hub Comunicação | `src/layouts/superadminHubConfig.ts`, `src/pages/superadmin/SuperAdminHubPage.tsx` |
| Migração base | `database/init/31_superadmin_settings.sql` |
| Stub e-mail | `packages/backend/src/services/messageService.ts` |

---

## 3. Onde a configuração SMTP deve ficar

### Persistência

- **Tabela:** `superadmin_settings`.  
- **Modelo:** uma linha por chave (como hoje). Valores são TEXT; booleans e números continuam serializados em string (`true`/`false`, porta como dígitos).

### Encriptação da senha

- A coluna `value` é texto **sem encriptação transparente na BD**.  
- Para cumprir “não expor senha em claro” no frontend e reduzir risco na BD:
  - **Backend:** guardar apenas **ciphertext** (ex.: AES-256-GCM) numa chave tipo `smtp_password_encrypted`, usando segredo derivado de variável de ambiente (ex. `SMTP_SETTINGS_SECRET` ou reutilização documentada de segredo já existente para credenciais).
  - **API GET:** nunca devolver a senha decifrada; devolver `smtp_password_configured: boolean` e, na UI, campo senha opcional (“deixar em branco para manter”).
  - **API PUT:** aceitar nova senha apenas quando o utilizador preenche o campo.

### Rota da UI (sugestão)

- **`/superadmin/smtp`** — consistente com rotas planas já usadas (`/superadmin/platform-notifications`, `/superadmin/notifications-engine`).  
- **`/superadmin/comunicacao/smtp`** — só faz sentido se existir um **layout pai** `/superadmin/comunicacao/*` com `<Outlet />`; hoje `/superadmin/comunicacao` é apenas o hub. Introduzir essa hierarquia seria refactor de rotas extra.

**Recomendação:** começar por **`/superadmin/smtp`** e acrescentar um card no hub em `superadminHubConfig` apontando para essa rota (alteração futura pequena).

---

## 4. Estrutura existente: `superadmin_settings`

- Já centraliza flags e IDs globais do Super Admin.  
- **Não é obrigatória** nova migração só para “criar” SMTP se as chaves forem **insert-on-save** (padrão já usado noutros serviços).  
- **Migração opcional (documentação / valores por defeito):** ficheiro SQL idempotente com `INSERT ... ON CONFLICT (key) DO NOTHING` para `smtp_enabled = false`, evitando surpresas em ambientes limpos.

**Não criar nova tabela** para SMTP na primeira versão, salvo requisito futuro de auditoria ou rotação de segredos mais rica.

---

## 5. Chaves sugeridas (`superadmin_settings.key`)

Alinhamento com o pedido; valores em `value` como texto.

| Chave | Conteúdo de `value` | Notas |
|-------|---------------------|--------|
| `smtp_enabled` | `true` / `false` | Ativo/Inativo. |
| `smtp_host` | hostname | Ex.: `smtp.sendgrid.net` |
| `smtp_port` | número em string | Ex.: `587` |
| `smtp_username` | string | Utilizador SMTP. |
| `smtp_password_encrypted` | base64 ou blob textual do ciphertext | Nunca enviar ao cliente após gravar. |
| `smtp_secure_mode` | `none` \| `tls` \| `ssl` | Mapear para opções nodemailer (`secure` / `requireTLS`). |
| `smtp_from_name` | string | Nome remetente padrão. |
| `smtp_from_email` | string | E-mail remetente (validar formato no backend). |
| `smtp_reply_to_email` | string ou vazio | Opcional. |

**Prefixo:** opcionalmente `platform_smtp_*` em vez de `smtp_*` para agrupar namespaces; decisão de equipa (compatível com o mesmo mecanismo de leitura).

---

## 6. Plano de implementação incremental

### Etapa 1 — Documento e arquitetura (esta entrega)

- Este ficheiro + revisão de segurança (segredo de encriptação, auditoria de acesso Super Admin).

### Etapa 2 — Backend de configuração

- Serviço dedicado (ex.: `smtpSuperadminSettingsService.ts`): ler/merge de chaves, encriptar/desencriptar só no servidor.
- Endpoints sob prefixo existente de Super Admin, por exemplo:
  - `GET /api/superadmin/smtp-settings` — dados não sensíveis + `password_configured`.
  - `PUT /api/superadmin/smtp-settings` — atualização parcial; senha só se enviada.
- Manter **fora** do handler de `platform-notifications/global-settings` para não misturar payloads nem alterar contratos atuais.

### Etapa 3 — Tela Super Admin

- Nova página lazy em `App.tsx`: rota `/superadmin/smtp`.
- Formulário: campos listados na especificação; estado ativo/inativo; não chamar motor de notificações.
- Após guardar, limpar campo senha no estado local; mostrar indicador “credencial configurada”.

### Etapa 4 — Teste de conexão

- Endpoint `POST /api/superadmin/smtp-settings/test` que usa credenciais **do servidor** (ou payload temporário não persistido com aviso de segurança) para enviar **um** e-mail de teste para um endereço indicado pelo admin.
- Continuar sem ligar ao motor transacional.

### Etapa 5 — Ativação no motor de notificações

- Canal `email` no motor da plataforma / filas: **última fase**, com feature flag adicional (ex. `platform_notifications_email_send_enabled`) se necessário.
- Continuar a não desativar WhatsApp por defeito.

---

## 7. Riscos

| Risco | Mitigação |
|-------|-----------|
| Senha em claro na BD ou na API | Encriptação no servidor + nunca repor senha no GET; HTTPS obrigatório. |
| Confundir SMTP com motor WhatsApp | Rotas e serviços separados; documentação na UI (“ainda não usado nas notificações automáticas”). |
| `superadmin_settings.value` sem schema | Validar portas, enums `smtp_secure_mode`, e-mails no PUT. |
| Teste de e-mail abusado | Limitar taxa; só super_admin; opcional captcha interno / log de auditoria. |
| Segredo de encriptação em falta no env | Falha explícita ao gravar senha com mensagem operacional. |

---

## 8. Checklist de validação (para quando as etapas 2–5 forem implementadas)

- [ ] Super Admin consegue gravar host/porta/modos/remetente sem alterar `platform_notifications_*`.  
- [ ] GET não devolve senha nem ciphertext interpretável no cliente.  
- [ ] WhatsApp e fluxos atuais de notificações da plataforma **inalterados** até a Etapa 5.  
- [ ] Build frontend e tipagem OK.  
- [ ] Migração opcional aplicada ou inserts lazy documentados.  
- [ ] (Etapa 4) E-mail de teste recebido apenas quando solicitado.  
- [ ] (Etapa 5) Ativação explícita documentada no changelog interno.

---

## 9. O que não fazer (até nova decisão)

- Envio real pelas notificações transacionais da plataforma.  
- Troca de WhatsApp por e-mail.  
- Amazon SES.  
- Alteração de templates ou catálogo `platform.*` para e-mail.  
- Automations adicionais fora do âmbito SMTP Super Admin.

---

*Última atualização: plano alinhado ao código e à tabela `superadmin_settings` do repositório painelcrm.*
