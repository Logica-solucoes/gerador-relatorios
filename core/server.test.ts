import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "./server";

// _template existe em clients/; o env é criado só para o teste.
beforeAll(() => { mkdirSync("env", { recursive: true }); writeFileSync("env/_template.env", ""); });
afterAll(() => rmSync("env/_template.env"));

const req = (path: string, init: RequestInit = {}) =>
  new Request("http://gerador" + path, { method: "POST", headers: { authorization: "Bearer t" }, ...init });
const ok = async () => ({ exitCode: 0, saida: "→ [_template] carregando dados…" });
const dirLog = () => mkdtempSync(join(tmpdir(), "srv-"));

test("saude responde sem token", async () => {
  expect((await app("t", ok, dirLog())(new Request("http://gerador/saude"))).status).toBe(200);
});

test("token errado ou ausente é 401", async () => {
  const f = app("t", ok, dirLog());
  expect((await f(req("/gerar/_template", { headers: {} }))).status).toBe(401);
  expect((await f(req("/gerar/_template", { headers: { authorization: "Bearer x" } }))).status).toBe(401);
});

test("cliente sem pasta ou sem env é 404 com resumo", async () => {
  const f = app("t", ok, dirLog());
  const r = await f(req("/gerar/nao_existe"));
  expect(r.status).toBe(404);
  expect((await r.json()).resumo).toContain("nao_existe");
  expect((await f(req("/gerar/basf"))).status).toBe(404); // pasta existe, env/basf.env não
});

test("hoje malformado é 400", async () => {
  const f = app("t", ok, dirLog());
  for (const hoje of ["22/09/2026", "2026-02-31", "2026-13-01"])
    expect((await f(req("/gerar/_template", { body: JSON.stringify({ hoje }) }))).status).toBe(400);
  expect((await f(req("/gerar/_template", { body: "null" }))).status).toBe(200);
});

test("repassa cliente e hoje; 200 com id e resumo; grava o log", async () => {
  let recebido: unknown[] = [];
  const dir = dirLog();
  const f = app("t", async (...a) => { recebido = a; return ok(); }, dir);
  const r = await f(req("/gerar/_template", { body: JSON.stringify({ hoje: "2026-09-22" }) }));

  expect(r.status).toBe(200);
  const corpo = await r.json();
  expect(corpo.ok).toBe(true);
  expect(corpo.id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/);
  expect(corpo.resumo).toContain("Cliente: _template");
  expect(recebido).toEqual(["_template", "2026-09-22"]);

  const [arquivo] = readdirSync(dir);
  const registro = JSON.parse(readFileSync(join(dir, arquivo!), "utf8"));
  expect(registro).toMatchObject({
    level: "info", id: corpo.id, cliente: "_template", hoje: "2026-09-22", exitCode: 0,
    saida: "→ [_template] carregando dados…",
  });
});

test("processo que falha vira 500 com o erro no resumo e registro error", async () => {
  const dir = dirLog();
  const r = await app("t", async () => ({ exitCode: 1, saida: "→ [_template] carregando dados…\nerror: boom" }), dir)(req("/gerar/_template"));
  expect(r.status).toBe(500);
  const corpo = await r.json();
  expect(corpo.ok).toBe(false);
  expect(corpo.resumo).toContain("Parou em: carregando dados…");
  expect(corpo.resumo).toContain("Erro: boom");
  const [arquivo] = readdirSync(dir);
  expect(JSON.parse(readFileSync(join(dir, arquivo!), "utf8")).level).toBe("error");
});

test("falha ao gravar o log não muda a resposta", async () => {
  // Um arquivo no lugar do diretório faz o pino falhar ao abrir o destino.
  const dir = join(dirLog(), "ocupado");
  writeFileSync(dir, "");
  const r = await app("t", ok, dir)(req("/gerar/_template"));
  expect(r.status).toBe(200);
  expect((await r.json()).ok).toBe(true);
});

test("segunda chamada concorrente do mesmo cliente é 409", async () => {
  let solta!: () => void;
  const f = app("t", () => new Promise((r) => { solta = () => r({ exitCode: 0, saida: "" }); }), dirLog());
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
