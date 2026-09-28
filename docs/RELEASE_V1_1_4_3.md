# Atualização da Plataforma — v1.1.4.3

## Resumo

Esta versão reforça o **módulo Agenda** com **vistas de calendário reais** (semana e mês) além da **lista** existente, reorganiza a **navegação lateral** (relação com clientes, faturamento e acesso à Agenda), melhora **contas financeiras unificadas** com **filtros por âmbito e tipo**, e inclui evoluções em **plano/assinatura (Meu Plano)**, **Chat** e **atalhos mobile**. A página `Agenda` passa a importar a implementação modular em `src/pages/agenda/`.

---

## Novidades

- **Agenda — Fase 2 (calendário real)**  
  - Seletor de vista: **Lista**, **Semana**, **Mês**.  
  - **Semana**: grelha com horários (ex.: 07:00–22:00), eventos posicionados, destaque do dia actual, no **desktop**; no **telemóvel** lista por dia (sem grelha larga).  
  - **Mês**: grelha com dias fora do mês discretos, até 3 compromissos por dia e “+N compromissos”, com opção de abrir o dia em **lista** filtrada.  
  - Barra com **Hoje**, **Anterior** e **Próximo** e título do período nas vistas calendário.  
  - Clique em evento abre o painel de detalhe/edição; clique em slot/dia vazio abre **novo compromisso** com data/hora sugeridas.  
  - **Filtros** (responsável, status, tipo) aplicam-se a todas as vistas; pedidos à API usam **apenas o intervalo de datas visível** (melhor desempenho).  
  - **Google / Meet** mantidos (badges e ligações conforme o registo).

- **Navegação (menu lateral)**  
  - Grupo **Relacionamento** (inclui **Agenda** quando o módulo está activo).  
  - Grupo **Faturamento** com faturas, cobranças e assinaturas, separado para melhor leitura.  
  - Ajustes alinhados ao `AppLayout` e `sidebar`.

- **Finanças — Contas (unificado)**  
  - Filtros adicionais por **âmbito** (ex.: empresarial / pessoal) e **tipo** de conta, com experiência clara em desktop e mobile.

---

## Melhorias

- **Meu Plano**: reorganização e refinamento do ecrã de plano/assinatura e estados associados.  
- **Chat**: ajustes de layout e fluxo (redução de complexidade e consistência com o restante painel).  
- **Novo contrato** e **atalhos “mais” no mobile** (`mobileMoreQuickAccess`): pequenos alinhamentos.  
- **Componentes de UI** partilhados (sidebar) coerentes com a nova estrutura de menu.

---

## Impacto para o utilizador

- **Agenda** passa a funcionar como calendário operacional (semana/mês), mantendo a lista para quem preferir.  
- **Menu** mais lógico: relação com clientes e **agenda** de um lado; **cobrança e faturação** noutro bloco.  
- **Contas financeiras** mais fáceis de filtrar quando há muitas contas (empresa vs. pessoal, tipo).  
- **Plano e chat** com experiência mais estável e previsível.

---

## Observações técnicas

- **Sem alteração obrigatória de base de dados** para a parte Agenda descrita; seguir sempre o processo de deploy e migrações do vosso ambiente.  
- Não publicar ficheiros `.env` nem credenciais. O branch de deploy não deve incluir alterações locais de `.env`.

---

## Texto para backlog / notícia do site (sugestão)

**Título:** Lançamento v1.1.4.3 — Agenda com calendário, menu e finanças

**Corpo (curto):**

> O PainelCRM actualiza-se para a **v1.1.4.3** com **Agenda em calendário** (vistas de semana e mês, além da lista), **menu lateral** repensado (Relacionamento com Agenda, bloco de Faturamento) e **filtros extra nas contas financeiras** (âmbito e tipo). Inclui melhorias em **Meu Plano**, **Chat** e mobile. Recomendamos testar a Agenda e a organização do menu após o deploy.

---

## Texto WhatsApp — clientes (copiar e colar)

```
🚀 *Atualização do PainelCRM — v1.1.4.3*

Olá! Trazemos novidades importantes:

✅ *Agenda* — Além da lista, agora pode ver a *semana* e o *mês* em *calendário real*, com navegação por período e o mesmo *filtro* de sempre (responsável, estado, tipo). *Google* e *Meet* mantêm-se quando aplicável.

✅ *Menu* — *Relacionamento* (incluindo *Agenda*) e *Faturamento* (faturas, cobranças, assinaturas) mais *claros* e fáceis de encontrar.

✅ *Contas (finanças)* — *Filtros* por *âmbito* (ex.: empresarial/pessoal) e *tipo* de conta.

✅ *Plano* e *Chat* — *Melhorias* de experiência e estabilidade.

Qualquer dúvida, estamos à disposição.

— *Equipa [nome da empresa]*
```

*(Personalize o nome da empresa antes de enviar.)*

---

*Documento de release **v1.1.4.3** — branch `deploy-v1.1.4.3`.*
