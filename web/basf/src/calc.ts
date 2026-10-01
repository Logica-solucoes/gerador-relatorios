import type { Linha } from "./types";

/** dimensão → valores aceitos. Lista vazia = sem filtro. */
export type Filtros = Record<string, string[]>;

export function passa(l: Linha, f: Filtros): boolean {
  for (const [dim, vals] of Object.entries(f)) {
    if (vals.length && !vals.includes(String(l[dim] ?? ""))) return false;
  }
  return true;
}

export const filtrar = (ls: Linha[], f: Filtros) => ls.filter((l) => passa(l, f));

/** Métricas que são média e não soma (o DAX do PBI usa AVERAGE para dose). */
const MEDIA = new Set(["dose"]);

export function total(ls: Linha[], metrica: string): number | null {
  let soma = 0, n = 0;
  for (const l of ls) {
    const v = l[metrica];
    if (typeof v === "number" && Number.isFinite(v)) { soma += v; n++; }
  }
  if (!n) return null;
  return MEDIA.has(metrica) ? soma / n : soma;
}

export interface Grupo { chave: string; valor: number }

export function agregar(ls: Linha[], f: Filtros, dim: string, metrica: string): Grupo[] {
  const grupos = new Map<string, Linha[]>();
  for (const l of ls) {
    if (!passa(l, f)) continue;
    const k = l[dim];
    if (k == null || k === "") continue;
    const chave = String(k);
    const g = grupos.get(chave);
    if (g) g.push(l); else grupos.set(chave, [l]);
  }
  return [...grupos]
    .map(([chave, xs]) => ({ chave, valor: total(xs, metrica) ?? 0 }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
}

type N = number | null | undefined;
const ok = (v: N): v is number => typeof v === "number" && Number.isFinite(v);

export function share(parte: N, todo: N): number | null {
  return ok(parte) && ok(todo) && todo !== 0 ? parte / todo : null;
}

/** Base mínima: "+262%" sobre R$ 800 não é informação. Base negativa (devolução) não tem leitura. */
export function variacao(atual: N, anterior: N, baseMinima = 0): number | null {
  if (!ok(atual) || !ok(anterior) || anterior <= 0 || anterior < baseMinima) return null;
  return atual / anterior - 1;
}

export const atingimento = share;
