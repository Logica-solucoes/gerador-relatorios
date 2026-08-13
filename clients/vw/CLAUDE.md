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

**Referência cruzada de página usa `pg("<seção>")`**, não número literal — reordenar seções não
pode deixar "ver página 7" apontando para o lugar errado.

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
- **O export é reproduzível desde 13/08/2026.** `optuna.create_study` rodava sem seed, então
  cada execução achava hiperparâmetros diferentes e não dava para reconstruir o modelo de um
  JSON antigo. Agora usa `TPESampler(seed=42)`. Re-exportar move as métricas (foi de AUC OOT
  0,7215 para 0,7207 na primeira re-execução) — isso é esperado, não bug.
- `Descrição do Veículo` é texto livre: com o piso, o topo vira `T-Cross`/`Novo T-Cross`/
  `T-Cross Sense…` — mesma família escrita de várias formas. Tratado como achado do relatório,
  não escondido — ver `cadastroRepetido()` em `narrativa.ts`, que descarta o prefixo "Novo" e
  **não** corta no hífen (senão `T-Cross` vira `T`).
- `Sub Origem Nível 2` tem um valor literal `"0"` com 17,5 mil leads e contribuição negativa
  forte — é ausência de cadastro entrando no modelo como se fosse canal. `valorSuspeito()` acusa.

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
