# Relatório BASF Sementes — Diagnóstico YTD

Gera um PDF A4 executivo (10 páginas) a partir do SQL Server, sem browser.

## Rodar

```bash
cp clients/basf/.env.example clients/basf/.env      # e preencha
docker compose run --rm --env-from-file clients/basf/.env -e CLIENT=basf relatorio
# → out/basf/relatorio.html  (estático, zero <script>)
# → out/basf/relatorio.pdf   (A4 retrato, numerado)
```

Repositório agora serve vários clientes (`clients/<id>/`) a partir do mesmo motor
(`core/`). Cliente novo? Ver `NOVO_CLIENTE.md`.

Sem defaults no código: variável faltando falha na hora, em vez de conectar no banco errado.

O alvo é **Azure SQL** — deixe `DB_TRUST_CERT` vazio para o certificado ser validado de
verdade. Só instância local com cert self-signed precisa de `=true`.

Banco na própria máquina? `localhost` no `.env` é o próprio container:

```bash
docker compose run --rm --env-from-file clients/basf/.env -e CLIENT=basf -e DB_HOST=host.docker.internal relatorio
```

## Iterar no design

O container só é necessário para o PDF:

```bash
CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts   # gera out/basf/relatorio.html
start out/basf/relatorio.html                                    # Chrome, reload instantâneo
```

No Chrome o número de página e o cabeçalho corrido não aparecem — são CSS Paged Media margin
boxes, que o WeasyPrint suporta e o Chrome não. O resto renderiza igual.

## Texto vs. dados

Relatório recorrente não pode ter conclusão hardcoded: se na próxima rodada a receita subir,
"a receita caiu pela metade" vira mentira ao lado de um número que diz o contrário.

Toda **afirmação** é derivada em `narrativa.ts`:

| Hardcoded seria | O que é gerado |
|---|---|
| "A receita caiu pela metade" | manchete por faixa e sinal da variação |
| "Onde foram os R$ X milhões" | vira "De onde vieram" se houver crescimento |
| "Todas as cinco culturas perderam volume" | conta os quadrantes e nomeia quem está em cada um |
| "O motor de aquisição parou" | compara receita nova vs. perdida |
| "2026 é o pior ano da série" | verifica; se não for, nomeia qual foi |

```bash
bun test   # prova que a prosa vira quando os dados viram
```

## Decisões analíticas que alguém vai questionar

- **Contas `%DUMMY%` ficam fora de todo recorte.** Existem na base e chegam a R$ 1 Mi/ano.
- **Tabelas nominais agrupam por `cust_name`**, não `cust_no` — a mesma empresa tem mais de
  um código no ERP.
- **O waterfall é partição exaustiva**: YTD 2025 + as 4 etapas fecham exatamente no YTD 2026.
- **Spread de preço compara dentro de `(item_no, pack_desc)`** — sem a embalagem, desconto
  legítimo por volume viraria "vazamento".
- **A recuperação estimada usa a mediana do SKU**, não o preço máximo. Contra o máximo daria
  ~4× mais e não se sustenta numa reunião.
- **Não há estimativa de ganho para cross-sell.** O múltiplo 2,8× é associação entre porte e
  amplitude de portfólio; aplicá-lo por cliente produzia números que os próprios dados
  contradizem — os maiores mono-cultura já faturam bem acima da média bi-cultura.

Recorte em `YTD_MES` / `ANO` / `ANO_ANT` no topo de `queries.ts`. Hoje jan–jun, 2026 vs 2025
(dados até 25/06/2026).

Convenções de código e armadilhas de renderização: `CLAUDE.md`.
