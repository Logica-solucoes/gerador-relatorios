import * as Plot from "@observablehq/plot";
import type { Dados } from "./queries";
import { plot, L, num, pct, curto } from "../../core/report";
import { rotuloSemana } from "./narrativa";

export const COR = {
  primary: "#001e50", // VW Dark Blue
  accent: "#0073c4",
  soft: "#7fd8ff",
  red: "#c40c1e",
  amber: "#b45309",
  grey: "#a1a1aa",
  greyLight: "#d4d4d8",
  dark: "#3f3f46",
  rotulo: "#52525b",
};

/** Ordem cronológica do tempo de resposta — sem domínio explícito o Plot ordena
 *  alfabeticamente e "Até um dia" cai antes de "Até duas horas". */
export const ORDEM_TEMPO = ["Até 30 minutos", "Até duas horas", "Até um dia", "Mais de um dia"];

/** Legenda em HTML: a legenda nativa do Plot injeta um <style> extra que o
 *  plot() do core não limpa, e o gráfico sai sem altura no WeasyPrint. */
export const legenda = (itens: { rotulo: string; cor: string }[]) =>
  `<p class="legenda">${itens
    .map((i) => `<span class="item"><span class="sw" style="background:${i.cor}"></span>${i.rotulo}</span>`)
    .join("")}</p>`;

/** Rótulo curto da semana no eixo: só o dia/mês do início. */
const eixoSemana = (inicio: string) => rotuloSemana(inicio).slice(0, 5);

/** Sinal de um desfecho declarado. Sobe "Comprei um VW" é bom; sobe "Não fui à
 *  concessionária" é ruim — sem isso a seta da tabela do mês pinta as duas de
 *  vermelho e o leitor lê melhora como piora. Os demais status ("Fora da
 *  jornada", "Outros") não têm sinal e ficam neutros de propósito. */
export const perda = (m: string) => /Não fui|Desisti|outra marca|Fora da jornada/i.test(m);
export const venda = (m: string) => /Comprei um VW/i.test(m);

// ══ GRÁFICOS ══════════════════════════════════════════════════════════════

/**
 * Taxa de contato por semana de auditoria. Responde "está crescendo?"
 * com a série inteira: com ~100 respostas por semana, dois pontos viram ruído.
 * As duas últimas barras são as do comparativo e vêm destacadas.
 */
export function gSerie(d: Dados, height = 232) {
  const dados = d.serie.map((s) => ({
    ...s,
    rot: eixoSemana(s.inicio),
    foco: s.inicio === d.periodo.atual || s.inicio === d.periodo.anterior,
  }));
  return plot({
    width: L,
    height,
    marginLeft: 40,
    marginTop: 20,
    marginBottom: 38,
    x: { label: null, tickSize: 0, domain: dados.map((s) => s.rot) },
    y: { label: null, grid: true, tickSize: 0, domain: [0, 100], tickFormat: (v: number) => `${v}%` },
    marks: [
      Plot.barY(dados, { x: "rot", y: "tx", fill: (r: any) => (r.foco ? COR.primary : "#c7d0dd"), rx: 2 }),
      Plot.text(dados, {
        x: "rot",
        y: "tx",
        text: (r: any) => pct(r.tx, 0),
        dy: -14,
        fontSize: 9,
        fontWeight: 600,
        fill: (r: any) => (r.foco ? COR.primary : COR.rotulo),
      }),
      // o n cola em toda barra: é a peça que impede ler 3 respostas como tendência.
      // COR.grey (#a1a1aa) é ilegível impresso — mesma armadilha já documentada em
      // clients/vw/report.ts. Rótulo de dado usa COR.rotulo, nunca COR.grey.
      Plot.text(dados, { x: "rot", y: "tx", text: (r: any) => `n=${num(r.n)}`, dy: -4, fontSize: 8.5, fontWeight: 500, fill: COR.rotulo }),
      Plot.ruleY([0], { stroke: COR.greyLight }),
      Plot.axisX({ label: "semana da auditoria · as duas escuras são o comparativo", labelAnchor: "center", labelOffset: 30, labelArrow: "none", tickSize: 0, fontSize: 8 }),
    ],
  });
}

/**
 * NPS por faixa de tempo de atendimento — a correlação central do relatório.
 * Barra colorida por sinal: faixa com NPS negativo é vermelha, e é o argumento.
 * Janela acumulada: semanal daria ~10 respostas por faixa.
 */
export function gNpsTempo(d: Dados, height = 244) {
  const dados = ORDEM_TEMPO.map((t) => d.npsTempo.find((x) => x.tempo === t)).filter(Boolean) as Dados["npsTempo"];
  const min = Math.min(0, ...dados.map((x) => x.nps));
  const max = Math.max(0, ...dados.map((x) => x.nps));
  const folga = (max - min) * 0.18;
  return plot({
    width: L,
    height,
    marginLeft: 104,
    marginRight: 96,
    marginTop: 10,
    marginBottom: 34,
    x: { label: null, grid: true, tickSize: 0, domain: [min - folga, max + folga] },
    y: { label: null, tickSize: 0, domain: dados.map((x) => x.tempo) },
    marks: [
      Plot.barX(dados, { x: "nps", y: "tempo", fill: (r: any) => (r.nps < 0 ? COR.red : r.nps >= 40 ? COR.primary : COR.accent), rx: 2 }),
      // duas marcas porque dx/textAnchor são constantes: com uma só o rótulo do
      // valor negativo cairia dentro da própria barra vermelha
      ...([
        [dados.filter((r) => r.nps >= 0), 6, "start"],
        [dados.filter((r) => r.nps < 0), -6, "end"],
      ] as const).map(([linhas, dx, anchor]) =>
        Plot.text(linhas, { x: "nps", y: "tempo", text: (r: any) => num(r.nps, 1), dx, textAnchor: anchor, fontSize: 9.5, fontWeight: 600, fill: COR.rotulo }),
      ),
      Plot.text(dados, { y: "tempo", frameAnchor: "right", text: (r: any) => `n=${num(r.n)}`, dx: 88, textAnchor: "end", fontSize: 8.5, fill: COR.rotulo }),
      Plot.ruleX([0], { stroke: COR.dark }),
      Plot.axisX({ label: "NPS (promotores − detratores)", labelAnchor: "center", labelOffset: 28, labelArrow: "none", tickSize: 0, fontSize: 8 }),
    ],
  });
}

/**
 * Onde a venda escapa: desfecho declarado pelo cliente na janela acumulada.
 * Vermelho no que é perda, azul no que é venda — a leitura tem que ser
 * instantânea. Semanal não sustenta: a cauda desce a 1 resposta.
 */
export function gMotivo(d: Dados, height = 208) {
  const dados = d.motivo.map((m) => ({ ...m, rot: curto(m.motivo, 30) }));
  return plot({
    width: L,
    height,
    marginLeft: 156,
    marginRight: 84,
    marginTop: 8,
    marginBottom: 30,
    x: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => `${v}%` },
    y: { label: null, tickSize: 0, domain: dados.map((m) => m.rot) },
    marks: [
      Plot.barX(dados, {
        x: "pct",
        y: "rot",
        fill: (r: any) => (venda(r.motivo) ? COR.accent : perda(r.motivo) ? COR.red : COR.grey),
        rx: 2,
      }),
      Plot.text(dados, { x: "pct", y: "rot", text: (r: any) => `${pct(r.pct, 1)} · ${num(r.n)}`, dx: 6, textAnchor: "start", fontSize: 8.5, fill: COR.rotulo }),
      Plot.ruleX([0], { stroke: COR.greyLight }),
      Plot.axisX({ label: "% das respostas com desfecho declarado", labelAnchor: "center", labelOffset: 24, labelArrow: "none", tickSize: 0, fontSize: 8 }),
    ],
  });
}

type LinhaRegional = { regional: string; atual: { tx: number; n: number }; anterior: { tx: number; n: number } };

/** Taxa de contato por regional, os dois períodos lado a lado. `fx` faceta —
 *  empilhar as duas séries no mesmo x viraria barra somada, que não existe.
 *
 *  Serve semana e mês: só muda o rótulo do eixo. Quando o período anterior não
 *  tem amostra nenhuma (a auditoria trabalha em mutirão, e um mês inteiro pode
 *  vir vazio), a série some em vez de desenhar seis barras em zero — barra
 *  zerada ao lado de barra cheia se lê como colapso, não como ausência. */
export function gRegional(linhas: LinhaRegional[], rotuloEixo: string, height = 220) {
  const temAnterior = linhas.some((r) => r.anterior.n > 0);
  const dados = linhas.flatMap((r) => [
    ...(temAnterior ? [{ regional: `R${r.regional}`, semana: "anterior", tx: r.anterior.tx, n: r.anterior.n }] : []),
    { regional: `R${r.regional}`, semana: "atual", tx: r.atual.tx, n: r.atual.n },
  ]);
  const series = temAnterior ? ["anterior", "atual"] : ["atual"];
  return plot({
    width: L,
    height,
    marginLeft: 38,
    marginTop: 18,
    marginBottom: 40,
    fx: { label: null, tickSize: 0, padding: 0.22 },
    x: { label: null, tickSize: 0, domain: series },
    y: { label: null, grid: true, tickSize: 0, domain: [0, 100], tickFormat: (v: number) => `${v}%` },
    color: { domain: ["anterior", "atual"], range: ["#c7d0dd", COR.primary] },
    marks: [
      Plot.barY(dados, { fx: "regional", x: "semana", y: "tx", fill: "semana", rx: 2 }),
      Plot.text(dados, {
        fx: "regional",
        x: "semana",
        y: "tx",
        text: (r: any) => pct(r.tx, 0),
        dy: -8,
        fontSize: 8,
        fontWeight: 600,
        fill: COR.rotulo,
      }),
      // amostra abaixo do piso vira aviso na própria barra, não some do gráfico:
      // esconder tiraria a lição de que aquele recorte não sustenta leitura
      Plot.text(dados.filter((r) => r.n < 10), {
        fx: "regional",
        x: "semana",
        y: () => 4,
        text: () => "amostra baixa",
        fontSize: 7.5,
        fontWeight: 500,
        fill: COR.red,
      }),
      Plot.ruleY([0], { stroke: COR.greyLight }),
      // Com uma série só, "atual" embaixo de cada barra não diz nada.
      Plot.axisX({ label: rotuloEixo, labelAnchor: "center", labelOffset: 32, labelArrow: "none", tickSize: 0, fontSize: 8, ...(temAnterior ? {} : { tickFormat: () => "" }) }),
    ],
  });
}

export const graficos = { gSerie, gNpsTempo, gMotivo, gRegional };
