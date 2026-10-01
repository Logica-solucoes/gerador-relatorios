# BASF BI Mercado — laboratório visual (fase 1) — design

Data: 2026-10-01. Escopo: refazer o "Dashboard BI Mercado" do portal BASF (hoje Power BI
"Publish to web", 11 páginas) como dashboard web em `web/basf/`, no padrão do `web/momentive/`.
Esta spec cobre só o laboratório. A integração no portal é a fase 2, com spec própria.

## Decisões

| Tema | Decisão |
|---|---|
| Destino | web, sem Power BI. O PBI publish-to-web é público por link; sai na fase 2 |
| Padrão | o do Momentive: `montarDashboard`, DOM puro + Observable Plot, CSS escopado sob `.bmd`. Vira componente Aurelia nativo na fase 2, sem iframe |
| Visual | direção "Campo Nunhems": laranja do portal, base creme, sem emoji nem enfeite. Stack em `## UI stack` do `CLAUDE.md` |
| Fontes | Manrope (texto) + JetBrains Mono (números de tabela), algarismos tabulares |
| Estrutura | 4 abas: Mercado, Comparativo, Clientes-chave, Vendas. A capa com botões some |
| Dados de mercado | snapshot das tabelas já transformadas do `.pbix` (`Dashboard Mercado BASF - BANCO.pbix`, as planilhas do zip são a última versão) |
| Dados de vendas | vivos: `basf_vendas`, com as regras de `clients/basf/CLAUDE.md` |
| Budget, forecast, taxa € | `meta_anual.json` no lab; tabela `basf_meta_anual` + importação na fase 2 |
| Plano de Ação | fora de escopo: não existe dado. A ficha do cliente mostra só números |
| Fora de escopo | Dashboard Sales (`forecast.pbix`), export PDF/Excel, formulário de plano |

## 1. O que existe hoje (diagnóstico)

- Menu `core_menu` 89 → rota `pubdash` (`/dash/pub/:idProgram`) → `core_program` 18 →
  `pbiPubReportId` → iframe `app.powerbi.com/view?r=...`. Permissão 58.
- O `.pbix` puxa do banco só `basf_vendas`. Todo o resto vem de planilhas num OneDrive:
  BASF Consolidado, ABCSEM, IBGE, CEPEA, Key Customer List, coordenadas de municípios, ícones e
  os de-para de hotspot, segmento e HY/OP/F2. Nenhuma delas está no banco `Basf`.
- A lógica de negócio está em 35 medidas DAX e 109 colunas calculadas.
- A página Sales do PBI está congelada em 2024: forecast da aba "Vendas 2024" do
  `vendas.xlsx`, budget e forecast anual digitados dentro do `.pbix`.
- O forecast do portal (`vw_basf_forecast_consolidado`) só tem 2024, 96 linhas, em quantidade.
  `basf_preco` tem um único preço: não dá para valorar forecast.

## 2. Abas

Mockups aprovados ficaram em `.superpowers/brainstorm/` (fora do git).

**Hero + abas.** Hero laranja "Inteligência de Mercado · BASF | Nunhems", data da última venda.
Abas logo abaixo.

**Mercado** — substitui as páginas BASF BI, IBGE, ABCSEM, CEPEA.
- Seletor de fonte BASF / IBGE / ABCSEM / CEPEA. Mesmo esqueleto; KPIs e dimensões trocam com a
  fonte. Share e potencial só existem na BASF.
- Barra de filtros em chips: Ano, Regional, Crop, Hotspot, Segmento, RTV (o que a fonte tiver).
  Seletor de métrica: Área (ha) / Dose TH/ha / Total TH (substitui o slicer "Métricas BASF").
- KPIs: share potencial em destaque (tick bar, vendas de potencial), área, Total TH,
  potencial R$ (com €), cada um com delta e sparkline.
- Mapa do Brasil (estados pintados pela métrica, pontos por município com tamanho pela métrica,
  5 maiores rotulados) ao lado do ranking `bar-list` (Estado / Hotspot / Regional / Crop) e da
  composição por segmento (barra 100%).
- Evolução por ano de estudo.

**Comparativo** — substitui Comparativo BASF×ABCSEM e Comparativo Fontes.
- Linhas de área (ou Total TH) por fonte e ano, rótulo no fim de cada linha.
- Última informação de cada fonte com delta contra o ano anterior disponível.
- BASF × ABCSEM por segmento em barras pareadas. Filtros: Espécie, Crop, Segmento, HY/OP/F2.

**Clientes-chave** — substitui Key Customer List, Plan Numbers e Plan Action.
- KPIs: customer share (copa), 80-20, clientes, penetração enxertia.
- Tabela agrupada por Hotspot / RTV / Crop com subtotal (`table-04`). Busca por cliente.
- Clique no cliente expande a ficha na própria linha (`c-data-grid-8`): potencial, vendas BASF,
  espaço a capturar, dose média e tabela por crop. Uma ficha aberta por vez.

**Vendas** — substitui a página Sales, com dados vivos.
- Filtros: período (ano + mês de corte), Crop, RTV, Regional, Cliente. Toggles R$/€ e Valor/TH.
- KPIs: atingimento do forecast anual (barra com marcador do ritmo esperado no mês), vendas
  YTD, volume YTD, budget. Deltas contra o mesmo período do ano anterior.
- Curva acumulada do ano contra o anterior, budget em linha tracejada.
- Por crop e por RTV: barras pareadas ano atual / anterior com variação. Clique filtra a aba.

## 3. Estrutura

```
web/basf/
  index.html            preview: fontes, #app
  snapshot/
    extrair_pbix.py     uv + pbixray → dados/*.json
    vendas.ts           bun + mssql → dados/vendas.json
    conferir.ts         reconciliação; falha = snapshot não sai
    meta_anual.json     budget R$, forecast R$, taxa € por ano (manual)
  dados/                saída do snapshot, fora do git (nome de cliente)
  src/
    types.ts            contrato
    dashboard.ts        montarDashboard(host, carregar) → { destruir }
    estado.ts           estado único + hash
    calc.ts             agregar, share, variacao, atingimento (puro, testado)
    abas/               mercado.ts, comparativo.ts, clientes.ts, vendas.ts
    shared/             cópia retematizada do LogicaDash (formato, filtros, drill, shell, tira)
                        + kpi, bar-list, chips, mapa
    geo/uf.json         malha IBGE de UFs, anéis já corrigidos
    dashboard.css       tudo sob .bmd
    preview.ts
```

Scripts no `package.json`: `dash:basf` (build do preview) e `dash:basf:snapshot`.

`shared/` é cópia, não import do LogicaDash: o lab vive em outro repo. Na fase 2 o `shared/` do
portal Basf nasce desta cópia.

## 4. Contrato de dados

`carregar(fonte)` é o único ponto de troca entre lab e portal. No lab faz `fetch` do JSON; no
portal será o `RequestHelper` chamando o endpoint. Cada fonte é carregada sob demanda e uma vez.

O dashboard filtra e soma. **Não recalcula regra de negócio**: de-paras, hotspot, segmento,
crop, potencial e regional chegam prontos.

| Fonte | Grão | Linhas |
|---|---|---|
| `basf` | ano × município × crop × segmento × RTV: área, dose, TH, potencial R$/€ | ~4,2 mil |
| `ibge` | ano × espécie × município (área > 0) + dimensão de municípios (UF, meso, hotspot, código, lat/lon) | ~60 mil, colunar |
| `abcsem` | ano × espécie × tipo × segmento: volume, área, valor, seed count, uso de sementes | ~1,9 mil |
| `cepea` | ano civil/safra × produto × estado × regional × item: valor (só "Consolidado") | ~7,6 mil |
| `resumo` | fonte × ano × espécie × segmento × HY/OP: área, TH | ~1 mil |
| `clientes` | cliente × crop: key list completa + potencial | ~430 |
| `vendas` | ano × mês × crop × RTV × regional × cliente × hotspot: R$, TH | poucos mil |
| `meta` | ano: budget, forecast, taxa € + data da última venda | ~5 |

**Vendas** seguem `clients/basf/CLAUDE.md`: data da nota (`inv_date`), `cust_name NOT LIKE
'%DUMMY%'`, `ship_to_country = 'BR'`, valor líquido com devoluções, agrupamento por `cust_name`.
RTV pelo `basf_fte` (`cod = primary_contact`). Euro = R$ ÷ taxa do ano.

Os números vão bater com o relatório PDF, não com o PBI atual (2024: PBI R$ 61,2 Mi, banco com
as regras R$ 71,2 Mi). O PBI soma por data do pedido, inclui DUMMY e export, e está desatualizado.

**Share potencial.** Venda do ano civil do estudo ÷ potencial, sob os mesmos filtros. O DAX do
PBI não amarra o ano. Antes de fechar a aba Mercado, conferir se o 17,9% do PBI bate com essa
regra; se não bater, a divergência volta para decisão, não é ajustada em silêncio.

**Mapa.** Casamento município → código IBGE resolvido no snapshot. A malha do IBGE vem com anéis
anti-horários (RFC 7946); o d3 lê como "globo menos o estado" e pinta um quadrado cheio —
`corrigirAneis` inverte uma vez.

## 5. Estado e interação

- Estado único `{ aba, fonte, filtros, metrica, moeda, agrupamento, clienteAberto }`. Toda
  interação muda o estado e redesenha só a aba ativa.
- Filtros por aba (cada aba tem dimensões próprias). Ano é compartilhado entre Mercado e
  Comparativo.
- Clique em gráfico vira filtro (mapa, `bar-list`, barra 100%, barras de Vendas); clicar de novo
  remove.
- Trocar de fonte descarta o filtro que não existe nela e avisa ("RTV não se aplica a IBGE").
- Drill no ranking: estado → hotspots, com "voltar" (`criarDrill` do `shared/`).
- Estado na URL (`#mercado?fonte=ibge&ano=2024`): link copiável, voltar do navegador funciona.
  No Aurelia o hash é do router — vira query da rota na fase 2.
- Responsivo pelo container (`ResizeObserver`). Abaixo de 640px uma coluna, mapa abaixo do
  ranking. Gráfico só desenha com largura real (bug do Momentive `72bb0e9`).
- Só transições CSS. Skeleton no formato do card enquanto a fonte carrega.

## 6. Casos de borda

O dado aparece como é; o buraco aparece como buraco. Ruído documentado se limpa no snapshot;
dúvida vai para a lista de pendências do snapshot, devolvida ao usuário.

- **Furo de série.** BASF não tem estudo 2021–2023: linha quebrada, nota no card. Delta da BASF
  compara com o último estudo existente e diz qual. Fonte sem o ano filtrado: "sem dado para
  <ano>", nunca zero.
- **Filtro sem resultado.** Estado vazio com o filtro que zerou e "limpar filtros".
- **Sem denominador.** Share, dose, atingimento e variação mostram "—". Variação sobre base
  < R$ 1 mil também.
- **Negativos.** Devolução entra líquida; mês negativo desce a curva acumulada.
- **Grafias duplicadas** (`MONTE ALTO` / `MONTEALTO`…): de-para explícito no snapshot, com lista
  do que unificou.
- **Município sem código IBGE:** soma nos totais, fica fora do mapa, entra nas pendências.
- **"DIVERSOS"**: selo "genérico", conta nos totais.
- **Crop com área zero:** some dos rankings, segue no filtro.
- **Meta ausente para o ano:** budget, forecast e atingimento mostram "meta não cadastrada"; €
  desabilitado com tooltip. Vendas em R$ seguem.
- **Falha de carga de uma fonte:** erro com "tentar de novo" no card; o resto segue funcionando.
- **Rótulos longos:** reticências + `title`. Rótulos de mapa e de fim de linha com afastamento
  anti-colisão (`dx`/`dy` são constantes no Plot: deslocar com marcas separadas).

## 7. Verificação

**Testes** (`bun test`), só funções puras. Seams:

1. `agregar(linhas, filtros, dimensão, métrica)`
2. `share`, `variacao`, `atingimento` — "—" sem denominador, base mínima
3. `aplicarFiltros` + troca de fonte — descarta e avisa
4. `estado ⇄ hash` — ida e volta sem perda
5. snapshot: de-para de grafias e município → código IBGE, listando os sem código
6. `corrigirAneis(geojson)` — cada UF com área menor que meio globo

**Reconciliação** (`snapshot/conferir.ts`), contra o PBI:

| Âncora | Valor |
|---|---|
| BASF 2024 — área semeio | 111.587 ha |
| BASF 2024 — Total TH | 34.348.416 |
| BASF 2024 — potencial | R$ 342,6 Mi |
| ABCSEM 2024 — área | 397.125 ha |
| IBGE 2024 — área (BR) | 232.102 ha |
| Key list — customer share copa | 18,9% |

Vendas reconciliam com SQL: YTD jan–jun 2026, BR, sem DUMMY = R$ 29.022.009,43.

**Visual.** Screenshot headless (Edge) de cada aba em 640, 1024 e 1500px, lido antes de dizer
pronto. Aprovação final do usuário no navegador.

**Pronto quando:** testes verdes, reconciliação batendo, screenshots sem corte nem sobreposição,
OK visual do usuário.

## 8. Fase 2 (fora desta spec, registrado para não perder)

- Tabelas no banco `Basf` para ABCSEM, IBGE, CEPEA, BASF Consolidado, Key Customer List, os
  de-para e `basf_meta_anual`, alimentadas pela Importação do portal (`etl_mapping`). Reproduzir
  o Power Query em SQL; o snapshot da fase 1 é o gabarito.
- Endpoints .NET com `[CoreAuthorize]` na permissão 58, `skipResolveRefs` no front (lição do
  Momentive).
- Componente Aurelia no `LogicaBasfFront`, registrado em `includes.ts`; rota nova em
  `core_route`; menu 89 apontando para ela; desligar o publish-to-web.
- Portal Basf roda em .NET 6 via `mise exec -- dotnet`, com as variáveis do
  `.vscode/launch.json`; o dev server do front não tem proxy para a API.
