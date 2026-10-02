import { distintos, total } from "../../calc";
import { cartao, kpi, pareado } from "../../componentes";
import { n0 } from "../../shared/formato";
import type { DefAba } from "../tipos";
import { BASE_MINIMA, DIMS, controlesBase, pares, ranking, recorte, semResultado } from "./comum";

const deltaAbs = (a: number, b: number, ano: number) => ({ txt: `${a - b >= 0 ? "+" : "−"}${n0(Math.abs(a - b))} vs ${ano}`, ruim: a < b });

export const analise: DefAba = {
  id: "analise",
  rotulo: "Análise",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: controlesBase,

  render(ctx, corpo) {
    const r = recorte(ctx);
    if (!r.base.length) return semResultado(ctx, corpo);
    const { ano } = r;
    const atual = r.ytd(ano), ant = r.ytd(ano - 1);
    const vend = r.moeda(total(atual, "valor"), ano), vendAnt = r.moeda(total(ant, "valor"), ano - 1);
    const vol = total(atual, "th"), volAnt = total(ant, "th");
    const cli = distintos(atual, "cliente"), cliAnt = distintos(ant, "cliente");
    const vars = distintos(atual, "variedade"), varsAnt = distintos(ant, "variedade");
    const ativos = (dim: string) => ctx.estado.filtros[ctx.estado.aba][dim] ?? [];
    const sub = `${ano} × ${ano - 1}, mesmo período`;

    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: `Volume · ${r.periodo}`, valor: r.fmtTH(vol), delta: r.delta(vol, volAnt), destaque: true })}
        ${kpi({ rotulo: `Vendas · ${r.periodo}`, valor: r.fmtValor(vend), delta: r.delta(vend, vendAnt, BASE_MINIMA) })}
        ${kpi({ rotulo: "Clientes com compra", valor: n0(cli), delta: deltaAbs(cli, cliAnt, ano - 1) })}
        ${kpi({ rotulo: "Variedades vendidas", valor: n0(vars), delta: deltaAbs(vars, varsAnt, ano - 1) })}
      </div>
      <div class="bmd-grid2">
        ${cartao(`Por crop · ${r.periodo}`, `Δ vs ${ano - 1}`, ranking(pares(r, "crop", 12), "crop", r, ativos("crop")))}
        ${cartao(`Por RTV · ${r.periodo}`, `Δ vs ${ano - 1}`, ranking(pares(r, "rtv", 12), "rtv", r, ativos("rtv")))}
      </div>
      <div class="bmd-grid2">
        ${cartao("Por cliente · top 15", `${sub} · lista completa na aba Tabela`, pareado(pares(r, "cliente", 15), "cliente", r.fmt, r.minimo))}
        ${cartao("Por variedade · top 15", sub, pareado(pares(r, "variedade", 15), "variedade", r.fmt, r.minimo))}
      </div>`;
  },
};
