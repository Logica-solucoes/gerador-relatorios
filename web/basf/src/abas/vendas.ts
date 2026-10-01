import * as Plot from "@observablehq/plot";
import { agregar, atingimento, filtrar, total, variacao, type Filtros } from "../calc";
import { cartao, kpi, seg } from "../componentes";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { C } from "../shared/tema";
import type { Linha } from "../types";
import type { DefAba } from "./tipos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const BASE_MINIMA = 1000;
const ESTILO_PAR = `<style>
.bmd-par{display:flex;flex-direction:column;gap:6px}
.bmd-par button{display:grid;grid-template-columns:minmax(70px,26%) 1fr auto;gap:10px;align-items:center;text-align:left;background:none;border:0;padding:4px 2px;cursor:pointer;font:inherit;color:inherit;border-radius:6px}
.bmd-par button:hover{background:rgba(0,0,0,.04)}
.bmd-par button>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.bmd-par button>span:nth-child(2){display:flex;flex-direction:column;gap:3px}
.bmd-par s{display:block;height:7px;border-radius:2px;text-decoration:none}
.bmd-par .bmd-mono{font-size:12px;white-space:nowrap}
.bmd-par em{font-style:normal;margin-left:6px}
.bmd-pos{color:${C.verde}}.bmd-neg{color:${C.alerta}}
</style>`;

export const vendas: DefAba = {
  id: "vendas",
  rotulo: "Vendas",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: { ano: "Ano", crop: "Crop", rtv: "RTV", regional: "Regional", cliente: "Cliente" }, origem: "vendas" }),
  controles: (e) => {
    return seg("moeda", { brl: "R$", eur: "€" }, e.moeda, [], "taxa do ano não cadastrada") + seg("medida", { valor: "Valor", th: "TH" }, e.medida);
  },

  render(ctx, corpo) {
    const e = ctx.estado;
    const f: Filtros = e.filtros.vendas;
    const todas = ctx.dados.vendas ?? [];
    const meta = ctx.dados.meta ?? [];
    const ultima = String(meta.find((m) => m.ultimaVenda)?.ultimaVenda ?? "");
    const anoMax = Math.max(...todas.map((l) => Number(l.ano)));
    const ano = f.ano?.length ? Math.max(...f.ano.map(Number)) : anoMax;
    // Ano corrente corta no mês da última venda; ano fechado vai até dezembro.
    const mesCorte = ano === Number(ultima.slice(0, 4)) ? Number(ultima.slice(5, 7)) : 12;
    const metaAno = meta.find((m) => m.ano === ano);
    const taxa = (a: number) => meta.find((m) => m.ano === a)?.taxa as number | null | undefined;
    const semTaxa = e.moeda === "eur" && !taxa(ano);
    const campo = e.medida === "th" ? "th" : "valor";
    const conv = (v: number | null, a: number) => (v == null || campo === "th" || e.moeda === "brl" ? v : taxa(a) ? v / taxa(a)! : null);
    const fmt = (v: number | null) => campo === "th" ? (v == null ? "—" : `${n0(Math.round(v / 1000))} mil TH`) : e.moeda === "eur" ? (v == null ? "—" : `€ ${nf(v / 1e6, 1)} Mi`) : moedaCompacta(v);

    const recorte = (a: number, ate: number): Linha[] => filtrar(todas, { ...f, ano: [String(a)] }).filter((l) => Number(l.mes) <= ate);
    const ytd = conv(total(recorte(ano, mesCorte), campo), ano);
    const ytdAnt = conv(total(recorte(ano - 1, mesCorte), campo), ano - 1);
    const vol = total(recorte(ano, mesCorte), "th");
    const volAnt = total(recorte(ano - 1, mesCorte), "th");
    const forecast = conv((metaAno?.forecast as number | null) ?? null, ano);
    const budget = conv((metaAno?.budget as number | null) ?? null, ano);
    const ating = campo === "valor" ? atingimento(ytd, forecast) : null;
    const periodo = mesCorte === 12 ? String(ano) : `${ano} até ${MESES[mesCorte - 1]}`;
    const d = (a: number | null, b: number | null) => {
      const v = variacao(a, b, BASE_MINIMA);
      return v == null ? null : { txt: `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}% vs ${ano - 1}`, ruim: v < 0 };
    };

    if (semTaxa) {
      corpo.innerHTML = `<div class="bmd-card bmd-nota">Sem taxa de euro cadastrada para ${ano}. Troque para R$ ou cadastre a taxa na meta anual.</div>`;
      return;
    }

    const acum = (a: number) => {
      let s = 0;
      return Array.from({ length: a === ano ? mesCorte : 12 }, (_, i) => {
        s += conv(total(filtrar(todas, { ...f, ano: [String(a)], mes: [String(i + 1)] }), campo), a) ?? 0;
        return { m: i, v: s, serie: String(a) };
      });
    };
    const curva = [...acum(ano - 1), ...acum(ano)];

    const pareado = (dim: string) => {
      const atual = agregar(recorte(ano, mesCorte), {}, dim, campo).slice(0, 6);
      const ant = new Map(agregar(recorte(ano - 1, mesCorte), {}, dim, campo).map((g) => [g.chave, g.valor]));
      const max = Math.max(...atual.map((g) => g.valor), ...atual.map((g) => ant.get(g.chave) ?? 0), 1);
      return `<div class="bmd-par">${atual.map((g) => {
        const a = ant.get(g.chave) ?? null;
        const v = variacao(g.valor, a, BASE_MINIMA);
        return `<button type="button" data-filtro="${dim}" data-v="${esc(g.chave)}"><span title="${esc(g.chave)}">${esc(g.chave)}</span>
          <span><s style="width:${(g.valor / max) * 100}%;background:${C.o500}"></s><s style="width:${((a ?? 0) / max) * 100}%;background:${C.anterior}"></s></span>
          <span class="bmd-mono">${fmt(conv(g.valor, ano))} <em class="${v != null && v < 0 ? "bmd-neg" : "bmd-pos"}">${v == null ? "—" : `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 0)}%`}</em></span></button>`;
      }).join("")}</div>`;
    };

    corpo.innerHTML = `${ESTILO_PAR}
      <div class="bmd-kpis2">
        ${kpi({ rotulo: "Atingimento do forecast anual", destaque: true, valor: ating == null ? "—" : `${nf(ating * 100, 1)}%`,
          proporcao: ating, marcador: mesCorte / 12,
          nota: forecast == null ? `meta não cadastrada para ${ano}` : `${fmt(ytd)} de ${fmt(forecast)} · marcador = ritmo esperado` })}
        ${kpi({ rotulo: `Vendas · ${periodo}`, valor: fmt(ytd), delta: d(ytd, ytdAnt) })}
        ${kpi({ rotulo: `Volume · ${periodo}`, valor: vol == null ? "—" : `${n0(Math.round(vol / 1000))} mil TH`, delta: d(vol, volAnt) })}
        ${kpi({ rotulo: `Budget ${ano}`, valor: budget == null ? "—" : fmt(budget), nota: budget == null ? "meta não cadastrada" : "" })}
      </div>
      ${cartao("Vendas acumuladas no ano", `${ano} contra ${ano - 1}`, '<div data-el="curva"></div>')}
      <div class="bmd-grid2">
        ${cartao(`Por crop · ${periodo}`, `${ano} vs ${ano - 1}`, pareado("crop"))}
        ${cartao(`Por RTV · ${periodo}`, `${ano} vs ${ano - 1}`, pareado("rtv"))}
      </div>`;

    const finais = [String(ano - 1), String(ano)].map((s) => curva.filter((p) => p.serie === s).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);
    ctx.shell.desenhar("curva", {
      height: ctx.shell.compacto() ? 220 : 260, marginLeft: 80, marginRight: 130,
      x: { domain: [0, 11], ticks: 12, tickFormat: (i: number) => MESES[i] ?? "", label: null },
      y: { grid: true, label: null, tickFormat: (v: number) => fmt(v) },
      color: { domain: [String(ano - 1), String(ano)], range: [C.anterior, C.o500] },
      marks: [
        ...(budget != null && campo === "valor" ? [Plot.ruleY([budget], { stroke: C.verde, strokeDasharray: "4 3" }),
          Plot.text([budget], { x: 11, y: (v: number) => v, text: () => `Budget ${ano}`, dy: -7, textAnchor: "end", fill: C.verde, fontWeight: 600 })] : []),
        Plot.areaY(curva.filter((p) => p.serie === String(ano)), { x: "m", y: "v", fill: C.o500, fillOpacity: 0.12, curve: "monotone-x" }),
        Plot.lineY(curva, { x: "m", y: "v", stroke: "serie", strokeWidth: 2.4, curve: "monotone-x" }),
        Plot.dot(finais, { x: "m", y: "v", fill: "serie", r: 3.5 }),
        Plot.text(finais, { x: "m", y: "v", text: (p: { serie: string; v: number }) => `${p.serie}  ${fmt(p.v)}`, dx: 8, textAnchor: "start", fill: "serie", fontWeight: 700 }),
      ],
    });
  },
};
