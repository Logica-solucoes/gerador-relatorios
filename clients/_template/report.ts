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
