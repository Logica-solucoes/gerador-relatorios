import * as Plot from "@observablehq/plot";
import type { Dados } from "./queries";
import { capturaEm, PISO_AMOSTRA } from "./queries";
import { plot, L, num, pct, curto } from "../../core/report";

// um parâmetro só: tickFormat do Plot chama como (valor, index) e o index
// vazaria pra dentro de um segundo parâmetro "d" de casas decimais.
const p1 = (v: number) => pct(v * 100, 1);

export const COR = {
  primary: "#001e50", // VW Dark Blue
  accent: "#0073c4", // VW Light Blue escurecido p/ contraste em papel
  soft: "#7fd8ff",
  red: "#c40c1e",
  grey: "#a1a1aa",
  greyLight: "#d4d4d8",
  dark: "#3f3f46",
  // rotulo de valor em #a1a1aa fica ilegivel impresso em 8pt
  rotulo: "#52525b",
};

/** Faixas do NPS. É a régua do relatório inteiro, não só do gráfico de notas. */
export const FAIXA_NPS = [
  { faixa: "Detrator", notas: "0 a 6", cor: COR.red },
  { faixa: "Neutro", notas: "7 e 8", cor: COR.grey },
  { faixa: "Promotor", notas: "9 e 10", cor: COR.accent },
] as const;

export const faixaDaNota = (n: number) => (n <= 6 ? "Detrator" : n <= 8 ? "Neutro" : "Promotor");

/** Ordem cronológica do tempo de resposta. Sem domínio explícito o Plot ordena
 *  alfabeticamente e "Até um dia" cai antes de "Até duas horas". */
export const ORDEM_TEMPO = ["Até 30 minutos", "Até duas horas", "Até um dia", "Mais de um dia"];

/** Ordem e cor do desfecho declarado pelo cliente. Do melhor para o pior desfecho
 *  do ponto de vista da VW — é o que faz a barra empilhada ser lida da esquerda
 *  para a direita como uma escala, e não como sete cores aleatórias. */
export const STATUS = [
  { status: "Comprei um VW Zero", cor: COR.primary },
  { status: "Comprei um VW Seminovo", cor: COR.accent },
  { status: "Fui à concessionária", cor: COR.soft },
  { status: "Não fui à concessionária", cor: COR.greyLight },
  { status: "Desisti de comprar", cor: COR.grey },
  { status: "Fora da jornada de compra", cor: COR.dark },
  { status: "Comprei de outra marca", cor: COR.red },
];
const ORDEM_STATUS = STATUS.map((s) => s.status);
const COR_STATUS = STATUS.map((s) => s.cor);

const SENTIMENTO = [
  { sentimento: "positivo", rotulo: "Positivo", cor: COR.accent },
  { sentimento: "neutro", rotulo: "Neutro", cor: COR.grey },
  { sentimento: "negativo", rotulo: "Negativo", cor: COR.red },
];

export const CANAIS = [
  { canal: "WhatsApp", cor: COR.primary },
  { canal: "Ligação", cor: COR.accent },
  { canal: "E-Mail", cor: COR.soft },
];

const escalaStatus = { domain: ORDEM_STATUS, range: COR_STATUS };

/** Legenda em HTML, não a do Plot. A legenda nativa devolve um <figure> com um
 *  <style> extra, e o `plot()` do core só sabe limpar o primeiro — o resultado é
 *  gráfico sem altura no WeasyPrint. Aqui a legenda é markup comum e imprime igual. */
export const legenda = (itens: { rotulo: string; cor: string }[]) =>
  `<p class="legenda">${itens
    .map((i) => `<span class="item"><span class="sw" style="background:${i.cor}"></span>${i.rotulo}</span>`)
    .join("")}</p>`;

/** dd/mm em fuso fixo — mesma razão do dt() do core: o mesmo relatório gerado no
 *  Windows e no container não pode mudar de dia. */
const dm = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Rótulo de amostra. Aparece grudado em toda barra de recorte — é a peça que
 *  transforma "essa concessionária tem 100%" em "100% de 3 respostas". */
export const amostra = (n: number) => `n=${num(n)}`;

// ══ GRÁFICOS ══════════════════════════════════════════════════════════════

/** Funil da auditoria. A barra é a **retenção** — quanto sobrou do degrau acima —
 *  e não o volume absoluto: em escala linear o último degrau (centenas) sumiria ao
 *  lado do primeiro (centenas de milhares), e em escala log a barra perde a
 *  baseline e não desenha (ver CLAUDE.md da raiz). O volume vai no rótulo. */
export function gFunil(d: Dados, height = 250) {
  const etapas = d.funil.map((e, i) => ({
    ...e,
    retencao: i === 0 ? 100 : (e.n / d.funil[i - 1]!.n) * 100,
    doTopo: (e.n / d.funil[0]!.n) * 100,
  }));
  return plot({
    width: L,
    height,
    marginLeft: 190,
    marginRight: 190,
    marginBottom: 32,
    x: { label: "% que sobrou do degrau acima", labelArrow: "none", domain: [0, 100], grid: true, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: etapas.map((e) => e.etapa) },
    marks: [
      Plot.barX(etapas, { x: "retencao", y: "etapa", fill: COR.primary, rx: 2 }),
      Plot.text(etapas, {
        x: "retencao",
        y: "etapa",
        text: (e: any) =>
          `${num(e.n)} leads · ${pct(e.retencao, 0)} do degrau acima${
            e.doTopo === 100 ? "" : ` · ${pct(e.doTopo, 1)} do topo`
          }`,
        dx: 6,
        textAnchor: "start",
        fontSize: 8.5,
        fill: COR.rotulo,
      }),
    ],
  });
}

/**
 * Taxa de conversão acumulada ao ligar para os N% de maior score, caso a fila
 * fosse ordenada em vez de atendida por chegada. A forma da curva vem do modelo
 * de Lead Scoring (`faixasScore`, decis do OOT — outro relatório, ver
 * clients/vw_auditoria/CLAUDE.md); o nível (onde ela pousa) vem da conversão
 * real desta auditoria (`projecao.taxaHoje`), não do modelo. A horizontal é a
 * fila por ordem de chegada — mesma taxa em qualquer corte.
 */
export function gProjecao(d: Dados, height: number) {
  const { corte, taxaHoje, taxaOrdenada } = d.projecao;
  const pontos = d.faixasScore.map((_, i) => {
    const pctBase = (i + 1) / 10;
    const captura = capturaEm(d.faixasScore, pctBase);
    return { pctBase, taxa: (captura / pctBase) * taxaHoje };
  });
  const topo = pontos[0]!;
  const noCorte = { pctBase: corte, taxa: taxaOrdenada };

  return plot({
    width: L,
    height,
    marginLeft: 44,
    marginRight: 30,
    marginBottom: 40,
    marginTop: 16,
    x: { label: null, grid: true, tickSize: 0, domain: [0, 1], tickFormat: p1 },
    y: { label: null, grid: true, tickSize: 0, domain: [0, topo.taxa * 1.14], tickFormat: p1 },
    marks: [
      Plot.areaY(pontos, { x: "pctBase", y1: () => taxaHoje, y2: "taxa", fill: COR.primary, fillOpacity: 0.08, curve: "monotone-x" }),
      Plot.ruleY([taxaHoje], { stroke: COR.grey, strokeDasharray: "4,4" }),
      Plot.text([{ y: taxaHoje }], { y: "y", frameAnchor: "left", text: () => `fila sem modelo · ${p1(taxaHoje)} em qualquer corte`, dy: 11, dx: 2, textAnchor: "start", fontSize: 8.5, fill: COR.grey }),
      Plot.line(pontos, { x: "pctBase", y: "taxa", stroke: COR.primary, strokeWidth: 2, curve: "monotone-x" }),
      Plot.ruleX([corte], { stroke: COR.dark, strokeDasharray: "3,3" }),
      Plot.text([{ x: corte }], { x: "x", frameAnchor: "bottom", text: () => p1(corte) + " contactados", dy: -6, dx: -5, textAnchor: "end", fontSize: 8.5, fontWeight: 500, fill: COR.dark }),
      Plot.arrow([{ x: corte, y1: taxaHoje, y2: taxaOrdenada }], { x1: "x", x2: "x", y1: "y1", y2: "y2", stroke: COR.red, strokeWidth: 1.4, headLength: 6, insetEnd: 4 }),
      Plot.text([{ x: corte, y: (taxaHoje + taxaOrdenada) / 2 }], { x: "x", y: "y", text: () => "+" + num((taxaOrdenada - taxaHoje) * 100, 1) + " p.p.", dx: 8, textAnchor: "start", fontSize: 9, fontWeight: 600, fill: COR.red }),
      Plot.dot([noCorte], { x: "pctBase", y: "taxa", fill: COR.primary, r: 4 }),
      Plot.text([noCorte], { x: "pctBase", y: "taxa", text: (r: any) => p1(r.taxa), dx: 9, dy: -9, textAnchor: "start", fontSize: 10, fontWeight: 600, fill: COR.primary }),
      Plot.dot([topo], { x: "pctBase", y: "taxa", fill: COR.primary, r: 3 }),
      Plot.text([topo], { x: "pctBase", y: "taxa", text: (r: any) => p1(r.taxa), dx: 6, dy: -9, textAnchor: "start", fontSize: 9, fontWeight: 600, fill: COR.primary }),
      Plot.ruleY([0], { stroke: COR.greyLight }),
      Plot.axisX({ label: "% da fila contactada, do score mais quente para o mais frio", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 8.5, tickFormat: p1 }),
    ],
  });
}

/** Taxa de contato mês a mês. Poucos pontos, então o rótulo vai em cada um. */
export function gContatoMes(d: Dados, height = 210) {
  return plot({
    width: L,
    height,
    marginLeft: 46,
    marginRight: 30,
    marginBottom: 34,
    x: { label: null, tickSize: 0, domain: d.contatoMes.map((m) => m.mes) },
    y: { label: "% que confirma contato", labelArrow: "none", domain: [0, 100], grid: true },
    marks: [
      Plot.ruleY([0], { stroke: COR.greyLight }),
      Plot.line(d.contatoMes, { x: "mes", y: "tx", stroke: COR.accent, strokeWidth: 2.5, curve: "monotone-x" }),
      Plot.dot(d.contatoMes, { x: "mes", y: "tx", fill: COR.primary, r: 4.5 }),
      Plot.text(d.contatoMes, {
        x: "mes",
        y: "tx",
        text: (m: any) => `${pct(m.tx)}  (${amostra(m.n)})`,
        dy: -14,
        fontSize: 9.5,
        fontWeight: 600,
        fill: COR.primary,
      }),
    ],
  });
}

/** Taxa de contato dia a dia. Dias abaixo do piso saem em cinza e sem linha —
 *  é justamente o que a página quer ensinar a ignorar. */
export function gContatoDia(d: Dados, height = 230) {
  // eixo de banda com rótulo dd/mm pronto: escala temporal deixaria os dias sem
  // auditoria como buraco no meio da linha, e o que interessa aqui é a sequência
  const dias = d.contatoDia.map((x) => ({ ...x, rot: dm(x.dia) }));
  const firmes = dias.filter((x) => x.n >= PISO_AMOSTRA);
  const fracos = dias.filter((x) => x.n < PISO_AMOSTRA);
  return plot({
    width: L,
    height,
    marginLeft: 46,
    marginRight: 16,
    marginBottom: 46,
    x: { label: null, tickRotate: -60, tickSize: 0, domain: dias.map((x) => x.rot) },
    y: { label: "% que confirma contato", labelArrow: "none", domain: [0, 100], grid: true },
    marks: [
      Plot.ruleY([0], { stroke: COR.greyLight }),
      Plot.line(firmes, { x: "rot", y: "tx", stroke: COR.accent, strokeWidth: 2 }),
      Plot.dot(firmes, { x: "rot", y: "tx", fill: COR.primary, r: 3 }),
      Plot.dot(fracos, { x: "rot", y: "tx", fill: "white", stroke: COR.grey, strokeWidth: 1.2, r: 3.2 }),
    ],
  });
}

/** Distribuição bruta das notas de NPS, colorida pela faixa. */
export function gNpsNotas(d: Dados, height = 220) {
  const notas = d.npsNotas.map((n) => ({ ...n, faixa: faixaDaNota(n.nota) }));
  return plot({
    width: L,
    height,
    marginLeft: 44,
    marginRight: 16,
    marginBottom: 40,
    x: { label: "nota dada pelo cliente", labelArrow: "none", tickSize: 0 },
    y: { label: "respostas", labelArrow: "none", grid: true },
    color: { domain: FAIXA_NPS.map((f) => f.faixa), range: FAIXA_NPS.map((f) => f.cor) },
    marks: [
      Plot.ruleY([0], { stroke: COR.greyLight }),
      Plot.barY(notas, { x: "nota", y: "n", fill: "faixa", rx: 2 }),
      Plot.text(notas, { x: "nota", y: "n", text: (n: any) => num(n.n), dy: -8, fontSize: 9, fill: COR.rotulo }),
    ],
  });
}

/** NPS por faixa de tempo de resposta — a escada que sustenta o relatório. */
export function gNpsTempo(d: Dados, height = 210) {
  const dados = d.npsTempo.map((t) => ({ ...t, positivo: t.nps >= 0 }));
  return plot({
    width: L,
    height,
    marginLeft: 118,
    marginRight: 120,
    marginBottom: 34,
    x: { label: "NPS (−100 a +100)", labelArrow: "none", domain: [-40, 70], grid: true },
    y: { label: null, tickSize: 0, domain: ORDEM_TEMPO },
    marks: [
      Plot.barX(dados, { x: "nps", y: "tempo", fill: (t: any) => (t.positivo ? COR.accent : COR.red), rx: 2 }),
      Plot.ruleX([0], { stroke: COR.dark }),
      // duas marcas porque textAnchor é constante: barra positiva rotula à
      // direita, negativa à esquerda — com uma marca só o texto invade a barra
      Plot.text(dados.filter((t) => t.positivo), {
        x: "nps", y: "tempo", text: (t: any) => `+${num(t.nps, 1)}  (${amostra(t.n)})`,
        dx: 6, textAnchor: "start", fontSize: 9.5, fontWeight: 600, fill: COR.rotulo,
      }),
      Plot.text(dados.filter((t) => !t.positivo), {
        x: "nps", y: "tempo", text: (t: any) => `${num(t.nps, 1)}  (${amostra(t.n)})`,
        dx: -6, textAnchor: "end", fontSize: 9.5, fontWeight: 600, fill: COR.red,
      }),
    ],
  });
}

/** Quanto tempo o cliente diz que esperou. */
export function gTempo(d: Dados, height = 180) {
  const total = d.tempo.reduce((a, b) => a + b.n, 0);
  return plot({
    width: L,
    height,
    marginLeft: 118,
    marginRight: 108,
    marginBottom: 30,
    x: { label: "respostas", labelArrow: "none", grid: true },
    y: { label: null, tickSize: 0, domain: ORDEM_TEMPO },
    marks: [
      Plot.barX(d.tempo, { x: "n", y: "tempo", fill: COR.primary, rx: 2 }),
      Plot.text(d.tempo, {
        x: "n", y: "tempo", text: (t: any) => `${num(t.n)}  (${pct((t.n / total) * 100, 0)})`,
        dx: 6, textAnchor: "start", fontSize: 9, fill: COR.rotulo,
      }),
    ],
  });
}

/** Desfecho declarado por faixa de tempo, em barras 100%. Compara composição,
 *  não volume — as quatro faixas têm tamanhos diferentes. */
export function gStatusTempo(d: Dados, height = 250) {
  const linhas = d.statusTempo.flatMap((t) =>
    t.status.map((s) => ({ tempo: t.tempo, status: s.status, n: s.n, share: (s.n / t.total) * 100 })),
  );
  const rotuloTempo = Object.fromEntries(d.statusTempo.map((t) => [t.tempo, `${t.tempo} (${amostra(t.total)})`]));
  return plot({
    width: L,
    height,
    marginLeft: 152,
    marginRight: 16,
    marginBottom: 34,
    x: { label: "% das respostas da faixa", labelArrow: "none", grid: true, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: ORDEM_TEMPO, tickFormat: (t: string) => rotuloTempo[t] ?? t },
    color: escalaStatus,
    marks: [
      Plot.barX(linhas, { x: "share", y: "tempo", fill: "status", order: ORDEM_STATUS, rx: 1 }),
    ],
  });
}

/** "Comprei de outra marca" isolado por faixa de tempo — a leitura que a barra
 *  empilhada torna possível mas não entrega pronta. */
export function gOutraMarcaTempo(d: Dados, height = 168) {
  const dados = d.statusTempo.map((t) => {
    const n = t.status.find((s) => s.status === "Comprei de outra marca")?.n ?? 0;
    return { tempo: t.tempo, share: (n / t.total) * 100, n, total: t.total };
  });
  return plot({
    width: L,
    height,
    marginLeft: 118,
    marginRight: 132,
    marginBottom: 30,
    x: { label: "% que comprou de outra marca", labelArrow: "none", grid: true, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: ORDEM_TEMPO },
    marks: [
      Plot.barX(dados, { x: "share", y: "tempo", fill: COR.red, rx: 2 }),
      Plot.text(dados, {
        x: "share", y: "tempo", text: (t: any) => `${pct(t.share)}  (${t.n} de ${t.total})`,
        dx: 6, textAnchor: "start", fontSize: 9, fill: COR.rotulo,
      }),
    ],
  });
}

/** Desfecho declarado: todos os auditados vs. só quem não preencheu o formulário.
 *  Dumbbell em vez de barras agrupadas — o que interessa é a distância entre os
 *  dois pontos, e 14 barras finas empatam a leitura. */
export function gStatusComparado(d: Dados, height = 250) {
  const soma = (xs: { n: number }[]) => xs.reduce((a, b) => a + b.n, 0);
  const tGeral = soma(d.status);
  const tNao = soma(d.statusNaoPreencheu);
  const linhas = ORDEM_STATUS.map((status) => {
    const geral = ((d.status.find((s) => s.status === status)?.n ?? 0) / tGeral) * 100;
    const naoPreencheu = ((d.statusNaoPreencheu.find((s) => s.status === status)?.n ?? 0) / tNao) * 100;
    return { status, geral, naoPreencheu };
  });
  return plot({
    width: L,
    height,
    marginLeft: 150,
    marginRight: 46,
    marginBottom: 36,
    x: { label: "% do grupo", labelArrow: "none", grid: true, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: ORDEM_STATUS },
    marks: [
      Plot.link(linhas, { x1: "geral", x2: "naoPreencheu", y1: "status", y2: "status", stroke: COR.greyLight, strokeWidth: 2.5 }),
      Plot.dot(linhas, { x: "geral", y: "status", fill: COR.primary, r: 5 }),
      Plot.dot(linhas, { x: "naoPreencheu", y: "status", fill: COR.soft, stroke: COR.accent, r: 5 }),
    ],
  });
}

/** Canal que o cliente pediu no cadastro × canal que a concessionária usou. */
export function gCanalPreferencia(d: Dados, height = 200) {
  const porPedido = new Map<string, number>();
  for (const c of d.canalPreferencia) porPedido.set(c.pedido, (porPedido.get(c.pedido) ?? 0) + c.n);
  const linhas = d.canalPreferencia.map((c) => ({ ...c, share: (c.n / porPedido.get(c.pedido)!) * 100 }));
  const ordem = [...porPedido].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  // o cadastro grava "Whatsapp"/"Email"; o resto do relatório escreve "WhatsApp"/"E-Mail"
  const GRAFIA: Record<string, string> = { Whatsapp: "WhatsApp", Email: "E-Mail", Telefone: "telefone" };
  const rot = Object.fromEntries(
    [...porPedido].map(([p, n]) => [p, `Pediu ${GRAFIA[p] ?? p} (${amostra(n)})`]),
  );
  return plot({
    width: L,
    height,
    marginLeft: 152,
    marginRight: 16,
    marginBottom: 34,
    x: { label: "% dos contatos do grupo", labelArrow: "none", grid: true, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: ordem, tickFormat: (p: string) => rot[p] ?? p },
    color: { domain: CANAIS.map((c) => c.canal), range: CANAIS.map((c) => c.cor) },
    marks: [Plot.barX(linhas, { x: "share", y: "pedido", fill: "usado", order: ["WhatsApp", "Ligação", "E-Mail"], rx: 1 })],
  });
}

/** Barras horizontais genéricas de recorte, com n colado no rótulo. Usada para
 *  regional e modelo — mesma leitura, dois cortes. */
function gRecorte(
  itens: { rotulo: string; valor: number; n: number }[],
  opts: { height: number; eixo: string; dominio?: [number, number]; cor?: (v: number) => string; formato?: (v: number) => string },
) {
  const cor = opts.cor ?? (() => COR.primary);
  const fmt = opts.formato ?? ((v: number) => pct(v));
  const positivos = itens.filter((i) => i.valor >= 0);
  const negativos = itens.filter((i) => i.valor < 0);
  return plot({
    width: L,
    height: opts.height,
    marginLeft: 116,
    marginRight: 108,
    marginBottom: 32,
    x: { label: opts.eixo, labelArrow: "none", grid: true, ...(opts.dominio ? { domain: opts.dominio } : {}) },
    y: { label: null, tickSize: 0, domain: itens.map((i) => i.rotulo) },
    marks: [
      Plot.barX(itens, { x: "valor", y: "rotulo", fill: (i: any) => cor(i.valor), rx: 2 }),
      Plot.ruleX([0], { stroke: COR.dark }),
      Plot.text(positivos, {
        x: "valor", y: "rotulo", text: (i: any) => `${fmt(i.valor)}  (${amostra(i.n)})`,
        dx: 6, textAnchor: "start", fontSize: 9, fill: COR.rotulo,
      }),
      Plot.text(negativos, {
        x: "valor", y: "rotulo", text: (i: any) => `${fmt(i.valor)}  (${amostra(i.n)})`,
        dx: -6, textAnchor: "end", fontSize: 9, fill: COR.red,
      }),
    ],
  });
}

const corNps = (v: number) => (v < 0 ? COR.red : v >= 30 ? COR.accent : COR.primary);

export const gContatoRegional = (d: Dados, height = 190) =>
  gRecorte(
    d.contatoRegional.map((r) => ({ rotulo: `Regional ${r.regional}`, valor: r.tx, n: r.n })),
    { height, eixo: "% que confirma contato", dominio: [0, 100] },
  );

export const gNpsRegional = (d: Dados, height = 190) =>
  gRecorte(
    d.npsRegional.map((r) => ({ rotulo: `Regional ${r.regional}`, valor: r.nps, n: r.n })),
    { height, eixo: "NPS (−100 a +100)", dominio: [-10, 55], cor: corNps, formato: (v) => num(v, 1) },
  );

/** NPS por canal usado. Canais abaixo do piso entram em cinza, com o n visível —
 *  sumir com eles esconderia justamente a armadilha que a página quer mostrar. */
export function gNpsCanal(d: Dados, height = 168) {
  const itens = [...d.npsCanal].sort((a, b) => b.n - a.n);
  return plot({
    width: L,
    height,
    marginLeft: 96,
    marginRight: 132,
    marginBottom: 32,
    x: { label: "NPS (−100 a +100)", labelArrow: "none", domain: [0, 110], grid: true },
    y: { label: null, tickSize: 0, domain: itens.map((c) => c.canal) },
    marks: [
      Plot.barX(itens, { x: "nps", y: "canal", fill: (c: any) => (c.n >= PISO_AMOSTRA ? COR.primary : COR.greyLight), rx: 2 }),
      Plot.ruleX([0], { stroke: COR.dark }),
      Plot.text(itens, {
        x: "nps", y: "canal",
        text: (c: any) => `${num(c.nps, 1)}  (${amostra(c.n)})${c.n < PISO_AMOSTRA ? " — amostra insuficiente" : ""}`,
        dx: 6, textAnchor: "start", fontSize: 8.5, fill: COR.rotulo,
      }),
    ],
  });
}

export const gContatoModelo = (d: Dados, height = 240) =>
  gRecorte(
    d.contatoModelo.filter((m) => m.n >= PISO_AMOSTRA).map((m) => ({ rotulo: m.modelo, valor: m.tx, n: m.n })),
    { height, eixo: "% que confirma contato", dominio: [0, 100] },
  );

export const gNpsModelo = (d: Dados, height = 240) =>
  gRecorte(
    d.npsModelo.filter((m) => m.n >= PISO_AMOSTRA).map((m) => ({ rotulo: m.modelo, valor: m.nps, n: m.n })),
    { height, eixo: "NPS (−100 a +100)", dominio: [-30, 60], cor: corNps, formato: (v) => num(v, 1) },
  );

/** Volume de comentários por sentimento. Três barras, sem eixo — é um totalizador. */
export function gSentimento(d: Dados, height = 130) {
  const linhas = SENTIMENTO.map((s) => ({
    rotulo: s.rotulo,
    cor: s.cor,
    n: d.sentimento.volume[s.sentimento as keyof typeof d.sentimento.volume],
  }));
  const total = linhas.reduce((a, b) => a + b.n, 0);
  return plot({
    width: L,
    height,
    marginLeft: 74,
    marginRight: 108,
    marginBottom: 26,
    x: { label: "comentários", labelArrow: "none", grid: true },
    y: { label: null, tickSize: 0, domain: linhas.map((l) => l.rotulo) },
    marks: [
      Plot.barX(linhas, { x: "n", y: "rotulo", fill: (l: any) => l.cor, rx: 2 }),
      Plot.text(linhas, {
        x: "n", y: "rotulo", text: (l: any) => `${num(l.n)}  (${pct((l.n / total) * 100, 0)})`,
        dx: 6, textAnchor: "start", fontSize: 9, fill: COR.rotulo,
      }),
    ],
  });
}

/** Palavras mais repetidas, coloridas pelo sentimento dominante. Substitui a
 *  nuvem do dashboard: no papel a nuvem vira mancha ilegível, a barra não. */
export function gPalavras(d: Dados, height = 300) {
  const itens = d.sentimento.palavras;
  return plot({
    width: L,
    height,
    marginLeft: 118,
    marginRight: 40,
    marginBottom: 32,
    x: { label: "vezes que a palavra aparece", labelArrow: "none", grid: true },
    y: { label: null, tickSize: 0, domain: itens.map((p) => p.palavra) },
    color: { domain: SENTIMENTO.map((s) => s.sentimento), range: SENTIMENTO.map((s) => s.cor) },
    marks: [
      Plot.barX(itens, { x: "n", y: "palavra", fill: "sentimento", rx: 2 }),
      Plot.text(itens, { x: "n", y: "palavra", text: (p: any) => num(p.n), dx: 5, textAnchor: "start", fontSize: 8.5, fill: COR.rotulo }),
    ],
  });
}

/** Marcas concorrentes citadas. Amostra minúscula — o gráfico existe para mostrar
 *  o formato do dado que vai chegar, não para sustentar conclusão. */
export function gConcorrencia(d: Dados, height = 230) {
  const itens = d.concorrencia.map((c) => ({ ...c, rot: curto(c.rotulo, 24) }));
  return plot({
    width: L,
    height,
    marginLeft: 150,
    marginRight: 40,
    marginBottom: 34,
    x: { label: "clientes que citaram", labelArrow: "none", grid: true, ticks: 3 },
    y: { label: null, tickSize: 0, domain: itens.map((c) => c.rot) },
    marks: [
      Plot.barX(itens, { x: "n", y: "rot", fill: COR.grey, rx: 2 }),
      Plot.text(itens, { x: "n", y: "rot", text: (c: any) => num(c.n), dx: 5, textAnchor: "start", fontSize: 9, fill: COR.rotulo }),
    ],
  });
}

/** Taxa de contato por origem do lead. Mesmo piso de amostra dos outros recortes. */
export const gContatoOrigem = (d: Dados, height = 190) =>
  gRecorte(
    d.contatoOrigem.map((o) => ({ rotulo: o.origem, valor: o.tx, n: o.n })),
    { height, eixo: "% que confirma contato", dominio: [0, 100] },
  );

/** Volume de leads e conversão por origem. Duas leituras num gráfico: a barra é
 *  o volume, o rótulo é a taxa — origem grande com taxa baixa salta à vista. */
export function gSubOrigem(d: Dados, height = 220) {
  return plot({
    width: L,
    height,
    marginLeft: 132,
    marginRight: 140,
    marginBottom: 32,
    x: { label: "leads criados no período", labelArrow: "none", grid: true, tickFormat: (v: number) => num(v / 1000) + "k" },
    y: { label: null, tickSize: 0, domain: d.subOrigem.map((s) => s.origem) },
    marks: [
      Plot.barX(d.subOrigem, { x: "leads", y: "origem", fill: COR.primary, rx: 2 }),
      Plot.text(d.subOrigem, {
        x: "leads", y: "origem",
        text: (s: any) => `${num(s.leads)} leads · ${pct(s.tx)} viraram venda`,
        dx: 6, textAnchor: "start", fontSize: 8.5, fill: COR.rotulo,
      }),
    ],
  });
}

export const graficos = {
  gFunil,
  gProjecao,
  gContatoMes,
  gContatoDia,
  gNpsNotas,
  gNpsTempo,
  gTempo,
  gStatusTempo,
  gOutraMarcaTempo,
  gStatusComparado,
  gCanalPreferencia,
  gContatoRegional,
  gNpsRegional,
  gNpsCanal,
  gContatoModelo,
  gNpsModelo,
  gSentimento,
  gPalavras,
  gConcorrencia,
  gSubOrigem,
  gContatoOrigem,
};
