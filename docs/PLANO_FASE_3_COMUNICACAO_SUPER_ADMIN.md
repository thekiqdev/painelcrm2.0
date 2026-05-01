# Plano — Fase 3: Separação da área de Comunicação (Super Admin)

Documento de investigação e proposta técnica/visual. **Esta fase prioriza análise e plano incremental**; alterações grandes de UI ficam para etapas seguintes, após validação.

**Restrições globais (mantidas):** sem alterações a backend, base de dados, permissões ou chaves de configuração existentes.

---

## 1. Mapa atual das telas de Comunicação

| Label na sidebar (`superadminNavConfig.ts`) | Rota | Página / componente principal | Função resumida |
|---------------------------------------------|------|-------------------------------|-----------------|
| Central de comunicação | `/superadmin/comunicacao` | `SuperAdminHubPage` + `superadminHubConfig` | Hub com cards para as rotas abaixo |
| Alertas operacionais | `/superadmin/notifications` | `SuperAdminNotifications.tsx` | Lista notificações in-app cujo `type` começa por `superadmin_`; botão “Verificar trials (7 dias)” |
| Anúncios aos clientes | `/superadmin/announcements` | `SuperAdminAnnouncements.tsx` | Lista anúncios; rotas filhas para novo, edição, envio, histórico de envios, grupos (`App.tsx`) |
| Motor de notificações | `/superadmin/notifications-engine` | `SuperAdminNotificationsEngineSettings.tsx` | Kill switches globais do motor **transacional dos tenants** (CRM): `notifications_engine_*` |
| Templates padrão | `/superadmin/notification-templates` | `SuperAdminCrmNotificationTemplates.tsx` | Edição de templates **sistema** do motor de notificações dos tenants (filtro canal/locale, preview) |
| Notificações da plataforma | `/superadmin/platform-notifications` | `SuperAdminPlatformNotifications.tsx` | Motor **platform.*** (SaaS): tabs WhatsApp / Catálogo / Configuração global / Histórico; inclui `SuperAdminPlatformWhatsAppPanel` |

**Rotas relacionadas a anúncios (mesmo domínio “comunicação com clientes”, não na sidebar principal):**

- `/superadmin/announcements/new`, `/:id/edit`, `/:id/send`
- `/superadmin/announcements/sends`, `/sends/:sendId`
- `/superadmin/announcements/groups`

**Área tenant (não Super Admin), para referência:**

- Configurações da empresa → `NotificationsSection` (`src/components/settings/NotificationsSection.tsx`): preferências e entregas do **motor do tenant**, não confundir com os painéis globais acima.

---

## 2. Arquivos e componentes relevantes

### Entrada e navegação

- `src/layouts/superadminNavConfig.ts` — grupo `comunicacao`
- `src/layouts/superadminHubConfig.ts` — cards do hub `/superadmin/comunicacao`
- `src/App.tsx` — lazy imports e `<Route>` sob `/superadmin`

### Páginas Super Admin (comunicação)

- `src/pages/superadmin/SuperAdminNotifications.tsx` — ~87 linhas (simples)
- `src/pages/superadmin/SuperAdminNotificationsEngineSettings.tsx` — ~150 linhas (focada)
- `src/pages/superadmin/SuperAdminCrmNotificationTemplates.tsx` — **~400+ linhas** (tabela + editor + preview)
- `src/pages/superadmin/SuperAdminPlatformNotifications.tsx` — **~780+ linhas** (tabs, estado complexo)
- `src/pages/superadmin/SuperAdminPlatformWhatsAppPanel.tsx` — painel WhatsApp **instância plataforma**, embutido na tab “WhatsApp” de `SuperAdminPlatformNotifications`
- `src/pages/superadmin/SuperAdminAnnouncements.tsx` + `SuperAdminAnnouncementEditor.tsx`, `Send`, `Sends`, `SendDetail`, `Groups`

### Serviços / API usados (referência de front)

- Endpoints sob `/api/superadmin/notifications-engine/*`, `/api/superadmin/platform-notifications/*`, `announcementsAdmin`, `/api/notifications`, etc. (sem alteração nesta fase)

---

## 3. Onde ficam SMTP e Amazon SES hoje

### Frontend (Super Admin e restante app)

- **Não existe** ecrã dedicado a configuração SMTP ou Amazon SES no Super Admin.
- Pesquisa por `SMTP`, `SES`, `nodemailer`, secções explícitas de “mail provider” em `src/pages/superadmin` e `src/components/settings` não revelou UI de correio transacional para plataforma.

### Backend (informação de contexto — sem alterações)

- `packages/backend/src/services/messageService.ts`: função `sendEmailMessage` é **stub** com comentário `TODO: Implementar serviço de email (nodemailer, sendgrid, etc)` — apenas log/simulação.
- O motor de notificações (`notificationsEngine`) modela **canais** (ex.: WhatsApp, e-mail em conceito), mas **não implica** um painel Super Admin de SMTP/SES neste repositório.

**Conclusão:** SMTP e Amazon SES **não estão “misturados” numa tela errada** — **não há UI** para os configurar. Qualquer separação “Canais de envio → SMTP / SES” será **nova superfície de produto** quando existir backend e requisitos de segurança (provavelmente env-only ou segredos geridos fora do CRM).

---

## 4. Problemas de UX encontrados

1. **Dois “motores” com nomes parecidos**  
   - “Motor de notificações” = tenants (CRM).  
   - “Notificações da plataforma” = eventos `platform.*` (SaaS).  
   O próprio UI já usa `Alert` explicativo em `SuperAdminNotificationsEngineSettings` e `SuperAdminPlatformNotifications`; ainda assim, utilizadores novos podem confundir — reforço por agrupamento na sidebar ou hub pode ajudar.

2. **Tamanho e densidade de `SuperAdminPlatformNotifications`**  
   Quatro tabs (WhatsApp, Catálogo, Global, Histórico) + diálogos de edição/preview: ficheiro muito grande para manutenção e navegação mental única “uma página = um objetivo”.

3. **Breadcrumb inconsistente com o menu**  
   Em `SuperAdminPlatformNotifications`, o breadcrumb textual referencia **“Super Admin / Plataforma”**, enquanto o item de menu está no grupo **Comunicação**. Não quebra funcionalidade, mas enfraquece a hierarquia mental (“estou em Plataforma ou Comunicação?”).

4. **Configuração WhatsApp “global” da plataforma**  
   Está **dentro** de “Notificações da plataforma” (tab WhatsApp → `SuperAdminPlatformWhatsAppPanel`). Para uma futura área “Canais de envio”, este painel é o candidato natural a link dedicado (mesma rota com âncora ou sub-rota apenas de apresentação).

5. **Templates CRM vs templates plataforma**  
   “Templates padrão” edita catálogo **tenant/CRM** (superadmin). “Notificações da plataforma” edita overrides **platform.***. Distinção correta no produto, mas labels próximos — beneficia de agrupamento visual explícito no hub ou secções nomeadas.

---

## 5. Proposta de nova organização (informacional)

### Comunicação (conteúdo e políticas)

| Conceito | Manter rota atual | Notas |
|----------|-------------------|--------|
| Central de comunicação | `/superadmin/comunicacao` | Hub |
| Alertas operacionais | `/superadmin/notifications` | In-app superadmin |
| Anúncios aos clientes | `/superadmin/announcements` (+ filhas) | Sem mudança de paths |
| Motor de notificações (tenants) | `/superadmin/notifications-engine` | Global flags CRM |
| Templates padrão (sistema CRM) | `/superadmin/notification-templates` | |
| Notificações da plataforma | `/superadmin/platform-notifications` | Eventos `platform.*`, histórico, toggles |

### Canais de envio (evolução futura)

| Canal | Estado atual | Proposta |
|-------|----------------|----------|
| WhatsApp (instância plataforma) | Tab dentro de `/superadmin/platform-notifications` | Extrair para entrada dedicada na navegação **quando** se decidir UX (wrapper ou sub-rota sem mudar API) |
| SMTP | Sem UI | Documentar dependência de futura feature / env |
| Amazon SES | Sem UI | Idem |

Até existir configuração real no produto, o grupo **“Canais de envio”** pode ser uma secção no hub (`superadminHubConfig`) com **apenas** o card WhatsApp apontando para `/superadmin/platform-notifications` (ou query `?tab=whatsapp` **se** for introduzido suporte de URL — requer pequeno ajuste de estado na página, fora do escopo “só documento” desta entrega).

---

## 6. Rotas sugeridas (incrementais)

**Curto prazo (sem novas APIs):**

- Manter todas as rotas existentes.
- Opcional: `/superadmin/comunicacao/canais` como **página hub leve** listando apenas links para rotas já existentes (ex.: WhatsApp → mesma URL da tab). Evita novos endpoints.

**Médio prazo (após refactor documentado):**

- `/superadmin/platform-notifications/whatsapp` — apenas se `SuperAdminPlatformNotifications` for dividido em wrappers com rotas filhas **sem** duplicar lógica (layout pai + `<Outlet />`).

**Não sugerido agora:** novas rotas para SMTP/SES sem backend.

---

## 7. Estratégia incremental de implementação

1. **Concluído (Fase 2):** hub `/superadmin/comunicacao` com cards.
2. **Esta entrega (Fase 3 plano):** este documento + consenso em equipa sobre breadcrumb e nomenclatura.
3. **Micro-melhorias seguras (uma PR pequena):**
   - Alinhar breadcrumb de `SuperAdminPlatformNotifications` de “Plataforma” para “Comunicação” (ou remover segmento enganador).
4. **Refactor médio (PR separada):**
   - Extrair blocos de `SuperAdminPlatformNotifications` para componentes menores **no mesmo ficheiro ou pasta**, sem mudar comportamento; só depois considerar rotas filhas.
5. **Hub “Canais”:** adicionar secção ou segunda linha de cards no hub quando houver mais de um destino real (hoje essencialmente WhatsApp na prática).

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Introduzir rotas filhas sem extrair estado | Duplicação de fetch e bugs de sincronização — preferir layout pai único com estado elevado mínimo |
| Query `?tab=` sem testes | Deep links quebrados ou estado inicial errado — testar montagem e troca de tab |
| Expectativa de UI SMTP/SES | Comunicar que canais dependem de roadmap backend; evitar páginas vazias que pareçam “quebradas” |
| Confundir permissões | Qualquer nova rota deve continuar sob `SuperAdminGuard` como hoje |

---

## 9. Checklist de validação (pós-implementação futura)

- [ ] Todas as rotas antigas de comunicação continuam acessíveis e funcionais.
- [ ] Build TypeScript (`npm run build`) sem erros.
- [ ] Sidebar destaca corretamente o item ativo (`NavLink` + `end` onde aplicável).
- [ ] Nenhuma chamada API nova obrigatória para navegar entre secções.
- [ ] Documentação de utilizador actualizada se breadcrumbs ou labels mudarem.

---

## 10. Melhoria pequena opcional (fora do âmbito obrigatório deste ficheiro)

- **Breadcrumb:** uma linha em `SuperAdminPlatformNotifications.tsx` para refletir “Comunicação” em vez de “Plataforma”, alinhando com `superadminNavConfig.ts`.

---

*Última actualização: investigação ao código em `painelcrm` (frontend + referência backend para email stub).*
