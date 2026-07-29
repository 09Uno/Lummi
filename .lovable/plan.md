
# Lummi Insight — melhorias no relatório de inteligência

## 1. Mockup DRZ embutido no prompt
Em `src/lib/intelligence-report.functions.ts`, adicionar uma seção `[EXEMPLO DE RELATÓRIO PERFEITO]` ao `PROMPT_TEMPLATE`, com um JSON completo da **DRZ Corporation** exatamente no mesmo shape do `[FORMATO DE SAÍDA]`. Campos preenchidos com o dossiê fornecido pelo usuário (CNPJ 03.873.532/0001-21, sede R. Cláudio Soares 72 Pinheiros SP, 51-200 funcionários via LinkedIn, produtos Smart Data Hub / Insights / Governance / AI Platform etc., maturidade "Inexistente", divergências marcadas com ⚠️, `attentionPoints` alertando ausência de RH público). Instrução explícita: "Use como referência de estrutura e nível de rigor. NÃO copie os valores; produza um relatório equivalente para a empresa solicitada."

## 2. Abrir relatório em nova aba imediatamente
Em `src/routes/_authenticated/prospeccao.tsx` (`onIntelligence`, ~L538): hoje só chamamos `window.open` depois que a server function retorna, o que trava o botão e, em alguns navegadores, o popup é bloqueado por não estar em gesture direto do usuário. Corrigir:
- Abrir `window.open("/inteligencia/relatorio?pending=<empresa>", "_blank")` **antes** do `await` (no gesto do clique) e guardar a referência.
- Disparar a geração em background; ao receber `res.id`, atualizar a URL da aba aberta via `win.location.replace('/inteligencia/relatorio?id=…')`.
- Criar loading state em `src/routes/_authenticated/inteligencia/relatorio.tsx` que aceita `?pending=<empresa>` e mostra spinner "Gerando dossiê…" até `id` chegar (ou o usuário pode simplesmente fechar).
- Alternativa mais simples se a UX for aceita: a nova aba mostra tela de "Gerando…" e chama `generateIntelligenceReport` ela mesma via `search={{ pending: empresa }}`, deixando a lista de leads intacta e removendo a dependência de gesto.

Escolho a segunda: mover a chamada `generateIntelligenceReport` para dentro da rota `/inteligencia/relatorio` quando vier `?pending=<empresa>`. `onIntelligence` só abre a nova aba com esse search param — nenhum await, botão volta ao normal imediatamente, popup não é bloqueado.

## 3. Web search + validação de CNPJ + divergências de sede
Gemini suporta `tools: [{ google_search: {} }]`. Ampliar `callGemini` (`src/lib/ai-gateway.server.ts`) com um flag `enableWebSearch` que injeta `tools: [{ googleSearch: {} }]` no body. Usar apenas na chamada do relatório (leads permanece sem search para não subir custo).

No prompt (`intelligence-report.functions.ts`):
- Bloco `[USO DE WEB SEARCH — OBRIGATÓRIO]` instruindo o modelo a executar buscas para (a) notícias recentes, (b) CNPJ em fontes confiáveis (Receita Federal, Casa dos Dados, Econodata, CNPJ.biz), (c) endereço da sede — trazendo **todas** as fontes encontradas.
- Novos campos no JSON de saída:
  - `cnpjSources: [{ cnpj, source, url }]` (lista, não um único)
  - `headquartersSources: [{ address, source, url }]`
  - `headquartersDivergence: boolean` + `headquartersNote: string` quando fontes conflitarem.
- Regra explícita: se nenhuma fonte pública confirmar, retornar `"CNPJ não encontrado"` — proibido inventar.

Validação server-side em `intelligence-report.functions.ts`:
- Adicionar `validateCnpj(str)` (algoritmo padrão de dígitos verificadores, mod 11).
- Após `extractJson`, para cada CNPJ retornado (campo `cnpj` + `cnpjSources[]`) validar; CNPJs inválidos são descartados e substituídos por `"CNPJ não encontrado"`, com nota adicionada em `attentionPoints`.
- `mapAiToReport` em `src/lib/lummi-data.ts` passa a expor os novos campos; `ReportView` (seção "Pontos de Atenção" ou header) renderiza divergência de sede com ícone de alerta e lista as fontes conflitantes.

## 4. Mais espaço para triangulação
Em `callGemini`, adicionar suporte a `generationConfig.maxOutputTokens` (default hoje: sem valor). Passar `maxOutputTokens: 8192` na chamada do relatório. Como o Gemini via REST usa `tools` para busca (não `max_uses`), documentar que o próprio modelo decide quantas queries fazer — nossa alavanca real é (a) instruir no prompt "faça pelo menos 4 buscas independentes: notícias, CNPJ, sede, benefícios" e (b) subir `maxOutputTokens`. Temperature permanece 0.1.

## Detalhes técnicos

Arquivos tocados:
- `src/lib/ai-gateway.server.ts` — flag `enableWebSearch`, `maxOutputTokens`.
- `src/lib/intelligence-report.functions.ts` — prompt DRZ + web search + novos campos + `validateCnpj`; chamada usa `enableWebSearch: true, maxOutputTokens: 8192`.
- `src/lib/lummi-data.ts` — extender `CompanyReport` com `cnpjSources`, `headquartersSources`, `headquartersDivergence`, `headquartersNote`; mapper preenche.
- `src/components/intelligence/ReportView.tsx` — renderizar fontes de CNPJ, divergência de sede.
- `src/routes/_authenticated/prospeccao.tsx` — `onIntelligence` apenas abre nova aba com `?pending=<empresa>`.
- `src/routes/_authenticated/inteligencia/relatorio.tsx` — aceitar `?pending`, chamar `generateIntelligenceReport` na própria aba e navegar para `?id=` ao concluir.

Não altera identidade visual, arquitetura, tabelas do Supabase, nem substitui bibliotecas.
