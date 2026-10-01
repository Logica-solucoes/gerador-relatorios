# CLAUDE.md

Motor de relatórios executivos em PDF (A4). Bun + Observable Plot (SSR via linkedom) → HTML
estático → WeasyPrint → PDF. `core/` é o motor; cada `clients/<id>/` é um cliente. Hoje:
`basf` (10 páginas, SQL Server), `vw` (15 páginas, JSON de modelo em `_intake/`, sem banco),
`vw_auditoria` (21 páginas, SQL Server — banco `LogicaChatBot`, o mesmo do dashboard de auditoria),
`vw_auditoria_semanal` (3 páginas, mesmo banco do `vw_auditoria` — acompanhamento operacional
semanal: última semana fechada contra a anterior + acumulado do mês, recortados pela **data da
auditoria**, não do lead; roda sozinho toda semana) e `_template` (esqueleto, sem banco).

Visão geral e decisões de produto estão no `README.md`. Aqui ficam as regras de trabalho.

## Comandos

```bash
CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts                 # HTML (Windows, SQL em localhost) — loop rápido de design
docker compose run --rm --env-from-file clients/basf/.env -e CLIENT=basf relatorio  # HTML + PDF (fluxo real)
bun test                                                                       # narrativa.ts de todos os clientes
```

`CLIENT` é obrigatório — sem default de propósito, mesmo motivo do `queries.ts` nunca ter
default de variável de banco (ver `## Banco`). Troque `basf` por qualquer pasta em `clients/`.
`--env-file=` (Bun) e `--env-from-file` (compose) são flags diferentes, de ferramentas
diferentes — não confunda um pelo outro. Cliente cujo banco roda na própria máquina (é o caso do
`vw_auditoria`) precisa de `-e DB_HOST=host.docker.internal` no `compose run`: `localhost` dentro
do container é o container. `clients/_template/` não tem banco: basta
`CLIENT=_template bun run core/build.ts`, sem `--env-file`.

**Loop de iteração:** rode `CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts`,
abra `out/basf/relatorio.html` no Chrome. O container só é necessário para o PDF.

**Cliente novo?** Ver `NOVO_CLIENTE.md` na raiz — processo de onboarding via agente de IA.

Os fontes são **montados** no container (`volumes:` em `compose.yaml`, `core/` e `clients/`
inteiros), então `compose run` sempre usa o código atual — não precisa de `docker compose
build` para mudança de código, só para mudança de dependência ou de Dockerfile. Não remova
esses mounts: sem eles o container roda a cópia assada na imagem e gera um PDF **plausível e
errado**, sem avisar.

## Produção

A imagem sobe `core/server.ts`: o n8n chama `POST /gerar/<cliente>` e cada chamada roda
`core/build.ts --publicar` num processo com só `env/<cliente>.env` — o servidor não carrega
credencial de cliente nenhum. `--publicar` chama `clients/<id>/publicar.ts` depois do PDF; cliente
sem esse arquivo não publica. Deploy, verificação e atualização: `deploy/README.md`.
Publicar imagem: `bun run imagem <versão>` (recusa com git sujo).

## Tamanho da imagem: dois números, um deles engana

`docker images` no CLI atual mostra **DISK USAGE** e **CONTENT SIZE** — são coisas diferentes.
CONTENT SIZE (confirma com `docker image inspect gerador-relatorios --format '{{.Size}}'`) é o
tamanho real da imagem, hoje ~200MB. DISK USAGE inclui cache de build (BuildKit) acumulado de
rebuilds anteriores — pode mostrar 800MB+ sem que a imagem tenha mudado. Se o número parecer
alto, confira `.Size` antes de investigar; cache de build se resolve com `docker builder prune`
(system-wide, pede confirmação antes de rodar — afeta outros projetos na mesma máquina).

Maior peso real, e o que fazer sobre cada um:
- **WeasyPrint + Python gerenciado pelo uv** (~174MB): inerente, é o motor de PDF.
- **Debian base + bun** (~226MB): inerente ao runtime escolhido.
- **`@azure/*` via `mssql` → `tedious`** (~42MB): dependência **obrigatória** do driver — a
  Azure AD auth vem embutida no `tedious` mesmo sem usar. Não removível sem trocar de driver.
- **devDependencies** (`typescript`, `@types/*`): removidas da imagem via
  `bun install --frozen-lockfile --omit=dev` no Dockerfile — só servem o `tsc --noEmit` local.

`compose.yaml` fixa `image: gerador-relatorios:latest`. Sem isso o compose nomeia
`{pasta}-{serviço}` (`gerador-relatorios-relatorio`) e o `docker image inspect` acima para de achar a imagem.

## Banco

**O alvo de produção é Azure SQL**; o SQL Server local é cópia de trabalho. Setup no README.

Duas coisas que não podem regredir: `queries.ts` **não** tem default para nenhuma variável
(conectar no banco errado em silêncio é pior que quebrar), e `DB_TRUST_CERT` só existe para
cert self-signed local — ligado contra a Azure remove a proteção contra MITM. `encrypt` é
sempre `true`. `clients/*/.env` está no `.dockerignore`; não remova.

## Verificação — obrigatória

Mudou layout ou gráfico? **Olhe o PDF renderizado.** Não confie em "o HTML parece certo":
metade dos bugs desta base só aparecem no WeasyPrint.

```bash
docker compose run --rm --entrypoint pdftoppm relatorio -png -r 100 out/basf/relatorio.pdf out/pg
# depois leia out/pg-*.png (troque basf pelo cliente que você está verificando)
```

Se o PDF tiver mais de 10 páginas, algo transbordou — quase sempre altura de gráfico.

### Medir preenchimento em vez de chutar

As alturas dos gráficos em `clients/<id>/report.ts` são calibradas para cada página chegar perto do fim da
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

## Armadilhas do WeasyPrint (todas já custaram tempo)

- **Não executa JavaScript.** Gráficos são SSR. Não introduza nada que dependa de runtime.
- **Ignora `width`/`height` como atributo em SVG inline.** `plot()` em `core/report.ts` repete os dois
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
- `tickFormat` é chamado como `(valor, index)`. Um helper de formatação com segundo parâmetro
  opcional (ex: `(v, d = 1) => ...`) recebe o `index` do tick nesse parâmetro — decimais crescem
  tick a tick (0, 1, 2, 3...) em vez de ficar fixo. Formatter passado a `tickFormat` precisa
  aceitar exatamente um parâmetro.

## Não faça

- Reintroduzir Chart.js ou qualquer render em canvas — rasteriza e borra no PDF.
- Adicionar Playwright/Puppeteer. Foi avaliado e descartado: pesa 6× mais e não suporta Paged
  Media, que é justamente o motivo do WeasyPrint.
- Adicionar dependência para o que resolve em algumas linhas. Hoje são 3.

## UI stack (`web/basf/`)

Dashboard web, não relatório PDF: segue o padrão `web/momentive/` (DOM puro + Observable Plot,
`montarDashboard(host, dados)`, CSS escopado) para virar componente Aurelia no portal Basf. Os
itens dos registries abaixo são React — porte o desenho (markup + CSS nos tokens), sem instalar.

Tone: Dense system — BI interno de mercado, muitos filtros, tabelas e gráficos.
- Blocks: `shared/` do LogicaDash (branch `masterAlexandreBFM`) retematizado; referência visual shadcnuikit (dashboards) e ReUI (filtros)
- Motion: só transição CSS
- Icons: Tabler outline, SVG inline só dos usados
- Theme: escala 50–950 do laranja `#F39500` (portal), base creme, azul BASF `#004A96` só na marca, vermelho `#C60023` só erro
  - Dados (`shared/tema.ts`): magnitude em verde hortaliça (`VERDE`, um tom claro → escuro); laranja só no destaque (maior, ano atual, pontos do mapa); categorias em ordem fixa (`CATEGORIAS`, cor segue a categoria via `coresPorChave`, nunca a posição)
  - Número ruim (delta negativo, tendência caindo) é laranja, nunca verde: verde só onde o número é bom
  - Paleta nova? Rode o validador do skill `dataviz` (`validate_palette.js`, `--pairs all` se as séries se cruzam) antes de usar
- Fonts: Manrope (texto/títulos) + JetBrains Mono (números em tabela), algarismos tabulares
- Showpiece: mapa do Brasil (Plot + GeoJSON IBGE, sem tiles) — único destaque; loading em skeleton CSS
- Extras (portar desenho):
  - dashboardcn `kpi-card` (KPIs com delta e sparkline), `bar-list` (rankings clicáveis), `allocation-card` (share), `distribution-bar` (composição 100%), `metric-list` (comparativo de fontes)
  - ReUI `filters-chip` (barra de filtros global), `c-data-grid-8` (cliente-chave expande na ficha)
  - blocks.so `table-04` (key list agrupada com subtotal)

Pick UI from this stack only. At the start of a UI task, offer once to scout the `ui-sources` catalog for components that fit this tone; load that skill for the scouting pass or when the stack can't cover a need.
