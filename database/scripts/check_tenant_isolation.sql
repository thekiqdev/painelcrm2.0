-- =============================================================================
-- Verificação de isolamento multi-tenant (executar no PostgreSQL)
-- Ver: docs/ANALISE-ISOLAMENTO-MULTI-TENANT.md
-- =============================================================================

-- 1) Usuários sem tenant_id
SELECT '1) Usuários sem tenant_id' AS check_name;
SELECT id, email, tenant_id, is_super_admin, created_at
FROM users
WHERE tenant_id IS NULL
ORDER BY created_at DESC;

-- 2.1) Tabelas com tenant_id NOT NULL: linhas com tenant_id NULL (não deveria existir)
SELECT '2.1) Tabelas tenant_id NOT NULL com NULL' AS check_name;
SELECT 'teams' AS tbl, COUNT(*) AS n FROM teams WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_plan', COUNT(*) FROM tenant_plan WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_billing', COUNT(*) FROM tenant_billing WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_feature_overrides', COUNT(*) FROM tenant_feature_overrides WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_admin_notes', COUNT(*) FROM tenant_admin_notes WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_tags', COUNT(*) FROM tenant_tags WHERE tenant_id IS NULL;

-- 2.2) Registros em tabelas user_id cujo dono não tem tenant (órfãos)
SELECT '2.2) Registros órfãos (user_id sem tenant)' AS check_name;
SELECT 'clients' AS tbl, COUNT(*) AS n
FROM clients c
JOIN users u ON u.id = c.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'leads', COUNT(*) FROM leads l JOIN users u ON u.id = l.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'products', COUNT(*) FROM products p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'contracts', COUNT(*) FROM contracts c JOIN users u ON u.id = c.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices i JOIN users u ON u.id = i.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses e JOIN users u ON u.id = e.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'proposals', COUNT(*) FROM proposals p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'tickets', COUNT(*) FROM tickets t JOIN users u ON u.id = t.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'projects', COUNT(*) FROM projects p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks t JOIN users u ON u.id = t.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'message_templates', COUNT(*) FROM message_templates m JOIN users u ON u.id = m.user_id AND u.tenant_id IS NULL;
