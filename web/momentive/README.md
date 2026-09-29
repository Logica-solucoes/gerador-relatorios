# Dashboard Momentive — exportação

Dashboard web (não é relatório PDF — não passa pelo `core/`). Cliente **Momentive Performance
Materials**, operação de exportação da **BFM Transportes**. Destino final: o portal Aurelia.

```bash
bun run dash:momentive        # dist/preview.js — loop de desenvolvimento
# abrir web/momentive/index.html no browser

bun run dash:momentive:file   # momentive-standalone.html — 1 arquivo, ~340 kB
```

## Arquivos

| | |
|---|---|
| `src/types.ts` | **Contrato de dados.** Interface `Embarque`. É o que o gerador Python precisa produzir. |
| `src/dashboard.ts` | Toda a lógica de render. Exporta `montarDashboard(hospedeiro, dados)`. |
| `src/dashboard.css` | Estilos, escopados sob `.mtv`. Não toca em `body`/`html`. |
| `src/dados.ts` | Snapshot de 70 embarques gerado da planilha. **Só o preview usa.** |
| `src/preview.ts` | Entrypoint do preview. Não entra no bundle de produção. |
| `index.html` | Shell do preview standalone. |
| `build-standalone.ts` | Gera o arquivo único auto-contido (JS + CSS + fontes em base64). |

## Arquivo único e PDF

`momentive-standalone.html` é auto-contido: abre sem build, sem servidor e **sem internet** —
as fontes Geist vão embutidas em base64 (subset latin, ~52 kB). Serve de anexo de e-mail.

O PDF sai do Chromium, **não** do WeasyPrint do `core/`: esta tela é renderizada em JS e o
WeasyPrint não executa JS — geraria página em branco.

```bash
bun run dash:momentive:file
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=20000 \
  --print-to-pdf=web/momentive/momentive-exportacao.pdf \
  file:///.../web/momentive/momentive-standalone.html
```

6 páginas em A4 paisagem (eram 8 até a tabela ser corrigida — ver abaixo). A seção do ciclo
começa em folha própria (`break-before: page`) e a linha das barras é de 14px por uma razão
aritmética: cabeçalho + tira + gráfico precisam caber nos ~725px úteis de uma A4 paisagem. Um
SVG não se divide entre páginas — se estourar, ele pula inteiro para a folha seguinte e deixa o
título órfão com meia página em branco. Acima de ~36 embarques FCL a seção passa a ocupar duas
folhas; é aceitável, mas saiba que é esse o limite.

**A tabela é a exceção deliberada à regra "seção inteira ou nada".** Toda outra seção do dash
tem `break-inside: avoid` porque contém um SVG que não pode ser cortado ao meio. A tabela de 70
linhas é sempre maior que qualquer página — para ela, "não caber inteira" é a regra, não a
exceção — e aplicar a mesma trava produzia o oposto do esperado: o Chromium não consegue *evitar*
quebrar um bloco maior que a página, mas ao tentar, ele deixava metade de cada folha em branco em
vez de preencher com linha. Isso gerava 5 páginas quase vazias (a tabela de 70 linhas espalhada
em ~14 linhas por folha, quando cabiam ~24). A seção `.mtv-sec--tabela` recebe `break-inside:
auto` e perde o card fechado (borda/sombra/canto arredondado) só na impressão — sem esse invólucro
o navegador empacota linha após linha até encher a página de verdade, inclusive continuando
direto onde o gráfico anterior (mês/peso) parou, em vez de pular para uma folha nova só para
caber o cabeçalho "Embarques".

**Ao mexer no layout, olhe o PDF renderizado** — mesma regra do motor de relatórios. Um SVG
não se parte entre páginas: toda seção com gráfico é atômica (`break-inside: avoid`) e desce
inteira quando não cabe na sobra da folha. Sobra de branco no pé é o comportamento certo pra
elas; se você reabilitar `break-inside` numa seção com gráfico "pra aproveitar a página", o que
acontece é o título ficar órfão numa folha e o gráfico sozinho na seguinte. A tabela é a única
exceção — ela não tem gráfico pra quebrar, então `break-inside: auto` nela é o comportamento
certo, não um bug (ver acima).

## Acoplando no Aurelia

`montarDashboard` não conhece Aurelia — recebe um elemento e devolve `{ atualizar, destruir }`.

```ts
import { montarDashboard, type Dashboard } from ".../momentive/src/dashboard";
import type { Embarque } from ".../momentive/src/types";
import ".../momentive/src/dashboard.css";

export class MomentiveDashboard {
  private host!: HTMLElement;
  private dash?: Dashboard;

  attached() { this.dash = montarDashboard(this.host, this.embarques); }
  detached() { this.dash?.destruir(); }          // remove o listener de resize
  embarquesChanged(novos: Embarque[]) { this.dash?.atualizar(novos); }
}
```

A fonte **Geist / Geist Mono** vem do Google Fonts. No portal, carregue pelo build do Aurelia
em vez do `<link>` do preview — o CSS já tem fallback para `system-ui` e `ui-monospace`.

## Responsivo

Container-based, não viewport-based: `compacto` (em `dashboard.ts`) é lido de `raiz.clientWidth`
a cada `render()`, não de `window.innerWidth`. Isso importa porque o mesmo componente pode
nascer tanto em tela cheia quanto num painel estreito do Aurelia — "compacto" aqui significa
"pouco espaço", não "é celular". Breakpoint: 640px, o mesmo valor usado no CSS.

**Os gráficos precisam de tratamento manual**, porque as margens do Plot (`marginLeft` etc.)
são pixels fixos calibrados para caber o rótulo mais longo em desktop — no ciclo, 168px para
`"EXP 255-256-257-258/2026"`. Sem ajuste, em 375px isso sozinho já é quase metade da tela.
Compacto reduz a margem e trunca o rótulo do eixo Y (`truncar()`), mantendo a referência
completa no tooltip — nada de informação se perde, só o rótulo estático fica mais curto.

**`.mtv-grid2` era o bug real**, não só falta de mobile: `minmax(400px, 1fr)` tem mínimo fixo
maior que qualquer tela de celular, então a grade forçava a página inteira a ficar mais larga
que o container e tudo — inclusive gráficos fora da grade — saía cortado. A correção é
`minmax(min(400px, 100%), 1fr)`, que nunca deixa a track exigir mais que 100% do espaço
disponível. Vale em qualquer container estreito, não só em mobile.

Verificação: não confie em screenshot de headless Chrome com `--window-size` pequeno — pelo
menos nesta build do Edge, a janela tem um piso de ~492px e janelas menores são silenciosamente
clampadas, então o screenshot "parece" 375px mas o layout real rodou mais largo. Para testar
uma largura exata, embuta a página num `<iframe style="width:375px">` (iframe sempre respeita a
largura do CSS, independente do piso da janela) e meça `scrollWidth` vs `clientWidth` via
`iframe.contentDocument` — não confie só no visual. `overflows=1, mtv-tw` é o resultado
esperado: só a tabela deve exceder a largura do container (rolagem horizontal é intencional).

## Imagem de fundo no hero

O hero aceita uma foto atrás do título. Ligue na folha do **host**, reusando o scrim:

```css
.mtv-hero { background-image: var(--scrim), url("/assets/porto.jpg"); }
```

**Não** coloque a url dentro de uma custom property (`--img: url(...)`). O Chromium resolve
`url()` de variável relativa à folha que **consome** a variável — `src/dashboard.css` — e não à
que declara. Um caminho relativo escrito no host vira `src/…`, dá 404 silencioso, o hero
renderiza navy chapado e **nada aparece no console**. Custou meia hora de investigação.

O scrim tem duas zonas, ancoradas em **pixels** (não em %, que escorregam quando o hero muda de
altura): os primeiros ~112px deixam a foto aparecer atrás do título; dali para baixo fecha em
navy sólido, porque é onde mora a linha de KPIs com texto pequeno.

Testado contra uma foto deliberadamente hostil — céu claro e sol estourado. Todas as bandas de
texto passam AA. Para reconferir depois de mexer no scrim, renderize o hero com
`color: transparent` e compare o pixel mais claro de cada banda com a cor do texto: medir em
cima do texto renderizado dá falso negativo, porque o antialiasing entra na amostra.

## Decisões que não podem regredir

**O dashboard não conserta dado.** `estufagemH`, `cicloDias` e `ajuste` chegam prontos do
gerador. Se um ciclo negativo vazar até aqui, vira barra negativa na tela — foi exatamente
isso que produziu o `-145,91 Transit Time` no dashboard da Polaris.

**Duas datas da planilha estão erradas** e o gerador as corrige, registrando o motivo em
`ajuste`. São erros de digitação de mês:

| Referência | Campo | Planilha | Corrigido | Por quê |
|---|---|---|---|---|
| `EXP 164-165/2026` | retirada do vazio | 27/07 | 27/04 | posterior ao carregamento (29/04) |
| `EXP 193/2026` | entrega no terminal | 14/04 | 14/05 | anterior ao carregamento (14/05) |

Sem isso os ciclos dão −88 e −26 dias. A correção é de exibição: **a planilha continua errada
na origem** e por isso a tela mostra a nota no rodapé e o selo `⚠ ajustado` na tabela. Quando
a Silvia corrigir a planilha, o `ajuste` some sozinho e a nota se esconde.

**O ciclo é mostrado decomposto em etapas, e isso é o ponto.** Na base de jan–jul/2026 a
estufagem — a métrica que o cliente pediu — é **2,5%** do ciclo; 56,7% é espera do container e
40,8% é trânsito ao terminal. Uma barra sólida dizia quantos dias; a barra segmentada diz onde
eles foram. Não volte para a barra sólida achando que dizia a mesma coisa.

**A comparação mês a mês usa os dois meses mais recentes com volume suficiente**, e diz quais
são ("jun vs mai"), em vez de "vs. mês anterior". Julho/2026 tem 4 embarques FCL: comparar
contra ele produziria uma seta de tendência em cima de ruído. O piso é `MIN_COMPARACAO = 5`;
sem par elegível o KPI simplesmente não mostra delta.

**Ciclo do container é métrica exclusiva de FCL.** Em LCL a carga é consolidada, não há
retirada de vazio. Filtrar por LCL mostra um estado vazio que explica isso — não é bug, e não
troque por "sem dados".

**`dx`, `dy` e `textAnchor` do Plot são constantes, não canais.** Passar função gera `NaN` nas
coordenadas e corrompe o SVG em silêncio. Mesma regra do `CLAUDE.md` da raiz.

**`tickFormat` é chamado como `(valor, índice)`.** Formatter com segundo parâmetro opcional
recebe o índice ali e os decimais crescem tick a tick. Todos os formatters daqui têm um
parâmetro só — mantenha assim.

**Escala do gráfico mensal é `band`, não `utc`.** Com `x.interval: "month"` numa escala utc o
Plot abre um slot vazio depois do último mês e fatia a última barra. O domínio é montado à mão,
vem da base inteira (não do filtro, senão o eixo dança ao trocar de modal) e inclui os meses
sem embarque — o buraco de fev/mar é informação.

## Paleta

Sistema de **duas cores**: navy `#2C4870` (a marca da BFM, âncora para não destoar do portal)
estrutura, laranja `#CC7C2F` é o contraponto.

O laranja é **cor de categoria**, não marca de alerta: LCL nos gráficos por modal, trânsito no
ciclo. Ele já foi restrito a "olhe aqui" e o resultado era um dash monocromático — laranja
aparecia em seis rótulos e mais nada. LCL e trânsito nunca convivem no mesmo gráfico (o ciclo é
exclusivo de FCL), então não há ambiguidade de leitura.

Como o laranja deixou de significar alerta, **outlier de ciclo é negrito, não cor**. O
comprimento da barra e a régua da mediana já carregam o sinal.

| token | hex | uso | contraste s/ branco |
|---|---|---|---|
| `--navy` | `#2C4870` | série FCL, ações | 9,3:1 |
| `--accent` | `#CC7C2F` | série LCL, trânsito | 3,2:1 (fill, não texto) |
| `--accent-ink` | `#9A5817` | texto laranja pequeno, chip LCL | 5,6:1 |
| `--et-espera` | `#B4C6DA` | etapa: espera do container | 1,8:1 (fill) |
| `--et-estufagem` | `#162438` | etapa: estufagem | 15,6:1 |
| `--ink` | `#111C2E` | corpo, outlier | 16,5:1 |
| `--muted` | `#55637A` | texto secundário | 5,9:1 |
| `--faint` | `#66717F` | labels pequenos | 4,8:1 |

Nenhum **texto** abaixo de 4,5:1. Ao mexer na paleta, confira antes de commitar.

Uma exceção consciente: `espera` (azul-claro) e `trânsito` (laranja) ficam em 2,13:1 entre si,
abaixo dos 3:1 pedidos para fills adjacentes. Nenhum par de azul-claro e laranja fecha esse
número — é inerente às duas cores. O que separa aqui é o **matiz** (frio vs. quente) mais a
borda branca de 1px entre segmentos, caminho que a WCAG 1.4.11 admite explicitamente. Não
remova o `stroke` do `barX` do ciclo achando que é enfeite: é ele que sustenta a distinção.

## Regerando o snapshot

`src/dados.ts` sai de `Momentive.xls` (planilha da BFM, sheet `Plan1`; `Plan2` é redundante —
as 24 referências dela já estão na `Plan1`). O script que gerou está no scratchpad da sessão;
quando o gerador Python existir, ele passa a ser a fonte e `dados.ts` vira só fixture de teste.
