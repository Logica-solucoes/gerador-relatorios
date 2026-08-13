import * as Plot from "@observablehq/plot";
import type { Dados } from "./queries";
import { plot, L, num, sinal, mi, curto, varPct } from "../../core/report";

const COR = {
  primary: "#004a96",
  accent: "#7a9a1f",
  soft: "#b2d235",
  red: "#c2001a",
  grey: "#a1a1aa",
  dark: "#3f3f46",
};

// ══ GRAFICOS ══════════════════════════════════════════════════════════════

function gWaterfall(d: Dados) {
  const b = d.bridge;
  const get = (e: string) => b.find((x) => x.etapa === e)!.valor;
  const base = get(`YTD 2025`);
  const passos = ["Export (intercompany)", "Clientes perdidos", "Retidos (variacao)", "Clientes novos"];
  const rotulo: Record<string, string> = {
    "Export (intercompany)": "Export\n(intercompany)",
    "Clientes perdidos": "Clientes\nperdidos",
    "Retidos (variacao)": "Retidos\n(variação)",
    "Clientes novos": "Clientes\nnovos",
  };

  let acc = base;
  const barras = [
    { etapa: "YTD 2025", y1: 0, y2: base, delta: base, tipo: "total" },
    ...passos.map((p) => {
      const v = get(p);
      const r = { etapa: rotulo[p]!, y1: acc, y2: acc + v, delta: v, tipo: v < 0 ? "neg" : "pos" };
      acc += v;
      return r;
    }),
    { etapa: "YTD 2026", y1: 0, y2: acc, delta: acc, tipo: "total" },
  ];

  return plot({
    width: L,
    height: 590,
    marginLeft: 44,
    marginBottom: 40,
    marginTop: 22,
    x: { label: null, tickSize: 0, domain: barras.map((b) => b.etapa) },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1e6), domain: [0, 72e6] },
    color: { domain: ["total", "neg", "pos"], range: [COR.primary, COR.red, COR.accent] },
    marks: [
      Plot.barY(barras, { x: "etapa", y1: "y1", y2: "y2", fill: "tipo", rx: 2 }),
      Plot.text(barras, {
        x: "etapa",
        y: (d: any) => Math.max(d.y1, d.y2),
        dy: -8,
        text: (d: any) => (d.tipo === "total" ? "" : d.delta > 0 ? "+" : "−") + num(Math.abs(d.delta) / 1e6, 2),
        fontSize: 10.5,
        fontWeight: 600,
        fill: (d: any) => (d.tipo === "neg" ? COR.red : d.tipo === "pos" ? COR.accent : COR.primary),
      }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gMensal(d: Dados) {
  const dados = d.mensalMercado.map((r) => ({ ...r, data: new Date(r.ano, r.mes - 1, 1) }));
  return plot({
    width: L,
    height: 380,
    marginLeft: 44,
    marginBottom: 26,
    marginRight: 58,
    x: { label: null, tickSize: 0 },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1e6) },
    color: { domain: ["Brasil", "Export"], range: [COR.primary, COR.soft] },
    marks: [
      Plot.areaY(dados, { x: "data", y: "fat", fill: "mercado", fillOpacity: 0.07, curve: "monotone-x" }),
      Plot.lineY(dados, { x: "data", y: "fat", stroke: "mercado", strokeWidth: 1.8, curve: "monotone-x" }),
      Plot.text(
        dados.filter((r) => r.ano === 2026 && r.mes === 6),
        { x: "data", y: "fat", text: "mercado", dx: 8, textAnchor: "start", fontSize: 9.5, fontWeight: 600, fill: "mercado" },
      ),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gReceitaVolume(d: Dados) {
  // Indexado em 2025 = 100 para expor o descolamento receita x volume.
  const linhas = ["Brasil", "Export"].flatMap((m) => {
    const a = d.precoVolume.find((r) => r.mercado === m && r.ano === 2025)!;
    const b = d.precoVolume.find((r) => r.mercado === m && r.ano === 2026)!;
    return [
      { mercado: m, metrica: "Receita", v: varPct(a.fat, b.fat) },
      { mercado: m, metrica: "Volume", v: varPct(a.vol, b.vol) },
    ];
  });
  return plot({
    width: 330,
    height: 280,
    marginLeft: 40,
    marginBottom: 42,
    marginTop: 26,
    fx: { label: null, tickSize: 0, padding: 0.3 },
    x: { label: null, tickSize: 0, domain: ["Receita", "Volume"] },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v) + "%", domain: [-75, 0] },
    color: { domain: ["Receita", "Volume"], range: [COR.primary, COR.grey] },
    marks: [
      Plot.barY(linhas, { fx: "mercado", x: "metrica", y: "v", fill: "metrica", rx: 2 }),
      Plot.text(linhas, {
        fx: "mercado",
        x: "metrica",
        y: "v",
        text: (r: any) => sinal(r.v, 1),
        dy: 11,
        fontSize: 8.5,
        fontWeight: 600,
        fill: COR.dark,
      }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

/** Codigos internos de cultura -> nome usado pela area comercial. */
const CULTURA: Record<string, string> = {
  WMW: "Melancia", MEM: "Melão", TOF: "Tomate", ONS: "Cebola", CAC: "Cenoura",
};

/** Variação preço x volume por cultura. Fonte única do gráfico e do texto da p.4. */
export function culturaVariacao(d: Dados) {
  return Object.keys(CULTURA)
    .map((k) => {
      const a = d.precoCultura.find((r) => r.cultura === k && r.ano === 2025);
      const b = d.precoCultura.find((r) => r.cultura === k && r.ano === 2026);
      if (!a || !b) return null;
      return {
        cultura: CULTURA[k]!,
        dPreco: ((b.preco - a.preco) / a.preco) * 100,
        dVol: ((b.vol - a.vol) / a.vol) * 100,
        fat: b.preco * b.vol,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function gPrecoCultura(d: Dados) {
  // Barras em escala log ficam ilegiveis (nao ha baseline zero). O que importa
  // e a DIRECAO: preco e volume subindo ou caindo juntos por cultura.
  const dados = culturaVariacao(d);

  return plot({
    width: 330,
    height: 305,
    marginLeft: 46,
    marginBottom: 40,
    marginTop: 18,
    marginRight: 62,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v) + "%" },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v) + "%" },
    r: { range: [4, 12] },
    marks: [
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
      Plot.dot(dados, {
        x: "dPreco",
        y: "dVol",
        r: "fat",
        fill: (r: any) => (r.dVol < 0 && r.dPreco < 0 ? COR.red : r.dVol < 0 ? "#e8a33d" : COR.accent),
        fillOpacity: 0.75,
      }),
      Plot.text(dados, { x: "dPreco", y: "dVol", text: "cultura", dx: 11, textAnchor: "start", fontSize: 9, fontWeight: 600, fill: COR.dark }),
      Plot.axisX({ label: "variação de preço por mil sementes", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
      Plot.axisY({ label: "variação de volume", labelAnchor: "center", labelOffset: 40, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
    ],
  });
}

/** "SEEDS STANDARD TREATMENT" -> "Seeds · Standard" (cabia no eixo). */
function nomeTratamento(s: string) {
  const t = s
    .replace(/ STANDARD TREATMENT$/, " · Standard")
    .replace(/ FARMORE F300$/, " · FarMore F300")
    .replace(/ – MAXIM$/, " · Maxim")
    .replace(/ UNTREATED$/, " · Sem tratamento");
  return t.replace(/\b([A-ZÀ-Ú])([A-ZÀ-Ú]+)\b/g, (_, a, b) => a + b.toLowerCase());
}

function gTratamento(d: Dados) {
  const dados = d.tratamento.map((r) => ({ ...r, tratamento: nomeTratamento(r.tratamento) }));
  return plot({
    width: L,
    height: 320,
    marginLeft: 130,
    marginRight: 74,
    marginBottom: 24,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1e6) },
    y: { label: null, tickSize: 0 },
    marks: [
      Plot.barX(dados, {
        x: "fat",
        y: "tratamento",
        sort: { y: "x", reverse: true },
        fill: COR.primary,
        rx: 2,
      }),
      Plot.text(dados, {
        x: "fat",
        y: "tratamento",
        text: (r: any) => "R$ " + num(r.preco, 0) + "/mil",
        dx: 6,
        textAnchor: "start",
        fontSize: 9,
        fontWeight: 500,
        fill: COR.dark,
      }),
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gPareto(d: Dados) {
  return plot({
    width: L,
    height: 400,
    marginLeft: 140,
    marginRight: 66,
    marginBottom: 24,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1e6) },
    y: { label: null, tickSize: 0 },
    marks: [
      Plot.barX(d.pareto, {
        x: "fat",
        y: (r: any) => curto(r.cliente, 20),
        sort: { y: "x", reverse: true },
        fill: (r: any) => (r.acum <= 66 ? COR.primary : "#c7d2df"),
        rx: 2,
      }),
      Plot.text(d.pareto, {
        x: "fat",
        y: (r: any) => curto(r.cliente, 20),
        text: (r: any) => num(r.acum, 0) + "% acum.",
        dx: 6,
        textAnchor: "start",
        fontSize: 8.5,
        fill: COR.grey,
      }),
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gCoorte(d: Dados) {
  const ordem = ["Retido", "Novo", "Reativado", "Perdido"];
  // Barras todas positivas: o eixo divergente empurrava o rotulo de "Perdido"
  // para fora da area util. A cor ja distingue perda de ganho.
  const dados = d.coorte.slice().sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status));
  return plot({
    width: 330,
    height: 265,
    marginLeft: 60,
    marginRight: 66,
    marginBottom: 24,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v) },
    y: { label: null, tickSize: 0, domain: ordem },
    marks: [
      Plot.barX(dados, {
        x: "clientes",
        y: "status",
        fill: (r: any) => (r.status === "Perdido" ? COR.red : r.status === "Retido" ? COR.primary : COR.accent),
        rx: 2,
      }),
      Plot.text(dados, {
        x: "clientes",
        y: "status",
        text: (r: any) => (r.fat < 0 ? "−" : "") + "R$ " + mi(Math.abs(r.fat)) + " Mi",
        dx: 6,
        textAnchor: "start",
        fontSize: 8.5,
        fill: (r: any) => (r.status === "Perdido" ? COR.red : COR.grey),
      }),
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gFrequencia(d: Dados) {
  return plot({
    width: 330,
    height: 330,
    marginLeft: 34,
    marginBottom: 34,
    marginTop: 16,
    x: { label: null, tickSize: 0, tickFormat: (v: number) => num(v) },
    y: { label: null, grid: true, tickSize: 0 },
    marks: [
      Plot.barY(d.frequencia, {
        x: "meses",
        y: "clientes",
        fill: (r: any) => (r.meses <= 1 ? COR.red : r.meses >= 5 ? COR.accent : COR.grey),
        rx: 2,
      }),
      Plot.text(d.frequencia, { x: "meses", y: "clientes", text: "clientes", dy: -8, fontSize: 9, fontWeight: 600, fill: COR.dark }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
      Plot.axisX({ label: "meses com compra no ano", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 9 }),
    ],
  });
}

function gSpread(d: Dados) {
  // Normalizado: 100% = melhor preco praticado no proprio SKU.
  // Sem isso, cebola (R$7/mil) e tomate (R$700/mil) nao dividem eixo.
  const dados = d.spread.map((r) => ({
    item: curto(r.item.replace(/^SEMENTES /, ""), 24),
    rel: (r.pmin / r.pmax) * 100,
    spread: r.spread,
    clientes: r.clientes,
  }));
  return plot({
    width: L,
    height: 265,
    marginLeft: 150,
    marginRight: 86,
    marginBottom: 32,
    x: { label: null, grid: true, tickSize: 0, domain: [50, 102], tickFormat: (v: number) => num(v) + "%" },
    y: { label: null, tickSize: 0 },
    marks: [
      Plot.ruleY(dados, { y: "item", x1: "rel", x2: 100, sort: { y: "x1" }, stroke: "#e4e4e7", strokeWidth: 5, strokeLinecap: "round" }),
      Plot.dot(dados, { y: "item", x: "rel", fill: COR.red, r: 4.2 }),
      Plot.dot(dados, { y: "item", x: 100, fill: COR.primary, r: 4.2 }),
      Plot.text(dados, {
        y: "item",
        x: 100,
        text: (r: any) => "−" + num(r.spread, 0) + "%  ·  " + r.clientes + " cli.",
        dx: 9,
        textAnchor: "start",
        fontSize: 8.5,
        fill: COR.grey,
      }),
      Plot.axisX({ label: "preço praticado, % do melhor preço do próprio SKU", labelAnchor: "center", labelOffset: 28, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
    ],
  });
}

function gDispersao(d: Dados) {
  const p = d.dispersao.map((r) => r.preco).sort((a, b) => a - b);
  const mediana = p[Math.floor(p.length / 2)]!;
  return plot({
    width: L,
    height: 180,
    marginLeft: 20,
    marginRight: 20,
    marginBottom: 40,
    marginTop: 26,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => "R$ " + num(v) },
    y: { axis: null },
    r: { range: [2.5, 11] },
    marks: [
      Plot.ruleX([mediana], { stroke: COR.dark, strokeDasharray: "3,3" }),
      Plot.text([{ x: mediana }], { x: "x", frameAnchor: "top", dy: -14, text: () => "mediana R$ " + num(mediana), fontSize: 9, fontWeight: 600, fill: COR.dark }),
      Plot.dot(d.dispersao, {
        x: "preco",
        r: "vol",
        fill: (r: any) => (r.preco < mediana ? COR.red : COR.primary),
        fillOpacity: 0.5,
        stroke: (r: any) => (r.preco < mediana ? COR.red : COR.primary),
        strokeOpacity: 0.9,
      }),
      Plot.axisX({ label: "preço por mil sementes · cada bolha = 1 cliente, tamanho = volume", labelAnchor: "center", labelOffset: 32, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
    ],
  });
}

function gCrossSell(d: Dados) {
  const rot: Record<number, string> = { 1: "1 cultura", 2: "2 culturas", 3: "3+ culturas" };
  const dados = d.culturasPorCliente.map((r) => ({ ...r, faixa: rot[r.culturas]! }));
  return plot({
    width: 330,
    height: 310,
    marginLeft: 46,
    marginBottom: 26,
    marginTop: 20,
    x: { label: null, tickSize: 0 },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1000) + "k" },
    marks: [
      Plot.barY(dados, { x: "faixa", y: "ticket", fill: (r: any) => (r.culturas === 1 ? COR.grey : COR.primary), rx: 2 }),
      Plot.text(dados, { x: "faixa", y: "ticket", text: (r: any) => "R$ " + num(r.ticket / 1000) + "k", dy: -9, fontSize: 9.5, fontWeight: 600, fill: COR.dark }),
      Plot.text(dados, { x: "faixa", y: 0, text: (r: any) => r.clientes + " clientes", dy: -8, fontSize: 8.5, fill: "white" }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gDevolucoes(d: Dados) {
  return plot({
    width: 330,
    height: 400,
    marginLeft: 34,
    marginBottom: 24,
    marginTop: 18,
    x: { label: null, tickSize: 0, tickFormat: (v: number) => String(v) },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v, 1) + "%" },
    marks: [
      Plot.barY(d.devolucoes, { x: "ano", y: "perc", fill: (r: any) => (r.ano === 2026 ? COR.red : "#d4d4d8"), rx: 2 }),
      Plot.text(d.devolucoes, { x: "ano", y: "perc", text: (r: any) => num(r.perc, 1) + "%", dy: -8, fontSize: 9, fontWeight: 600, fill: COR.dark }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

function gUrgencia(d: Dados) {
  return plot({
    width: 330,
    height: 400,
    marginLeft: 34,
    marginBottom: 24,
    marginTop: 18,
    x: { label: null, tickSize: 0, tickFormat: (v: number) => String(v) },
    y: { label: null, grid: true, tickSize: 0, domain: [0, 60], tickFormat: (v: number) => num(v) + "%" },
    marks: [
      Plot.areaY(d.urgencia, { x: "ano", y: "perc", fill: COR.red, fillOpacity: 0.1, curve: "monotone-x" }),
      Plot.lineY(d.urgencia, { x: "ano", y: "perc", stroke: COR.red, strokeWidth: 2, curve: "monotone-x" }),
      Plot.dot(d.urgencia, { x: "ano", y: "perc", fill: COR.red, r: 3.4 }),
      Plot.text(d.urgencia, { x: "ano", y: "perc", text: (r: any) => num(r.perc, 0) + "%", dy: -11, fontSize: 9, fontWeight: 600, fill: COR.dark }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

export const graficos = {
  gWaterfall, gMensal, gReceitaVolume, gPrecoCultura, gTratamento, gPareto,
  gCoorte, gFrequencia, gSpread, gDispersao, gCrossSell, gDevolucoes, gUrgencia,
};
export { CULTURA };
