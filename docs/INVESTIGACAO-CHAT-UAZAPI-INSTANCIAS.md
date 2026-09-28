# Investigação Técnica — Chat + Uazapi

## 1. Estado atual do módulo

### O que já funciona (quando o ambiente está correto)

- Rotas de chat sob `/api/chat/*` protegidas por `tenantAuth` + `requireFeature('chat')`.
- Listagem de instâncias locais (`GET /api/chat/instances`) a partir da tabela `chat_instances` por `user_id`.
- Serviço `UazapiService` (`packages/backend/src/services/uazapi.ts`) encapsula chamadas HTTP à API Uazapi:
  - `POST /instance/init` com header **`admintoken`** — criação de instância no provedor.
  - Operações por instância (`connect`, `status`, `webhook`, envio de mensagens, etc.) usam header **`token`** com o **token da instância** retornado pela Uazapi.
- Fluxo de QR Code: após existir `instance_token` salvo, `connectInstance` chama `POST /instance/connect` **sem** telefone para obter QR (comportamento documentado no código).

### O que estava quebrado / confuso

- Criação de instância retornava **HTTP 403** com corpo `{ error: 'Admin token required' }` quando **`UAZAPI_ADMIN_TOKEN`** não estava definido (ou estava em branco) no **processo do backend**.
- A mensagem sugeria falha de permissão do **usuário** ou necessidade de um “admin token” no cliente — **incorreto**: o requisito é **variável de ambiente no servidor** com o token administrativo **da Uazapi**, não o JWT do painel.

### Acoplamentos relevantes

- Criação de instância depende de **um único** `UAZAPI_ADMIN_TOKEN` global ao processo (multi-tenant compartilha o mesmo token de provedor, típico de SaaS que usa uma conta Uazapi para todos os tenants).
- Instâncias são persistidas por **usuário** (`chat_instances.user_id`), não por `tenant_id` explícito na tabela analisada neste fluxo — ponto a revisar em evoluções futuras de isolamento.

---

## 2. Fluxo atual de criação de instância

1. **Frontend** (`src/services/chat.ts`): `POST /api/chat/instances` com `{ name, metadata? }` e `Authorization: Bearer <JWT>`.
2. **Rotas** (`packages/backend/src/routes/chatRoutes.ts`): `router.use(tenantAuth)`, `router.use(requireFeature('chat'))`, depois `POST /instances` → `createInstance`.
3. **Controller** (`packages/backend/src/controllers/chatController.ts` → `createInstance`):
   - Valida corpo com `instanceSchema` (nome ≥ 3 caracteres).
   - Chama `uazapiService.createInstance(name, metadata)` → internamente `request('/instance/init', { method: 'POST', useAdminToken: true })`.
4. **UazapiService** (`packages/backend/src/services/uazapi.ts`):
   - Monta URL: `UAZAPI_BASE_URL` (default `https://free.uazapi.com`) + `/instance/init`.
   - Envia header `admintoken: <UAZAPI_ADMIN_TOKEN>`.
5. Resposta: extrai `token` da instância, grava em `chat_instances` (`instance_token`, `metadata` JSON, etc.) e retorna **201** com a linha criada.

### Onde ficam as credenciais

| Credencial | Onde | Uso |
|------------|------|-----|
| JWT do usuário | `Authorization` (middleware `tenantAuth`) | Autorização no PainelCRM (tenant + feature chat). |
| `UAZAPI_ADMIN_TOKEN` | Variável de ambiente do **backend** | Header `admintoken` na Uazapi para **criar** instância (`/instance/init`). |
| Token da instância | Resposta Uazapi + coluna `chat_instances.instance_token` | Header `token` nas demais chamadas (connect, webhook, mensagens). |

---

## 3. Causa raiz do erro “Admin token required”

1. **Verificação prévia** no controller chamava `ensureAdminToken()`, que falhava se `process.env.UAZAPI_ADMIN_TOKEN` estivesse ausente.
2. O handler convertia isso em **403** com texto **`Admin token required`** — semanticamente incorreto:
   - **403 Forbidden** costuma indicar “usuário autenticado mas sem permissão”.
   - Aqui o problema era **configuração do servidor** (integração não pronta), mais próximo de **503 Service Unavailable** ou erro de configuração.
3. O usuário final **nunca** deve enviar o `admintoken` da Uazapi; isso é **segredo de infraestrutura** apenas no backend.

**Conclusão:** o erro não era “falta de header no frontend”, e sim **ausência (ou valor só com espaços) de `UAZAPI_ADMIN_TOKEN` no ambiente em que o Node roda**, combinado com mensagem e status HTTP enganosos.

---

## 4. O que foi corrigido

1. **Substituída** a função `ensureAdminToken()` por **`isUazapiAdminConfigured()`** (checagem de string não vazia após `trim`).
2. **Criação de instância** (`createInstance`): se a integração não estiver configurada, resposta **503** com:
   - `error`: texto claro em português para administrador de ambiente.
   - `code`: `UAZAPI_NOT_CONFIGURED`.
   - `details`: esclarece que não é o token do usuário do painel.
3. **Remoção** da exigência de admin token em **`deleteInstance`**: a exclusão atual apenas remove registro no banco; não precisa do `admintoken` da Uazapi (evita bloquear exclusão local quando o env está incompleto).
4. **`UazapiService`**: normalização de `UAZAPI_ADMIN_TOKEN` com `trim()` no construtor e em `updateConfig`, e checagem consistente antes de enviar `admintoken`.
5. **`env.example`**: comentário explicativo e placeholder em vez de valor que pareça segredo real.

---

## 5. Arquivos alterados

- `packages/backend/src/controllers/chatController.ts`
- `packages/backend/src/services/uazapi.ts`
- `env.example`
- `docs/INVESTIGACAO-CHAT-UAZAPI-INSTANCIAS.md` (este documento)

---

## 6. Riscos encontrados

- **Deploy:** se `UAZAPI_ADMIN_TOKEN` não for injetado no **runtime** (apenas em build-arg sem repassar ao container), a criação continuará falhando até o env estar correto — agora com **503** e mensagem explícita.
- **Segurança:** o token administrativo da Uazapi é **global ao processo**; qualquer usuário autorizado ao módulo chat pode disparar criação de instância no mesmo provedor — alinhado a muitos MVPs, mas pode exigir **rate limit / quotas / papel admin** em evolução.
- **Modelo de dados:** instâncias ligadas a `user_id` podem não refletir isolamento “por tenant” em todos os cenários SaaS — revisar em upgrade.

---

## 7. Pontos de melhoria para o upgrade do módulo

1. **Configuração:** permitir credenciais Uazapi por tenant (ou criptografadas em BD) em vez de só `.env` global.
2. **Observabilidade:** métricas e logs correlacionados (tenant, user, instance id) sem vazar tokens.
3. **Resiliência:** retries idempotentes na criação, tratamento fino de códigos da Uazapi.
4. **Frontend:** exibir mensagem amigável quando `code === 'UAZAPI_NOT_CONFIGURED'` (orientar contato com suporte / administrador).
5. **Testes:** contrato da rota `POST /api/chat/instances` com env mockado / ausente.
6. **Documentação Uazapi:** manter mapeamento endpoint-a-endpoint (`/instance/init`, `/instance/connect`, webhooks) versionado.

---

## 8. Próximos passos recomendados

1. Garantir em **produção** `UAZAPI_ADMIN_TOKEN` e `UAZAPI_BASE_URL` corretos no serviço que executa o backend (Docker/Kubernetes/EasyPanel).
2. Validar manualmente: criar instância → listar → conectar / QR → webhook.
3. Opcional: no frontend, tratar `503` + `UAZAPI_NOT_CONFIGURED` com texto fixo para o usuário final.
4. Planejar upgrade de modelo multi-tenant (tokens por tenant, limites, auditoria).
