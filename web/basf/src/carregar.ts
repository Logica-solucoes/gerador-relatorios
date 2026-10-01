import type { Carregar, Linha, TabelaFio } from "./types";

export function expandir(t: TabelaFio): Linha[] {
  return t.r.map((r) => Object.fromEntries(t.c.map((c, i) => [c, r[i] ?? null])));
}

/** Preview: lê do snapshot. No portal (fase 2) troca por RequestHelper → endpoint. */
export const carregarArquivo = (base: string): Carregar => async (r) => {
  const resp = await fetch(`${base}${r}.json`);
  if (!resp.ok) throw new Error(`${r}: HTTP ${resp.status}`);
  return expandir((await resp.json()) as TabelaFio);
};
