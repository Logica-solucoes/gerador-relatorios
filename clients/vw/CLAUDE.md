# CLAUDE.md — VW

Regras de negócio do cliente Volkswagen (Lead Scoring). Regras de motor (comandos, Docker,
WeasyPrint, Plot) estão no `CLAUDE.md` da raiz.

## Comando

```bash
CLIENT=vw bun run core/build.ts                    # sem --env-file: este cliente não tem banco
docker compose run --rm -e CLIENT=vw relatorio     # HTML + PDF
```

## Regras que não podem quebrar

**Dois modelos independentes.** `modelo_base.json` (base inteira, com tuning Optuna) e
`modelo_campanha.json` (16,4% da base, sem tuning) **não são comparáveis entre si**. Dentro do
experimento, A e B **são** — mesmo recorte, mesma metodologia. O aviso está na capa e repetido
na abertura do capítulo de mídia; não remova nenhum dos dois.

**Texto vs. dados.** Se uma frase deixaria de ser verdade com outro export, ela pertence a
`narrativa.ts` e precisa de teste. `pages.ts` só carrega prosa neutra (definição de métrica,
descrição de eixo, metodologia). Nunca escreva "meta atingida" ou "as colunas ajudam" direto no
template — os dois têm veredito derivado do dado.

**Nada é recalculado aqui.** `carregar()` só lê os dois JSONs. Métrica nova = notebook novo e
export novo, não uma conta em `queries.ts`.

**Sem cifra em reais.** A base não tem valor de venda nem custo de contato. Qualquer estimativa
de ROI seria invenção — o relatório diz isso explicitamente na página final. Só entra se o
cliente fornecer ticket médio e custo por contato.

**Sem meta de Recall.** O relatório não cita alvo contratado (o antigo "≥ 60%" era desafio
interno, não compromisso com o cliente) — nem em texto, nem como linha no gráfico de métricas.
A régua é `TAXA_ATENDIMENTO` (45%), a taxa de atendimento medida na auditoria de leads: o
argumento é que a fila **já** é cortada nesse ponto, e hoje é cortada no aleatório. Recall@30%
continua no relatório como métrica descritiva, sem veredito de aprovado/reprovado.

**Referência cruzada de página usa `pg("<seção>")`**, não número literal — reordenar seções não
pode deixar "ver página 7" apontando para o lugar errado. `pg()` assume **uma página por
seção**: se alguma seção precisar de duas páginas, `pg()` passa a mentir para tudo que vem
depois e tem que virar uma tabela de `{ titulo, paginas }`.

**A audiência não é técnica.** Quem lê conhece a base de leads pelo CRM da Volks e mais nada.
As três primeiras páginas depois da capa (o que é / como funciona / como ler o score) e o
glossário do fim existem por isso: são o contrato de leitura do documento, não enfeite. Termo
técnico novo no corpo do relatório entra junto no `GLOSSARIO` de `pages.ts`.

## Dados

- **Faixas de score são decis do OOT** nos dois modelos (`faixas_oot` no notebook 03,
  `tabela_faixas(y_oot, …)` no 04). Volume por faixa é uniforme por construção — não vira
  gráfico, vira coluna de tabela.
- **Split temporal** derivado de `periodo.fim`: maturação = últimos 3 meses, OOT = os 2
  anteriores, dev = o resto (80/20 treino/OOS). Espelha `MESES_MATURACAO`/`MESES_OOT` do
  notebook 03; se lá mudar, `split()` em `report.ts` muda junto.
- **`pct_da_base_limpa` = 16,36%**, não 41%. O "~41%" que aparecia em `metodologia-modelo.md`
  era de uma execução antiga, antes de a base ser consolidada em `report1783970681632`.
- `importancia_features` já vem filtrada por ganho > 0 — daí "12 das 25 colunas", não "12
  features existem".
- Drill-down é contribuição SHAP média **no conjunto de treino**, não no OOT, e tem **piso de
  volume de 0,1% do treino** (`piso_volume` no export). Sem o piso, `tabela_drilldown` fazia
  `groupby().mean().head(10)` e a média de 1 lead disputava o topo com a média de 57 mil: a
  primeira versão do relatório publicou `TAOS` (2 leads) e `Novo T-Cross - Sense TSI Automático
  Nacional` (1 lead) acima de `Test Drive` (50 mil). Todo valor traz seu `volume`, e o gráfico
  mostra esse número — é o que deixa a média auditável.
- **O drill-down traz topo E fundo** (`top=7`, `piores=3` em `tabela_drilldown`). Só o `head()`
  respondia "quais os melhores" e fazia parecer que nenhuma concessionária puxava a conversão
  para baixo — quando o que acontecia é que o corte era pelos maiores. As 3 últimas linhas
  entram sempre, mesmo se positivas.
- **`coluna_detalhe` pode ser um par concatenado.** `DRILLDOWN_MAP` aceita string ou tupla;
  `Sub Origem` usa `('Sub Origem', 'Sub Origem Nível 2')` e o rótulo sai como
  `Site Ofertas › Estou interessado`. `Test Drive` sozinho não dizia de qual origem veio.
  Do lado do relatório, `rotuloRecorte()` e `tituloDrill()` traduzem cada segmento pelo `LABEL`
  e descartam o segmento que repete a própria feature.
- **Volume alto não é contribuição positiva.** `POLO` é a família com mais leads da base
  (326 mil no treino) e tem contribuição **−0,309**; `JETTA` é a mais negativa (−0,642). Do lado
  das concessionárias, `Francauto` (−0,551), `Autohauss` (−0,459) e `Paraguacu` (−0,422) puxam
  para baixo. Isso não é bug de sinal — é o modelo dizendo que aquele recorte converte abaixo da
  média. Antes do top+fundo nenhum negativo aparecia no relatório e dava para achar que não havia.
- **`FamilyProduct` detalha nele mesmo, não em `Descrição do Veículo`.** A descrição é texto
  livre e quebrava a mesma família em quatro barras (`T-Cross`, `Novo T-Cross`, `T-Cross
  Sense!Automática de 6 velocidades…`); `FamilyProduct` já vem padronizado em 13 valores macro.
  Isso resolveu o achado na origem, então `cadastroRepetido()` foi removido de `narrativa.ts` —
  não recrie a função para "detectar" um problema que o export não produz mais.
- **O export é reproduzível desde 13/08/2026.** `optuna.create_study` rodava sem seed, então
  cada execução achava hiperparâmetros diferentes e não dava para reconstruir o modelo de um
  JSON antigo. Agora usa `TPESampler(seed=42)`. Re-exportar move as métricas (foi de AUC OOT
  0,7215 para 0,7207 na primeira re-execução) — isso é esperado, não bug.
- `Sub Origem Nível 2` tem um valor literal `"0"` (~50 mil leads na base) e ~180 mil nulos. Os
  nulos viravam nada: o `groupby` os descartava em silêncio. Agora `chave_drilldown()` grava
  `(sem cadastro)` e eles aparecem. Os dois são ausência de cadastro entrando no modelo como se
  fossem canal, e `valorSuspeito()` acusa — testando a **folha** do rótulo (o pedaço depois do
  `›`), porque `Whatsapp › 0` não casa com um teste de "só dígitos" no rótulo inteiro.

## Insumos

`clients/vw/_intake/` (gitignored) precisa de 4 arquivos, copiados de
`Esteira_Automacao_VW/Lead Score/`:

| Arquivo | Origem |
|---|---|
| `modelo_base.json` | `Modelos VW/output/` |
| `modelo_campanha.json` | `Modelos VW/output/` |
| `metodologia-modelo.md` | `docs/` — referência de prosa, não é lido em build |
| `dicionario-dados.md` | `docs/` — referência de prosa, não é lido em build |

Só os dois JSONs são lidos por `queries.ts`. Sem `_intake/` o build quebra, e é o
comportamento certo: relatório com dado ausente é pior que build vermelho.

## Não faça

- Comparar métrica do modelo base com métrica do experimento de campanha em qualquer gráfico,
  tabela ou frase.
- Recalcular AUC/KS/Recall a partir das faixas — os números autoritativos são os do JSON.
- Inventar ganho financeiro.
