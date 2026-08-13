# Onboarding de cliente novo

Processo pra montar o relatório de um cliente novo neste motor — pra qualquer agente de IA
seguir, não só uma sessão específica do Claude Code. Ver
`docs/superpowers/specs/2026-08-13-multi-cliente-pipeline-design.md` pro desenho completo da
arquitetura multi-cliente.

## Contrato que o cliente precisa satisfazer

Uma pasta `clients/<id>/` com:

- `queries.ts` — exporta `conectar()` e `carregar(pool)`. `carregar` devolve o shape de dados
  que o resto do cliente usa; exporte `export type Dados = Awaited<ReturnType<typeof carregar>>`.
- `report.ts` — exporta `graficos` (objeto de funções de gráfico) e qualquer paleta/mapeamento
  de negócio (`COR`, categorias, etc). Importa `plot`, `L` e os formatadores genéricos de
  `../../core/report`.
- `narrativa.ts` — texto derivado dos dados (nunca hardcoded — ver `README.md`, "Texto vs.
  dados", e o precedente em `clients/basf/CLAUDE.md`). Importa formatadores de
  `../../core/report`.
- `narrativa.test.ts` — prova que a prosa muda quando os dados mudam.
- `pages.ts` — exporta `documento(dados)` (HTML) e `titulo` (string do `<title>`).
- `theme.css` — variáveis de cor (`--primary`, `--accent`, `--accent-soft`, `--destructive`)
  sobre `core/styles.base.css`, e o `content` do `@top-right` do `@page` (cabeçalho impresso).
- `.env` (gitignored) + `.env.example` — credenciais, se o cliente usar banco de dados. Se não
  usar (CSV, notebook, etc), `queries.ts` pode devolver `null` de `conectar()` — ver
  "Verificação" abaixo.

Use `clients/_template/` como ponto de partida — copie a pasta inteira e adapte.

## Insumos

Antes de começar, você recebe uma pasta `clients/<id>/_intake/` (gitignored — dado bruto de
cliente real nunca entra no repositório) com algum destes, em qualquer combinação:

- Acesso ou dump de banco de dados.
- CSVs e notebooks (ex: projeto de ciência de dados sem banco nenhum).
- Relatório/planilha/PDF antigo do cliente, como espelho do que precisa ser reproduzido.
- Briefing de negócio (documento, notas de reunião).

Não assuma banco de dados. Inventarie o que existe antes de agir.

## Fases

### 1. Inventário

Liste o que existe em `_intake/` e que tipo de fonte é cada arquivo. Não assuma nada sobre
estrutura de dados ainda.

### 2. Exploração

Se houver banco: schema, colunas, volumetria. Se houver CSV/notebook: leia e entenda as
colunas disponíveis. Se houver relatório antigo: mapeie que métricas/gráficos ele tinha. Não
tire conclusão de negócio ainda — só mapeie o que os dados permitem responder.

### 3. Entrevista de regras de negócio (obrigatória, pergunte antes de assumir)

Pergunte ao humano responsável pelo cliente, um de cada vez:

- Que exclusões existem? (contas de teste, registros de amostra/trial, filiais fora do
  escopo). Ver o precedente da BASF em `clients/basf/CLAUDE.md`: contas `%DUMMY%` de teste
  chegavam a R$ 1 Mi/ano e ficam fora de todo recorte.
- Que definições são ambíguas? (o que conta como "venda", filtros de país/moeda/unidade de
  negócio).
- O que o cliente efetivamente quer saber? Que decisão essa pessoa vai tomar lendo o
  relatório?
- Existe alguma comparação que só faz sentido dentro de um recorte mais fino? (o precedente da
  BASF: comparação de preço só é válida dentro de `(item_no, pack_desc)` — sem a embalagem,
  desconto legítimo de volume parece "vazamento").

Nunca assuma uma regra de negócio não confirmada. Isto vale mesmo que o agente que estiver
fazendo o onboarding não tenha o `CLAUDE.md` global de clarificação carregado — a regra está
aqui, não lá.

### 4. Brief de descoberta (aprovação humana obrigatória antes do código)

Escreva um documento curto — pode ser um spec via `superpowers:brainstorming` se o agente tiver
acesso à skill, ou simplesmente um markdown de rascunho — com:

- As regras de negócio levantadas na fase 3.
- Rascunho de divisão de páginas/seções e que narrativa cada uma sustenta.
- Que gráficos/KPIs cada página precisa.

Peça aprovação explícita do humano antes de escrever qualquer `queries.ts`/`narrativa.ts`.
Errar uma regra de negócio custa muito mais depois de implementado do que antes.

### 5. Implementação

Depois do brief aprovado:

1. `clients/<id>/queries.ts` — implemente `conectar`/`carregar` de acordo com a fonte real
   (banco, CSV, etc).
2. `clients/<id>/report.ts` — gráficos, seguindo as armadilhas de Plot documentadas no
   `CLAUDE.md` da raiz (`dx`/`dy`/`textAnchor` são constantes, não canais; barra em escala log
   não tem baseline; etc).
3. `clients/<id>/narrativa.ts` + `narrativa.test.ts` — toda afirmação que mudaria de sentido
   com outro dado.
4. `clients/<id>/pages.ts` — layout, seguindo as armadilhas de WeasyPrint documentadas no
   `CLAUDE.md` da raiz (sem JavaScript, `width`/`height` de SVG como CSS, sem `display:flex`
   em card com `<p>`, CSS Grid parcial).
5. `clients/<id>/theme.css` — paleta do cliente.
6. `clients/<id>/.env` + `.env.example`, se houver banco.

### 6. Verificação

- `bun test` — os testes de narrativa do cliente novo passam.
- `CLIENT=<id> bun --env-file=clients/<id>/.env run core/build.ts` — gera `out/<id>/relatorio.html`
  sem erro. Sem `--env-file` se o cliente não tiver `.env` (não usa banco) — `conectar()` pode
  devolver `null` nesse caso; `core/build.ts` já lida com isso (`await pool?.close()`), então
  cliente sem banco é um caso legítimo, não um workaround.
- `docker compose run --rm --env-from-file clients/<id>/.env -e CLIENT=<id> relatorio` — gera o
  PDF de verdade.
- Renderize o PDF em PNG (`pdftoppm`, ver `CLAUDE.md`) e **leia as páginas** — metade dos bugs
  desta base só aparecem no WeasyPrint, nunca confie só no HTML no Chrome.
- Meça preenchimento de página com o script do `CLAUDE.md` (generalizado pro número de páginas
  do cliente novo, não necessariamente 10 como a BASF). Alvo: 88–99% por página.
- **Datas usam fuso fixo.** `dt()` em `core/report.ts` formata sempre em `America/Sao_Paulo`
  (`timeZone` explícito no `Intl.DateTimeFormat`), justamente para o mesmo relatório sair igual
  gerado no Windows ou no container. Novo `dt()`/formatador de data que você escrever num
  cliente precisa do mesmo cuidado, senão a data muda com a máquina que rodou o build.

## Geração ≠ envio

O pipeline só gera `out/<id>/relatorio.pdf` e para. Não existe (e não deve existir) nenhum
envio automático — e-mail, upload, etc. — disparado a partir da geração. Quando um passo de
distribuição existir, ele precisa de uma ação humana explícita entre gerar e enviar.
