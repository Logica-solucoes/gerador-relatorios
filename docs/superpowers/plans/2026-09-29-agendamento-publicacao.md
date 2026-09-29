# Agendamento e publicação do semanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o n8n dispara toda segunda um endpoint do gerador, que gera o PDF do `vw_auditoria_semanal` e publica no portal VwAuditoria sem duplicar.

**Architecture:** `core/server.ts` (Bun.serve) recebe `POST /gerar/:client` e roda `core/build.ts --publicar` num subprocesso que só enxerga `env/<client>.env`. O `build.ts` chama `clients/<id>/publicar.ts` depois do PDF. Imagem vai para o Docker Hub e roda no servidor do n8n, na mesma rede Docker.

**Tech Stack:** Bun 1.3 (`Bun.serve`, `Bun.spawn`, `fetch`, `FormData`), `bun:test`, Docker/Compose, n8n.

**Spec:** `docs/superpowers/specs/2026-09-29-agendamento-publicacao-design.md`

**Convenções do repo:** commits em pt-br, minúsculos, conventional (`feat(vw_auditoria_semanal): ...`). Comentário só quando o *porquê* não sai do código. Nenhuma dependência nova.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `clients/vw_auditoria_semanal/publicar.ts` (novo) | título/referência da semana, detecção de duplicado, login + upload no portal |
| `clients/vw_auditoria_semanal/publicar.test.ts` (novo) | partes puras do acima |
| `core/build.ts` (mod) | flag `--publicar` no CLI |
| `core/server.ts` (novo) | HTTP: auth, lock por cliente, subprocesso com env isolado |
| `core/server.test.ts` (novo) | rotas do servidor com `rodar` falso |
| `Dockerfile`, `compose.yaml`, `.dockerignore`, `.gitignore`, `package.json` (mod) | servidor como CMD, dev continua no build, renomeação |
| `scripts/imagem.sh` (novo) | build + push com git limpo |
| `deploy/compose.yaml`, `deploy/README.md` (novos) | produção no servidor do n8n |
| `CLAUDE.md`, `clients/vw_auditoria_semanal/CLAUDE.md`, `.env.example` (mod) | documentação |

## Ordem e paralelismo

- Task 1 primeiro (mexe no repo inteiro).
- Depois, em paralelo: **Task 2 → Task 3** (mesma pasta, em série) e **Task 4** e **Task 5**.
- Task 6 depois da 4 e 5. Task 7 depois de todas. Tasks 8–10 são humanas/sessão nova.

---

### Task 1: Arrumar o repositório antes do deploy

A imagem hoje não builda de um clone limpo: `core/build.ts` lê `core/dash.png` e `core/vw.png`, que não estão no git. Há 750 linhas pendentes.

**Files:**
- Modify: `.gitignore`, `.dockerignore`
- Commit: tudo que está pendente, em grupos

- [x] **Step 1: ignorar o que não é projeto**

Adicionar ao fim de `.gitignore`:

```
# ferramenta local (Serena)
.serena/

# env de produção por cliente (servidor HTTP) — nunca versionado
env/

# build de dashboard web
web/*/dist/
```

Adicionar ao fim de `.dockerignore`:

```
web
docs
scripts
env
.serena
```

- [x] **Step 2: conferir que nenhum `.env` entra**

Run: `git status --short --untracked-files=all | grep -i "\.env$"`
Expected: nenhuma linha (só `.env.example` pode aparecer).

- [x] **Step 3: commits em grupos**

```bash
git add .gitignore .dockerignore
git commit -m "chore: ignora .serena, env/ e dist de dashboard"

git add core/build.ts core/styles.base.css core/dash.png core/vw.png clients/vw_auditoria_semanal/pages.ts
git commit -m "feat(core): logos dash e sala de performance embutidas no html"

git add clients/vw/
git commit -m "feat(vw): atualiza relatorio de lead scoring"

git add clients/vw_auditoria/
git commit -m "feat(vw_auditoria): relatorio de leitura do dashboard de auditoria"

git add package.json bun.lock web/
git commit -m "feat(momentive): dashboard web de exportacao"

git add CLAUDE.md
git commit -m "docs: registra vw_auditoria e vw_auditoria_semanal no CLAUDE.md"
```

Antes de cada `commit`, `git diff --cached --stat` para conferir que o grupo tem só o que o título diz. Se `clients/vw/` misturar mudanças claramente independentes, dividir.

- [x] **Step 4: conferir**

Run: `git status --short`
Expected: vazio.

Run: `bun test`
Expected: todos passam.

---

### Task 2: Título, referência e duplicado (partes puras de `publicar.ts`)

Padrão já publicado à mão no portal em 22/09: título `Relatório Semanal Auditoria - Semana 3`, referência `Setembro/2026`, assunto `Auditoria`, para a semana 14–20/09. N = semana do mês do **domingo** que fecha a semana lida.

**Files:**
- Create: `clients/vw_auditoria_semanal/publicar.ts`
- Test: `clients/vw_auditoria_semanal/publicar.test.ts`

- [x] **Step 1: teste que falha**

`clients/vw_auditoria_semanal/publicar.test.ts`:

```ts
import { expect, test } from "bun:test";
import { janela, semanaPassada } from "./queries";
import { campos, jaPublicado } from "./publicar";

const dia = (s: string) => new Date(s + "T00:00:00Z");

test("bate com o que foi publicado à mão em 22/09 (semana 14–20/09)", () => {
  const fim = janela(semanaPassada(dia("2026-09-22"))).fim;
  expect(campos(fim)).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Setembro/2026" });
});

test("número da semana e mês saem do domingo", () => {
  expect(campos(dia("2026-09-27"))).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 4", referencia: "Setembro/2026" });
  expect(campos(dia("2026-08-31"))).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 5", referencia: "Agosto/2026" });
});

test("semana que cruza o mês vai para o mês do domingo", () => {
  const fim = janela(semanaPassada(dia("2026-10-06"))).fim; // 28/09–04/10
  expect(campos(fim)).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 1", referencia: "Outubro/2026" });
});

test("duplicado exige título e referência iguais", () => {
  const lista = [{ titulo: "Relatório Semanal Auditoria - Semana 3", assunto: "Auditoria", referencia: "Setembro/2026" }];
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Setembro/2026" })).toBe(true);
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Outubro/2026" })).toBe(false);
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 4", referencia: "Setembro/2026" })).toBe(false);
});
```

- [x] **Step 2: rodar e ver falhar**

Run: `bun test clients/vw_auditoria_semanal/publicar.test.ts`
Expected: FAIL — `Cannot find module './publicar'`.

- [x] **Step 3: implementação mínima**

`clients/vw_auditoria_semanal/publicar.ts`:

```ts
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Campos = { titulo: string; referencia: string };

/** Padrão do que já foi publicado à mão no portal. `fim` é o domingo da semana lida. */
export function campos(fim: Date): Campos {
  return {
    titulo: `Relatório Semanal Auditoria - Semana ${Math.ceil(fim.getUTCDate() / 7)}`,
    referencia: `${MESES[fim.getUTCMonth()]}/${fim.getUTCFullYear()}`,
  };
}

export const jaPublicado = (lista: Campos[], c: Campos) =>
  lista.some((r) => r.titulo === c.titulo && r.referencia === c.referencia);
```

- [x] **Step 4: rodar e ver passar**

Run: `bun test clients/vw_auditoria_semanal/publicar.test.ts`
Expected: 4 pass.

- [x] **Step 5: commit**

```bash
git add clients/vw_auditoria_semanal/publicar.ts clients/vw_auditoria_semanal/publicar.test.ts
git commit -m "feat(vw_auditoria_semanal): titulo e referencia no padrao do portal"
```

---

### Task 3: Upload no portal e `build.ts --publicar`

API do portal (`RelatorioController.cs` do repo VwAuditoria): erro vem com **HTTP 200 e `status: 1`** no corpo; `titulo` ≤ 50, `referencia` ≤ 30. `GET /api/relatorio` devolve a lista sem o arquivo.

**Files:**
- Modify: `clients/vw_auditoria_semanal/publicar.ts`
- Modify: `core/build.ts` (bloco `if (import.meta.main)` no fim do arquivo)
- Modify: `clients/vw_auditoria_semanal/.env.example`

- [x] **Step 1: `publicar()`**

Acrescentar em `clients/vw_auditoria_semanal/publicar.ts` (import no topo do arquivo):

```ts
import { janela, semanaPassada } from "./queries.ts";
```

```ts
/** Sem default, mesma regra do banco: publicar no portal errado em silêncio é pior que falhar. */
function env(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não definida (clients/vw_auditoria_semanal/.env)`);
  return v;
}

/** O portal devolve erro com HTTP 200 e `status: 1` — o código HTTP sozinho não serve. */
async function portal(path: string, init: RequestInit = {}) {
  const r = await fetch(env("PORTAL_URL").replace(/\/$/, "") + path, init);
  const body = (await r.json().catch(() => null)) as { status: number; data: any; error: string | null } | null;
  if (!r.ok || body?.status !== 0) throw new Error(`portal ${path}: HTTP ${r.status} ${body?.error ?? ""}`.trim());
  return body.data;
}

export async function publicar(pdf: string) {
  const c = campos(janela(semanaPassada()).fim);
  if (c.titulo.length > 50 || c.referencia.length > 30) throw new Error(`campo longo demais para o portal: ${JSON.stringify(c)}`);

  const login = new FormData();
  login.append("login", env("PORTAL_LOGIN"));
  login.append("password", env("PORTAL_SENHA"));
  const { accessToken } = await portal("/api/login", { method: "POST", body: login });
  if (!accessToken) throw new Error("portal /api/login: sem accessToken na resposta");
  // O portal hoje aceita sem token; manda mesmo assim para não quebrar quando a autorização voltar.
  const headers = { Authorization: `Bearer ${accessToken}` };

  if (jaPublicado(await portal("/api/relatorio", { headers }), c)) {
    console.log(`· já publicado: ${c.titulo} · ${c.referencia}`);
    return;
  }

  const form = new FormData();
  form.append("titulo", c.titulo);
  form.append("assunto", "Auditoria");
  form.append("referencia", c.referencia);
  form.append("arquivo", Bun.file(pdf), "relatorio.pdf");
  form.append("arquivoMimeType", "application/pdf");
  await portal("/api/relatorio", { method: "POST", headers, body: form });
  console.log(`✓ publicado: ${c.titulo} · ${c.referencia}`);
}
```

- [x] **Step 2: `--publicar` no CLI**

Em `core/build.ts`, substituir o bloco final:

```ts
if (import.meta.main) {
  const client = process.env.CLIENT;
  // O .env vive em clients/<id>/, fora do cwd — o auto-load do Bun nao o pega,
  // dai o --env-file explicito. Sem ele a falha e' um DB_HOST ausente confuso.
  if (!client) throw new Error("CLIENT não definida. Ex: CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts");
  await gerar(client);
}
```

por:

```ts
if (import.meta.main) {
  const client = process.env.CLIENT;
  // O .env vive em clients/<id>/, fora do cwd — o auto-load do Bun nao o pega,
  // dai o --env-file explicito. Sem ele a falha e' um DB_HOST ausente confuso.
  if (!client) throw new Error("CLIENT não definida. Ex: CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts");
  await gerar(client);

  // Só com a flag: o loop local de design nunca publica.
  if (process.argv.includes("--publicar")) {
    const pdf = `out/${client}/relatorio.pdf`;
    if (!(await Bun.file(pdf).exists())) throw new Error("--publicar sem PDF — rode no container (weasyprint)");
    const { publicar } = await import(`../clients/${client}/publicar.ts`);
    await publicar(pdf);
  }
}
```

- [x] **Step 3: `.env.example`**

Acrescentar ao fim de `clients/vw_auditoria_semanal/.env.example`:

```
# Portal VwAuditoria — só usado com `core/build.ts --publicar` (servidor de produção).
PORTAL_URL=https://vwauditoria.azurewebsites.net
PORTAL_LOGIN=
PORTAL_SENHA=
```

- [x] **Step 4: tipos e testes**

Run: `bunx tsc --noEmit`
Expected: sem erros.

Run: `bun test`
Expected: tudo passa.

Run (sem publicar, confere que o fluxo local não mudou): `CLIENT=_template bun run core/build.ts`
Expected: `✓ out/_template/relatorio.html`, sem nenhuma linha de portal.

- [x] **Step 5: commit**

```bash
git add clients/vw_auditoria_semanal/publicar.ts clients/vw_auditoria_semanal/.env.example core/build.ts
git commit -m "feat(vw_auditoria_semanal): publica o pdf no portal com --publicar, sem duplicar"
```

---

### Task 4: Servidor HTTP

**Files:**
- Create: `core/server.ts`
- Test: `core/server.test.ts`

Rotas: `GET /saude` → 200. `POST /gerar/:client` com `Authorization: Bearer <token>` e corpo opcional `{"hoje":"AAAA-MM-DD"}`. 401 sem token certo; 404 se `clients/<id>` ou `env/<id>.env` não existem; 400 `hoje` malformado; 409 se o cliente já está rodando; 200/500 conforme o subprocesso.

- [x] **Step 1: teste que falha**

`core/server.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { app } from "./server";

// _template existe em clients/; o env é criado só para o teste.
beforeAll(() => { mkdirSync("env", { recursive: true }); writeFileSync("env/_template.env", ""); });
afterAll(() => rmSync("env/_template.env"));

const req = (path: string, init: RequestInit = {}) =>
  new Request("http://gerador" + path, { method: "POST", headers: { authorization: "Bearer t" }, ...init });
const ok = async () => ({ ok: true, log: "fim" });

test("saude responde sem token", async () => {
  expect((await app("t", ok)(new Request("http://gerador/saude"))).status).toBe(200);
});

test("token errado ou ausente é 401", async () => {
  const f = app("t", ok);
  expect((await f(req("/gerar/_template", { headers: {} }))).status).toBe(401);
  expect((await f(req("/gerar/_template", { headers: { authorization: "Bearer x" } }))).status).toBe(401);
});

test("cliente sem pasta ou sem env é 404", async () => {
  const f = app("t", ok);
  expect((await f(req("/gerar/nao_existe"))).status).toBe(404);
  expect((await f(req("/gerar/basf"))).status).toBe(404); // pasta existe, env/basf.env não
});

test("hoje malformado é 400", async () => {
  const r = await app("t", ok)(req("/gerar/_template", { body: JSON.stringify({ hoje: "22/09/2026" }) }));
  expect(r.status).toBe(400);
});

test("repassa cliente e hoje; 200 quando o processo termina bem", async () => {
  let recebido: unknown[] = [];
  const f = app("t", async (...a) => { recebido = a; return { ok: true, log: "fim" }; });
  const r = await f(req("/gerar/_template", { body: JSON.stringify({ hoje: "2026-09-22" }) }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, log: "fim" });
  expect(recebido).toEqual(["_template", "2026-09-22"]);
});

test("processo que falha vira 500 com o log", async () => {
  const r = await app("t", async () => ({ ok: false, log: "boom" }))(req("/gerar/_template"));
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ ok: false, log: "boom" });
});

test("segunda chamada concorrente do mesmo cliente é 409", async () => {
  let solta!: () => void;
  const f = app("t", () => new Promise((r) => { solta = () => r({ ok: true, log: "" }); }));
  const primeira = f(req("/gerar/_template"));
  await Bun.sleep(10);
  expect((await f(req("/gerar/_template"))).status).toBe(409);
  solta();
  expect((await primeira).status).toBe(200);

  // liberou: a próxima chamada roda de novo (e o novo `solta` a encerra)
  const terceira = f(req("/gerar/_template"));
  await Bun.sleep(10);
  solta();
  expect((await terceira).status).toBe(200);
});
```

- [x] **Step 2: rodar e ver falhar**

Run: `bun test core/server.test.ts`
Expected: FAIL — `Cannot find module './server'`.

- [x] **Step 3: implementação**

`core/server.ts`:

```ts
import { existsSync } from "node:fs";

type Resultado = { ok: boolean; log: string };
type Rodar = (client: string, hoje?: string) => Promise<Resultado>;

/**
 * Cada execução é um processo com o .env só daquele cliente: o servidor não
 * carrega credencial de banco/portal de ninguém, e um cliente nunca vê a de outro.
 */
async function rodarBuild(client: string, hoje?: string): Promise<Resultado> {
  const env: Record<string, string> = { CLIENT: client };
  for (const k of ["PATH", "HOME", "XDG_CACHE_HOME", "TZ"]) if (process.env[k]) env[k] = process.env[k]!;
  if (hoje) env.HOJE = hoje;
  const p = Bun.spawn(["bun", `--env-file=env/${client}.env`, "run", "core/build.ts", "--publicar"], {
    env, stdout: "pipe", stderr: "pipe", timeout: 5 * 60_000,
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  const log = (out + err).trim().split("\n").slice(-30).join("\n");
  console.log(`[${client}] exit ${code}\n${log}`);
  return { ok: code === 0, log };
}

export function app(token: string, rodar: Rodar = rodarBuild) {
  const rodando = new Set<string>(); // ponytail: lock em memória, basta com uma réplica
  return async (req: Request) => {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/saude") return new Response("ok");

    const m = url.pathname.match(/^\/gerar\/([\w-]+)$/);
    if (req.method !== "POST" || !m) return new Response("não encontrado", { status: 404 });
    if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response("não autorizado", { status: 401 });

    const client = m[1]!;
    if (!existsSync(`clients/${client}`) || !existsSync(`env/${client}.env`))
      return Response.json({ ok: false, log: `cliente sem pasta ou sem env: ${client}` }, { status: 404 });

    const { hoje } = (await req.json().catch(() => ({}))) as { hoje?: string };
    if (hoje !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(hoje))
      return Response.json({ ok: false, log: `hoje inválido: ${hoje}` }, { status: 400 });

    if (rodando.has(client)) return Response.json({ ok: false, log: "já em execução" }, { status: 409 });
    rodando.add(client);
    try {
      const r = await rodar(client, hoje);
      return Response.json(r, { status: r.ok ? 200 : 500 });
    } finally {
      rodando.delete(client);
    }
  };
}

if (import.meta.main) {
  const token = process.env.GERADOR_TOKEN;
  if (!token) throw new Error("GERADOR_TOKEN não definida");
  // idleTimeout 0: o padrão (10s) derruba a conexão antes do PDF ficar pronto.
  Bun.serve({ port: 3000, idleTimeout: 0, fetch: app(token) });
  console.log("→ gerador ouvindo em :3000");
}
```

- [x] **Step 4: rodar e ver passar**

Run: `bun test core/server.test.ts`
Expected: 7 pass.

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [x] **Step 5: fumaça real (sem banco, sem portal)**

```bash
mkdir -p env && : > env/_template.env
GERADOR_TOKEN=t bun run core/server.ts &
sleep 1
curl -s -X POST -H "Authorization: Bearer t" localhost:3000/gerar/_template
kill %1; rm env/_template.env
```

Expected: `{"ok":false,"log":"...--publicar sem PDF..."}` (fora do container não há weasyprint; o `_template` gera o HTML e a flag falha como deveria). Isso prova subprocesso + env isolado + log de volta.

- [x] **Step 6: commit**

```bash
git add core/server.ts core/server.test.ts
git commit -m "feat(core): servidor http que gera e publica por cliente, com env isolado"
```

---

### Task 5: Imagem — servidor como CMD, renomeação e script de push

**Files:**
- Modify: `Dockerfile` (última linha `CMD`)
- Modify: `compose.yaml`
- Modify: `package.json`
- Modify: `CLAUDE.md` (seção "Tamanho da imagem")
- Create: `scripts/imagem.sh`

- [x] **Step 1: Dockerfile**

Trocar as duas últimas linhas:

```dockerfile
# Sem HEALTHCHECK de proposito: job em batch que roda e sai — o exit code e' o sinal.
CMD ["bun", "run", "core/build.ts"]
```

por:

```dockerfile
# Em produção fica no ar esperando o n8n (deploy/compose.yaml). O compose de
# desenvolvimento troca por core/build.ts via `command:`.
CMD ["bun", "run", "core/server.ts"]
```

- [x] **Step 2: compose.yaml de desenvolvimento**

- `image: basf-relatorio:latest` → `image: gerador-relatorios:latest`; ajustar o comentário acima (a pasta não se chama mais igual ao serviço; o motivo de fixar continua: sem isso vira `{pasta}-relatorio`).
- Logo abaixo de `image:`, acrescentar:

```yaml
    # A imagem sobe o servidor HTTP por padrão; aqui continua sendo job que roda e sai.
    command: ["bun", "run", "core/build.ts"]
```

- [x] **Step 3: package.json**

- `"name": "basf-relatorio"` → `"name": "gerador-relatorios"`.
- Em `"scripts"`, acrescentar `"imagem": "bash scripts/imagem.sh"`.

- [x] **Step 4: `scripts/imagem.sh`**

```bash
#!/usr/bin/env bash
# Publica a imagem de produção. Uso: bun run imagem 1.0.0
set -euo pipefail
v="${1:?uso: bun run imagem <versão>}"
repo=logicasolucoesanaliticas/logicaprivado

# A imagem leva o código: publicar com mudança sem commit gera versão que não existe no git.
[ -z "$(git status --porcelain)" ] || { echo "git com mudanças pendentes — commite antes"; exit 1; }

docker build --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
  -t "$repo:gerador-relatorios-$v" -t "$repo:gerador-relatorios-latest" .
docker push "$repo:gerador-relatorios-$v"
docker push "$repo:gerador-relatorios-latest"
```

- [x] **Step 5: CLAUDE.md**

Na seção "Tamanho da imagem", trocar `basf-relatorio` por `gerador-relatorios` nas duas menções (o `docker image inspect` e o parágrafo do `compose.yaml` que fixa `image:`).

- [x] **Step 6: conferir que o fluxo local não mudou**

Run: `docker compose build && docker compose run --rm -e CLIENT=_template relatorio`
Expected: `✓ out/_template/relatorio.pdf`.

Run: `docker image inspect gerador-relatorios --format '{{.Config.Cmd}}'`
Expected: `[bun run core/server.ts]`.

- [x] **Step 7: commit**

```bash
git add Dockerfile compose.yaml package.json scripts/imagem.sh CLAUDE.md
git commit -m "chore: imagem sobe o servidor, renomeia para gerador-relatorios e script de push"
```

---

### Task 6: Arquivos de deploy

**Files:**
- Create: `deploy/compose.yaml`
- Create: `deploy/README.md`
- Modify: `CLAUDE.md` (nova seção depois de `## Comandos`)
- Modify: `clients/vw_auditoria_semanal/CLAUDE.md` (nova seção depois de `## Comando`)

- [x] **Step 1: `deploy/compose.yaml`**

```yaml
# Produção: servidor do n8n. Copie esta pasta para /opt/gerador-relatorios/ (ver README.md).
services:
  gerador:
    image: logicasolucoesanaliticas/logicaprivado:gerador-relatorios-latest
    restart: unless-stopped
    environment:
      GERADOR_TOKEN: ${GERADOR_TOKEN:?defina GERADOR_TOKEN no .env ao lado}
      TZ: America/Sao_Paulo
    volumes:
      - ./env:/app/env:ro
      - ./out:/app/out
    # Sem ports: só o n8n, na mesma rede, chama http://gerador:3000.
    networks: [n8n]
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    mem_limit: 1g
    cpus: 2.0
    healthcheck:
      test: ["CMD", "bun", "-e", "process.exit((await fetch('http://localhost:3000/saude')).ok ? 0 : 1)"]
      interval: 1m

networks:
  n8n:
    external: true
    name: ${N8N_NETWORK:?defina N8N_NETWORK no .env ao lado (docker network ls)}
```

- [x] **Step 2: `deploy/README.md`**

````markdown
# Deploy — servidor do n8n

O gerador roda como container na mesma rede Docker do n8n. O n8n chama
`POST http://gerador:3000/gerar/<cliente>`; o gerador gera o PDF e publica no portal do cliente.

## Primeira vez

```bash
mkdir -p /opt/gerador-relatorios/env /opt/gerador-relatorios/out
cd /opt/gerador-relatorios
# copie deploy/compose.yaml deste repositório para cá
chown 1000:1000 out            # o container roda como usuário bun (uid 1000)

docker network ls              # ache a rede do container do n8n
docker inspect <container-n8n> --format '{{json .NetworkSettings.Networks}}'

cat > .env <<EOF
GERADOR_TOKEN=$(openssl rand -hex 32)
N8N_NETWORK=<nome da rede>
EOF
chmod 600 .env

docker login -u logicasolucoesanaliticas   # uma vez; token de leitura basta
```

Um arquivo por cliente em `env/<cliente>.env`, com `chmod 600`. Para o semanal VW,
`env/vw_auditoria_semanal.env` com as chaves de `clients/vw_auditoria_semanal/.env.example`
preenchidas para produção (`DB_HOST` do Azure SQL, `DB_TRUST_CERT` vazio, `PORTAL_*`).

## Conferir antes de ligar o n8n

```bash
# 1. banco alcançável e PDF sai (não publica)
docker compose run --rm -e CLIENT=vw_auditoria_semanal --entrypoint bun gerador \
  --env-file=env/vw_auditoria_semanal.env run core/build.ts

# 2. servidor no ar
docker compose up -d && docker compose ps     # STATUS healthy após ~1 min

# 3. de dentro do n8n, semana já publicada à mão (14–20/09) — deve dizer "já publicado"
docker exec <container-n8n> wget -qO- --header "Authorization: Bearer <token>" \
  --post-data '{"hoje":"2026-09-22"}' http://gerador:3000/gerar/vw_auditoria_semanal
```

Falhou o 1 com timeout de conexão? Liberar o IP de saída do servidor no firewall do Azure SQL.

## Atualizar

```bash
cd /opt/gerador-relatorios && docker compose pull && docker compose up -d
```

Versão publicada: `bun run imagem <versão>` na máquina de desenvolvimento, com git limpo.

## Reprocessar uma semana

Mesmo POST com `{"hoje":"AAAA-MM-DD"}` de um dia da semana **seguinte** à que se quer.
Semana já publicada (mesmo título e referência) é pulada — para republicar, apague no portal antes.
````

- [x] **Step 3: CLAUDE.md da raiz**

Depois do bloco de `## Comandos`, antes de `## Tamanho da imagem`, acrescentar:

```markdown
## Produção

A imagem sobe `core/server.ts`: o n8n chama `POST /gerar/<cliente>` e cada chamada roda
`core/build.ts --publicar` num processo com só `env/<cliente>.env` — o servidor não carrega
credencial de cliente nenhum. `--publicar` chama `clients/<id>/publicar.ts` depois do PDF; cliente
sem esse arquivo não publica. Deploy, verificação e atualização: `deploy/README.md`.
Publicar imagem: `bun run imagem <versão>` (recusa com git sujo).
```

- [x] **Step 4: CLAUDE.md do semanal**

Depois da seção `## Comando`, acrescentar:

```markdown
## Publicação no portal

`core/build.ts --publicar` sobe o PDF em `PORTAL_URL` (portal VwAuditoria) com assunto
`Auditoria`, título `Relatório Semanal Auditoria - Semana N` e referência `Mês/AAAA` — o padrão do
que já era publicado à mão. N e o mês saem do **domingo** da semana lida: 28/09–04/10 é
`Outubro/2026` Semana 1. Mesmo título + referência já no portal → não envia de novo, então o n8n pode
repetir a chamada. O portal devolve erro com HTTP 200 e `status: 1`; `publicar.ts` checa o corpo.
```

- [x] **Step 5: commit**

```bash
git add deploy/ CLAUDE.md clients/vw_auditoria_semanal/CLAUDE.md
git commit -m "docs: deploy do gerador no servidor do n8n"
```

---

### Task 7: Verificação local de ponta a ponta (sem gravar no portal)

**Precisa do usuário:** `PORTAL_URL`, `PORTAL_LOGIN`, `PORTAL_SENHA` em `clients/vw_auditoria_semanal/.env` e o SQL Server local ligado. Pedir antes de começar.

A semana 14–20/09 já foi publicada à mão com exatamente `Relatório Semanal Auditoria - Semana 3` / `Setembro/2026`. Rodar com `HOJE=2026-09-22` exercita login + listagem + duplicado **sem enviar nada**.

- [x] **Step 1: PDF + publicar em modo duplicado**

```bash
docker compose run --rm --env-from-file clients/vw_auditoria_semanal/.env \
  -e CLIENT=vw_auditoria_semanal -e DB_HOST=host.docker.internal -e HOJE=2026-09-22 \
  relatorio bun run core/build.ts --publicar
```

Expected: `✓ out/vw_auditoria_semanal/relatorio.pdf` e `· já publicado: Relatório Semanal Auditoria - Semana 3 · Setembro/2026`. Nada novo em `GET https://vwauditoria.azurewebsites.net/api/relatorio`.

- [x] **Step 2: PDF continua com 3 páginas**

```bash
docker compose run --rm --entrypoint pdfinfo relatorio out/vw_auditoria_semanal/relatorio.pdf | grep Pages
```

Expected: `Pages: 3`.

- [x] **Step 3: credencial errada falha alto**

Mesmo comando do Step 1 com `-e PORTAL_SENHA=errada`.
Expected: exit code ≠ 0 e mensagem `portal /api/login: HTTP 200 ...` (ou equivalente com o erro do portal).

- [x] **Step 4: `bun test` e `bunx tsc --noEmit`**

Expected: tudo verde.

O primeiro envio real fica para a Task 9, já do servidor — publicar daqui criaria o relatório da Semana 4 fora do fluxo.

---

### Task 8 (humano): publicar a imagem e subir no servidor

- [ ] `bun run imagem 1.0.0` na máquina de desenvolvimento (git limpo).
- [ ] No servidor, via AnyDesk: seguir `deploy/README.md` → "Primeira vez" e "Conferir antes de ligar o n8n" (passos 1–3).
- [ ] Guardar o `GERADOR_TOKEN` gerado — vai para a credencial do n8n na Task 9.

---

### Task 9 (sessão nova com n8n-mcp): workflow no n8n

Numa sessão nova do Claude Code (as ferramentas do n8n-mcp só carregam em sessão nova):

- [ ] Credencial **Header Auth** `Gerador relatórios`: header `Authorization`, valor `Bearer <GERADOR_TOKEN>`.
- [x] E-mail de falha pela credencial `Microsoft Outlook account` que já existe no n8n (decidido em 29/09) — não criar SMTP.
- [ ] Workflow `VW — Auditoria semanal → portal`:
  1. **Schedule Trigger**: toda segunda, 06:00. Settings do workflow: timezone `America/Sao_Paulo`.
  2. **HTTP Request**: `POST http://gerador:3000/gerar/vw_auditoria_semanal`, auth pela credencial acima, body JSON `{"hoje": "{{ $now.setZone('America/Sao_Paulo').toFormat('yyyy-MM-dd') }}"}`, timeout 360000 ms, "Never Error" em response (para o IF ver o 500), "On Error: Continue" (para timeout/rede).
  3. **IF** `{{ $json.ok }}` é `true` → fim.
  4. **Microsoft Outlook → Send** (ramo falso, credencial `Microsoft Outlook account`): para `alexandrescarano@gmail.com, rodrigo.otavio@seudash.com.br`, assunto `Falha no relatório semanal VW`, corpo com `{{ $json.log ?? $json.error?.message }}`.
- [ ] Rodar manualmente uma vez: gera e publica a semana corrente de verdade. Conferir no portal (título, referência, PDF abre).
- [ ] Rodar manualmente de novo: deve responder `já publicado`.
- [ ] Forçar falha (trocar o token na credencial por um errado), rodar, conferir que o e-mail chega; desfazer.
- [ ] Ativar o workflow.

---

### Task 10 (humano, fora do repositório): pendências de segurança

Não bloqueiam o deploy, mas estão abertas:

- [ ] Rodrigo: religar `[CoreAuthorize]` no `RelatorioController` do portal (listar, baixar, criar e apagar funcionam sem login).
- [ ] Trocar `admin/admin` do portal; de preferência um usuário próprio para o robô. Só muda `env/vw_auditoria_semanal.env` no servidor.
- [ ] Rotacionar a API key do n8n (foi colada no chat) e `claude mcp remove n8n-mcp -s user` + `add` com a nova. A atual vence ~28/10/2026.
