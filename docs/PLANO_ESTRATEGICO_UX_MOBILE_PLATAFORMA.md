# Plano Estrategico de UX Mobile da Plataforma (Versao Final Refinada)

## 1. RESUMO EXECUTIVO ATUALIZADO

Direcao aprovada e refinada:

- navegacao mobile em camadas (bottom nav curta + sheet "Mais");
- home mobile com foco em acao operacional;
- chat como fluxo-referencia "app-like" (lista -> conversa);
- padrao transversal lista -> detalhe para modulos densos;
- remocao de "Planos" do menu mobile principal.

Objetivo da 1a onda: **entregar base de navegacao e usabilidade real**, sem abrir escopo para redesign amplo.

---

## 2. DECISOES FECHADAS DA PRIMEIRA RODADA

## 2.1 Escopo que ENTRA na 1a rodada

1. Navegacao mobile principal (bottom nav + "Mais").
2. Remocao de "Planos" do menu principal mobile.
3. Curadoria e agrupamento final do sheet "Mais".
4. Home mobile como dashboard operacional com atalhos uteis antes de analytics profunda.
5. Padrao de filtros em sheet para modulos densos.
6. Direcao de chat em duas telas (lista -> conversa), com definicao funcional fechada.

## 2.2 Escopo que FICA FORA da 1a rodada

1. FAB global como decisao padrao.
2. Microanimacoes avancadas.
3. Redesign profundo simultaneo de todos os modulos.
4. Refatoracoes visuais grandes em modulos secundarios.

Observacao: FAB pode voltar na 2a onda se houver evidencias de ganho real apos estabilizacao da base.

---

## 3. NAVEGACAO MOBILE PRINCIPAL DEFINITIVA

## 3.1 Bottom navigation final (camada principal)

1. **Inicio**
2. **Clientes**
3. **Cobrancas**
4. **Chat**
5. **Mais**

## 3.2 Decisao final: "Financeiro" vs "Cobrancas"

### DECISAO FECHADA: usar **"Cobrancas"** no menu principal mobile.

Justificativa objetiva:

- o uso mobile tende a ser mais operacional e transacional (ver status, vencimento, gerar/acompanhar cobranca);
- "Cobrancas" comunica acao imediata melhor que "Financeiro";
- "Financeiro" permanece como dominio mais amplo dentro do "Mais", sem ocupar o slot principal.

Resumo da regra:
- principal = linguagem de tarefa direta;
- secundario = visao ampla/modular.

---

## 4. ESTRUTURA FINAL DO "MAIS"

Objetivo: impedir que o "Mais" vire uma segunda sidebar desorganizada.

## 4.1 Agrupamento recomendado

### Comercial
- Propostas
- Contratos
- Funil (quando habilitado)

### Operacao
- Financeiro (resumo geral/modulo completo)
- Assinaturas
- Tarefas
- Projetos
- Suporte (tickets)

### Conta e sistema
- Configuracoes
- Integracoes (WhatsApp/pagamentos quando aplicavel)
- Administracao (somente perfis elegiveis)
- Sair

## 4.2 Regras de exibicao

- "Planos" fora do menu principal mobile.
- Itens administrativos exibidos somente por permissao/perfil.
- Itens tecnicos de baixa frequencia sempre secundarios.

---

## 5. CHAT COMO FLUXO MOBILE PRIORITARIO

## 5.1 Decisao estrutural (fechada)

O Chat sera o **primeiro fluxo app-like prioritario** e referencia para os demais modulos densos.

Modelo final:

- **Tela A - Conversas**: busca, filtros compactos, lista com badges.
- **Tela B - Conversa**: historico em tela propria, foco total na comunicacao.

## 5.2 Padrao funcional do chat (1a onda)

- header simplificado (nome, estado, 2-3 acoes primarias);
- acoes secundarias em menu (nao poluir header);
- composer com auto-grow (1 linha ate limite de 5-6 linhas);
- anexos acessiveis sem aumentar friccao;
- area de digitacao confortavel para uso continuo.

Esse fluxo vira referencia de UX para CRM, cobrancas e contratos no mobile.

---

## 6. PADRAO TRANSVERSAL DE PAGINA MOBILE

Padrao obrigatorio para paginas densas:

1. **lista primeiro**;
2. **detalhe em tela separada**;
3. **filtros em sheet**;
4. **acoes secundarias em menu/sheet**;
5. **cards no lugar de tabela quando fizer sentido**.

Regras adicionais:

- evitar abrir dialogs grandes como experiencia principal no mobile;
- priorizar leitura rapida e toque unico para acao principal;
- preservar desktop sem regressao.

---

## 7. HOME MOBILE COM CARA DE APP (DECISAO FECHADA)

A home mobile e o **dashboard operacional mobile**.

Hierarquia obrigatoria:

1. Atalhos reais (acoes do dia a dia);
2. Indicadores essenciais;
3. Alertas operacionais;
4. Analytics mais profunda.

Diretriz-chave:

- a "cara de app" vem da combinacao navegacao + home orientada a acao;
- nao vem de launcher gigante de icones.

---

## 8. ORDEM DE PRIORIZACAO DOS MODULOS (FINAL)

1. **Navegacao / base mobile**  
   (bottom nav, "Mais", remocao de Planos, padrao de filtro em sheet)

2. **Chat**  
   (fluxo referencia lista -> conversa + composer adequado)

3. **Clientes / CRM**  
   (lista em cards + detalhe separado)

4. **Cobrancas / Financeiro**  
   (entrada operacional por cobrancas + expansao para financeiro no "Mais")

5. **Propostas / Contratos**  
   (padrao lista/detalhe + filtros em sheet)

6. **Configuracoes**  
   (organizacao mobile por blocos de tarefa)

Justificativa: segue frequencia de uso, impacto operacional e risco de regressao.

---

## 9. QUICK WINS AJUSTADOS

1. Remover "Planos" do menu mobile principal.
2. Trancar menu principal em: Inicio, Clientes, Cobrancas, Chat, Mais.
3. Curar "Mais" em 3 grupos (Comercial, Operacao, Conta e sistema).
4. Padronizar filtros em sheet nos modulos mais densos.
5. Definir e aplicar chat lista->conversa como referencia.
6. Reordenar Home mobile para acao primeiro, analise depois.

Nao entram como quick win da 1a onda:
- FAB global;
- animacoes avancadas;
- redesign amplo simultaneo.

---

## 10. PLANO DE EVOLUCAO REVISADO

## Fase 0 - Aprovacao final (agora)

- validar este plano refinado;
- alinhar KPIs de sucesso da 1a onda:
  - toques ate tarefa principal;
  - tempo para abrir conversa;
  - tempo para gerar/acompanhar cobranca.

## Fase 1 - Base mobile (1a onda, escopo fechado)

- navegação principal final (com "Cobrancas");
- estrutura e curadoria do "Mais";
- remocao de "Planos" do principal;
- home mobile operacional com atalhos;
- padrao de filtro em sheet;
- especificacao funcional do chat 2 telas pronta para execucao.

## Fase 2 - Execucao dos fluxos criticos

- implementar chat 2 telas + composer robusto;
- aplicar padrao lista/detalhe em CRM;
- aplicar padrao em cobrancas/financeiro operacional.

## Fase 3 - Expansao controlada

- propostas/contratos no mesmo padrao transversal;
- configuracoes mobile por blocos;
- ajustes de estados vazios e acessibilidade.

## Fase 4 - Otimizacao orientada por dados

- telemetria de uso mobile;
- ajuste fino de itens do "Mais" por perfil;
- avaliar se FAB traz ganho real (somente se dados justificarem).

---

## Recomendacao final

Para esta plataforma, a melhor estrutura mobile na 1a onda e:

1. bottom nav curta com **Cobrancas** (nao Financeiro);
2. "Mais" curado e agrupado;
3. home operacional com atalhos reais;
4. chat como fluxo referencia app-like;
5. padrao transversal lista -> detalhe + filtros em sheet.

Isso entrega modernidade com eficiencia operacional, sem virar launcher de icones e sem quebrar desktop.

