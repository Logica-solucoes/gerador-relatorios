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

Só a arquitetura: extrair o motor compartilhado, migrar a BASF pra dentro dele, e deixar um
template de cliente novo pronto pra copiar. **Não** inclui:

- Queries/narrativa/páginas reais de VW, Embrapii, BFM ou Mendes — não existem ainda.
- Qualquer serviço de agendamento (cron container, Task Scheduler, etc). O pipeline fica
  parametrizável por cliente; quem dispara é externo (hoje manual, depois um scheduler real ou
  a API).
- A API em si. Só isolamos a função de geração pra ela ser chamável depois sem reescrever.

## Estrutura de pastas

```
core/                          # motor compartilhado (client-agnostic)
├── build.ts                    # gerar(client): importa módulos do cliente, gera html/pdf
├── report.ts                   # helpers de plot/SSR
├── styles.base.css             # CSS base com var(--accent) etc
└── fonts/

clients/
├── basf/
│   ├── queries.ts               # migrado do root, sem mudança de lógica
│   ├── narrativa.ts
│   ├── narrativa.test.ts
│   ├── pages.ts
│   ├── theme.css                # só as variáveis de cor da BASF
│   ├── .env                     # gitignored — host/user/senha/banco da BASF
│   └── .env.example
└── _template/                   # esqueleto pra copiar em cliente novo
    ├── queries.ts                # com TODOs, dados mock
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

`core/build.ts` importa dinamicamente `clients/${CLIENT}/queries.ts` (precisa exportar
`conectar`, `carregar`) e `clients/${CLIENT}/pages.ts` (precisa exportar `documento`) — é o
mesmo contrato que já existe hoje entre `build.ts`, `queries.ts` e `pages.ts`, só descrito
explicitamente, não um `interface` TypeScript novo. Formalizar um tipo compartilhado fica pra
quando um terceiro cliente real expuser o que de fato varia — hoje seria abstração sem
segundo uso comprovado (o `_template` conta como prova de forma, não de tipo).

`build.ts` deixa de ser só um script top-level e exporta uma função `gerar(client: string)`.
O script CLI vira uma casca fina que lê `CLIENT` do ambiente e chama `gerar`. Isso custa quase
nada agora e evita reescrever a orquestração quando a API existir de verdade.

## CSS / paleta por cliente

`core/styles.base.css` usa `var(--accent)`, `var(--accent-2)` etc onde hoje há cor fixa. Cada
`clients/<id>/theme.css` só define os valores dessas variáveis. O build concatena
`theme.css` do cliente + `styles.base.css` (nessa ordem, pra variável do cliente valer).

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
- Extrair paleta atual de `styles.css` pra `clients/basf/theme.css`; o resto vira
  `core/styles.base.css`.
- Mover `build.ts`, `report.ts`, `fonts/` pra `core/`.
- Mover `.env` atual pra `clients/basf/.env` (e `.env.example`).
- Atualizar `Dockerfile` e `compose.yaml` pros novos caminhos e mounts de diretório.
- Atualizar `CLAUDE.md`/`README.md` pra refletir a nova estrutura (comandos, caminhos,
  a armadilha de mount que deixa de existir).

## Fora de escopo (explícito)

- Dados reais de VW, Embrapii, BFM, Mendes.
- Scheduler (cron container, Task Scheduler, etc).
- API.
- Qualquer mecanismo de aprovação/envio — só a regra documentada acima.
