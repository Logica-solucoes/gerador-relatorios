import { expect, test } from "bun:test";
import { resumir } from "./log";

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
