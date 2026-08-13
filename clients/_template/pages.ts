import type { Dados } from "./queries";
import { graficos as g } from "./report";
import { manchete } from "./narrativa";

export const titulo = "Cliente Template — Relatório";

export function documento(d: Dados): string {
  return `<div class="page">
    <header class="sec"><h2>Resumo</h2></header>
    <p class="lead">${manchete(d)}</p>
    <figure>${g.gSerie(d)}</figure>
  </div>`;
}
