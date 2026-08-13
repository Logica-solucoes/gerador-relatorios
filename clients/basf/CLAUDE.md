# CLAUDE.md — BASF

Regras de negócio específicas do cliente BASF Sementes. Regras de motor (comandos, Docker,
WeasyPrint, Plot) estão no `CLAUDE.md` da raiz.

## Regras que não podem quebrar

**Texto vs. dados.** Se uma frase deixaria de ser verdade com outro conjunto de dados, ela
pertence a `narrativa.ts` e precisa de teste. `pages.ts` só carrega prosa neutra (definições,
metodologia, descrição de eixo). Nunca escreva "caiu", "o pior da série" ou "todas as culturas"
direto no template.

**Contas de teste.** Todo recorte filtra `cust_name NOT LIKE '%DUMMY%'` (`REAL` em
`queries.ts`). Query nova sem esse filtro quebra a reconciliação entre páginas.

**Waterfall é partição exaustiva.** YTD 2025 + as 4 etapas fecham exatamente no YTD 2026. Mexeu
nas condições, confira que ainda soma antes de seguir.

**Tabelas nominais agrupam por `cust_name`, não `cust_no`** — a mesma empresa tem mais de um
código no ERP.

**Comparação de preço é sempre dentro de `(item_no, pack_desc)`.** Sem a embalagem, desconto
legítimo por volume vira "vazamento".

## Dados

- `inv_qty_th` está em **milhares** de sementes (`/1e6` = bilhões).
- `total_line_amt` é líquido e **inclui devoluções** (valores negativos).
- Comparação de preço usa `net_price_th_inv_cur`.
- `ship_to_country <> 'BR'` é export intercompany (Nunhems/NL) — negócio diferente, nunca some
  com o mercado BR sem separar.
- `reason_desc` distingue venda de amostra/trial.
- Recorte em `YTD_MES` / `ANO` / `ANO_ANT` no topo de `queries.ts`. Hoje jan–jun, 2026 vs 2025.

## Não faça

- Inventar estimativa de ganho sem base no dado. Já houve um caso (múltiplo de cross-sell
  aplicado por cliente) que os próprios números contradiziam.
