# BASF Sales — laboratório visual — design

Data: 2026-10-02. Escopo: refazer o "Dashboard Sales" do portal BASF (`forecast.pbix`, 4 páginas)
como segundo painel do lab `web/basf/`, ao lado do BI Mercado
(`2026-10-01-basf-bi-mercado-design.md`, aprovado). A integração no portal fica com a fase 2 do BI
Mercado.

## Decisões

| Tema | Decisão |
|---|---|
| Relação com o BI Mercado | dashboard separado, menu próprio no portal. A aba Vendas do BI Mercado fica como resumo |
| Código | o mesmo `montarDashboard`, parametrizado por painel (`{ titulo, abas }`). Sem cópia de shell |
| Estrutura | 3 abas: Evolução, Análise, Tabela (as duas tabelas do PBI viram uma, com seletor) |
| Regra de venda | a da fase 1 (BR, sem DUMMY, líquido com devoluções). **Pendente de confirmar com a BASF** |
| RTV | reatribuição BR10→BR02 do PBI aplicada; BR04/BR07 aparecem como "<nome> (ex-RTV)" |
| Volume | `inv_qty_th` (milhares de sementes) |
| € | R$ ÷ taxa do ano da nota (`meta_anual.json`) |
| YTD | corte no mês da última venda, ajustável pelo seletor "Até mês" |
| Forecast | fora de escopo: o PBI não mostra forecast em nenhum visual e `basf_forecast` só tem 2024 |
| Fora de escopo | forecast, export PDF/Excel, integração no portal |

## 1. O que existe hoje (diagnóstico)

`forecast.pbix` lê `basf_vendas` e cadastros do banco `Basf`. Tem 4 páginas, todas de venda:

- **Evolução:** KPIs (vendas ano atual, quantidade, diferença e variação YTD), linhas mensais
  2022→hoje de R$ e de quantidade, acumulado do ano atual × anterior (R$ e quantidade) e barras
  mês × ano (5 anos).
- **Análise:** TH por crop e por FTE, e o TH YTD atual × anterior por crop, cliente e cultivar.
- **Tabela por variedade** (crop ▸ variedade) e **tabela por cliente**, com Sales 2024, 2025 e
  2026 YTD. Os anos estão fixos nas medidas DAX.

O que diverge da regra da fase 1:

- Soma só `order_type` SBB + SDB. Não tira DUMMY nem export e não desconta devolução (RS/RSB). Com
  isso, o PBI bate centavo a centavo com o banco: 2026 YTD R$ 28.989.184 e 2024 R$ 62.619.923.
- Com a regra da fase 1, os valores ficam assim:

  | Ano | PBI (SBB+SDB) | Regra da fase 1 |
  |---|---|---|
  | 2024 | R$ 62,6 Mi | R$ 66,1 Mi |
  | 2025 | R$ 82,6 Mi | R$ 84,2 Mi |
  | 2026 até jun | R$ 28,99 Mi | R$ 29,02 Mi |

  A diferença vem de SOS (~R$ 3 Mi/ano) e SBA, contra devoluções.
- O Power Query troca `primary_contact` BR10 → BR02 quando `kind = 'WMW'` e o cliente é A
  SEMENTEIRA PROD AGR LTDA, NATIVA AGRICOLA LTDA ou NATIVO AGRICOLA LTDA. Isso move R$ 3,1 Mi em
  2025 e R$ 0,75 Mi em 2026.
- O mesmo Power Query exclui Antonio Junior (BR04) e Antônio Pierro (BR07) da tabela de FTE, e a
  venda deles vira "(Em branco)".
- A medida "TH" do PBI soma `inv_qty`, que é número de embalagens, e não TH. Por isso a página
  Análise mostra "Vendas (R$) Ano Atual 56 Mil". A "Quantidade" do PBI (`inv_qty_alt`) é o TH de
  verdade, igual a `inv_qty_th`.
- O € usa o ano do **pedido** e o YTD usa `TODAY()`.
- A taxa do euro está digitada no `.pbix`: 2022 6,44; 2023 5,3; 2024 5,5; 2025 5,775; 2026
  5,775. São as mesmas do `meta_anual.json`.

## 2. Abas

Os mockups aprovados ficaram em `.superpowers/brainstorm/` (fora do git).

**Shell.** É o mesmo do BI Mercado: hero com o título "Vendas" e a data da última venda, abas,
barra de chips e controles à direita.

- Chips: Ano, Crop, Regional, RTV, Cliente.
- Controles: "Até mês", R$/€ e Valor/TH, nas três abas. Na Tabela entram também o seletor
  Variedade/Cliente e a busca.
- Clique numa barra ou num item de ranking vira filtro, e clicar de novo remove.

**Ano de referência** = o maior ano do chip Ano; sem chip, o maior ano com venda. Com ano
fechado, o "YTD" é o ano cheio, como na aba Vendas.

**Evolução**
- KPIs:
  - vendas YTD;
  - volume YTD (TH);
  - diferença contra o YTD anterior;
  - ticket médio (R$ ou € por mil TH).

  Cada KPI tem delta contra o mesmo período do ano anterior.
- Linha mês a mês, de jan/2022 até o último mês com venda, na medida do toggle. Rótulo no pico
  de cada ano e no último ponto.
- Curva do acumulado do ano, atual contra o anterior. Reaproveita o desenho da aba Vendas.
- Barras mês × ano facetadas por mês (`fx`): o ano de referência em laranja e os anteriores em
  `VERDE`, do claro (mais antigo) ao escuro. Abaixo de 640px, só os 3 últimos anos.

**Análise** (sempre YTD contra YTD do ano anterior)
- KPIs:
  - volume;
  - vendas;
  - clientes com compra (distintos, com venda líquida > 0), com delta absoluto;
  - variedades vendidas (distintas, com venda líquida > 0).
- Ranking (`bar-list`) por crop e por RTV, com Δ%. O maior aparece em laranja e o resto em verde.
- Barras pareadas atual × anterior por cliente e por variedade, top 15 pelo ano atual.

**Tabela**
- Seletor Variedade / Cliente e busca por texto (no nome da variedade ou do cliente).
- Variedade: agrupada por crop com subtotal. Grupo recolhível, aberto por padrão.
- Cliente: lista plana.
- Colunas: os 2 anos anteriores fechados, o YTD do ano de referência e a "Var. vs YTD anterior"
  (YTD contra YTD, nunca contra o ano cheio). Linha de total no fim.
- Ordena por qualquer coluna clicando no cabeçalho. A ordem padrão é pelo YTD, decrescente.
- Valores com algarismos tabulares (JetBrains Mono).

## 3. Estrutura

```
web/basf/
  sales.html               preview do Sales (mesmo CSS, entrypoint próprio)
  src/
    dashboard.ts           montarDashboard(host, carregar, painel) → { destruir }
    paineis.ts             MERCADO = { titulo, abas: [...] }, SALES = { titulo, abas: [...] }
    calc.ts                + ticket, distintos, tabelaAnos (puro, testado)
    abas/sales/            evolucao.ts, analise.ts, tabela.ts
    preview.ts             monta MERCADO
    preview-sales.ts       monta SALES
  snapshot/
    vendas.ts              + item_desc no SELECT
    montar.ts              + variedade; RTV por rtvDe()
    normaliza.ts           + rtvDe(cod, nome, cliente, kind) (puro, testado)
    conferir.ts            + âncoras do Sales
```

- `Aba` ganha `evolucao | analise | tabela`. O `Estado` guarda filtros por aba, como hoje, e
  recebe dois campos novos: `tabela` (`variedade | cliente`) e `busca`. A busca fica fora do
  hash.
- Hash com aba que não existe no painel cai na primeira aba do painel.
- Script novo no `package.json`: `dash:basf:sales` (build do `preview-sales.ts`). O
  `dash:basf:serve` serve os dois HTML.

## 4. Contrato de dados

Não há recurso novo. O `vendas` ganha uma coluna:

| Recurso | Grão | Colunas |
|---|---|---|
| `vendas` | ano × mês × crop × **variedade** × RTV × regional × cliente × hotspot × segmento | + `variedade` |
| `meta` | ano | sem mudança (só a taxa é usada pelo Sales) |

- `variedade` = `item_desc` sem o prefixo "SEMENTES ", igual ao PBI.
- O grão maior aumenta o `vendas.json`, que hoje tem 4,6 mil linhas e 503 KB. Medir no snapshot:
  passou de 3 MB, a variedade vai para um recurso próprio (`vendasVariedade`) e o `vendas`
  continua como está.

**RTV** (`rtvDe`), aplicado no snapshot e valendo para os dois dashboards:

- `cod = BR10`, `kind = WMW` e cliente entre os 3 acima → BR02 (Mariana Vieira).
- BR04 / BR07 → `"<nome> (ex-RTV)"`.
- Sem cadastro em `basf_fte` → código; sem código → "Sem RTV", como hoje.
- A regional segue o código já reatribuído.

## 5. Casos de borda

- **Sem denominador:**
  - Δ, ticket e Var. % mostram "—".
  - Variação sobre base < R$ 1 mil também mostra "—".
- **Sem venda no ano:** célula vazia na Tabela, nunca zero. Fora das pareadas quando falta nos
  dois anos.
- **Filtro sem resultado:** estado vazio com o filtro que zerou e "limpar filtros".
- **€ sem taxa do ano:** toggle desabilitado com tooltip, como na aba Vendas.
- **Devolução:**
  - Entra líquida, e um mês negativo desce abaixo de zero na linha mensal.
  - Cliente ou variedade com saldo ≤ 0 não conta nos KPIs de distintos.
- **Rótulos longos** (cliente, variedade): reticências + `title`.
- **Falha de carga:** erro com "tentar de novo" no card.

## 6. Verificação

**Testes** (`bun test`), só funções puras. As seams aprovadas:

1. `deHash(hash, painel)`: aba e filtros vêm do painel; hash com aba fora do painel cai na
   primeira aba (o `montarDashboard` só repassa o painel).
2. `tabelaAnos(linhas, dim, ano, mesCorte)`: crop ▸ variedade com subtotal, colunas dos 2 anos
   anteriores + YTD, e Var. YTD × YTD.
3. `ticket`, `distintos`: "—" sem denominador; saldo ≤ 0 não conta.
4. `rtvDe`: reatribuição só nos 3 clientes com WMW, ex-RTV rotulado, demais intactos.

**Reconciliação** (`snapshot/conferir.ts`), contra o SQL com a regra da fase 1, jan–jun/2026:

| Âncora | Valor |
|---|---|
| Vendas R$ (existente) | 29.022.009,43 |
| Volume TH | 784.944 |
| Σ por RTV = total geral | a reatribuição não perde venda |
| Σ por variedade = total geral | o grão novo não perde venda |

**Visual.** Screenshot headless (Edge) de cada aba em 640, 1024 e 1500px, lido antes de dizer
pronto. A aprovação final do usuário é no navegador.

**Pronto quando:** testes verdes, reconciliação batendo, BI Mercado sem regressão (testes e
screenshot das 4 abas), screenshots sem corte nem sobreposição e OK visual do usuário.

## 7. Pendências para a BASF

- Regra de venda: fase 1 (BR, sem DUMMY, líquido) ou a do PBI (SBB+SDB). Trocar é mudar o
  `WHERE` do `snapshot/vendas.ts`, e vale para os dois dashboards e para o PDF só se o
  `clients/basf` também mudar.
- Rótulo dos ex-RTV (BR04, BR07).
