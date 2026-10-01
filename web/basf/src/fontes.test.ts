import { describe, expect, test } from "bun:test";
import { agregar, filtrar, total } from "./calc";
import { linhasIbge } from "./fontes";

const L = [
  { nivel: "BR", uf: null, meso: null, cod: null, area: 300 },
  { nivel: "UF", uf: "MG", meso: null, cod: null, area: 200 },
  { nivel: "UF", uf: "SP", meso: null, cod: null, area: 100 },
  { nivel: "ME", uf: "MG", meso: "Triângulo", cod: null, area: 120 },
  { nivel: "ME", uf: "MG", meso: "Sul de Minas", cod: null, area: 60 },
  { nivel: "ME", uf: "SP", meso: "Bauru", cod: null, area: 90 },
  { nivel: "MU", uf: "MG", meso: null, cod: 3170107, area: 500 },
];

describe("linhasIbge", () => {
  test("sem filtro: total do BR, ranking dos UF, mapa dos MU", () => {
    expect(total(linhasIbge(L, "total", {}), "area")).toBe(300);
    expect(agregar(linhasIbge(L, "uf", {}), {}, "uf", "area").map((g) => g.valor)).toEqual([200, 100]);
    expect(linhasIbge(L, "mapa", {}).length).toBe(1);
  });
  test("filtro de estado: total vem dos UF", () => {
    const f = { uf: ["MG"] };
    expect(total(filtrar(linhasIbge(L, "total", f), f), "area")).toBe(200);
  });
  test("filtro de mesorregião: total e estados vêm do ME, mapa fica sem pontos", () => {
    const f = { meso: ["Triângulo", "Bauru"] };
    expect(total(filtrar(linhasIbge(L, "total", f), f), "area")).toBe(210);
    expect(agregar(linhasIbge(L, "uf", f), f, "uf", "area")).toEqual([{ chave: "MG", valor: 120 }, { chave: "SP", valor: 90 }]);
    expect(linhasIbge(L, "mapa", f)).toEqual([]);
  });
});
