/**
 * Texto que muda de sentido conforme os dados — nunca hardcoded (ver
 * CLAUDE.md, seção "Texto vs. dados").
 */
import type { Dados } from "./queries";
import { sinal } from "../../core/report";

export function manchete(d: Pick<Dados, "kpi">): string {
  const delta = ((d.kpi.valor2026 - d.kpi.valor2025) / d.kpi.valor2025) * 100;
  return delta >= 0 ? `Receita cresceu ${sinal(delta)}` : `Receita caiu ${sinal(delta)}`;
}
