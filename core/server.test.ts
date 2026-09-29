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
