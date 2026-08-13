import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";

const { document } = parseHTML("<!doctype html><html><body></body></html>");

const ESTILO = {
  background: "transparent",
  color: "#71717a",
  fontSize: "10px",
  fontFamily: "Geist, sans-serif",
};

/**
 * Renderiza um spec do Plot para string SVG, sem browser.
 * Dois ajustes exigidos pelo WeasyPrint:
 *  - remove o <style> que o Plot injeta (`height:auto` para ser responsivo no
 *    browser) — ali ele descola a altura do viewBox;
 *  - repete width/height como CSS: o WeasyPrint ignora os atributos de
 *    apresentacao em SVG inline e sem isso o bloco vira quadrado.
 */
export function plot(spec: Plot.PlotOptions): string {
  const el = Plot.plot({
    document,
    style: { ...ESTILO, width: `${spec.width}px`, height: `${spec.height}px` },
    ...spec,
  }) as unknown as Element;
  return el.outerHTML.replace(/<style>[\s\S]*?<\/style>/, "");
}

// ── formatacao pt-BR ──────────────────────────────────────────────────────
const nf = (d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const mi = (n: number) => nf(2).format(n / 1e6);
export const num = (n: number, d = 0) => nf(d).format(n);
export const pct = (n: number, d = 1) => nf(d).format(n) + "%";
export const sinal = (n: number, d = 1) => (n > 0 ? "+" : "−") + nf(d).format(Math.abs(n)) + "%";
export const dt = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
export const varPct = (a: number, b: number) => ((b - a) / Math.abs(a)) * 100;
/** Primeira palavra significativa do nome, para tabelas apertadas. */
export const curto = (s: string, n = 26) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

/** Largura util do conteudo em A4 (182mm @96dpi) — mesma pra qualquer cliente. */
export const L = 680;
