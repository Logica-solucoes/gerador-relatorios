import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gravar, limpar, novoId, resumir, textoResumo } from "./log";

// Saídas reais coletadas no deploy de 2026-10-14 (stdout + stderr, nessa ordem).
const LOGIN_FALHOU = `→ [vw_auditoria_semanal] carregando dados…
ConnectionError: Login failed for user 'vw'.
      code: "ELOGIN"
      at <anonymous> (/app/node_modules/mssql/lib/tedious/connection-pool.js:86:17)
error: Login failed for user 'vw'.
 code: "ELOGIN"
      at onErrorMessage (/app/node_modules/tedious/lib/token/handler.js:186:19)
Bun v1.3.14 (Linux x64 baseline)`;

const VIEW_FALTANDO = `→ [vw_auditoria_semanal] carregando dados…
RequestError: Invalid object name 'vw_volks_leads_auditados'.
error: Invalid object name 'vw_volks_leads_auditados'.
Bun v1.3.14 (Linux x64 baseline)`;

const WEASYPRINT = `→ [vw_auditoria_semanal] carregando dados…
→ semana 2026-10-05 a 2026-10-11 · mês 2026-10-01 a 2026-10-11
→ [vw_auditoria_semanal] renderizando gráficos e páginas…
✓ out/vw_auditoria_semanal/relatorio.html (195 KB)
→ [vw_auditoria_semanal] gerando PDF…
error: weasyprint falhou
      at gerar (/app/core/build.ts:60:51)
Bun v1.3.14 (Linux x64 baseline)`;

const PUBLICADO = `→ [vw_auditoria_semanal] carregando dados…
→ semana 2026-10-05 a 2026-10-11 · mês 2026-10-01 a 2026-10-11
→ [vw_auditoria_semanal] renderizando gráficos e páginas…
✓ out/vw_auditoria_semanal/relatorio.html (195 KB)
→ [vw_auditoria_semanal] gerando PDF…
✓ out/vw_auditoria_semanal/relatorio.pdf (142 KB)
✓ publicado: Relatório Semanal Auditoria - Semana 2 · Outubro/2026
WARNING: Ignored \`print-color-adjust: exact\` at 48:52, unknown property.`;

test("falha no banco: etapa de carga e a mensagem da linha error:", () => {
  expect(resumir(LOGIN_FALHOU, 1)).toEqual({
    etapa: "carregando dados…",
    erro: "Login failed for user 'vw'.",
    semana: undefined,
  });
  expect(resumir(VIEW_FALTANDO, 1).erro).toBe("Invalid object name 'vw_volks_leads_auditados'.");
});

test("falha no PDF: última etapa, sem confundir a linha da semana com etapa", () => {
  expect(resumir(WEASYPRINT, 1)).toEqual({
    etapa: "gerando PDF…",
    erro: "weasyprint falhou",
    semana: "2026-10-05 a 2026-10-11 · mês 2026-10-01 a 2026-10-11",
  });
});

test("sucesso não tem erro", () => {
  expect(resumir(PUBLICADO, 0).erro).toBeUndefined();
});

test("falha sem linha error: usa a última linha não vazia", () => {
  expect(resumir("→ [x] carregando dados…\nSegmentation fault\n\n", 139).erro).toBe("Segmentation fault");
});

test("ignora cores ANSI", () => {
  expect(resumir("\x1b[31merror\x1b[0m: boom", 1).erro).toBe("boom");
});

// Meio-dia em Brasília: o dia local é o mesmo em qualquer fuso de -11h a +11h.
const AGORA = new Date("2026-10-14T12:00:00-03:00");

test("id tem data, hora e sufixo aleatório", () => {
  expect(novoId(AGORA)).toMatch(/^20261014-\d{6}-[0-9a-f]{4}$/);
  expect(novoId(AGORA)).not.toBe(novoId(AGORA));
});

test("texto do resumo omite linhas sem valor e só diz 'parou em' quando falhou", () => {
  const falha = textoResumo({
    cliente: "vw_auditoria_semanal", id: "20261014-120000-abcd", arquivo: "out/logs/2026-10-14.log",
    duracaoMs: 42_300, exitCode: 1, resumo: { etapa: "gerando PDF…", erro: "weasyprint falhou" },
  });
  expect(falha).toBe([
    "Cliente: vw_auditoria_semanal",
    "Parou em: gerando PDF…",
    "Erro: weasyprint falhou",
    "Duração: 42s",
    "Log completo: out/logs/2026-10-14.log (id 20261014-120000-abcd)",
  ].join("\n"));

  const ok = textoResumo({
    cliente: "x", id: "i", arquivo: "a", duracaoMs: 1000, exitCode: 0,
    resumo: { etapa: "gerando PDF…", semana: "2026-10-05 a 2026-10-11" },
  });
  expect(ok).not.toContain("Parou em");
  expect(ok).toContain("Semana: 2026-10-05 a 2026-10-11");
});

test("gravar escreve uma linha JSON no arquivo do dia, com nível legível", () => {
  const dir = mkdtempSync(join(tmpdir(), "log-"));
  const arquivo = gravar(dir, AGORA, { id: "a", saida: "linha 1\nlinha 2" }, false);
  gravar(dir, AGORA, { id: "b" }, true);

  expect(arquivo).toBe(join(dir, "2026-10-14.log"));
  const [r1, r2] = readFileSync(arquivo, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(r1).toMatchObject({ level: "info", id: "a", saida: "linha 1\nlinha 2" });
  expect(r2).toMatchObject({ level: "error", id: "b" });
  expect(typeof r1.time).toBe("string"); // ISO, não epoch
});

test("limpar apaga só logs com mais de 90 dias", () => {
  const dir = mkdtempSync(join(tmpdir(), "log-"));
  for (const f of ["2026-07-15.log", "2026-07-16.log", "2026-10-14.log", "anotacao.txt"]) writeFileSync(join(dir, f), "");
  limpar(dir, AGORA);
  expect(readdirSync(dir).sort()).toEqual(["2026-07-16.log", "2026-10-14.log", "anotacao.txt"]);
});
