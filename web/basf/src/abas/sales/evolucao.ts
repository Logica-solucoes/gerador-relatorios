import * as Plot from "@observablehq/plot";
import { ticket, total } from "../../calc";
import { cartao, kpi } from "../../componentes";
import { legenda } from "../../shared/blocos";
import { nf } from "../../shared/formato";
import { C, VERDE } from "../../shared/tema";
import type { Linha } from "../../types";
import type { DefAba } from "../tipos";
import { BASE_MINIMA, DIMS, MESES, controlesBase, recorte, semResultado } from "./comum";

export const evolucao: DefAba = {
  id: "evolucao",
  rotulo: "Evolução",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: controlesBase,

  render(ctx, corpo) {
    const r = recorte(ctx);
    const { ano, mesCorte } = r;
    const anos = [...new Set(r.base.map((l) => l.ano as number))].filter((a) => a <= ano).sort((a, b) => a - b);
    if (!anos.length) return semResultado(ctx, corpo);

    const atual = r.ytd(ano), ant = r.ytd(ano - 1);
    const vend = r.moeda(total(atual, "valor"), ano), vendAnt = r.moeda(total(ant, "valor"), ano - 1);
    const vol = total(atual, "th"), volAnt = total(ant, "th");
    const med = r.medir(atual, ano), medAnt = r.medir(ant, ano - 1);
    const dif = med != null && medAnt != null ? med - medAnt : null;
    const tk = ticket(vend, vol), tkAnt = ticket(vendAnt, volAnt);
    const fmtTicket = (v: number | null) => (v == null ? "—" : `${r.eur ? "€" : "R$"} ${nf(v, 2)}/TH`);

    // Soma uma vez por ano|mês: as três visões abaixo leem daqui.
    const porMes = new Map<string, Linha[]>();
    for (const l of r.base) { const k = `${l.ano}|${l.mes}`; (porMes.get(k) ?? porMes.set(k, []).get(k)!).push(l); }
    const noMes = (a: number, i: number) => r.medir(porMes.get(`${a}|${i + 1}`) ?? [], a) ?? 0;
    const meses = (a: number) => (a === ano ? mesCorte : 12);

    const mensal = anos.flatMap((a) => Array.from({ length: meses(a) }, (_, i) => ({ a, m: i, d: new Date(Date.UTC(a, i, 1)), v: noMes(a, i) })));
    const picos = anos.map((a) => mensal.filter((p) => p.a === a).reduce((x, y) => (y.v > x.v ? y : x)));
    const rotulos = [...new Set([...picos, mensal.at(-1)!])];

    const acum = (a: number) => { let s = 0; return Array.from({ length: meses(a) }, (_, i) => ({ m: i, v: (s += noMes(a, i)), serie: String(a) })); };
    const curva = [...(anos.includes(ano - 1) ? acum(ano - 1) : []), ...acum(ano)];
    const finais = [String(ano - 1), String(ano)].map((s) => curva.filter((p) => p.serie === s).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);

    const anosBarras = ctx.shell.compacto() ? anos.slice(-3) : anos;
    const anteriores = anosBarras.filter((a) => a !== ano);
    // Mais antigo = verde mais claro; o ano de referência é o único laranja.
    const cor = (a: number) => (a === ano ? C.o500 : VERDE[Math.min(1 + anteriores.indexOf(a), VERDE.length - 1)]!);
    const barras = mensal.filter((p) => anosBarras.includes(p.a)).map((p) => ({ ...p, serie: String(p.a) }));

    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: `Vendas · ${r.periodo}`, valor: r.fmtValor(vend), delta: r.delta(vend, vendAnt, BASE_MINIMA), destaque: true })}
        ${kpi({ rotulo: `Volume · ${r.periodo}`, valor: r.fmtTH(vol), delta: r.delta(vol, volAnt) })}
        ${kpi({ rotulo: `Diferença vs ${ano - 1}`, valor: dif == null ? "—" : `${dif >= 0 ? "+" : "−"}${r.fmt(Math.abs(dif))}`, nota: `mesmo período de ${ano - 1}` })}
        ${kpi({ rotulo: "Ticket médio", valor: fmtTicket(tk), delta: r.delta(tk, tkAnt) })}
      </div>
      ${cartao("Vendas mês a mês", `${anos[0]} → ${r.periodo}`, '<div data-el="mensal"></div>')}
      <div class="bmd-grid2">
        ${cartao("Acumulado no ano", `${ano} contra ${ano - 1}`, '<div data-el="acum"></div>')}
        ${cartao("Mês × ano", "ano de referência em laranja", `<div class="bmd-leg2">${legenda(anosBarras.map((a) => ({ rotulo: String(a), cor: cor(a), quadrado: true })))}</div><div data-el="mesano"></div>`)}
      </div>`;

    const alto = ctx.shell.compacto() ? 200 : 240;
    const tick = (v: number) => (v === 0 ? "0" : r.fmt(v));
    ctx.shell.desenhar("mensal", {
      height: alto, marginLeft: 80, marginRight: 56,
      x: { type: "utc", label: null, tickFormat: (d: Date) => MESES[d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : "") },
      y: { grid: true, label: null, tickFormat: tick },
      marks: [
        Plot.ruleY([0], { stroke: C.border }),
        Plot.lineY(mensal, { x: "d", y: "v", stroke: C.o500, strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(rotulos, { x: "d", y: "v", fill: C.o500, r: 3 }),
        Plot.text(rotulos, { x: "d", y: "v", text: (p: { v: number }) => r.fmt(p.v), dy: -9, fill: C.ink, fontWeight: 600 }),
      ],
    });
    ctx.shell.desenhar("acum", {
      height: alto, marginLeft: 80, marginRight: 120,
      x: { domain: [0, 11], ticks: 12, tickFormat: (i: number) => MESES[i] ?? "", label: null },
      y: { grid: true, label: null, tickFormat: tick },
      color: { domain: [String(ano - 1), String(ano)], range: [C.anterior, C.o500] },
      marks: [
        Plot.lineY(curva, { x: "m", y: "v", stroke: "serie", strokeWidth: 2.4, curve: "monotone-x" }),
        Plot.dot(finais, { x: "m", y: "v", fill: "serie", r: 3.5 }),
        Plot.text(finais, { x: "m", y: "v", text: (p: { serie: string; v: number }) => `${p.serie}  ${r.fmt(p.v)}`, dx: 8, textAnchor: "start", fill: "serie", fontWeight: 700 }),
      ],
    });
    ctx.shell.desenhar("mesano", {
      height: alto, marginLeft: 70, marginBottom: 28,
      fx: { axis: "bottom", tickFormat: (i: number) => MESES[i] ?? "", label: null, padding: 0.12 },
      x: { axis: null, domain: anosBarras.map(String) },
      y: { grid: true, label: null, tickFormat: tick },
      color: { domain: anosBarras.map(String), range: anosBarras.map(cor) },
      marks: [
        Plot.ruleY([0], { stroke: C.border }),
        Plot.barY(barras, { fx: "m", x: "serie", y: "v", fill: "serie", title: (p: { m: number; a: number; v: number }) => `${MESES[p.m]} ${p.a}: ${r.fmt(p.v)}` }),
      ],
    });
  },
};
