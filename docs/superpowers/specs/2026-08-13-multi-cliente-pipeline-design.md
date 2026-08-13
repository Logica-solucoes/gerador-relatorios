# Pipeline multi-cliente de relatórios — design

Data: 2026-08-13

## Contexto

O projeto hoje gera o relatório executivo da BASF (10 páginas, SQL Server → HTML SSR →
WeasyPrint → PDF), com toda a lógica (queries, narrativa, layout) hardcoded pra um único
cliente e pasta única na raiz do repo.

A firma vai atender outros clientes com o mesmo tipo de relatório: Auditoria VW, Embrapii,
BFM, Mendes. Cada um tem seu próprio banco de dados, suas próprias regras de negócio
(queries/narrativa/páginas) e sua própria identidade visual (paleta de cores sobre o mesmo
CSS base). O objetivo eventual é expor isso como API pro sistema principal disparar, com cada
cliente rodando na sua própria janela (cron).

## Escopo desta rodada

Só a arquitetura: extrair o motor compartilhado, migrar a BASF pra dentro dele, deixar um
template de cliente novo pronto pra copiar, e documentar o procedimento de onboarding de
cliente novo via agente de IA (`NOVO_CLIENTE.md`, ver seção própria abaixo). **Não** inclui:

- Queries/narrativa/páginas reais de VW, Embrapii, BFM ou Mendes — não existem ainda.
- Qualquer serviço de agendamento (cron container, Task Scheduler, etc). O pipeline fica
  parametrizável por cliente; quem dispara é externo (hoje manual, depois um scheduler real ou
  a API).
- A API em si. Só isolamos a função de geração pra ela ser chamável depois sem reescrever.

## Estrutura de pastas

```
core/                          # motor compartilhado (client-agnostic)
├── build.ts                    # gerar(client): importa módulos do cliente, gera html/pdf
├── report.ts                   # só plot() (SSR) + formatadores (mi, num, pct, sinal, dt, varPct, curto)
├── styles.base.css             # CSS base com var(--accent) etc
└── fonts/

clients/
├── basf/
│   ├── queries.ts               # migrado do root, sem mudança de lógica
│   ├── report.ts                # COR (paleta dos gráficos), CULTURA, graficos/gXxx — migrado do root
│   ├── narrativa.ts
│   ├── narrativa.test.ts
│   ├── pages.ts
│   ├── theme.css                # só as variáveis de cor da BASF
│   ├── .env                     # gitignored — host/user/senha/banco da BASF
│   └── .env.example
└── _template/                   # esqueleto pra copiar em cliente novo
    ├── queries.ts                # com TODOs, dados mock
    ├── report.ts                 # COR mock + 1 gráfico de exemplo
    ├── narrativa.ts
    ├── narrativa.test.ts
    ├── pages.ts
    ├── theme.css
    └── .env.example

out/<client>/relatorio.html, relatorio.pdf
```

`package.json`, `tsconfig.json`, `Dockerfile`, `compose.yaml` continuam na raiz — um único
`node_modules`, um único install, um único container serve qualquer cliente.

## Contrato cliente ↔ motor

`core/build.ts` importa dinamicamente, de `clients/${CLIENT}/`:
- `queries.ts` (precisa exportar `conectar`, `carregar`)
- `pages.ts` (precisa exportar `documento`)

e concatena `clients/${CLIENT}/theme.css` + `core/styles.base.css` no HTML final. É o mesmo
contrato que já existe hoje entre `build.ts`, `queries.ts` e `pages.ts`, só descrito
explicitamente, não um `interface` TypeScript novo. Formalizar um tipo compartilhado fica pra
quando um terceiro cliente real expuser o que de fato varia — hoje seria abstração sem
segundo uso comprovado (o `_template` conta como prova de forma, não de tipo).

`pages.ts` do cliente importa o `report.ts` do próprio cliente (gráficos), que por sua vez
importa `plot()` e os formatadores de `core/report.ts` — mesma cadeia de import que existe
hoje (`pages.ts` → `report.ts`), só que agora `report.ts` também é por cliente. `build.ts` não
importa `report.ts` diretamente em nenhum dos dois níveis.

`build.ts` deixa de ser só um script top-level e exporta uma função `gerar(client: string)`.
O script CLI vira uma casca fina que lê `CLIENT` do ambiente e chama `gerar`. Isso custa quase
nada agora e evita reescrever a orquestração quando a API existir de verdade.

## Cor por cliente: dois lugares, sem sincronização automática

O que muda entre clientes é sobretudo a paleta — mas a paleta tem dois consumidores diferentes
hoje, e cada um continua com sua própria cópia dos valores (achado durante o desenho: o
`styles.css` atual já duplica os mesmos hex do `report.ts` à mão, então isso não é regressão,
é o padrão já existente formalizado por cliente):

- **CSS** (`clients/<id>/theme.css`) — `core/styles.base.css` usa `var(--accent)`,
  `var(--primary)` etc onde hoje há cor fixa; cada `theme.css` só define os valores dessas
  variáveis. O build concatena `theme.css` do cliente + `styles.base.css` (nessa ordem, pra
  variável do cliente valer). Também é onde mora o `@top-right { content: "..." }` do `@page`
  com o nome do cliente/período no cabeçalho impresso (hoje hardcoded "BASF Sementes · YTD
  2026" em `styles.css`) — `core/styles.base.css` declara a estrutura do `@page` (tamanho,
  margem, `@bottom-right` com contador, `@top-left` com `string(secao)`) sem `content` no
  `@top-right`; o `theme.css` do cliente sobrescreve só essa propriedade.
- **Gráficos** (`clients/<id>/report.ts`) — `COR` é um objeto TS simples (hex string) usado
  como `fill`/`stroke` nas specs do Plot, porque isso vira atributo de apresentação no SVG, não
  CSS. Cada cliente define o próprio `COR` com os mesmos ~5 tons do `theme.css`.

Sem geração automática de um a partir do outro — são ~5 valores, editar os dois na mão ao
criar cliente novo é mais simples que um passo de build extra pra manter sincronizado. Revisar
se algum dia isso realmente doer (cliente com paleta grande, ou os dois arquivos divergindo).

## Env / segredos por cliente

Cada projeto aponta pra um banco diferente. `clients/<id>/.env` guarda `DB_HOST`, `DB_USER`,
`DB_PASS`, `DB_NAME`, `DB_TRUST_CERT` — mesmo formato de hoje, um arquivo por cliente,
gitignored, com `.env.example` versionado ao lado.

Carregado via `--env-file` no `docker compose run`, não por auto-load do Bun. Como o `.env`
fica dentro de `clients/<id>/`, fora do cwd do processo (`/app`, raiz do projeto), o Bun não
carrega ele automaticamente mesmo que o diretório inteiro esteja montado — o problema que hoje
obriga montar arquivo por arquivo (mount de diretório expondo `.env` que o Bun lê e sobrescreve
o `DB_HOST` injetado pelo compose) não existe mais nesse layout.

## Docker / compose

Um único service genérico, sem bloco por cliente:

```bash
docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf relatorio
```

Volumes passam de arquivo-por-arquivo pra dois mounts de diretório:
`./core:/app/core:ro` e `./clients:/app/clients:ro`. Adicionar cliente novo não toca mais em
`compose.yaml` — só cria a pasta em `clients/`.

`.dockerignore` ganha `clients/*/.env` (o padrão hoje é só `.env` na raiz).

Restante do `compose.yaml` (cap_drop, read_only, mem_limit, cpus, sem healthcheck) não muda.

## Geração ≠ envio (human-in-the-loop)

O pipeline, hoje e depois de qualquer scheduler/API futuro, **só gera** `out/<client>/relatorio.pdf`
e para. Não existe passo de envio nesta rodada — nenhum mecanismo de aprovação é construído
agora porque não há nada pra aprovar ainda.

Regra pra quando o envio existir (fora de escopo aqui, só documentando pra não esquecer): a
etapa de geração nunca deve disparar sozinha um envio (e-mail, upload, etc). Precisa de uma
ação humana explícita no meio — geração e distribuição são passos separados, com aprovação
manual entre os dois.

## Testes

`bun test` já descobre `**/*.test.ts` recursivamente — `clients/basf/narrativa.test.ts` e
`clients/_template/narrativa.test.ts` são achados sem mudança de configuração.

## Migração da BASF (resumo, detalhado no plano de implementação)

- Mover `queries.ts`, `narrativa.ts`, `narrativa.test.ts`, `pages.ts` pra `clients/basf/`.
- Dividir `report.ts`: `plot()` + formatadores vão pra `core/report.ts`; `COR`, `CULTURA`,
  `graficos`, `culturaVariacao` e todo `gXxx` vão pra `clients/basf/report.ts`.
- Extrair paleta atual (`:root { --primary/--accent/--accent-soft/--destructive }`) de
  `styles.css` pra `clients/basf/theme.css`, junto com o `content` do `@top-right` ("BASF
  Sementes · YTD 2026"); o resto vira `core/styles.base.css`.
- Mover `build.ts`, `fonts/` pra `core/`.
- Mover `.env` atual pra `clients/basf/.env` (e `.env.example`).
- Atualizar `Dockerfile` e `compose.yaml` pros novos caminhos e mounts de diretório.
- Atualizar `CLAUDE.md`/`README.md` pra refletir a nova estrutura (comandos, caminhos,
  a armadilha de mount que deixa de existir).
- Apagar `out/relatorio.html` e `out/relatorio.pdf` (artefato de build antigo, não versionado —
  `out` já está no `.gitignore` e continua cobrindo `out/<client>/` sem mudança nenhuma; o build
  novo escreve em `out/basf/` e deixa os arquivos da raiz órfãos).

## Onboarding de cliente novo via agente de IA

Hoje, montar o relatório de um cliente novo (queries, narrativa, páginas) é trabalho manual
guiado por quem conhece o negócio do cliente. O objetivo é documentar esse procedimento de
forma que qualquer agente de IA — não só uma sessão específica do Claude Code — consiga
conduzir o onboarding sem reinventar o processo a cada cliente.

### Local

`NOVO_CLIENTE.md` na raiz do repo, em markdown puro (sem depender do formato `SKILL.md` do
Claude Code — funciona pra qualquer agente que leia o repo). `CLAUDE.md` ganha uma referência
a ele, pra ser carregado automaticamente por qualquer agente quando a tarefa for "criar
relatório pra cliente novo".

### Insumos

`clients/<id>/_intake/`, gitignored — dado bruto de cliente real não entra no repositório. O
que existe nessa pasta varia por cliente e o playbook não assume banco de dados: trata como
fontes possíveis, em qualquer combinação:

- Acesso/dump de banco de dados.
- CSVs e notebooks (ex: projeto de ciência de dados de leads, sem banco nenhum).
- Relatório/planilha/PDF antigo do cliente, usado como espelho do que precisa ser reproduzido.
- Briefing de negócio (documento, notas de reunião).

### Fases

1. **Inventário** — o que existe em `_intake/`, que tipo de fonte é cada arquivo.
2. **Exploração** — schema/colunas se houver banco, leitura de notebooks/CSV, extração de
   estrutura do relatório antigo se houver. Sem gerar conclusão nenhuma ainda, só mapear o que
   os dados permitem responder.
3. **Entrevista de regras de negócio** — perguntas obrigatórias ao humano responsável pelo
   cliente antes de assumir qualquer regra: exclusões (ex: contas de teste/dummy), definições
   ambíguas (o que conta como venda, filtros de país/moeda/unidade), o que o cliente
   efetivamente quer saber. Escrito explicitamente no arquivo — não depende do `CLAUDE.md`
   global de clarificação estar carregado, porque o agente que fizer o onboarding pode não ser
   uma sessão com esse arquivo.
4. **Brief de descoberta** — documento curto (regras de negócio levantadas + rascunho de
   divisão de páginas/narrativa) que o humano aprova **antes** de qualquer código ser escrito.
   Mesmo padrão spec-first usado neste próprio design.
5. **Implementação** — `clients/<id>/{queries,report,narrativa,pages}.ts`, `narrativa.test.ts`,
   `theme.css`, seguindo o contrato do `core` (`conectar`/`carregar`/`documento`, `report.ts` do
   cliente com sua paleta `COR` própria) e as regras já documentadas no `CLAUDE.md` (texto vs.
   dado sempre derivado com teste, armadilhas WeasyPrint, armadilhas Plot).
6. **Verificação** — `bun test`, `build.ts`, renderizar PDF, medir preenchimento de página
   (mesmo script do `CLAUDE.md`, generalizado pro número de páginas daquele cliente em vez de
   fixar 10 como a BASF).

### Fora de escopo desta seção

Só o documento `NOVO_CLIENTE.md` agora. Nenhuma ferramenta/script de apoio (ex: inventariador
automático de `_intake/`) — ainda não existe um onboarding real feito com esse processo pra
saber o que de fato vale a pena automatizar depois.

## Fora de escopo (explícito)

- Dados reais de VW, Embrapii, BFM, Mendes.
- Scheduler (cron container, Task Scheduler, etc).
- API.
- Qualquer mecanismo de aprovação/envio — só a regra documentada acima.
