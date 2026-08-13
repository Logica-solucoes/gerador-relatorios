import * as Plot from "@observablehq/plot";
import type { Dados } from "./queries";
import { plot, L, num } from "../../core/report";

/** TODO: troque pelos mesmos tons de clients/<id>/theme.css. */
const COR = { primary: "#3b82f6" };

function gSerie(d: Dados) {
  return plot({
    width: L,
    height: 240,
    marginLeft: 44,
    // domain explicito: sem ele o Plot ordena o eixo de string alfabeticamente
    // (Fev, Jan, Mar) e a linha vira zigue-zague.
    x: { label: null, tickSize: 0, domain: d.serie.map((r) => r.mes) },
    // tickFormat curto: o rotulo cru (110.000) nao cabe no marginLeft.
    y: { label: null, grid: true, tickSize: 0, tickFormat: (v: number) => num(v / 1000) + "k" },
    marks: [
      Plot.lineY(d.serie, { x: "mes", y: "valor", stroke: COR.primary, strokeWidth: 2 }),
      Plot.dot(d.serie, { x: "mes", y: "valor", fill: COR.primary }),
      Plot.ruleY([0], { stroke: "#d4d4d8" }),
    ],
  });
}

export const graficos = { gSerie };
