# CLAUDE.md

Relatório executivo em PDF (A4, 10 páginas) gerado a partir do SQL Server `Basf-Relatorio`.
Bun + Observable Plot (SSR via linkedom) → HTML estático → WeasyPrint → PDF.

Visão geral e decisões de produto estão no `README.md`. Aqui ficam as regras de trabalho.

## Comandos

```bash
bun run build.ts                  # HTML (Windows, SQL em localhost) — loop rápido de design
docker compose run --rm relatorio # HTML + PDF (fluxo real)
bun test                          # narrativa.ts
```

**Loop de iteração:** rode `bun run build.ts`, abra `out/relatorio.html` no Chrome. O container
só é necessário para o PDF.

Os fontes são **montados** no container (`volumes:` em `compose.yaml`), então `compose run`
sempre usa o código atual — não precisa de `docker compose build` para mudança de código, só
para mudança de dependência ou de Dockerfile. Não remova esses mounts: sem eles o container
roda a cópia assada na imagem e gera um PDF **plausível e errado**, sem avisar.

## Banco

**O alvo de produção é Azure SQL**; o SQL Server local é cópia de trabalho. Setup no README.

Duas coisas que não podem regredir: `queries.ts` **não** tem default para nenhuma variável
(conectar no banco errado em silêncio é pior que quebrar), e `DB_TRUST_CERT` só existe para
cert self-signed local — ligado contra a Azure remove a proteção contra MITM. `encrypt` é
sempre `true`. `.env` está no `.dockerignore`; não remova.

## Verificação — obrigatória

Mudou layout ou gráfico? **Olhe o PDF renderizado.** Não confie em "o HTML parece certo":
metade dos bugs desta base só aparecem no WeasyPrint.

```bash
docker compose run --rm --entrypoint pdftoppm relatorio -png -r 100 out/relatorio.pdf out/pg
# depois leia out/pg-*.png
```

Se o PDF tiver mais de 10 páginas, algo transbordou — quase sempre altura de gráfico.

### Medir preenchimento em vez de chutar

As alturas dos gráficos em `report.ts` são calibradas para cada página chegar perto do fim da
área útil (~1111px a 100dpi). Mexeu em altura? Meça, não olhe no olho:

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem out/pg-*.png | Sort-Object Name | ForEach-Object {
  $b=[System.Drawing.Bitmap]::FromFile($_.FullName); $u=0
  for ($y=40; $y -lt $b.Height-60; $y+=3) { for ($x=40; $x -lt $b.Width-40; $x+=6) {
    $p=$b.GetPixel($x,$y); if ($p.R -lt 235 -or $p.G -lt 235 -or $p.B -lt 235) { $u=$y; break } } }
  $b.Dispose(); "{0}  {1,4}/1111  {2,3}%" -f $_.Name,$u,[int](100*$u/1111) }
```

Alvo: 88–99%. Abaixo de 85% sobra vão visível; acima de 99% a página parte em duas.

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

## Armadilhas do WeasyPrint (todas já custaram tempo)

- **Não executa JavaScript.** Gráficos são SSR. Não introduza nada que dependa de runtime.
- **Ignora `width`/`height` como atributo em SVG inline.** `plot()` em `report.ts` repete os dois
  como CSS e remove o `<style>` que o Plot injeta (`height:auto`). Sem isso todo gráfico vira um
  bloco quadrado e o PDF dobra de tamanho.
- **Ignora `margin` em flex item.** Não use `display:flex` em card com vários `<p>` — eles colam.
- **CSS Grid é parcial.** Layout em flexbox e block. `.row` já resolve colunas.
- Margin boxes (`@page { @bottom-right }`) funcionam aqui e **não** no Chrome — no browser o
  número de página some, é esperado.

## Plot

- `dx`, `dy` e `textAnchor` são **constantes, não canais**. Passar função gera `NaN` nas
  coordenadas e corrompe o PDF em silêncio. Precisa variar? Duas marcas com dados filtrados.
- Eixo com `label` ganha seta automática: passe `labelArrow: "none"`.
- Barra em escala log não tem baseline — vira retângulo flutuante. Use ponto, ou mude a métrica.
- Barras agrupadas: `fx` para facetar, não empilhar no mesmo `x`.
- Rótulo à direita da última marca precisa de `marginRight` que caiba nele, senão corta.

## Dados

- `inv_qty_th` está em **milhares** de sementes (`/1e6` = bilhões).
- `total_line_amt` é líquido e **inclui devoluções** (valores negativos).
- Comparação de preço usa `net_price_th_inv_cur`.
- `ship_to_country <> 'BR'` é export intercompany (Nunhems/NL) — negócio diferente, nunca some
  com o mercado BR sem separar.
- `reason_desc` distingue venda de amostra/trial.
- Recorte em `YTD_MES` / `ANO` / `ANO_ANT` no topo de `queries.ts`. Hoje jan–jun, 2026 vs 2025.

## Não faça

- Reintroduzir Chart.js ou qualquer render em canvas — rasteriza e borra no PDF.
- Adicionar Playwright/Puppeteer. Foi avaliado e descartado: pesa 6× mais e não suporta Paged
  Media, que é justamente o motivo do WeasyPrint.
- Adicionar dependência para o que resolve em algumas linhas. Hoje são 3.
- Inventar estimativa de ganho sem base no dado. Já houve um caso (múltiplo de cross-sell
  aplicado por cliente) que os próprios números contradiziam.
