import * as Plot from "@observablehq/plot";
import type { Dados, Modelo } from "./queries";
import { ganho, META_RECALL } from "./queries";
import { plot, L, num, pct, curto } from "../../core/report";

const COR = {
  primary: "#001e50",
  accent: "#0073c4",
  soft: "#7fd8ff",
  red: "#c40c1e",
  grey: "#a1a1aa",
  dark: "#3f3f46",
};

/** Nome técnico da feature -> nome que o time de marketing usa. */
export const LABEL: Record<string, string> = {
  TX_CONV_DN_30D: "Conversão da concessionária (30d)",
  "DN grupo": "Grupo da concessionária",
  FLAG_BEST_DRIVE: "Fez test drive",
  FamilyProduct: "Família do veículo",
  "ID da Oferta": "Oferta vinculada",
  "Código do Modelo": "Código do modelo",
  "Sub Origem": "Canal de origem",
  QTD_LEADS_CLIENTE: "Leads anteriores do cliente",
  Regional: "Regional",
  "Sub Origem Nível 2": "Sub-canal de origem",
  FLAG_TROCA: "Tem veículo para troca",
  FLAG_FORA_HORARIO: "Chegou fora do horário",
  "Product Service": "Produto/serviço da campanha",
  NOM_AUDIENCE_SEGMENT_TACTIC: "Segmento de audiência",
  "Supplier Publisher": "Publisher da mídia",
  NOM_FORMAT: "Formato do anúncio",
  "Funnel Stage": "Etapa do funil",
};

/** As 5 colunas que só o modelo B enxerga — o que o experimento isola. */
export const COLS_CAMPANHA = ["Product Service", "NOM_AUDIENCE_SEGMENT_TACTIC", "Supplier Publisher", "NOM_FORMAT", "Funnel Stage"];

export const rotulo = (f: string) => LABEL[f] ?? f;

/**
 * Datas do split temporal, derivadas do fim do período (notebook 03:
 * MESES_MATURACAO = 3, MESES_OOT = 2 contados para trás a partir do último lead).
 */
export function split(d: Dados) {
  const fim = new Date(d.base.dados.periodo.fim + "T12:00:00Z");
  const menos = (m: number) => {
    const x = new Date(fim);
    x.setUTCMonth(x.getUTCMonth() - m);
    return x;
  };
  return {
    inicio: new Date(d.base.dados.periodo.inicio + "T12:00:00Z"),
    corteOot: menos(5),
    corteMaturacao: menos(3),
    fim,
  };
}

/**
 * Rótulos truncados, com desempate. Duas descrições de veículo que só diferem
 * depois do corte virariam a MESMA barra no Plot — some uma linha sem avisar.
 */
function rotulosUnicos<T extends { valor: string }>(itens: T[], n: number) {
  const vistos = new Set<string>();
  return itens.map((r) => {
    let s = curto(r.valor, n);
    while (vistos.has(s)) s += " ";
    vistos.add(s);
    return { ...r, rot: s };
  });
}

const p1 = (v: number) => num(v * 100, 0) + "%";

// ══ GRAFICOS ══════════════════════════════════════════════════════════════

/** Linha do tempo dos conjuntos. Volume por conjunto não é exportado — o que o
 *  leitor precisa entender aqui é a ordem cronológica, não o tamanho. */
function gSplit(d: Dados, height = 200) {
  const s = split(d);
  const fases = [
    { fase: "Dev (treino 80% + OOS 20%)", x1: s.inicio, x2: s.corteOot, cor: "dev" },
    { fase: "OOT (teste no tempo)", x1: s.corteOot, x2: s.corteMaturacao, cor: "oot" },
    { fase: "Maturação (fora do modelo)", x1: s.corteMaturacao, x2: s.fim, cor: "fora" },
  ];
  const dias = (f: (typeof fases)[number]) => (f.x2.getTime() - f.x1.getTime()) / 86400000;
  return plot({
    width: L,
    height,
    marginLeft: 148,
    marginRight: 126,
    marginBottom: 28,
    x: { label: null, grid: true, tickSize: 0 },
    y: { label: null, tickSize: 0, domain: fases.map((f) => f.fase) },
    color: { domain: ["dev", "oot", "fora"], range: [COR.primary, COR.accent, "#d4d4d8"] },
    marks: [
      Plot.barX(fases, { x1: "x1", x2: "x2", y: "fase", fill: "cor", rx: 2 }),
      // frameAnchor em vez de x: as barras de 2 e 3 meses sao estreitas demais
      // para caber qualquer rotulo dentro ou logo depois delas.
      Plot.text(fases, {
        y: "fase",
        frameAnchor: "right",
        text: (f: any) => `${num(dias(f) / 30.44, 0)} meses`,
        dx: 116,
        textAnchor: "end",
        fontSize: 9,
        fontWeight: 500,
        fill: COR.dark,
      }),
      Plot.ruleX([s.inicio], { stroke: "#d4d4d8" }),
    ],
  });
}

/** Curva de ganho acumulado: quanto das vendas o time captura contactando os N%
 *  de maior score. A diagonal é a discagem sem modelo. */
function gGanho(series: { nome: string; modelo: Modelo; cor: string }[], height: number) {
  const pontos = series.flatMap((s) => ganho(s.modelo.faixas_score).map((p) => ({ ...p, nome: s.nome })));
  const aleatorio = [
    { pctBase: 0, pctConv: 0 },
    { pctBase: 1, pctConv: 1 },
  ];

  // Legenda no canto e rótulo do corte de 30% escalonados por série: `dy` é
  // constante, não canal — duas séries no mesmo mark sairiam sobrepostas.
  const porSerie = series.flatMap((s, i) => [
    Plot.text([{ nome: s.nome }], {
      frameAnchor: "top-left",
      dx: 10,
      dy: 12 + i * 15,
      text: "nome",
      textAnchor: "start",
      fontSize: 9.5,
      fontWeight: 600,
      fill: s.cor,
    }),
    Plot.dot([ganho(s.modelo.faixas_score)[3]!], { x: "pctBase", y: "pctConv", fill: s.cor, r: 4 }),
    // A esquerda da linha de 30% e acima do ponto o espaco esta sempre vazio (a
    // curva vem de baixo). A direita ela passa por cima do rotulo. Com duas
    // series, a de baixo desce e vai pra direita, no vao entre as curvas e a
    // diagonal — dx/dy/textAnchor sao constantes, entao e uma marca por serie.
    Plot.text([ganho(s.modelo.faixas_score)[3]!], {
      x: "pctBase",
      y: "pctConv",
      text: (r: any) => pct(r.pctConv * 100, 1),
      ...(series.length > 1 && i === 0
        ? { dx: 10, dy: 16, textAnchor: "start" as const }
        : { dx: -9, dy: -9, textAnchor: "end" as const }),
      fontSize: 10,
      fontWeight: 600,
      fill: s.cor,
    }),
  ]);

  return plot({
    width: L,
    height,
    marginLeft: 44,
    marginRight: 30,
    marginBottom: 40,
    marginTop: 12,
    x: { label: null, grid: true, tickSize: 0, domain: [0, 1], tickFormat: p1 },
    y: { label: null, grid: true, tickSize: 0, domain: [0, 1], tickFormat: p1 },
    color: { domain: series.map((s) => s.nome), range: series.map((s) => s.cor) },
    marks: [
      Plot.line(aleatorio, { x: "pctBase", y: "pctConv", stroke: COR.grey, strokeDasharray: "4,4" }),
      Plot.text([{ pctBase: 0.78, pctConv: 0.78 }], { x: "pctBase", y: "pctConv", text: () => "discagem sem modelo", dx: 4, dy: 12, textAnchor: "start", fontSize: 8.5, fill: COR.grey }),
      Plot.ruleX([0.3], { stroke: COR.dark, strokeDasharray: "3,3" }),
      Plot.areaY(
        series.length === 1 ? ganho(series[0]!.modelo.faixas_score) : [],
        { x: "pctBase", y: "pctConv", fill: series[0]?.cor ?? COR.primary, fillOpacity: 0.08, curve: "monotone-x" },
      ),
      Plot.line(pontos, { x: "pctBase", y: "pctConv", stroke: "nome", strokeWidth: 2, curve: "monotone-x" }),
      ...porSerie,
      Plot.axisX({ label: "% da base contactada, do score mais quente para o mais frio", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 8.5, tickFormat: p1 }),
    ],
  });
}

/** AUC, KS e Recall@30% nos três conjuntos. A linha de meta só existe na faceta
 *  de Recall — é a métrica contratada do projeto. */
function gMetricas(m: Modelo, height = 300) {
  const conj = [
    ["treino", "Treino"],
    ["oos", "OOS"],
    ["oot", "OOT"],
  ] as const;
  const met = [
    ["auc", "AUC"],
    ["ks", "KS"],
    ["recall_30", "Recall@30%"],
  ] as const;
  const linhas = met.flatMap(([k, nome]) => conj.map(([c, cn]) => ({ metrica: nome, conjunto: cn, v: m.metricas[c][k] })));

  return plot({
    width: L,
    height,
    marginLeft: 38,
    marginTop: 22,
    marginBottom: 46,
    fx: { label: null, tickSize: 0, padding: 0.24 },
    x: { label: null, tickSize: 0, domain: conj.map(([, n]) => n) },
    y: { label: null, grid: true, tickSize: 0, domain: [0, 1], tickFormat: p1 },
    color: { domain: conj.map(([, n]) => n), range: ["#c7d0dd", COR.accent, COR.primary] },
    marks: [
      Plot.barY(linhas, { fx: "metrica", x: "conjunto", y: "v", fill: "conjunto", rx: 2 }),
      Plot.text(linhas, {
        fx: "metrica",
        x: "conjunto",
        y: "v",
        text: (r: any) => num(r.v, 3),
        dy: 13,
        fontSize: 8.5,
        fontWeight: 600,
        // dentro da barra: fora dela o valor do OOT caia em cima da linha de meta
        fill: (r: any) => (r.conjunto === "Treino" ? COR.dark : "white"),
      }),
      Plot.ruleY([{ metrica: "Recall@30%", v: META_RECALL }], { fx: "metrica", y: "v", stroke: COR.red, strokeDasharray: "3,3" }),
      Plot.text([{ metrica: "Recall@30%", v: META_RECALL }], { fx: "metrica", y: "v", // dy folgado: com -6 o rotulo caia em cima do valor da barra do OOT, que fica
      // logo abaixo da meta.
      frameAnchor: "right", text: () => "meta 60%", dy: -21, dx: -2, textAnchor: "end", fontSize: 8, fontWeight: 500, fill: COR.red }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

/** Taxa de conversão por faixa de score (decis do OOT). Faixa 1 = 10% mais quentes. */
function gFaixas(m: Modelo, taxaGeral: number, height = 300) {
  const f = m.faixas_score;
  return plot({
    width: L,
    height,
    marginLeft: 40,
    marginTop: 22,
    marginBottom: 42,
    x: { label: null, tickSize: 0, domain: f.map((r) => String(r.faixa)) },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v * 100, 0) + "%" },
    marks: [
      Plot.barY(f, {
        x: (r: any) => String(r.faixa),
        y: "taxa_conversao",
        // gradiente frio->quente: a faixa 1 precisa saltar aos olhos
        fill: (r: any) => (r.faixa <= 3 ? COR.primary : r.faixa <= 6 ? COR.accent : "#c7d0dd"),
        rx: 2,
      }),
      Plot.text(f, { x: (r: any) => String(r.faixa), y: "taxa_conversao", text: (r: any) => num(r.taxa_conversao * 100, 1) + "%", dy: -8, fontSize: 8.5, fontWeight: 600, fill: COR.dark }),
      Plot.ruleY([taxaGeral], { stroke: COR.red, strokeDasharray: "3,3" }),
      Plot.text([{ y: taxaGeral }], { y: "y", frameAnchor: "right", text: () => "média da base " + num(taxaGeral * 100, 1) + "%", dy: -6, dx: -2, textAnchor: "end", fontSize: 8, fontWeight: 500, fill: COR.red }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
      Plot.axisX({ label: "faixa de score · 1 = 10% mais quentes, 10 = 10% mais frios", labelAnchor: "center", labelOffset: 32, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
    ],
  });
}

/** Importância (gain) relativa por variável, com o acumulado à direita.
 *  `destacar` pinta as colunas de campanha no modelo B. */
function gImportancia(m: Modelo, height: number, destacar = false) {
  const dados = m.importancia_features.map((r) => ({ ...r, rot: rotulo(r.feature), campanha: COLS_CAMPANHA.includes(r.feature) }));
  return plot({
    width: L,
    height,
    marginLeft: 176,
    marginRight: 76,
    marginBottom: 30,
    x: { label: null, grid: true, tickSize: 0, tickFormat: p1 },
    y: { label: null, tickSize: 0, domain: dados.map((r) => r.rot) },
    marks: [
      Plot.barX(dados, { x: "importance_relativa", y: "rot", fill: (r: any) => (destacar && r.campanha ? COR.soft : COR.primary), rx: 2 }),
      Plot.text(dados, { x: "importance_relativa", y: "rot", text: (r: any) => num(r.importance_acumulada * 100, 0) + "% acum.", dx: 6, textAnchor: "start", fontSize: 8, fill: COR.grey }),
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
      Plot.axisX({ label: "participação da variável no ganho total do modelo", labelAnchor: "center", labelOffset: 24, labelArrow: "none", tickSize: 0, fontSize: 8.5, tickFormat: p1 }),
    ],
  });
}

/** Drill-down SHAP: que valor da variável empurra a conversão pra cima ou pra baixo. */
function gDrill(dd: Modelo["drilldown"][number], height: number) {
  const dados = rotulosUnicos(dd.top_valores, 32);
  // Folga no dominio: sem ela a barra mais negativa encosta na moldura e o
  // rotulo dela cai por cima do nome da categoria, do lado de fora.
  const vals = dados.map((r) => r.contribuicao_media);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const folga = (max - min) * 0.12;
  return plot({
    width: L,
    height,
    marginLeft: 172,
    marginRight: 54,
    marginBottom: 14,
    marginTop: 6,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v, 2), domain: [min - (min < 0 ? folga : 0), max + folga] },
    y: { label: null, tickSize: 0, domain: dados.map((r) => r.rot) },
    marks: [
      Plot.barX(dados, { x: "contribuicao_media", y: "rot", fill: (r: any) => (r.contribuicao_media < 0 ? COR.red : COR.accent), rx: 2 }),
      // Duas marcas porque dx/textAnchor sao constantes: com uma so, o rotulo do
      // valor negativo cai dentro da propria barra vermelha.
      ...([
        [dados.filter((r) => r.contribuicao_media >= 0), 6, "start"],
        [dados.filter((r) => r.contribuicao_media < 0), -6, "end"],
      ] as const).map(([linhas, dx, anchor]) =>
        Plot.text(linhas, {
          x: "contribuicao_media",
          y: "rot",
          text: (r: any) => num(r.contribuicao_media, 3),
          dx,
          textAnchor: anchor,
          fontSize: 8,
          fill: COR.grey,
        }),
      ),
      Plot.ruleX([0], { stroke: COR.dark }),
    ],
  });
}

export const graficos = {
  gSplit,
  gGanhoBase: (d: Dados, h = 430) => gGanho([{ nome: "Modelo VW", modelo: d.base, cor: COR.primary }], h),
  gGanhoAB: (d: Dados, h = 380) =>
    gGanho(
      [
        { nome: "A — baseline", modelo: d.a, cor: COR.grey },
        { nome: "B — +campanha", modelo: d.b, cor: COR.accent },
      ],
      h,
    ),
  gMetricas,
  gFaixas,
  gImportancia,
  gDrill,
};
export { COR };
