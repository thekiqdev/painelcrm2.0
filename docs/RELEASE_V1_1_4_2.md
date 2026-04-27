# Atualização da Plataforma — v1.1.4.2

## Resumo

Esta versão consolida o **hub único de Contas a pagar** (unificação com o antigo ecrã “Despesas”), **correcções no histórico de despesas pagas por período**, **perfil pessoal e segurança** (palavra-passe, dados, avatar), **integração opcional com Google Calendar**, **páginas legais** (termos/privacidade) com gestão em SuperAdmin e versão pública, **pesquisa global** no painel, **atalhos rápidos mobile** personalizáveis, e várias **melhorias de UX mobile e financeiro** (chat, clientes, leads, listagens comerciais, contratos, propostas, faturas, cartões de crédito). Inclui migrações de base de dados e reforços de sanitização e rotas públicas.

---

## Novidades

- **Financeiro — Contas a pagar (hub único)**  
  Uma só área operacional para avulsas, recorrências, fila de vencimentos, histórico de **pagas no período** e cadastro de avulsas. A rota antiga `/finance/expenses` redirecciona para **Contas a pagar** (compatibilidade com links guardados). Período principal (Hoje / Semana / Mês / Personalizado) no topo; filtros da secção refinam listas e indicadores.

- **Histórico “pagas no período”**  
  Critérios alinhados à **data de pagamento** (recorrentes e avulsas), em coordenação com o backend (`financialPayablesService`), para o histórico corresponder ao período seleccionado.

- **Perfil pessoal**  
  Dados pessoais, alteração de palavra-passe com sessão activa, e suporte a **avatar** (quando configurado no ambiente).

- **Google Calendar (opcional)**  
  Ligação de conta para sincronização/agenda conforme configuração do servidor.

- **Páginas legais**  
  Publicação de termos/políticas com versão **rascunho / publicado**, área SuperAdmin dedicada e páginas públicas institucionais.

- **Pesquisa global**  
  Painel de pesquisa unificada por entidades relevantes do CRM (comandos e atalhos alinhados ao layout).

- **Atalhos rápidos no telemóvel**  
  Grelha personalizável de acesso rápido (preferências persistidas), com defaults ajustáveis.

---

## Melhorias

- **Financeiro**: rotas e serviços de recorrências e movimentos; experiência mobile com barra inferior contextual em fluxos financeiros.
- **Layout e navegação**: `AppLayout`, `SettingsLayout`, `SuperAdminLayout`; refinamentos em componentes UI (popover, select, dropdown, sonner, command).
- **Chat, Dashboard, Clientes, Leads, Contratos, Propostas, Faturas, Tarefas, Tickets, Assinaturas**: ajustes de listagens, filtros, cabeçalhos mobile e consistência visual.
- **Catálogo / media**: uploads e rotas alinhadas ao serviço de media.
- **Segurança de conteúdo**: sanitização reforçada onde aplicável (HTML legal, inputs sensíveis).

---

## Correções

- **Contas a pagar**: listagem e resumo coerentes com **pagamentos no período** e filtros secundários (evita histórico vazio indevido quando o estado operacional por defeito é “não pagos”).
- **Rotas e redirects**: `recurring-expenses` e links internos apontam para **Contas a pagar** com âncoras correctas.

---

## Impacto para o utilizador

- Menos duplicidade entre “Despesas” e “Contas a pagar”: **um só sítio** para gerir o que vence, o que já pagou no período e as regras recorrentes.
- **Perfil** mais completo e seguro (palavra-passe sem depender de fluxo externo, quando disponível).
- **Empresa** pode cumprir melhor **informação legal** no site/app com versões controladas.
- **Pesquisa** mais rápida para encontrar registos no dia a dia.
- **Telemóvel**: menos fricção em finanças, listas comerciais e navegação.

---

## Observações técnicas

- Executar **migrações Supabase** e scripts em `database/init` **em ordem** nos ambientes de deploy (perfil, avatar, mobile quick access, legal pages, etc.).
- Variáveis de ambiente: **Google Calendar**, **páginas legais** e políticas de avatar conforme documentação interna (`PERFIL_PESSOAL_E_NEGOCIO.md` e ficheiros de config no backend).
- Não commitar `.env` nem credenciais.

---

## Texto WhatsApp — clientes (copiar e colar)

```
🚀 *Atualização da plataforma — v1.1.4.2*

Bom dia! Trazemos melhorias importantes no vosso painel:

✅ *Finanças* — Tudo o que é *contas a pagar* (despesas avulsas, recorrentes, o que vence e o que já pagaram no período) passa a estar *num único sítio*, mais claro e fácil de usar.

✅ *Histórico de pagamentos* — A lista de *despesas já pagas* respeita melhor o *período* que escolhem (mês, semana, etc.).

✅ *Perfil* — *Dados pessoais*, *palavra-passe* e *foto de perfil* (quando activo) com mais controlo e segurança.

✅ *Pesquisa* — *Pesquisa global* no painel para encontrar mais depressa o que precisam.

✅ *Mobile* — *Atalhos rápidos* personalizáveis e refinamentos em ecrãs comerciais e financeiros.

✅ *Legal* — Páginas de *termos/privacidade* com gestão por versões (onde aplicável ao vosso site).

👉 Recomendamos explorar sobretudo *Financeiro → Contas a pagar* e o *Perfil*.

Qualquer dúvida, estamos por aqui!

— Equipa [Nome da empresa]
```

*(Personalize “Equipa [Nome da empresa]” antes de enviar.)*

---

*Documento gerado para release **v1.1.4.2** — branch `deploy-v1.1.4.2`.*
