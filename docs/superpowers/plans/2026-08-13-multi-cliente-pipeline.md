# Pipeline multi-cliente de relatórios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar o repositório de "um cliente hardcoded na raiz" para "motor compartilhado (`core/`) + clientes isolados (`clients/<id>/`)", migrando a BASF pra dentro do novo layout, criando um cliente-template pra provar o padrão, e documentando o processo de onboarding de cliente novo via agente de IA.

**Architecture:** `core/` guarda só o que é 100% genérico (orquestração `build.ts`→`gerar(client)`, helper SSR do Plot, formatadores pt-BR, CSS base). Cada `clients/<id>/` guarda `queries.ts` (dados), `report.ts` (gráficos + paleta usada neles), `narrativa.ts` (texto derivado), `pages.ts` (HTML), `theme.css` (paleta CSS) e `.env` (credenciais) — o mesmo contrato de hoje entre esses arquivos, só descrito explicitamente e reproduzível por cliente.

**Tech Stack:** Bun, TypeScript, Observable Plot, linkedom, mssql, WeasyPrint (container), Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-13-multi-cliente-pipeline-design.md`

---

## Task 1: Esqueleto de pastas + mover arquivos genéricos pra `core/`

**Files:**
- Move: `build.ts` → `core/build.ts`
- Move: `fonts/` → `core/fonts/`

- [ ] **Step 1: Criar as pastas e mover os arquivos genéricos**

```bash
mkdir -p core clients/basf
git mv build.ts core/build.ts
git mv fonts core/fonts
```

- [ ] **Step 2: Conferir que só sobrou o que ainda falta mover**

Run: `ls`
Expected: `report.ts`, `queries.ts`, `pages.ts`, `narrativa.ts`, `narrativa.test.ts`, `styles.css`, `.env`, `.env.example` ainda na raiz — serão movidos nas próximas tasks. `core/build.ts` e `core/fonts/` já não aparecem mais na raiz.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: cria core/ e move build.ts e fonts pra dentro"
```

---

## Task 2: Mover arquivos de negócio da BASF pra `clients/basf/`

**Files:**
- Move: `queries.ts` → `clients/basf/queries.ts`
- Move: `narrativa.ts` → `clients/basf/narrativa.ts`
- Move: `narrativa.test.ts` → `clients/basf/narrativa.test.ts`
- Move: `pages.ts` → `clients/basf/pages.ts`

Nenhum desses arquivos muda de conteúdo nesta task — só de lugar. Os imports quebrados são corrigidos na Task 4 (depois que `report.ts` também estiver dividido, na Task 3).

- [ ] **Step 1: Mover**

```bash
git mv queries.ts clients/basf/queries.ts
git mv narrativa.ts clients/basf/narrativa.ts
git mv narrativa.test.ts clients/basf/narrativa.test.ts
git mv pages.ts clients/basf/pages.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: move queries/narrativa/pages da BASF pra clients/basf/"
```

---

## Task 3: Dividir `report.ts` — genérico em `core/`, gráficos da BASF em `clients/basf/`

`report.ts` hoje mistura duas coisas: o helper de SSR do Plot + formatadores pt-BR (genéricos, servem qualquer cliente) e os gráficos + paleta de cor + mapa de cultura da BASF (específico do negócio dela — a própria regra do waterfall documentada em `CLAUDE.md` já é BASF-specific). Ver seção "Cor por cliente" da spec.

**Files:**
- Create: `core/report.ts`
- Create: `clients/basf/report.ts`
- Delete: `report.ts` (conteúdo integralmente redistribuído nos dois arquivos acima)

- [ ] **Step 1: Criar `core/report.ts`** (helper SSR + formatadores — sem `COR`, sem `CULTURA`, sem os `gXxx`, sem `Dados`)

```typescript
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
```

- [ ] **Step 2: Criar `clients/basf/report.ts`** (gráficos, `COR`, `CULTURA` — tudo que é específico do negócio da BASF, importando o genérico de `core/report.ts`)

```typescript
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
```

- [ ] **Step 3: Apagar o `report.ts` antigo da raiz**

```bash
rm report.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: divide report.ts em core/report.ts (generico) e clients/basf/report.ts (graficos BASF)"
```

---

## Task 4: Corrigir imports em `clients/basf/pages.ts` e `clients/basf/narrativa.ts`

**Files:**
- Modify: `clients/basf/pages.ts:1-3`
- Modify: `clients/basf/narrativa.ts:11-12`

- [ ] **Step 1: Atualizar imports de `clients/basf/pages.ts`**

Old:
```typescript
import type { Dados } from "./queries";
import { graficos as g, mi, num, pct, sinal, curto, dt, varPct, CULTURA, culturaVariacao } from "./report";
import { narrar, subst, metaCobertura, prioridadeAcao } from "./narrativa";
```

New:
```typescript
import type { Dados } from "./queries";
import { graficos as g, CULTURA, culturaVariacao } from "./report";
import { mi, num, pct, sinal, curto, dt, varPct } from "../../core/report";
import { narrar, subst, metaCobertura, prioridadeAcao } from "./narrativa";
```

- [ ] **Step 2: Adicionar export do título do documento em `clients/basf/pages.ts`**

O `<title>` do HTML hoje está hardcoded em `build.ts` (`"BASF Sementes — Diagnóstico Executivo YTD 2026"`) — vira específico de cliente. Logo depois dos imports (antes de `const hoje = ...`), adicionar:

```typescript
export const titulo = "BASF Sementes — Diagnóstico Executivo YTD 2026";
```

- [ ] **Step 3: Atualizar imports de `clients/basf/narrativa.ts`**

Old:
```typescript
import type { Dados } from "./queries";
import { mi, pct, sinal } from "./report";
```

New:
```typescript
import type { Dados } from "./queries";
import { mi, pct, sinal } from "../../core/report";
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro relacionado a `pages.ts`/`narrativa.ts`/`report.ts` (pode haver erros pré-existentes não relacionados — comparar com o estado antes desta task se houver dúvida).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: corrige imports de pages.ts e narrativa.ts apos divisao de report.ts"
```

---

## Task 5: Dividir `styles.css` — base genérica em `core/`, paleta BASF em `clients/basf/`

O comentário original já descrevia a intenção ("tokens: estrutura shadcn (neutral) + acentos BASF") — só nunca tinha sido separado em arquivos. `--background/--foreground/--muted/--muted-foreground/--border/--card/--radius` são neutros; `--primary/--accent/--accent-soft/--destructive` são a paleta BASF. O texto do cabeçalho impresso (`@top-right { content: "BASF Sementes · YTD 2026" }`) também é específico do cliente.

**Files:**
- Create: `core/styles.base.css`
- Create: `clients/basf/theme.css`
- Delete: `styles.css`

- [ ] **Step 1: Criar `clients/basf/theme.css`**

```css
/* Paleta BASF sobre o CSS base (core/styles.base.css). */
:root {
  --primary: #004a96;   /* BASF blue */
  --accent: #7a9a1f;    /* BASF green escurecido p/ contraste em papel */
  --accent-soft: #b2d235;
  --destructive: #c2001a;
}

@page {
  @top-right { content: "BASF Sementes · YTD 2026"; }
}
```

- [ ] **Step 2: Criar `core/styles.base.css`**

```css
/* ── tokens: estrutura shadcn (neutral) ────────────────────────────────── */
:root {
  --background: #ffffff;
  --foreground: #09090b;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --border: #e4e4e7;
  --card: #ffffff;
  --radius: 8px;
}

/* ── paginacao ──────────────────────────────────────────────────────────
   Margin boxes sao CSS Paged Media: funcionam no WeasyPrint, nao no Chrome.
   No Chrome o layout aparece igual, so sem numero de pagina / cabecalho.
   `@top-right`'s `content` fica pro theme.css de cada cliente (nome/periodo
   do relatorio impresso no cabecalho corrido). */
@page {
  size: A4 portrait;
  margin: 17mm 14mm 15mm;

  @top-left {
    content: string(secao);
    font: 500 8pt Geist, sans-serif;
    color: #71717a;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 5mm;
  }
  @top-right {
    font: 400 8pt Geist, sans-serif;
    color: #a1a1aa;
    margin-bottom: 5mm;
  }
  @bottom-right {
    content: counter(page) " / " counter(pages);
    font: 500 8pt Geist, sans-serif;
    color: #71717a;
    margin-top: 4mm;
  }
}
@page :first { @top-left { content: none } @top-right { content: none } }

* { margin: 0; padding: 0; box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }

body {
  font-family: Geist, ui-sans-serif, system-ui, sans-serif;
  font-size: 9.5pt;
  line-height: 1.5;
  color: var(--foreground);
  background: var(--background);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

.page { break-after: page; }
.page:last-child { break-after: auto; }

/* ── tipografia ─────────────────────────────────────────────────────────── */
h1 { font-size: 27pt; font-weight: 600; letter-spacing: -0.03em; line-height: 1.08; }
h2 {
  font-size: 15pt; font-weight: 600; letter-spacing: -0.022em;
  string-set: secao content();      /* alimenta o cabecalho corrido */
  margin-bottom: 2mm;
}
h3 { font-size: 10pt; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 1.5mm; }
p  { max-width: 62em; }
p + p { margin-top: 2.5mm; }
.lead { font-size: 11pt; color: var(--muted-foreground); line-height: 1.55; }
.muted { color: var(--muted-foreground); }
/* Reservado para texto genuinamente secundário (legenda de gráfico, nota de
   rodapé, anotação de tabela) — nunca para o corpo principal de um card. */
.small { font-size: 8pt; line-height: 1.45; }
strong { font-weight: 600; }

.eyebrow {
  font-size: 8pt; font-weight: 500; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--primary);
}
.rule { height: 3px; width: 46px; background: var(--accent-soft); margin: 4mm 0; }

header.sec { border-bottom: 1px solid var(--border); padding-bottom: 3mm; margin-bottom: 5mm; }
section + section { margin-top: 6mm; }

/* ── cards ──────────────────────────────────────────────────────────────── */
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  padding: 4mm 4.5mm;
}
.row { display: flex; gap: 3.5mm; align-items: stretch; }
.row > * { flex: 1; min-width: 0; }

/* ── KPI ────────────────────────────────────────────────────────────────── */
.kpi .label { font-size: 8pt; color: var(--muted-foreground); font-weight: 500; }
/* nowrap: "R$ 34,85" + unidade não cabia e a unidade caía para a linha de baixo */
.kpi .value { font-size: 19pt; font-weight: 600; letter-spacing: -0.03em; line-height: 1.15; margin-top: 1mm; white-space: nowrap; }
.kpi .value .unit { font-size: 11pt; font-weight: 500; color: var(--muted-foreground); margin-left: 1px; }
.kpi .delta { font-size: 8.5pt; font-weight: 500; margin-top: 0.5mm; }
.neg { color: var(--destructive); }
.pos { color: var(--accent); }

/* ── callout ────────────────────────────────────────────────────────────── */
.callout {
  border-left: 3px solid var(--accent-soft);
  background: #fafaf6;
  padding: 3mm 4mm;
  border-radius: 0 var(--radius) var(--radius) 0;
  font-size: 9pt;
}
.callout.alerta { border-left-color: var(--destructive); background: #fdf6f6; }
.callout .tag { font-weight: 600; }

/* ── tabelas ────────────────────────────────────────────────────────────── */
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
thead th {
  text-align: left; font-weight: 500; font-size: 7.5pt; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--muted-foreground);
  padding: 0 2mm 1.5mm; border-bottom: 1px solid var(--border);
}
tbody td { padding: 1.7mm 2mm; border-bottom: 1px solid var(--muted); }
tbody tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nome { font-weight: 500; }

/* ── graficos ───────────────────────────────────────────────────────────── */
figure { margin: 0; }
figcaption { font-size: 8pt; color: var(--muted-foreground); margin-top: 1.5mm; }
/* width/height vem dos atributos do SVG — nao sobrescrever, senao a altura descola */
svg { display: block; }
svg text, svg tspan { white-space: pre; font-family: Geist, sans-serif; }

/* ── capa ───────────────────────────────────────────────────────────────── */
/* O rodapé de metadados é ancorado no pé da página por posicionamento absoluto.
   `margin-top:auto` em flex item é ignorado pelo WeasyPrint (mesma família do
   bug de margin em flex), e sem âncora a nota flutuava no meio da capa. */
.capa { position: relative; height: 247mm; }
.capa .topo { margin-bottom: 22mm; }
.capa .rodape {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding-top: 5mm; border-top: 1px solid var(--border);
}
.capa h1 { font-size: 31pt; }

/* índice da capa: ocupa o vão entre o callout e o rodapé com conteúdo útil */
.indice { margin-top: 9mm; }
.indice ol { display: flex; flex-wrap: wrap; list-style: none; margin-top: 3mm; }
.indice li {
  width: 50%; font-size: 9pt; padding: 1.6mm 0;
  border-bottom: 1px solid var(--muted);
}
.indice li:nth-child(odd)  { padding-right: 6mm; }
.indice li:nth-child(even) { padding-left: 6mm; }
.indice .p {
  display: inline-block; width: 6mm; color: var(--muted-foreground);
  font-variant-numeric: tabular-nums; font-size: 8pt;
}
.logo { display: flex; align-items: center; gap: 2.5mm; font-weight: 600; font-size: 11pt; letter-spacing: -0.01em; }
.logo .mark { width: 11px; height: 11px; background: var(--accent-soft); border-radius: 2px; }
.logo .sub { color: var(--muted-foreground); font-weight: 400; }

/* ── plano de acao ──────────────────────────────────────────────────────── */
.acao td { vertical-align: top; padding-top: 5mm; padding-bottom: 5mm; }
.acao .n {
  width: 6mm; font-weight: 600; color: var(--primary);
  font-variant-numeric: tabular-nums;
}
.chip {
  display: inline-block; font-size: 7.5pt; font-weight: 500;
  padding: 0.6mm 2mm; border-radius: 99px; border: 1px solid var(--border);
  color: var(--muted-foreground); white-space: nowrap;
}
.chip.alta { border-color: #f0c8c8; color: var(--destructive); background: #fdf6f6; }
```

- [ ] **Step 3: Apagar `styles.css` da raiz**

```bash
rm styles.css
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: divide styles.css em core/styles.base.css e clients/basf/theme.css"
```

---

## Task 6: Mover `.env`/`.env.example` da BASF

**Files:**
- Move: `.env` → `clients/basf/.env`
- Move: `.env.example` → `clients/basf/.env.example`

- [ ] **Step 1: Mover**

```bash
git mv .env.example clients/basf/.env.example
mv .env clients/basf/.env
```

(`.env` não passa pelo `git mv` porque já é gitignored e não está rastreado — `mv` normal basta.)

- [ ] **Step 2: Conferir que não sobrou `.env` na raiz**

Run: `ls -a`
Expected: nenhum `.env` na raiz do repo; `clients/basf/.env` existe.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: move .env.example da BASF pra clients/basf/"
```

---

## Task 7: Reescrever `core/build.ts` como `gerar(client)` parametrizável

**Files:**
- Modify: `core/build.ts` (reescrita completa)

- [ ] **Step 1: Substituir todo o conteúdo de `core/build.ts`**

```typescript
const PESOS = { 400: "normal", 500: "500", 600: "600", 700: "700" } as const;

/** Embute as woff2 em base64 para o HTML rodar offline e o PDF carregar a fonte. */
async function fontes() {
  const faces = await Promise.all(
    Object.entries(PESOS).map(async ([peso, weight]) => {
      const b64 = Buffer.from(await Bun.file(`core/fonts/Geist-${peso}.woff2`).arrayBuffer()).toString("base64");
      return `@font-face{font-family:Geist;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    }),
  );
  return faces.join("\n");
}

/** Gera HTML (e PDF, se weasyprint estiver disponível) pra um cliente. */
export async function gerar(client: string) {
  const { conectar, carregar } = await import(`../clients/${client}/queries.ts`);
  const { documento, titulo } = await import(`../clients/${client}/pages.ts`);

  const pool = await conectar();
  console.log(`→ [${client}] carregando dados…`);
  const dados = await carregar(pool);
  await pool.close();

  console.log(`→ [${client}] renderizando gráficos e páginas…`);
  const theme = await Bun.file(`clients/${client}/theme.css`).text();
  const base = await Bun.file("core/styles.base.css").text();
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
${await fontes()}
${theme}
${base}
</style>
</head>
<body>
${documento(dados)}
</body>
</html>`;

  await Bun.write(`out/${client}/relatorio.html`, html);
  console.log(`✓ out/${client}/relatorio.html (${(html.length / 1024).toFixed(0)} KB)`);

  if (Bun.which("weasyprint")) {
    console.log(`→ [${client}] gerando PDF…`);
    const p = Bun.spawn(["weasyprint", `out/${client}/relatorio.html`, `out/${client}/relatorio.pdf`], { stderr: "inherit" });
    if ((await p.exited) !== 0) throw new Error("weasyprint falhou");
    const pdfSize = (await Bun.file(`out/${client}/relatorio.pdf`).stat()).size;
    console.log(`✓ out/${client}/relatorio.pdf (${(pdfSize / 1024).toFixed(0)} KB)`);
  } else {
    console.log("· weasyprint não encontrado — só o HTML foi gerado (use o container para o PDF)");
  }
}

if (import.meta.main) {
  const client = process.env.CLIENT;
  if (!client) throw new Error("CLIENT não definida. Ex: CLIENT=basf bun run core/build.ts");
  await gerar(client);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: build.ts vira gerar(client) parametrizavel por cliente"
```

---

## Task 8: Verificação local da BASF (Windows, sem Docker)

**Files:** nenhum (só validação)

- [ ] **Step 1: Rodar os testes**

Run: `bun test`
Expected: todos os testes de `clients/basf/narrativa.test.ts` passam (mesmos testes de antes, só o import mudou de lugar — nenhuma asserção muda).

- [ ] **Step 2: Gerar o HTML da BASF com o novo comando**

Run (PowerShell): `$env:CLIENT='basf'; bun run core/build.ts`
Expected: `✓ out/basf/relatorio.html (NN KB)` no console, arquivo `out/basf/relatorio.html` criado. Sem WeasyPrint local, o PDF não é gerado (mensagem "weasyprint não encontrado" é esperada aqui).

- [ ] **Step 3: Abrir no Chrome e conferir visualmente**

Run: `start out/basf/relatorio.html`
Expected: mesmo relatório de 10 páginas de antes, cores BASF (azul/verde) intactas nos KPIs, cards e gráficos — a divisão de arquivos não mudou nenhum dado nem nenhuma cor.

- [ ] **Step 4: Conferir que `CLIENT` ausente falha alto e claro**

Run (PowerShell): `Remove-Item Env:\CLIENT -ErrorAction SilentlyContinue; bun run core/build.ts`
Expected: erro `CLIENT não definida. Ex: CLIENT=basf bun run core/build.ts`, processo sai com erro — não gera relatório errado em silêncio.

---

## Task 9: Atualizar `Dockerfile` pro novo layout

**Files:**
- Modify: `Dockerfile:31-33`, `Dockerfile:42`

- [ ] **Step 1: Trocar os `COPY` de arquivo-por-arquivo pra diretório**

Old:
```dockerfile
COPY --chown=bun:bun build.ts queries.ts report.ts pages.ts narrativa.ts styles.css ./
COPY --chown=bun:bun fonts ./fonts
RUN mkdir -p /app/out && chown bun:bun /app/out
```

New:
```dockerfile
COPY --chown=bun:bun core ./core
COPY --chown=bun:bun clients ./clients
RUN mkdir -p /app/out && chown bun:bun /app/out
```

- [ ] **Step 2: Trocar o `CMD` pro novo caminho do entrypoint**

Old:
```dockerfile
CMD ["bun", "run", "build.ts"]
```

New:
```dockerfile
CMD ["bun", "run", "core/build.ts"]
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: atualiza Dockerfile pros caminhos core/ e clients/"
```

---

## Task 10: Atualizar `.gitignore` e `.dockerignore`

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`

- [ ] **Step 1: Adicionar `_intake` ao `.gitignore`** (insumo bruto de cliente nunca entra no repo — ver spec, seção "Onboarding")

Old:
```
# output
out
dist
*.tgz
```

New:
```
# output
out
dist
*.tgz

# insumos brutos de cliente (nunca versionados — ver NOVO_CLIENTE.md)
_intake
```

- [ ] **Step 2: Adicionar padrões de cliente ao `.dockerignore`**

Old:
```
.env
.env.*

relatorio.html
```

New:
```
.env
.env.*
clients/*/.env
clients/*/_intake

relatorio.html
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: ignora .env e _intake por cliente no git e no docker"
```

---

## Task 11: Atualizar `compose.yaml`

**Files:**
- Modify: `compose.yaml`

- [ ] **Step 1: Remover o `env_file` fixo e trocar os volumes de arquivo-por-arquivo pra diretório**

Old:
```yaml
services:
  relatorio:
    build: .
    # Sem isso o compose nomeia a imagem "{pasta}-{servico}" — a pasta e' o
    # servico contendo "relatorio" nos dois, dando basf-relatorio-relatorio.
    image: basf-relatorio:latest

    # Credenciais e host vêm do .env (gitignored). Nada de default aqui:
    # este arquivo é versionado, e um default errado conecta no banco errado
    # em silêncio.
    env_file: .env

    # Banco rodando na própria máquina? `localhost` no .env é o container aqui:
    #   docker compose run -e DB_HOST=host.docker.internal --rm relatorio
    # Com Azure o .env sozinho basta.
    extra_hosts:
      - "host.docker.internal:host-gateway"

    volumes:
      - ./out:/app/out
      # Código montado read-only. Sem isso o `compose run` usa a cópia assada na
      # imagem e gera o relatório com a versão antiga — falha silenciosa, o PDF
      # sai plausível e errado. Montado arquivo por arquivo de propósito: montar
      # o diretório inteiro exporia o .env, que o Bun carrega e sobrescreveria
      # o DB_HOST vindo daqui.
      - ./build.ts:/app/build.ts:ro
      - ./queries.ts:/app/queries.ts:ro
      - ./report.ts:/app/report.ts:ro
      - ./pages.ts:/app/pages.ts:ro
      - ./narrativa.ts:/app/narrativa.ts:ro
      - ./styles.css:/app/styles.css:ro
      - ./fonts:/app/fonts:ro

    # Lê o banco e escreve em ./out. Não precisa de nenhuma capability.
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp   # cache do fontconfig (XDG_CACHE_HOME aponta para cá)
    mem_limit: 1g
    cpus: 2.0

    # Sem healthcheck: job em batch, roda e sai. O exit code é o sinal.
```

New:
```yaml
services:
  relatorio:
    build: .
    # Sem isso o compose nomeia a imagem "{pasta}-{servico}" — a pasta e' o
    # servico contendo "relatorio" nos dois, dando basf-relatorio-relatorio.
    image: basf-relatorio:latest

    # Sem env_file fixo: cada cliente tem o proprio .env em clients/<id>/.env.
    # Nada de cliente default de proposito (mesmo motivo do queries.ts nunca
    # ter default de variavel de banco) — informe os dois na hora de rodar:
    #   docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf relatorio
    #
    # Banco rodando na própria máquina? `localhost` no .env é o container aqui:
    #   docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf -e DB_HOST=host.docker.internal relatorio
    extra_hosts:
      - "host.docker.internal:host-gateway"

    volumes:
      - ./out:/app/out
      # Código montado read-only, por diretório inteiro. Sem isso o `compose
      # run` usa a cópia assada na imagem e gera o relatório com a versão
      # antiga — falha silenciosa, o PDF sai plausível e errado. Montar o
      # diretório inteiro (em vez de arquivo por arquivo) é seguro aqui: o
      # .env de cada cliente fica dentro de clients/<id>/, fora do cwd do
      # processo (/app), então o auto-load do Bun não o pega.
      - ./core:/app/core:ro
      - ./clients:/app/clients:ro

    # Lê o banco e escreve em ./out. Não precisa de nenhuma capability.
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp   # cache do fontconfig (XDG_CACHE_HOME aponta para cá)
    mem_limit: 1g
    cpus: 2.0

    # Sem healthcheck: job em batch, roda e sai. O exit code é o sinal.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: compose.yaml monta core/ e clients/ por diretorio, sem env_file fixo"
```

---

## Task 12: Verificação via Docker (fluxo real, com PDF)

**Files:** nenhum (só validação)

- [ ] **Step 1: Build da imagem**

Run: `docker compose build`
Expected: build completa sem erro.

- [ ] **Step 2: Rodar pra BASF**

Run: `docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf relatorio`
Expected: log `✓ out/basf/relatorio.html` e `✓ out/basf/relatorio.pdf`, exit code 0.

- [ ] **Step 3: Renderizar o PDF em PNG pra inspeção visual**

```bash
docker compose run --rm --entrypoint pdftoppm relatorio -png -r 100 out/basf/relatorio.pdf out/pg
```

Expected: `out/pg-01.png` até `out/pg-10.png` criados.

- [ ] **Step 4: Ler as imagens geradas e conferir visualmente**

Ler `out/pg-01.png` até `out/pg-10.png` com a ferramenta de leitura de imagem. Expected: 10 páginas, mesmo conteúdo/layout/cores de antes da migração (comparar com a versão do PDF gerado antes da Task 1, se ainda disponível, ou com a memória do relatório já validado em commits anteriores). Nenhuma página deve estar vazia, cortada ou com gráfico quadrado/distorcido (sintoma de largura/altura de SVG quebrada).

- [ ] **Step 5: Medir preenchimento de página** (script do `CLAUDE.md`, evita "olho")

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem out/pg-*.png | Sort-Object Name | ForEach-Object {
  $b=[System.Drawing.Bitmap]::FromFile($_.FullName); $u=0
  for ($y=40; $y -lt $b.Height-60; $y+=3) { for ($x=40; $x -lt $b.Width-40; $x+=6) {
    $p=$b.GetPixel($x,$y); if ($p.R -lt 235 -or $p.G -lt 235 -or $p.B -lt 235) { $u=$y; break } } }
  $b.Dispose(); "{0}  {1,4}/1111  {2,3}%" -f $_.Name,$u,[int](100*$u/1111) }
```

Expected: cada página entre 88–99% (mesmos números de antes da migração — nada nesta task deveria ter mudado altura de gráfico).

---

## Task 13: Criar `clients/_template/` — cliente placeholder pra provar o padrão

Dados mock, propositalmente pequeno (1 KPI + 1 gráfico), só pra provar que o contrato `queries → report → narrativa → pages → theme.css` funciona fim-a-fim pra um segundo cliente sem depender da BASF.

**Files:**
- Create: `clients/_template/queries.ts`
- Create: `clients/_template/report.ts`
- Create: `clients/_template/narrativa.ts`
- Create: `clients/_template/narrativa.test.ts`
- Create: `clients/_template/pages.ts`
- Create: `clients/_template/theme.css`
- Create: `clients/_template/.env.example`

- [ ] **Step 1: `clients/_template/queries.ts`**

```typescript
// TEMPLATE — copie esta pasta pra clients/<novo-cliente>/ e adapte.
// Ver NOVO_CLIENTE.md na raiz do repo pro processo completo de onboarding.

/** Mock: troque por conexão real (SQL Server, outro banco, ou leitura de
 *  CSV/planilha — a única exigência é devolver algo que `carregar` aceite). */
export async function conectar() {
  return null;
}

export async function carregar(_pool: unknown) {
  return {
    kpi: { label: "Receita YTD", valor2025: 1_000_000, valor2026: 1_250_000 },
    serie: [
      { mes: "Jan", valor: 80_000 },
      { mes: "Fev", valor: 95_000 },
      { mes: "Mar", valor: 110_000 },
    ],
  };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
```

- [ ] **Step 2: `clients/_template/report.ts`**

```typescript
import * as Plot from "@observablehq/plot";
import type { Dados } from "./queries";
import { plot, L } from "../../core/report";

/** TODO: troque pelos mesmos tons de clients/<id>/theme.css. */
const COR = { primary: "#3b82f6" };

function gSerie(d: Dados) {
  return plot({
    width: L,
    height: 240,
    marginLeft: 44,
    x: { label: null, tickSize: 0 },
    y: { label: null, grid: true, tickSize: 0 },
    marks: [
      Plot.lineY(d.serie, { x: "mes", y: "valor", stroke: COR.primary, strokeWidth: 2 }),
      Plot.dot(d.serie, { x: "mes", y: "valor", fill: COR.primary }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

export const graficos = { gSerie };
```

- [ ] **Step 3: `clients/_template/narrativa.ts`**

```typescript
/**
 * Texto que muda de sentido conforme os dados — nunca hardcoded (ver
 * CLAUDE.md, seção "Texto vs. dados").
 */
import type { Dados } from "./queries";
import { sinal } from "../../core/report";

export function manchete(d: Pick<Dados, "kpi">): string {
  const delta = ((d.kpi.valor2026 - d.kpi.valor2025) / d.kpi.valor2025) * 100;
  return delta >= 0 ? `Receita cresceu ${sinal(delta)}` : `Receita caiu ${sinal(delta)}`;
}
```

- [ ] **Step 4: `clients/_template/narrativa.test.ts`**

```typescript
import { expect, test } from "bun:test";
import { manchete } from "./narrativa";

test("manchete acompanha o sinal", () => {
  expect(manchete({ kpi: { label: "x", valor2025: 100, valor2026: 150 } })).toContain("cresceu");
  expect(manchete({ kpi: { label: "x", valor2025: 100, valor2026: 50 } })).toContain("caiu");
});
```

- [ ] **Step 5: `clients/_template/pages.ts`**

```typescript
import type { Dados } from "./queries";
import { graficos as g } from "./report";
import { manchete } from "./narrativa";

export const titulo = "Cliente Template — Relatório";

export function documento(d: Dados): string {
  return `<div class="page">
    <header class="sec"><h2>Resumo</h2></header>
    <p class="lead">${manchete(d)}</p>
    <figure>${g.gSerie(d)}</figure>
  </div>`;
}
```

- [ ] **Step 6: `clients/_template/theme.css`**

```css
/* TEMPLATE — troque os valores abaixo pela paleta do cliente novo. */
:root {
  --primary: #3b82f6;
  --accent: #3b82f6;
  --accent-soft: #93c5fd;
  --destructive: #dc2626;
}

@page {
  @top-right { content: "Cliente Template"; }
}
```

- [ ] **Step 7: `clients/_template/.env.example`**

```
# Copie pra clients/<novo-cliente>/.env e preencha.
# Se o cliente novo nao usa banco de dados (ex: fonte e CSV/notebook), pode
# apagar este arquivo e ajustar queries.ts pra nao exigir nenhuma DB_* var.
DB_HOST=
DB_USER=
DB_PASS=
DB_NAME=
DB_TRUST_CERT=
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: cria clients/_template como esqueleto pra cliente novo"
```

---

## Task 14: Verificar o `_template`

**Files:** nenhum (só validação)

- [ ] **Step 1: Rodar os testes** (agora cobrindo dois clientes)

Run: `bun test`
Expected: testes de `clients/basf/narrativa.test.ts` E `clients/_template/narrativa.test.ts` passam, descobertos automaticamente sem configuração extra.

- [ ] **Step 2: Gerar o HTML do template**

Run (PowerShell): `$env:CLIENT='_template'; bun run core/build.ts`
Expected: `✓ out/_template/relatorio.html`.

- [ ] **Step 3: Abrir e conferir visualmente**

Run: `start out/_template/relatorio.html`
Expected: 1 página, título "Resumo", frase de manchete ("Receita cresceu +25,0%"), 1 gráfico de linha em azul — prova que o contrato funciona pra um cliente diferente da BASF sem tocar em `core/`.

---

## Task 15: Separar regras de negócio da BASF pro `CLAUDE.md` dela

O `CLAUDE.md` da raiz hoje mistura regra de motor (comandos, Docker, WeasyPrint, Plot — genéricas) com regra de negócio da BASF ("Regras que não podem quebrar", "## Dados" — específicas dela). Como o repo passa a servir vários clientes, as regras de negócio da BASF viram enganosas na raiz (implicam que valem pra todo cliente). Claude Code carrega `CLAUDE.md` de qualquer diretório no caminho de trabalho — colocar um em `clients/basf/` faz ele ser lido automaticamente quando o trabalho for ali.

**Files:**
- Create: `clients/basf/CLAUDE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Criar `clients/basf/CLAUDE.md`** com as seções de negócio movidas da raiz

```markdown
# CLAUDE.md — BASF

Regras de negócio específicas do cliente BASF Sementes. Regras de motor (comandos, Docker,
WeasyPrint, Plot) estão no `CLAUDE.md` da raiz.

## Regras que não podem quebrar

**Texto vs. dados.** Se uma frase deixaria de ser verdade com outro conjunto de dados, ela
pertence a `narrativa.ts` e precisa de teste. `pages.ts` só carrega prosa neutra (definições,
metodologia, descrição de eixo). Nunca escreva "caiu", "o pior da série" ou "todas as culturas"
direto no template.

**Contas de teste.** Todo recorte filtra `cust_name NOT LIKE '%DUMMY%'` (`REAL` em
`queries.ts`). Query nova sem esse filtro quebra a reconciliação entre páginas.

**Waterfall é partição exaustiva.** YTD 2025 + as 4 etapas fecham exatamente no YTD 2026. Mexeu
nas condições, confira que ainda soma antes de seguir.

**Tabelas nominais agrupam por `cust_name`, não `cust_no`** — a mesma empresa tem mais de um
código no ERP.

**Comparação de preço é sempre dentro de `(item_no, pack_desc)`.** Sem a embalagem, desconto
legítimo por volume vira "vazamento".

## Dados

- `inv_qty_th` está em **milhares** de sementes (`/1e6` = bilhões).
- `total_line_amt` é líquido e **inclui devoluções** (valores negativos).
- Comparação de preço usa `net_price_th_inv_cur`.
- `ship_to_country <> 'BR'` é export intercompany (Nunhems/NL) — negócio diferente, nunca some
  com o mercado BR sem separar.
- `reason_desc` distingue venda de amostra/trial.
- Recorte em `YTD_MES` / `ANO` / `ANO_ANT` no topo de `queries.ts`. Hoje jan–jun, 2026 vs 2025.

## Não faça

- Inventar estimativa de ganho sem base no dado. Já houve um caso (múltiplo de cross-sell
  aplicado por cliente) que os próprios números contradiziam.
```

- [ ] **Step 2: Remover essas seções do `CLAUDE.md` da raiz**

No `CLAUDE.md` da raiz, apagar as seções `## Regras que não podem quebrar` e `## Dados` inteiras, e a linha "Inventar estimativa de ganho..." da seção `## Não faça` (as outras linhas de "Não faça" — Chart.js, Playwright, dependência nova — são genéricas de motor e ficam).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: move regras de negocio da BASF pro CLAUDE.md dela"
```

---

## Task 16: Atualizar comandos e caminhos no `CLAUDE.md` da raiz

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Atualizar o bloco "Comandos"**

Old:
```markdown
## Comandos

```bash
bun run build.ts                  # HTML (Windows, SQL em localhost) — loop rápido de design
docker compose run --rm relatorio # HTML + PDF (fluxo real)
bun test                          # narrativa.ts
```

**Loop de iteração:** rode `bun run build.ts`, abra `out/relatorio.html` no Chrome. O container
só é necessário para o PDF.
```

New:
```markdown
## Comandos

```bash
CLIENT=basf bun run core/build.ts                  # HTML (Windows, SQL em localhost) — loop rápido de design
docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf relatorio  # HTML + PDF (fluxo real)
bun test                                            # narrativa.ts de todos os clientes
```

`CLIENT` é obrigatório — sem default de propósito, mesmo motivo do `queries.ts` nunca ter
default de variável de banco (ver `## Banco`). Troque `basf` por qualquer pasta em `clients/`.

**Loop de iteração:** rode `CLIENT=basf bun run core/build.ts`, abra `out/basf/relatorio.html`
no Chrome. O container só é necessário para o PDF.

**Cliente novo?** Ver `NOVO_CLIENTE.md` na raiz — processo de onboarding via agente de IA.
```

- [ ] **Step 2: Atualizar a explicação de mounts (parágrafo logo abaixo)**

Old:
```markdown
Os fontes são **montados** no container (`volumes:` em `compose.yaml`), então `compose run`
sempre usa o código atual — não precisa de `docker compose build` para mudança de código, só
para mudança de dependência ou de Dockerfile. Não remova esses mounts: sem eles o container
roda a cópia assada na imagem e gera um PDF **plausível e errado**, sem avisar.
```

New:
```markdown
Os fontes são **montados** no container (`volumes:` em `compose.yaml`, `core/` e `clients/`
inteiros), então `compose run` sempre usa o código atual — não precisa de `docker compose
build` para mudança de código, só para mudança de dependência ou de Dockerfile. Não remova
esses mounts: sem eles o container roda a cópia assada na imagem e gera um PDF **plausível e
errado**, sem avisar.
```

- [ ] **Step 3: Atualizar os comandos de verificação (bloco "Verificação — obrigatória")**

Old:
```markdown
```bash
docker compose run --rm --entrypoint pdftoppm relatorio -png -r 100 out/relatorio.pdf out/pg
# depois leia out/pg-*.png
```
```

New:
```markdown
```bash
docker compose run --rm --entrypoint pdftoppm relatorio -png -r 100 out/basf/relatorio.pdf out/pg
# depois leia out/pg-*.png (troque basf pelo cliente que voce esta verificando)
```
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: atualiza comandos e caminhos do CLAUDE.md pro layout multi-cliente"
```

---

## Task 17: Escrever `NOVO_CLIENTE.md` (onboarding via agente de IA)

**Files:**
- Create: `NOVO_CLIENTE.md`
- Modify: `CLAUDE.md` (referência já adicionada na Task 16, Step 1 — conferir que aponta certo)

- [ ] **Step 1: Criar `NOVO_CLIENTE.md`**

```markdown
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
- `narrativa.ts` — texto derivado dos dados (nunca hardcoded — ver `CLAUDE.md`, "Texto vs.
  dados"). Importa formatadores de `../../core/report`.
- `narrativa.test.ts` — prova que a prosa muda quando os dados mudam.
- `pages.ts` — exporta `documento(dados)` (HTML) e `titulo` (string do `<title>`).
- `theme.css` — variáveis de cor (`--primary`, `--accent`, `--accent-soft`, `--destructive`)
  sobre `core/styles.base.css`, e o `content` do `@top-right` do `@page` (cabeçalho impresso).
- `.env` (gitignored) + `.env.example` — credenciais, se o cliente usar banco de dados.

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
- `CLIENT=<id> bun run core/build.ts` — gera `out/<id>/relatorio.html` sem erro.
- `docker compose run --rm --env-file clients/<id>/.env -e CLIENT=<id> relatorio` — gera o PDF
  de verdade.
- Renderize o PDF em PNG (`pdftoppm`, ver `CLAUDE.md`) e **leia as páginas** — metade dos bugs
  desta base só aparecem no WeasyPrint, nunca confie só no HTML no Chrome.
- Meça preenchimento de página com o script do `CLAUDE.md` (generalizado pro número de páginas
  do cliente novo, não necessariamente 10 como a BASF). Alvo: 88–99% por página.

## Geração ≠ envio

O pipeline só gera `out/<id>/relatorio.pdf` e para. Não existe (e não deve existir) nenhum
envio automático — e-mail, upload, etc. — disparado a partir da geração. Quando um passo de
distribuição existir, ele precisa de uma ação humana explícita entre gerar e enviar.
```

- [ ] **Step 2: Conferir que a referência no `CLAUDE.md` (Task 16) aponta certo**

Run: `Select-String -Path CLAUDE.md -Pattern "NOVO_CLIENTE"`
Expected: uma linha encontrada, referenciando `NOVO_CLIENTE.md`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: escreve NOVO_CLIENTE.md, playbook de onboarding via agente de IA"
```

---

## Task 18: Atualizar `README.md`, limpar `out/` órfão, verificação final

**Files:**
- Modify: `README.md`
- Delete: `out/relatorio.html`, `out/relatorio.pdf` (se ainda existirem da raiz antiga)

- [ ] **Step 1: Atualizar o bloco "Rodar" do `README.md`**

Old:
```markdown
## Rodar

```bash
cp .env.example .env      # e preencha
docker compose run --rm relatorio
# → out/relatorio.html  (estático, zero <script>)
# → out/relatorio.pdf   (A4 retrato, numerado)
```
```

New:
```markdown
## Rodar

```bash
cp clients/basf/.env.example clients/basf/.env      # e preencha
docker compose run --rm --env-file clients/basf/.env -e CLIENT=basf relatorio
# → out/basf/relatorio.html  (estático, zero <script>)
# → out/basf/relatorio.pdf   (A4 retrato, numerado)
```

Repositório agora serve vários clientes (`clients/<id>/`) a partir do mesmo motor
(`core/`). Cliente novo? Ver `NOVO_CLIENTE.md`.
```

- [ ] **Step 2: Atualizar o bloco "Iterar no design"**

Old:
```markdown
## Iterar no design

O container só é necessário para o PDF:

```bash
bun run build.ts          # gera out/relatorio.html
start out/relatorio.html  # Chrome, reload instantâneo
```
```

New:
```markdown
## Iterar no design

O container só é necessário para o PDF:

```bash
CLIENT=basf bun run core/build.ts   # gera out/basf/relatorio.html
start out/basf/relatorio.html       # Chrome, reload instantâneo
```
```

- [ ] **Step 3: Apagar os artefatos órfãos de `out/`**

```bash
rm -f out/relatorio.html out/relatorio.pdf
```

(`out/` já está no `.gitignore` — isso não é uma mudança de tracking, só limpeza de disco local. O build novo escreve em `out/basf/` e `out/_template/`.)

- [ ] **Step 4: Verificação final completa**

Run: `bun test`
Expected: todos os testes passam (BASF + `_template`).

Run (PowerShell): `$env:CLIENT='basf'; bun run core/build.ts`
Expected: `✓ out/basf/relatorio.html`.

Run: `git status`
Expected: working tree limpo (tudo commitado nas tasks anteriores), sem `queries.ts`/`report.ts`/`pages.ts`/`narrativa.ts`/`styles.css`/`build.ts`/`.env.example` soltos na raiz.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: atualiza README.md pro layout multi-cliente e limpa out/ orfao"
```

---

## Self-Review (já aplicado ao escrever o plano)

- **Cobertura da spec:** estrutura de pastas (Tasks 1–2, 13), contrato cliente↔motor (Task 4,
  7, 17), cor por cliente incl. correção do `report.ts` (Task 3, 5), env por cliente (Task 6,
  11), docker/compose (Task 9, 11), geração≠envio (documentado na Task 17), testes (Task 8,
  14), migração da BASF (Tasks 1–8), onboarding via IA (Task 13, 17), limpeza do `out/` antigo
  (Task 18) — todas as seções da spec têm task correspondente.
- **Placeholders:** nenhum "TODO"/"TBD" nos arquivos de código gerados — os únicos comentários
  `TODO` são intencionais, dentro de `clients/_template/` (instrução pro próximo agente trocar
  a paleta), consistente com o propósito do template.
- **Consistência de tipos:** `Dados` é sempre `Awaited<ReturnType<typeof carregar>>` do
  `queries.ts` do próprio cliente, tanto na BASF quanto no template. `titulo` é exportado por
  `pages.ts` em ambos. `graficos` é sempre o nome do export em `report.ts` de cada cliente.
  Import de formatadores genéricos é sempre de `../../core/report` a partir de
  `clients/<id>/*.ts` (dois níveis acima: `clients/<id>/` → `clients/` → raiz → `core/`).
