import { describe, expect, test } from "bun:test";
import { agregar, atingimento, filtrar, share, total, variacao } from "./calc";

const L = [
  { uf: "MG", crop: "ONX", ano: 2024, area: 100, dose: 10 },
  { uf: "MG", crop: "WMW", ano: 2024, area: 50, dose: 30 },
  { uf: "SP", crop: "ONX", ano: 2024, area: 80, dose: 20 },
  { uf: "SP", crop: "CUP", ano: 2024, area: 0, dose: null },
  { uf: null, crop: "ONX", ano: 2023, area: 999, dose: 5 },
];

describe("filtrar/total", () => {
  test("filtro vazio passa tudo; valores comparados como texto", () => {
    expect(filtrar(L, { ano: [] }).length).toBe(5);
    expect(filtrar(L, { ano: ["2024"] }).length).toBe(4);
  });
  test("soma ignora null; dose é média", () => {
    expect(total(filtrar(L, { ano: ["2024"] }), "area")).toBe(230);
    expect(total(filtrar(L, { ano: ["2024"] }), "dose")).toBe(20);
  });
  test("sem valor numérico devolve null, não 0", () => {
    expect(total([{ area: null }], "area")).toBeNull();
    expect(total([], "area")).toBeNull();
  });
});

describe("agregar", () => {
  test("agrupa, ordena desc, respeita filtros", () => {
    expect(agregar(L, { ano: ["2024"] }, "uf", "area")).toEqual([
      { chave: "MG", valor: 150 },
      { chave: "SP", valor: 80 },
    ]);
  });
  test("chave nula fica fora; grupo com valor 0 some do ranking", () => {
    const r = agregar(L, {}, "crop", "area").map((g) => g.chave);
    expect(r).not.toContain("CUP");
    expect(agregar(L, {}, "uf", "area").map((g) => g.chave)).toEqual(["MG", "SP"]);
  });
});

describe("razões", () => {
  test("share: null sem denominador", () => {
    expect(share(18, 100)).toBeCloseTo(0.18);
    expect(share(18, 0)).toBeNull();
    expect(share(18, null)).toBeNull();
    expect(share(null, 100)).toBeNull();
  });
  test("variacao: null sem base ou base abaixo do mínimo", () => {
    expect(variacao(110, 100)).toBeCloseTo(0.1);
    expect(variacao(110, 0)).toBeNull();
    expect(variacao(110, null)).toBeNull();
    expect(variacao(5000, 900, 1000)).toBeNull();
    expect(variacao(-50, -100)).toBeNull();
  });
  test("atingimento é realizado / meta", () => {
    expect(atingimento(29, 94)).toBeCloseTo(0.3085, 3);
    expect(atingimento(29, null)).toBeNull();
  });
});
