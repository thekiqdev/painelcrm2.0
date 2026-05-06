/**
 * Script de migração: executa os SQLs de `database/init` **nesta ordem** (array `order` abaixo).
 * Ficheiros novos em `database/init` não são descobertos automaticamente — é obrigatório acrescentar o nome ao array.
 * Uso: `cd packages/backend && npm run migrate:tsx` (fonte atual, sem build) **ou** `npm run build && npm run migrate` (JavaScript em `dist/`).
 * `npm run migrate` sozinho usa `dist/migrate.js`; se não tiver feito `build` depois de editar isto, o ficheiro `dist` pode estar desatualizado.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// No Docker: /app/dist -> root = /app. No repo: packages/backend/dist -> root = projeto (../../..)
const initDirDocker = path.resolve(__dirname, '..', 'database', 'init');
const initDirRepo = path.resolve(__dirname, '../../..', 'database', 'init');
const initDir = fs.existsSync(initDirDocker) ? initDirDocker : initDirRepo;
const rootDir = path.resolve(initDir, '..', '..');
const rootEnv = path.resolve(rootDir, '.env');
dotenv.config({ path: rootEnv });
dotenv.config();
const order = [
  '01_create_users_and_auth.sql',
  '02_create_enums.sql',
  '03_create_permissions_and_roles.sql',
  '04_create_leads_and_clients.sql',
  '05_create_funnels.sql',
  '06_create_products.sql',
  '07_create_contracts.sql',
  '08_create_projects.sql',
  '09_create_tickets.sql',
  '10_create_whatsapp.sql',
  '11_create_tasks.sql',
  '12_create_proposals.sql',
  '13_create_finance.sql',
  '14_add_assignee_to_client_tasks.sql',
  '15_create_chat_tables.sql',
  '16_create_notifications_table.sql',
  '17_alter_chat_conversations_add_lead_id.sql',
  '18_add_chat_conversations_unique_constraint.sql',
  '19_add_connected_phone_to_instances.sql',
  '20_fix_conversations_last_message_at.sql',
  '21_create_message_templates.sql',
  '22_update_message_templates_structure.sql',
  '23_add_super_admin.sql',
  '24_plans_and_plan_features.sql',
  '25_seed_initial_plans.sql',
  '26_tenants_and_user_tenant.sql',
  '27_tenant_feature_overrides.sql',
  '28_tenant_plan_and_audit_log.sql',
  '29_system_features_table.sql',
  '30_tenants_created_via.sql',
  '31_superadmin_settings.sql',
  '32_migrate_old_users_to_tenants.sql',
  '33_tenant_billing.sql',
  '34_tenants_config.sql',
  '35_tenant_admin_notes_and_tags.sql',
  '36_tenant_limit_overrides.sql',
  '37_plans_whatsapp_limit_and_tenant_override.sql',
  '38_plans_plan_type_and_default.sql',
  '39_plan_interval_prices.sql',
  '40_tenant_billing_interval_extend.sql',
  '41_seed_default_plan.sql',
  '42_plans_benefits.sql',
  '43_plans_free.sql',
  '44_projects_wizard_foundation.sql',
  '45_projects_wizard_phase2.sql',
  '46_project_areas_and_versions.sql',
  '47_project_tasks_area_id.sql',
  '48_project_areas_responsible_ids.sql',
  '49_teams_and_team_members.sql',
  '50_projects_team_id.sql',
  '51_role_module_permissions.sql',
  '52_tenant_enabled_roles.sql',
  '53_tenant_custom_roles.sql',
  '54_projects_team_ids.sql',
  '55_project_areas_team_ids.sql',
  '56_project_area_comments.sql',
  '57_rls_tenant_isolation.sql',
  '58_user_permission_versions.sql',
  '59_asaas_integration_phase1.sql',
  '60_payment_gateway_configuration.sql',
  '61_payment_gateways_panel_phase1.sql',
  '62_payment_webhook_events_phase5.sql',
  '63_activation_plan_phase1.sql',
  '64_tenants_billing_contact.sql',
  '65_tenants_onboarding_completed.sql',
  '66_users_tenant_email_unique.sql',
  '67_subscriptions.sql',
  '68_tenant_billing_subscription_id.sql',
  '69_billing_recurring_jobs.sql',
  '70_customer_invoices.sql',
  '71_customer_invoices_manual_support.sql',
  '72_clients_cpf_cnpj.sql',
  '73_gateway_payment_generic_columns.sql',
  '74_drop_asaas_payment_columns.sql',
  '75_payment_status_check_multi_gateway.sql',
  '76_customer_invoice_items.sql',
  '77_payment_token_customer_invoices.sql',
  '78_customer_invoices_client_id_nullable.sql',
  '79_customer_charges.sql',
  '80_customer_invoice_items_advanced_schedule.sql',
  '81_customer_invoice_parent_child_e2.sql',
  '82_customer_invoice_payment_attempts.sql',
  '83_public_pay_card_idempotency.sql',
  '84_invoice_attempts_one_open_per_method.sql',
  '85_chat_conversations_link_hardening.sql',
  '86_client_timeline_events.sql',
  '87_users_global_email_whatsapp_unique.sql',
  '88_chat_instances_external_name_index.sql',
  '89_rls_sensitive_tables.sql',
  '90_checkout_trial_phase2.sql',
  '91_plans_trial_days_legacy_align.sql',
  '92_profiles_hide_activation_checklist.sql',
  '93_tenant_billing_payment_attempts.sql',
  '94_seats_commercial_policy.sql',
  '95_chat_conversations_canonical_identity.sql',
  /** Etapa 5 — atendimento / fila em `chat_conversations` + histórico auditável */
  '96_chat_conversations_attendance_etapa5.sql',
  /** RLS chat: `app.actor_user_id` + políticas SELECT/INSERT separadas */
  '97_rls_chat_app_actor_visibility.sql',
  '98_chat_conversations_assigned_team.sql',
  /** Kanban de conversas (/chat/kanbam): boards, colunas, cards + RLS */
  '99_chat_kanban_etapa_d2.sql',
  /** Fase 2 catálogo: store_banner_url, theme_key, theme_options em store_profiles */
  '100_store_profiles_media_theme.sql',
  /** MVP checkout loja: orders.customer_invoice_id + idempotência */
  '101_orders_store_checkout.sql',
  /** Checkout loja: habilitar por loja (default false) */
  '102_store_profiles_checkout_enabled.sql',
  '103_tenant_chat_templates.sql',
  /** Checkout loja: pedido vinculado ao cliente CRM */
  '104_orders_client_id.sql',
  /** Templates WhatsApp: categorias + templates com itens (sequência, delay, imagem) */
  '105_whatsapp_message_templates_module.sql',
  /** Templates WhatsApp: tipo automatic|model, document, media_url (bases que correram 105 antigo) */
  '106_whatsapp_templates_type_model_document.sql',
  /** Templates WhatsApp: upload de mídia com storage_path + metadados de ficheiro */
  '107_whatsapp_template_items_storage_upload.sql',
  /** Kanban: movimento automático por tempo (agendamentos) */
  '108_chat_kanban_scheduled_moves.sql',
  /** Kanban: visibilidade do board (tenant_all / restricted) + utilizadores e equipes */
  '109_chat_kanban_board_visibility.sql',
  /** Contratos: snapshot + document_frozen_at (Etapa 2 — travas de documento) */
  '110_contracts_document_freeze.sql',
  /** Contratos: token hash para link público de visualização (Etapa 3) */
  '111_contract_public_view_tokens.sql',
  /** Contratos: convites de assinatura pública por signatário (Etapa 4) */
  '112_contract_signer_signature_invites.sql',
  /** Contratos: hardening link público — cancelado não acessível por token (Etapa 6) */
  '113_contract_public_view_block_cancelled.sql',
  /** Contratos: link público provisionado na criação + ciphertext + visualização em rascunho */
  '114_contract_public_view_auto_provision.sql',
  /** Contratos: tax_id signatário + convite assinatura com fallback de documento */
  '115_contract_signers_tax_id_signature_invite_doc.sql',
  /** Contratos: modelo com valor padrão, título padrão e regras de vigência copiadas no contrato */
  '116_contract_templates_value_tenancy.sql',
  /** Contratos: contract_id na função pública de view (assinaturas + PDF por token) */
  '117_contract_public_view_contract_id.sql',
  /** Propostas: coluna preparatória proposal_id em customer_invoices (vínculo futuro com fatura) */
  '118_customer_invoices_proposal_id.sql',
  /** Propostas Etapa 2: invoiced, converted_invoice_id, timeline, unicidade fatura↔proposta */
  '119_proposals_etapa2_invoiced_timeline.sql',
  /** Propostas Etapa 3: tokens de link público (hash) */
  '120_proposal_public_view_tokens.sql',
  /** Propostas Etapa 4: política pós-aceite + eventos de integração */
  '121_proposals_etapa4_automation.sql',
  /** Propostas Etapa 5: webhooks outbound, entregas, permissões finas (module_extras) */
  '122_proposals_etapa5_outbound.sql',
  /** Gateway: métodos habilitados + padrão (pix/boleto/credit_card) */
  '124_payment_gateway_payment_methods.sql',
  /** Tenant: logos claro/escuro + endereço comercial (Configurações → Dados da Empresa) */
  '125_tenant_company_branding.sql',
  /** Propostas: lead_id (Kanban chat) + XOR com client_id */
  '126_proposals_lead_id.sql',
  /** Propostas: modelos dedicados (proposal_templates) */
  '128_proposal_templates.sql',
  /** Páginas públicas: funções SQL com logo clara/escura do tenant */
  '127_public_tenant_brand_sql_functions.sql',
  /** Motor Central de Notificações — núcleo mínimo (Fase 2) */
  '129_notifications_engine_core.sql',
  /** Billing: outcome explícito em jobs de recorrência (Etapa 1 observabilidade) */
  '130_billing_recurring_jobs_completion_outcome.sql',
  /** Motor de notificações — retry básico + índices operacionais (Fase 4) */
  '131_notifications_engine_retry_and_ops.sql',
  /** Fase 1 — persistência de horário recorrência/notificação por tenant */
  '137_tenant_billing_recurrence_preferences.sql',
  /** Fase 4 — agendamento inicial outbound (dispatch_not_before) */
  '138_notification_outbound_dispatch_not_before.sql',
  /** Motor de Notificações da PLATAFORMA — núcleo (Fase 2); domínio separado do tenant */
  '139_platform_notifications_engine_core.sql',
  /** Billing: cycle_key canónico YYYY-MM-DD + dedupe legado ISO */
  '140_billing_recurring_jobs_normalize_cycle_key.sql',
  /** Billing: subscription_cycles (Etapa 1) + RLS + flags + backfill idempotente */
  '141_subscription_cycles_phase1.sql',
  /** Motor da PLATAFORMA: trial started/ended + templates revisados */
  '142_platform_notifications_trial_and_template_refresh.sql',
  /** Billing: defaults ativos para flags subscription_cycles_* (painel Super Admin pode desligar) */
  '143_subscription_cycles_superadmin_defaults.sql',
  /** Cobrança SaaS: token público /saas-pay/:token (mesma tenant_billing) */
  '144_tenant_billing_platform_public_pay_token.sql',
  /** Notificação platform.billing.charge.created: merge billing.platform_invoice_url */
  '145_platform_notification_billing_platform_invoice_url.sql',
  /** Plataforma: opção de botão PIX copia e cola no WhatsApp (templates cobrança SaaS) */
  '146_platform_notification_whatsapp_pix_button.sql',
  '147_password_reset_whatsapp.sql',
  '148_tenants_recurring_invoice_generate_days_before_due.sql',
  /** Módulo financeiro Fase 1: contas, categorias, entradas e despesas (tenant-scoped) */
  '149_finance_module_phase1.sql',
  /** Modelo unificado /api/financial: financial_accounts, financial_transactions, expense_categories */
  '150_financial_unified.sql',
  /** Financeiro Fase 2: despesas recorrentes + ocorrências */
  '151_financial_recurring_expenses.sql',
  '152_financial_credit_cards.sql',
  '153_financial_cc_purchase_amount_mode.sql',
  /** Assinaturas CRM: ciclos ilimitados / max_cycles (relatórios e configuração) */
  '154_subscriptions_cycles_config.sql',
  /** Módulo Anúncios / Atualizações (Super Admin → tenants; obrigatório antes de 156_notifications_announcement_entity) */
  '154_announcements_module.sql',
  /** Financeiro: account_scope + transferências internas */
  '155_financial_accounts_scope_and_transfers.sql',
  /** Sininho: notificações de anúncio com entity_id/href (idempotência por user+announcement) */
  '156_notifications_announcement_entity.sql',
  /** Perfil: profiles (avatar, cargo, locale, timezone), tenants extra, user_password_change_codes */
  '157_profile_personal_and_password_change.sql',
  /** Perfil: users.avatar_url (fallback de avatar) */
  '158_users_avatar_url.sql',
  /** Google Calendar: OAuth por utilizador/tenant (tokens cifrados no backend) */
  '159_google_calendar_connections.sql',
  /** Páginas legais públicas (privacidade / termos), editadas pelo Super Admin */
  '160_legal_pages.sql',
  /** Rascunho vs publicado + migração de content_html legado */
  '161_legal_pages_draft_publish.sql',
  /** Contas financeiras ↔ gateway (Asaas, Mercado Pago) + transações automáticas */
  '162_financial_gateway_account_links.sql',
  /** Visibilidade por conta + permissões utilizador/equipa */
  '163_financial_account_visibility.sql',
  /** Google Calendar: colunas opcionais google_name / google_picture (userinfo) */
  '164_google_calendar_oauth_profile.sql',
  /** Módulo Agenda: compromissos, attendees, RLS, permissões e feature "agenda" */
  '165_appointments_module.sql',
  '166_appointment_reminders_log.sql',
  /** Motor de notificações: appointment.invited / appointment.reminder (Agenda → WhatsApp) */
  '167_notifications_appointment_events.sql',
  /** Atualização de textos padrão WhatsApp dos eventos de agenda */
  '168_refresh_appointment_whatsapp_templates.sql',
  /** Pós-compromisso comercial: status done + notas + outcome */
  '169_appointments_post_meeting_followup.sql',
  /** Motor de notificações: appointment.completed (resumo pós-compromisso) */
  '170_notifications_appointment_completed.sql',
  /** Agenda: lembrete 30m + compatibilidade reminder_type (60m/1h) */
  '171_appointment_reminder_types_30m.sql',
  /** Agenda Fase 4.2A: series de recorrencia simples */
  '172_appointments_recurrence_series.sql',
  /** Asaas: metadados para provisionamento automático de webhook por tenant */
  '173_asaas_webhook_auto_config_fields.sql',
  /** CRM: persistência de avatar WhatsApp (clients/leads) */
  '174_whatsapp_avatar_to_clients_leads.sql',
  /** Chat Engine Fase 2: identidade técnica multicanal do contato */
  '175_communication_contacts.sql',
  /** Agenda Fase 4.4: confirmação de presença */
  '176_appointments_attendance_status.sql',
  /** Agenda Fase 4.5: solicitação de confirmação via WhatsApp */
  '177_notifications_appointment_confirmation_request.sql',
  /** Agenda Fase 4.6: link público de confirmação */
  '178_appointments_public_confirmation_link.sql',
  /** Agenda Fase 4.8: logs de automações operacionais */
  '179_appointment_automation_logs.sql',
  /** Mercado Pago: catálogo gateway (Fase 2 OAuth — isolado do Asaas) */
  '180_mercado_pago_gateway_catalog.sql',
  /** Mercado Pago: tabela PKCE (code_verifier) para OAuth */
  '181_mercado_pago_oauth_pkce.sql',
  /** Chat Engine Fase 4: colunas multicanal em conversas/mensagens + índice username em communication_contacts */
  '182_chat_engine_multichannel_phase4.sql',
  /** Agenda Fase 5.1: disponibilidade tenant para remarcação pública */
  '183_appointment_availability_settings.sql',
  /** Agenda Fase 5.2: disponibilidade por utilizador (fallback tenant) */
  '184_appointment_user_availability_settings.sql',
  /** Chat Engine Fase 5: filas, status padronizados, transferências, SLA básico */
  '185_chat_engine_phase5_professional.sql',
  /** Agenda Fase 5.3: bloqueios de indisponibilidade (tenant / utilizador) */
  '186_appointment_availability_blocks.sql',
  /** Chat Engine Fase 6: automação, distribuição, SLA, regras */
  '187_chat_engine_phase6_automation.sql',
  /** Agenda Fase 5.4: feriados e bloqueio automático */
  '188_appointment_holidays.sql',
  /** Chat Engine Fase 7: logs, SLA por fila, regras UI */
  '189_chat_engine_phase7_operational_ui.sql',
  /** Chat Engine Fase 8: chatbot básico (tabela chat_bot_rules) */
  '190_chat_engine_phase8_chatbot.sql',
  /** Agenda Fase 5.7: capacidade por slot (público / mesmo responsável) */
  '191_appointment_capacity_per_slot.sql',
  /** Agenda Fase 5.8: tipos de compromisso (duração padrão / labels) */
  '192_appointment_type_settings.sql',
  /** Chat: resposta citada, comentários internos, notas CRM */
  '193_chat_collaboration.sql',
  '194_crm_notes_source_comment.sql',
  /** Inbox: preencher contact_avatar_url em notificações de chat antigas a partir da conversa */
  '195_notification_chat_contact_avatar_backfill.sql',
  /** Chat: client_message_id + índice único (idempotência outbound) */
  '196_chat_messages_client_message_id.sql',
  /** Chat: colunas de cache local de avatar WhatsApp (catálogo + metadados CDN) */
  '197_whatsapp_avatar_local_cache.sql',
  /** Super Admin: leads/grupos (import CSV) + disparos de anúncio por grupo de leads */
  '198_superadmin_marketing_leads.sql',
  /** WhatsApp Business Platform (Meta Cloud API) — provider whatsapp_official */
  '199_whatsapp_official_meta_cloud.sql',
  '200_whatsapp_official_campaigns_phase3.sql',
  '201_system_feature_flags.sql',
  '202_whatsapp_official_templates_meta_columns.sql',
  '203_asaas_disable_customer_notifications_default.sql',
  '204_admin_script_runs.sql',
  '205_media_assets.sql',
  '206_chat_avatar_cache_worker.sql',
  /** Google Drive: OAuth por tenant + pastas empresa / Clientes no Drive */
  '207_tenant_google_drive_integrations.sql',
  /** Google Drive: pastas por cliente (Arquivos, Contratos, Propostas, Faturas) */
  '208_client_google_drive_folders.sql',
  /** Google Drive: metadados de upload em Cliente > Arquivos */
  '209_client_google_drive_files.sql',
  /** Google Drive: pastas criadas pelo utilizador em Cliente > Arquivos */
  '212_client_google_drive_user_folders.sql',
  '210_uazapi_webhook_instance_secret_hardening.sql',
  '211_chat_conversations_attendance_status_default_fix.sql',
  'create-admin-user.sql',
];

async function main() {
  const config = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'painelcrm',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };

  const adminPool = new pg.Pool({ ...config, database: 'postgres' });
  try {
    await adminPool.query('SELECT 1');
    console.log('Conexão com PostgreSQL OK.');
  } catch (e) {
    console.error('Erro ao conectar no banco. Verifique o .env e se o PostgreSQL está rodando.');
    console.error(e);
    process.exit(1);
  }

  const dbName = config.database;
  const checkDb = await adminPool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );
  if (checkDb.rowCount === 0) {
    console.log(`Criando banco "${dbName}"...`);
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
  }
  await adminPool.end();

  const pool = new pg.Pool(config);
  await runMigrations(pool);
  await pool.end();
  console.log('Migração concluída.');
}

async function runMigrations(pool: pg.Pool) {
  for (const file of order) {
    const filePath = path.join(initDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Pulando ${file} (arquivo não encontrado).`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Executando ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  OK: ${file}`);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : '';
      if (msg.includes('already exists')) {
        // Ex.: tabela/índice/trigger/constraint em reexecução; ver linha se não for o esperado
        const firstLine = msg.split('\n')[0];
        console.log(`  (já existe) ${file}`);
        console.log(`     detalhe: ${firstLine}`);
      } else {
        console.error(`  ERRO em ${file}:`, err.message);
        throw err;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
