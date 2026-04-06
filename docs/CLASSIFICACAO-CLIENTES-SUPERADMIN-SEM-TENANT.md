# Classificação — Clientes vinculados a super admin sem `tenant_id`

## Escopo e regras

- **Somente classificação e investigação** (leitura). Nenhum `UPDATE` / `DELETE` foi executado para elaborar este documento.
- Os fatos abaixo referem-se ao **banco local** auditado na Etapa 4A (Docker `painelcrm_postgres`). Em **produção**, repetir as queries com os mesmos UUIDs só faz sentido se forem os mesmos registros.

---

## 1. Confirmação do usuário

| Campo | Valor |
|--------|--------|
| `id` | `3886bf78-77c8-4c3a-b9c9-d6441b275888` |
| `email` | `admin@painelcrm.com` |
| `is_super_admin` | **true** |
| `tenant_id` | **NULL** (esperado para este usuário seed) |
| `created_at` | `2026-02-23 16:29:07+00` |

### É super admin?

**Sim.** A coluna `users.is_super_admin` está **true**. Não há linhas em `user_roles` para esse `user_id` (papéis de app/tenant costumam existir para usuários **com** tenant; super admin de plataforma é um caso separado).

### Origem

O arquivo [`database/init/create-admin-user.sql`](c:\CURSOR\painelcrm\database\init\create-admin-user.sql) documenta a criação proposital de um usuário:

- e-mail `admin@painelcrm.com`;
- `is_super_admin = true`;
- **`tenant_id` NULL** — modelo “usuário de plataforma”, não pertencente a um tenant CRM.

A migração [`23_add_super_admin.sql`](c:\CURSOR\painelcrm\database\init\23_add_super_admin.sql) define o significado de `is_super_admin`.

**Conclusão:** a hipótese “é o super admin do sistema” está **confirmada** para este ambiente; a ausência de `tenant_id` **não é bug de dados** nesse usuário — é **desenho do seed** / conta global.

---

## 2. Lista dos quatro clientes

Todos com `user_id = 3886bf78-77c8-4c3a-b9c9-d6441b275888`, sem `group_id` nem `profile_id`.

| `id` (cliente) | Nome | E-mail (cadastro) | Telefone | Empresa | `created_at` (UTC) |
|----------------|------|-------------------|----------|---------|---------------------|
| `c55c9cec-07cf-4467-a7c9-bb648b333b1b` | Kaique Silva Santos | thekiq@icloud.com | 11981169950 | Criar Loja | 2026-02-25 15:18 |
| `6b3754a1-41a8-4d7e-bb40-c74238f1dd00` | teste | kssantos@hotmail.com | 11981169950 | — | 2026-03-05 12:24 |
| `8a75aaf2-c89a-4668-be1d-1d6160872e9a` | tesadas | kssantos@hotmail.com | 11981169950 | — | 2026-03-05 12:29 |
| `54fb2632-323f-4a5a-80b1-e331bb72ae54` | teste | kaique@agenciadev.com.br | 11981169950 | Kaique Santos | 2026-03-05 12:33 |

Observações:

- **Mesmo telefone** nos quatro — forte indício de **teste / mesmo operador**.
- Dois nomes são claramente de **teste** (`teste`, `tesadas`); um parece **pessoa/empresa reais** (nome + empresa + e-mail corporativo).

---

## 3. Onde aparecem no sistema e vínculos

Consultas executadas (somente `SELECT`) sobre estes quatro `clients.id`:

| Relação | Quantidade | Nota |
|---------|------------|------|
| `client_timeline_events` | **0** | Sem histórico de timeline |
| `customer_invoices` (`client_id`) | **0** | Sem faturas de cliente |
| `chat_conversations` (`client_id`) | **0** | Sem conversa vinculada ao registro |
| `client_tasks` | **0** | Sem tarefas |
| `proposals` / `contracts` (por `client_id`, se existir na instalação) | **0** | |
| `subscriptions` (`customer_id` = client) | **0** | |

Também foi verificado cruzamento por **telefone** normalizado com `chat_conversations`: **0** linhas (no snapshot atual não há conversa com o mesmo número desses clientes).

**Comportamento esperado do CRM “por tenant”:** em [`getClients`](c:\CURSOR\painelcrm\packages\backend\src\controllers\clientsController.ts), se `req.tenantId` for nulo, a API retorna **`[]`**. Logo, com o super admin **sem tenant**, esses clientes **não aparecem na listagem colaborativa normal**; continuam apenas como linhas em `clients` com `user_id` do admin.

---

## 4. Como os clientes foram criados (fluxo provável)

1. **`createClient`** ([`clientsController.ts`](c:\CURSOR\painelcrm\packages\backend\src\controllers\clientsController.ts)) faz `INSERT INTO clients` com **`user_id = req.userId`** (dono do registro = quem chamou a API).
2. Quem estiver autenticado como `admin@painelcrm.com` no **app principal** (não necessariamente só no `/superadmin`) obtém JWT com esse `user_id`.
3. Chamadas **POST** de criação de cliente passam a gravar **clientes “do super admin”**, que **não herdam tenant** porque o usuário não tem `tenant_id`.

Isso **não exige bug de UUID**: é **lacuna de regra de negócio** — permitir criação de cliente para usuário **sem tenant** deixa registros **órfãos do modelo multi-tenant**.

O painel Super Admin, em **impersonação**, exige usuário alvo **com** tenant ([`superadminUsersController.ts`](c:\CURSOR\painelcrm\packages\backend\src\controllers\superadminUsersController.ts) — comentário/checagem). O caminho problemático é o super admin usar o **CRM como ele mesmo**, sem tenant.

**Recomendação de produto (futura, fora do escopo de correção de dados):** bloquear `createClient` (ou todo módulo CRM) quando `req.tenantId` / `users.tenant_id` for nulo, exceto fluxos explícitos.

---

## 5. Classificação por registro e ação recomendada

Nenhuma ação foi executada; abaixo é **recomendação** para Etapa 4B / correção controlada.

| Cliente | Perfil dos dados | Dependências | Recomendação principal | Alternativa |
|---------|------------------|--------------|------------------------|-------------|
| `c55c9cec-…` | Parece **cadastro real** (nome completo, empresa) | Nenhuma detectada | **Migrar** `user_id` (e, se política exigir, criar vínculo lógico) para um **usuário de tenant correto** — após validação com o negócio | Se for falso positivo de teste: **remover** após confirmação |
| `6b3754a1-…` | Nome “teste”, e-mail genérico | Nenhuma | **Remover** (dado de teste) | Arquivar só se houver requisito de auditoria retendo linha |
| `8a75aaf2-…` | “tesadas” — óbvio teste | Nenhuma | **Remover** | Idem |
| `54fb2632-…` | “teste” + e-mail corporativo | Nenhuma | **Remover** como teste **ou** migrar se a empresa for tenant real e o cadastro for intencional | Confirmar com quem criou |

**“Manter como dado técnico”:** **não recomendado.** Clientes do CRM devem pertencer a um **tenant** via cadeia `clients.user_id` → `users.tenant_id`. Manter clientes só no super admin perpetua inconsistência e confunde auditorias.

**“Desativar”:** se existir coluna de status/arquivamento no produto, pode ser usado **em vez de DELETE** para os casos “teste” — desde que o modelo de negócio tenha esse conceito (hoje `status` nos dados é texto livre “Ativo”).

---

## 6. Risco de correção

| Ação | Risco | Mitigação |
|------|--------|-----------|
| **DELETE** dos 4 | **Baixo** neste snapshot: sem timeline, faturas, conversas, tarefas, propostas, contratos, subscriptions ligados | Backup; dry-run com `SELECT` dos mesmos `WHERE`; em produção, repetir contagem de dependentes |
| **UPDATE** `user_id` / realocação para usuário de tenant | **Médio**: permissões, `group_id`/`profile_id`, duplicidade de e-mail no tenant | Escolher `user_id` primário do tenant; validar unicidade e regras do módulo de clientes; opcionalmente preencher `group_id` válido |
| **SET tenant no super admin** | **Alto** para o modelo atual: quebra intenção do seed (admin global); pode conflitar com `users_email_null_tenant_key` / fluxo super admin | **Não** tratar como primeira opção; preferir mover **clientes**, não “dar tenant” ao super admin sem decisão arquitetural |

---

## 7. Síntese

| Pergunta | Resposta |
|----------|----------|
| O `user_id` é super admin? | **Sim** — `admin@painelcrm.com`, `is_super_admin = true`. |
| Por que sem `tenant_id`? | **Por desenho** do seed / usuário de plataforma, não por corrupção aleatória. |
| Os 4 clientes são contaminados entre tenants? | **Não** no sentido Etapa 4A (não há outro tenant misturado); são **órfãos de tenant** (dono sem `tenant_id`). |
| Bug de criação? | **Lacuna:** API permite criar cliente com dono sem tenant. |
| Próximo passo seguro? | Decisão negocial nos 4 registros; depois **DELETE** (testes) ou **UPDATE `user_id`** para usuário do tenant correto (caso “Kaique…”), sempre após novo `SELECT` de dependentes em produção. |

---

*Documento de classificação — sem alteração de dados.*
