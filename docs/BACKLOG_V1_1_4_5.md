# Backlog v1.1.4.5 — recursos e melhorias

Documento de referência do que entra nesta release (funcionalidades novas, melhorias e fundação técnica). Ajuste os itens consoante o que for efetivamente promovido para produção.

---

## Chat

- **Integração Agenda ↔ Chat (WhatsApp)**  
  Ações rápidas no compositor: *Agendar compromisso* (deep link para `/agenda` com cliente/lead e título), *Criar reunião para agora* (Meet + mensagem no chat), *Criar reunião para depois* (agendamento com confirmação no chat).  
  Endpoints: `POST /api/chat/conversations/:id/create-meet-now`, `POST /api/chat/conversations/:id/schedule-appointment`.  
  Permissões: módulo `agenda` (criar) + envio no chat; timeline do cliente: evento `chat_appointment_scheduled` quando aplicável.

- **Motor de chatbot / automação (fases 6–8)**  
  Regras, debounce, runners e integração com inbound (arquivos em `chatbotEngine`, `chatbotPhase8Runner`, controllers de automação e bot rules).

- **Painel operacional / SLA / insights**  
  Componentes e serviços para métricas, filas, SLA e painel operacional no inbox (`ChatOperationalPanel`, `ChatInsightsPanel`, `chatSlaUi`, serviços de dashboard e SLA).

- **Distribuição e métricas de conversas**  
  `chatDistributionService`, `chatMetricsService`, workers e hooks de inbound.

- **Avatar / identidade / proxy**  
  Proxy de avatar, debug de mídia, melhorias em identidade canónica e qualidade de perfil (`chatAvatarProxy`, `useChatAvatarProxySrc`, utilitários Uaz).

- **Navegação e não lidos**  
  Eventos de navegação do chat e contagem de não lidos (`useChatNavUnreadCount`, `chatNavUnreadEvents`).

- **Configurações de atendimento**  
  Secções e permissões (`ChatAttendanceSettingsSection`, `chatAccess`).

---

## Agenda

- **UX mobile — Relatórios**  
  Filtros em bottom sheet (`ReportsFiltersSheet`), KPIs em grelha compacta, taxa de conclusão em destaque, blocos Resumo / Confirmação, tabelas substituídas por listas no mobile; export CSV e filtro no header. Desktop mantém layout anterior.

- **UX mobile — Calendário (fases anteriores neste branch)**  
  `AgendaFiltersSheet`, FAB, vistas lista/semana/mês compactas, integração com header mobile.

- **Disponibilidade e tipos**  
  Blocos de disponibilidade, feriados, capacidade por slot, definições por tipo de compromisso (controllers e serviços `appointmentAvailability*`, `appointmentHolidays*`, `appointmentTypeSettings*`).

- **Controlo de acesso à agenda**  
  Serviço `agendaAccessControl` e integrações em rotas/serviços conforme implementado.

- **Confirmação pública e fluxos relacionados**  
  Ajustes em `publicAppointmentConfirmationService` e páginas públicas quando presentes no diff.

---

## Pagamentos e faturação

- **Mercado Pago**  
  Preferências de checkout, pagamentos, webhook com assinatura, serviço de pagamento de faturas de cliente, painel e cartão de gateway (`MercadoPagoGatewayPanelCard`, integrações em `customerInvoices`, `mercadoPagoIntegration*`).

- **Gateway / UI de pagamentos**  
  Refatoração de cartões (Asaas, Mercado Livre branding), badges, `PaymentsPanelPage`, layout financeiro.

- **Documentação operacional**  
  `docs/MERCADO_PAGO_OPERACIONAL.md` e artefactos de marca em `public/branding/` / `docs/*.png` quando versionados.

---

## Clientes e notificações

- Timeline: tipo `chat_appointment_scheduled` e rótulos no perfil.  
- Notificações de sistema e sinos de header quando alterados neste branch.

---

## Base de dados e migrações

Scripts em `database/init/` e `supabase/migrations/` para: blocos de disponibilidade, feriados, tipos de compromisso, capacidade por slot, automação chat (fase 6), UI operacional (fase 7), chatbot (fase 8), entre outros alinhados aos serviços acima.

---

## Infra / tooling

- **Backend:** `index.ts`, `migrate.ts`, configs (`chatAutomationEnv`, `chatbotAutomationEnv`, Mercado Pago).  
- **Frontend:** `api/client`, `vite-env`, CSS global, hooks mobile.  
- **Testes:** `chatbotEngine.test.ts` (imports ESM + tipos).

---

## Notas de release

- Confirmar que **`.env` não deve ser commitado** em deploy (variáveis sensíveis).  
- Correr migrações (`migrate` / Supabase) antes do deploy.  
- Validar feature flags: `chat`, `agenda`, planos com módulos necessários.

---

*Gerado para o branch `deploy-v1.1.4.5`. Atualize este ficheiro se cortar ou adiar funcionalidades para uma versão posterior.*
