import * as Plot from "@observablehq/plot";
import type { Dados, Modelo } from "./queries";
import { capturaEm, faixaExibida, ganho, TAXA_ATENDIMENTO } from "./queries";
import { plot, L, num, pct, curto } from "../../core/report";

const COR = {
  primary: "#001e50",
  accent: "#0073c4",
  soft: "#7fd8ff",
  red: "#c40c1e",
  grey: "#a1a1aa",
  dark: "#3f3f46",
  // cinza de rotulo de valor: #a1a1aa fica ilegivel impresso em 8pt
  rotulo: "#52525b",
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
  "DN - Nome Fantasia": "Concessionária",
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
 * Rótulo do recorte de um drill-down. O notebook grava pares concatenados
 * ("Sub Origem › Sub Origem Nível 2"); aqui cada lado passa pelo LABEL.
 */
export const rotuloRecorte = (coluna: string) =>
  coluna
    .split("›")
    .map((s) => rotulo(s.trim()))
    .join(" › ");

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
 *  de maior score. A diagonal é a discagem sem modelo.
 *
 *  `corte` marca o ponto de operação — por padrão os 45% de taxa de atendimento
 *  medidos na auditoria, que é o corte que o time já pratica hoje. */
function gGanho(series: { nome: string; modelo: Modelo; cor: string }[], height: number, corte = TAXA_ATENDIMENTO) {
  const pontos = series.flatMap((s) => ganho(s.modelo.faixas_score).map((p) => ({ ...p, nome: s.nome })));
  const aleatorio = [
    { pctBase: 0, pctConv: 0 },
    { pctBase: 1, pctConv: 1 },
  ];
  const noCorte = (s: { modelo: Modelo }) => ({ pctBase: corte, pctConv: capturaEm(s.modelo.faixas_score, corte) });

  // Legenda no canto e rótulo do corte escalonados por série: `dy` é constante,
  // não canal — duas séries no mesmo mark sairiam sobrepostas.
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
    Plot.dot([noCorte(s)], { x: "pctBase", y: "pctConv", fill: s.cor, r: 4 }),
    // A esquerda da linha de corte e acima do ponto o espaco esta sempre vazio (a
    // curva vem de baixo). A direita ela passa por cima do rotulo. Com duas
    // series, a de baixo desce e vai pra direita, no vao entre as curvas e a
    // diagonal — dx/dy/textAnchor sao constantes, entao e uma marca por serie.
    Plot.text([noCorte(s)], {
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

  // O vao entre a curva e a diagonal no ponto de operacao — e o argumento inteiro
  // do relatorio em uma marca. So na serie unica: com duas curvas o espaco ja e disputado.
  const vao =
    series.length === 1
      ? [
          Plot.arrow([{ x: corte, y1: corte, y2: capturaEm(series[0]!.modelo.faixas_score, corte) }], {
            x1: "x",
            x2: "x",
            y1: "y1",
            y2: "y2",
            stroke: COR.red,
            strokeWidth: 1.4,
            headLength: 6,
            insetEnd: 4,
          }),
          Plot.text([{ x: corte, y: (corte + capturaEm(series[0]!.modelo.faixas_score, corte)) / 2 }], {
            x: "x",
            y: "y",
            text: () => "+" + num((capturaEm(series[0]!.modelo.faixas_score, corte) - corte) * 100, 1) + " p.p.",
            dx: 8,
            textAnchor: "start",
            fontSize: 9,
            fontWeight: 600,
            fill: COR.red,
          }),
        ]
      : [];

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
      Plot.text([{ pctBase: 0.78, pctConv: 0.78 }], { x: "pctBase", y: "pctConv", text: () => "fila sem modelo", dx: 4, dy: 12, textAnchor: "start", fontSize: 8.5, fill: COR.grey }),
      Plot.ruleX([corte], { stroke: COR.dark, strokeDasharray: "3,3" }),
      Plot.text([{ x: corte }], { x: "x", frameAnchor: "bottom", text: () => p1(corte) + " atendidos", dy: -6, dx: -5, textAnchor: "end", fontSize: 8.5, fontWeight: 500, fill: COR.dark }),
      Plot.areaY(
        series.length === 1 ? ganho(series[0]!.modelo.faixas_score) : [],
        { x: "pctBase", y: "pctConv", fill: series[0]?.cor ?? COR.primary, fillOpacity: 0.08, curve: "monotone-x" },
      ),
      Plot.line(pontos, { x: "pctBase", y: "pctConv", stroke: "nome", strokeWidth: 2, curve: "monotone-x" }),
      ...vao,
      ...porSerie,
      Plot.axisX({ label: "% da base contactada, do score mais quente para o mais frio", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 8.5, tickFormat: p1 }),
    ],
  });
}

/** AUC, KS e Recall@30% nos três conjuntos. Sem linha de alvo: o relatório não
 *  julga o modelo contra uma meta, mostra onde ele chega. */
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
        // dentro da barra: a barra do treino é clara, as outras duas escuras
        fill: (r: any) => (r.conjunto === "Treino" ? COR.dark : "white"),
      }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

/** Taxa de conversão por faixa de score (decis do OOT). Faixa 10 = 10% mais quentes. */
function gFaixas(m: Modelo, taxaGeral: number, height = 300) {
  const f = m.faixas_score;
  // eixo sempre 1→10 na tela, mesmo a ordem interna de `f` sendo quente→frio
  const domain = Array.from({ length: 10 }, (_, i) => String(i + 1));
  return plot({
    width: L,
    height,
    marginLeft: 40,
    marginTop: 22,
    marginBottom: 42,
    x: { label: null, tickSize: 0, domain },
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v * 100, 0) + "%" },
    marks: [
      Plot.barY(f, {
        x: (r: any) => String(faixaExibida(r.faixa)),
        y: "taxa_conversao",
        // gradiente frio->quente: a faixa 10 precisa saltar aos olhos
        fill: (r: any) => (faixaExibida(r.faixa) >= 8 ? COR.primary : faixaExibida(r.faixa) >= 5 ? COR.accent : "#c7d0dd"),
        rx: 2,
      }),
      Plot.text(f, { x: (r: any) => String(faixaExibida(r.faixa)), y: "taxa_conversao", text: (r: any) => num(r.taxa_conversao * 100, 1) + "%", dy: -8, fontSize: 8.5, fontWeight: 600, fill: COR.dark }),
      Plot.ruleY([taxaGeral], { stroke: COR.red, strokeDasharray: "3,3" }),
      // esquerda, não direita: com o eixo invertido são as barras frias (curtas)
      // que ficam do lado esquerdo, deixando espaço pro rótulo não colidir com barra
      Plot.text([{ y: taxaGeral }], { y: "y", frameAnchor: "left", text: () => "média da base " + num(taxaGeral * 100, 1) + "%", dy: -6, dx: 2, textAnchor: "start", fontSize: 8, fontWeight: 500, fill: COR.red }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
      Plot.axisX({ label: "faixa de score · 1 = 10% mais frios, 10 = 10% mais quentes", labelAnchor: "center", labelOffset: 32, labelArrow: "none", tickSize: 0, fontSize: 8.5 }),
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
    // `height` no Plot e o SVG inteiro: aumentar margem aperta a area do
    // grafico, nao a pagina. Com 30 o rotulo do eixo saia cortado embaixo.
    marginBottom: 42,
    x: { label: null, grid: true, tickSize: 0, tickFormat: p1 },
    y: { label: null, tickSize: 0, domain: dados.map((r) => r.rot) },
    marks: [
      Plot.barX(dados, { x: "importance_relativa", y: "rot", fill: (r: any) => (destacar && r.campanha ? COR.soft : COR.primary), rx: 2 }),
      Plot.text(dados, { x: "importance_relativa", y: "rot", text: (r: any) => num(r.importance_acumulada * 100, 0) + "% acum.", dx: 6, textAnchor: "start", fontSize: 8.5, fill: COR.rotulo }),
      Plot.ruleX([0], { stroke: "#d4d4d8" }),
      Plot.axisX({ label: "participação da variável no ganho total do modelo", labelAnchor: "center", labelOffset: 34, labelArrow: "none", tickSize: 0, fontSize: 8.5, tickFormat: p1 }),
    ],
  });
}

/** Drill-down SHAP: que valor da variável empurra a conversão pra cima ou pra baixo. */
function gDrill(dd: Modelo["drilldown"][number], height: number) {
  // 46, nao 32: desde que o recorte virou par concatenado os rotulos ficaram mais
  // longos — "Site Ofertas › Campanha - Lead Financiamento" tem 44 e saia cortado.
  const dados = rotulosUnicos(dd.top_valores, 46);
  // Folga no dominio: sem ela a barra mais negativa encosta na moldura e o
  // rotulo dela cai por cima do nome da categoria, do lado de fora.
  const vals = dados.map((r) => r.contribuicao_media);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const folga = (max - min) * 0.12;
  return plot({
    width: L,
    height,
    marginLeft: 232,
    // margem direita larga: a coluna de volume mora nela, ancorada na moldura
    marginRight: 104,
    marginBottom: 26,
    marginTop: 6,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v, 2), domain: [min - (min < 0 ? folga : 0), max + folga] },
    y: { label: null, tickSize: 0, domain: dados.map((r) => r.rot) },
    // 232 acompanha o `curto(…, 46)` acima — margem menor volta a cortar rotulo.
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
          fontSize: 8.5,
          fill: COR.rotulo,
        }),
      ),
      // Volume numa coluna propria: sem ele o leitor nao sabe se a media veio de
      // 57 mil leads ou de 2 — foi exatamente o que quebrou a primeira versao.
      Plot.text(dados, {
        y: "rot",
        frameAnchor: "right",
        text: (r: any) => num(r.volume) + " leads",
        dx: 96,
        textAnchor: "end",
        fontSize: 8,
        fill: COR.grey,
      }),
      Plot.ruleX([0], { stroke: COR.dark }),
    ],
  });
}

export const graficos = {
  gSplit,
  gGanhoBase: (d: Dados, h = 430) => gGanho([{ nome: "Modelo VW", modelo: d.base, cor: COR.primary }], h),
  // corte em 30% aqui, não nos 45%: a tabela A vs B compara Recall@30%, e gráfico
  // e tabela marcando pontos diferentes na mesma página confundem.
  gGanhoAB: (d: Dados, h = 380) =>
    gGanho(
      [
        { nome: "A — baseline", modelo: d.a, cor: COR.grey },
        { nome: "B — +campanha", modelo: d.b, cor: COR.accent },
      ],
      h,
      0.3,
    ),
  gMetricas,
  gFaixas,
  gImportancia,
  gDrill,
};
export { COR };
