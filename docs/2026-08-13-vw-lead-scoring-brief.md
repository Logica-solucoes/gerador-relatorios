# Brief de descoberta — cliente `vw` (Lead Scoring Volkswagen)

Fase 4 do `NOVO_CLIENTE.md`. **Precisa de aprovação explícita antes de qualquer código.**

## 1. Insumos

`clients/vw/_intake/` (gitignored) recebe só 4 arquivos da pasta `Lead Score/` — não a pasta
inteira (~2 GB de CSV/XLSX que o relatório não usa):

| Arquivo | Papel |
|---|---|
| `modelo_base.json` | Modelo principal — métricas, faixas OOT, importância, drill-down |
| `modelo_campanha.json` | Experimento de mídia — modelos A e B no mesmo subconjunto |
| `metodologia-modelo.md` | Fonte do capítulo de metodologia |
| `dicionario-dados.md` | Fonte da tabela de colunas disponíveis |

Sem banco de dados: `conectar()` devolve `null`, `carregar()` lê os dois JSONs do disco.

## 2. Regras de negócio levantadas

| # | Regra | Origem |
|---|---|---|
| R1 | **Dois modelos independentes.** `modelo_base` (base inteira, com Optuna) e `modelo_campanha` (16,4% da base, sem tuning) não são comparáveis entre si. A e B **são** comparáveis entre si. | Prompt + `aviso` no JSON |
| R2 | **Base = `report1783970681632`**, 1.504.960 linhas limpas, 2022-01-01 → 2026-07-13. O "~41%" da `metodologia-modelo.md` está **desatualizado** — o correto é 16,4% (246.143 / 1.504.960). Vou corrigir o .md junto. | Confirmado pelo humano |
| R3 | **Faixas de score = conjunto OOT** nos dois modelos (`faixas_oot` no notebook 03, `tabela_faixas(y_oot, …)` no 04). Rotular assim em todo gráfico. | Verificado no notebook |
| R4 | **Meta do projeto: Recall@30% ≥ 60%.** OOT deu 59,63% → narrativa "praticamente na meta", com o número exato e a linha de meta visíveis no gráfico. | Decisão do humano |
| R5 | **Nomes de concessionária e grupo aparecem nominalmente** (Andreta, Baviera, Luson…), grupo e nome fantasia. | Decisão do humano |
| R6 | **Público: time técnico/marketing VW.** Pode usar AUC/KS/Recall com definição curta, sem tratar como leigo. Tom de venda do projeto — mostrar efetividade. | Decisão do humano |
| R7 | Identificadores puros (`ID principal`, `DN`, `Versão`, `Satélite`) nunca entram como feature — só rastreabilidade e drill-down. | `metodologia-modelo.md` |

## 3. Três problemas nos dados que mudam o desenho

**(a) "Distribuição do volume por faixa" é uniforme por construção.** Os decis têm 7.571
leads cada (2.646 no campanha) — por definição, 10% cada. Um gráfico de volume por faixa é
uma barra reta e não diz nada. Proposta: trocar por **curva de ganho acumulado** (x = % da
base contactada, y = % das conversões capturadas, diagonal = discagem aleatória). É o
gráfico que vende o projeto, e ele bate exatamente com o Recall@30%:

| % da base | Conversões capturadas | Aleatório |
|---|---|---|
| 10% | 31,4% | 10% |
| 20% | 47,6% | 20% |
| **30%** | **59,6%** ← Recall@30% | 30% |

O volume por faixa vira uma coluna da tabela de faixas, não um gráfico.

**(b) `FamilyProduct` → `Descrição do Veículo` tem nomenclatura suja.** No modelo base o top
10 traz "Taos", "TAOS", "Taos Highline!Automática de 8 velocidades…" como valores distintos —
5 dos 10 são variações de Taos. No campanha convive `T-Cross` com `tcross-highline`.
Proposta: truncar o rótulo (`curto()`) e **tratar isso como achado do relatório**, não
esconder — cadastro inconsistente de produto é informação útil pro time. Uma linha de nota
abaixo do gráfico.

**(c) `Sub Origem` do experimento de campanha só tem 3 valores** (WhatsApp, Blindados,
"Estou interessado") contra 10 no modelo base — o subconjunto com atribuição de mídia é
pouco diverso em canal. Proposta: mostrar os 3 e dizer por quê, em vez de fingir um top 10.

## 4. Estrutura proposta — 11 páginas

| # | Página | Gráficos / KPIs | Narrativa que sustenta |
|---|---|---|---|
| 1 | **Capa** | — | Título, período, volume da base, índice, callout R1 (dois modelos) |
| 2 | **Sumário executivo** | 4 KPIs (AUC OOT, KS OOT, Recall@30% vs meta, lift faixa 1÷faixa 10) + curva de ganho acumulado (grande) | "Ligando só pros 30% mais quentes o time captura 59,6% das vendas" |
| 3 | **A base** | Barra do split temporal (treino / OOS / OOT / maturação) + tabela das 25 colunas por grupo (identificação, brutas, datas, engineered, target) | Período, volume, taxa de conversão geral 10,26% |
| 4 | **Metodologia** | — (prosa + callouts) | LightGBM+Optuna, por que o split é temporal e não aleatório, o que é maturação, definição de AUC/KS/Recall@30%, gain vs SHAP |
| 5 | **Qualidade do modelo** | Barras agrupadas: AUC, KS, Recall@30% × treino/OOS/OOT | Gap treino→OOT pequeno (AUC 0,777→0,722) = modelo estável, não decorou |
| 6 | **Faixas de score** | Barras de taxa de conversão por decil + linha da média geral; tabela volume/conversões/taxa/lift | Faixa 1 converte 26,2% vs 1,7% da faixa 10 → **15,5× mais** |
| 7 | **Variáveis mais importantes** | Barras horizontais de importância relativa + curva de importância acumulada | 5 variáveis = 68% do modelo; histórico da concessionária é a #1 |
| 8 | **Zoom nas variáveis** | 3 gráficos divergentes (positivo/negativo): DN grupo→Nome Fantasia, Sub Origem→Nível 2, FamilyProduct→Descrição | Que valor de cada variável empurra pra cima e pra baixo |
| 9 | **Experimento de mídia — o desenho** | Callout R1 em destaque no topo + KPIs do subconjunto (246.143 leads, 16,4%, conversão 6,51% vs 10,26%) + barras A vs B nas 3 métricas | O que o experimento responde e o que ele **não** responde |
| 10 | **Experimento de mídia — resultado** | Curva de ganho A vs B + importância do modelo B com as 5 colunas de campanha destacadas + drill-down | Recall@30% 57,1% → 59,2% (+2,1pp): as colunas de campanha ajudam |
| 11 | **Plano de ação** | Tabela de ações priorizadas | Produção, incorporar campanha, monitorar drift, limpar cadastro de produto |

Páginas 6–8 e 10 são o mesmo conjunto de outputs pedido, aplicado aos dois modelos — o
paralelismo é intencional e reforça R1.

## 5. Identidade

`theme.css`: `--primary #001E50` (VW Dark Blue), `--accent #00B0F0` (VW Light Blue),
`--accent-soft #7FD8FF`, `--destructive #C40C1E`. Cabeçalho corrido:
`"Volkswagen · Lead Scoring · 2022–2026"`.

## 6. Decisões fechadas na implementação

- **Sem cifra em reais.** Varredura nos 6 notebooks (VW e Yamaha) não achou ticket médio,
  receita, custo por lead nem margem; a base também não tem coluna de valor. O plano de ação
  fica em ganho operacional, e a página final diz isso explicitamente.
- **Veredito do experimento:** +2,14 p.p. de Recall@30% no OOT cruza o limiar de 2 p.p. do
  notebook 04 — o texto sai como "ajudam de forma relevante".
- **11 páginas**, preenchimento medido entre 88% e 98%.
