import * as Plot from "@observablehq/plot";
import { agregar, filtrar, variacao, type Filtros } from "../calc";
import { cartao, seg } from "../componentes";
import { esc, n0, nf } from "../shared/formato";
import { C, COR_FONTE } from "../shared/tema";
import type { DefAba } from "./tipos";

const FONTES_ORDEM = ["ABCSEM", "IBGE", "CEPEA", "BASF"];
const mil = (v: number) => `${n0(Math.round(v / 1000))} mil`;

export const comparativo: DefAba = {
  id: "comparativo",
  rotulo: "Comparativo",
  recursos: () => ["resumo", "resumoSeg"],
  chips: () => ({ dims: { especie: "Espécie", crop: "Crop", segmento: "Segmento", hy: "HY/OP/F2" }, origem: "resumoSeg" }),
  controles: (e) => seg("metrica", { area: "Área (ha)", th: "Total TH" }, e.metrica === "th" ? "th" : "area"),

  render(ctx, corpo) {
    const m = ctx.estado.metrica === "th" ? "th" : "area";
    const f: Filtros = ctx.estado.filtros.comparativo;
    // `resumo` não tem segmento/hy/crop: com esses filtros a linha por fonte usa só BASF+ABCSEM.
    const usaSeg = ["segmento", "hy", "crop"].some((d) => f[d]?.length);
    const linhas = filtrar(usaSeg ? ctx.dados.resumoSeg ?? [] : ctx.dados.resumo ?? [], { ...f, ano: [] });
    const pontos = FONTES_ORDEM.flatMap((fonte) =>
      agregar(linhas, { fonte: [fonte] }, "ano", m).map((g) => ({ fonte, ano: Number(g.chave), v: g.valor })))
      .sort((a, b) => a.ano - b.ano);

    const ultimos = FONTES_ORDEM.map((fonte) => {
      const ps = pontos.filter((p) => p.fonte === fonte);
      const u = ps.at(-1), a = ps.at(-2);
      return u ? { fonte, ano: u.ano, v: u.v, anoAnt: a?.ano, d: variacao(u.v, a?.v) } : null;
    }).filter((x): x is NonNullable<typeof x> => x != null);

    const ultimoAnoBA = Math.max(...filtrar(ctx.dados.resumoSeg ?? [], { fonte: ["BASF"] }).map((l) => Number(l.ano)));
    const seg2 = agregar(filtrar(ctx.dados.resumoSeg ?? [], { ...f, ano: [String(ultimoAnoBA)], fonte: ["ABCSEM"] }), {}, "segmento", m).slice(0, 6);
    const basfSeg = new Map(agregar(filtrar(ctx.dados.resumoSeg ?? [], { ...f, ano: [String(ultimoAnoBA)], fonte: ["BASF"] }), {}, "segmento", m).map((g) => [g.chave, g.valor]));
    const maxSeg = Math.max(...seg2.map((g) => g.valor), ...basfSeg.values(), 1);

    corpo.innerHTML = `
      ${cartao(`${m === "area" ? "Área" : "Total TH"} de mercado por fonte, por ano`, "a BASF não tem estudo de 2021 a 2023: a linha é interrompida", '<div data-el="linhas"></div>')}
      <div class="bmd-grid2">
        ${cartao("Última informação de cada fonte", "vs ano anterior disponível", `<div class="bmd-ml">${ultimos.map((u) => `
          <div><i style="background:${COR_FONTE[u.fonte]}"></i><b>${esc(u.fonte)}</b><span>${u.ano}</span>
          <span class="bmd-mono">${n0(Math.round(u.v))}${m === "area" ? " ha" : ""}</span>
          <span class="${u.d != null && u.d < 0 ? "bmd-neg" : "bmd-pos"}" title="${u.anoAnt != null ? `vs ${u.anoAnt}` : ""}">${u.d == null ? "—" : `${u.d >= 0 ? "+" : "−"}${nf(Math.abs(u.d) * 100, 1)}%`}</span></div>`).join("")}</div>
          <p class="bmd-nota">Cada delta compara com o ano anterior que a fonte tem (passe o mouse para ver qual).</p>`)}
        ${cartao(`BASF × ABCSEM por segmento · ${ultimoAnoBA}`, m === "area" ? "área (ha)" : "Total TH", `<div class="bmd-par">${seg2.map((g) => {
          const b = basfSeg.get(g.chave) ?? 0;
          return `<button type="button" data-filtro="segmento" data-v="${esc(g.chave)}"><span>${esc(g.chave)}</span>
            <span><s style="width:${(g.valor / maxSeg) * 100}%;background:${C.verde}"></s><s style="width:${(b / maxSeg) * 100}%;background:${C.o500}"></s></span>
            <span class="bmd-mono">${n0(Math.round(g.valor))} / ${b ? n0(Math.round(b)) : "—"}</span></button>`;
        }).join("")}</div><div class="bmd-leg2"><span><i style="background:${C.verde}"></i>ABCSEM</span><span><i style="background:${C.o500}"></i>BASF</span></div>`)}
      </div>`;

    const finais = FONTES_ORDEM.map((fonte) => pontos.filter((p) => p.fonte === fonte).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);
    // dx/dy são constantes no Plot: rótulos que terminam colados (BASF e CEPEA) vão em marcas separadas.
    const ordenados = [...finais].sort((a, b) => b.v - a.v);
    const desloc = new Map<string, number>();
    ordenados.forEach((p, i) => { const prox = ordenados[i - 1]; desloc.set(p.fonte, prox && Math.abs(prox.v - p.v) / Math.max(prox.v, 1) < 0.08 ? 9 : 0); });
    ctx.shell.desenhar("linhas", {
      height: ctx.shell.compacto() ? 240 : 300, marginLeft: 56, marginRight: 120,
      x: { label: null, tickFormat: (v: number) => String(v) },
      y: { grid: true, label: null, tickFormat: (v: number) => (m === "area" ? mil(v) : `${nf(v / 1e6, 0)} Mi`) },
      color: { domain: FONTES_ORDEM, range: FONTES_ORDEM.map((x) => COR_FONTE[x]!) },
      marks: [
        // z quebra a linha onde falta ano consecutivo
        Plot.lineY(pontos, { x: "ano", y: "v", stroke: "fonte", strokeWidth: 2.2, curve: "monotone-x", z: (p: { fonte: string; ano: number }) => `${p.fonte}${pontos.some((q) => q.fonte === p.fonte && q.ano === p.ano - 1) || !pontos.some((q) => q.fonte === p.fonte && q.ano < p.ano) ? "" : p.ano}` }),
        Plot.dot(pontos.filter((p) => p.fonte === "BASF"), { x: "ano", y: "v", fill: COR_FONTE.BASF, r: 3 }),
        Plot.text(finais.filter((p) => !desloc.get(p.fonte)), { x: "ano", y: "v", text: (p: { fonte: string; v: number }) => `${p.fonte}  ${m === "area" ? mil(p.v) : nf(p.v / 1e6, 1) + " Mi"}`, dx: 8, textAnchor: "start", fill: "fonte", fontWeight: 700 }),
        Plot.text(finais.filter((p) => desloc.get(p.fonte)), { x: "ano", y: "v", text: (p: { fonte: string; v: number }) => `${p.fonte}  ${m === "area" ? mil(p.v) : nf(p.v / 1e6, 1) + " Mi"}`, dx: 8, dy: 11, textAnchor: "start", fill: "fonte", fontWeight: 700 }),
      ],
    });
  },
};
