import { describe, expect, test } from "bun:test";
import { agregar, ateCorte, atingimento, diaDeCorte, distintos, filtrar, mesDeCorte, mesMaximo, ordenarAnos, share, tabelaAnos, ticket, total, variacao } from "./calc";

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

describe("mesDeCorte", () => {
  test("ano corrente não passa do mês da última venda", () => {
    expect(mesMaximo(2026, "2026-06-15")).toBe(6);
    expect(mesDeCorte(null, 2026, "2026-06-15")).toBe(6);
    expect(mesDeCorte(12, 2026, "2026-06-15")).toBe(6);
    expect(mesDeCorte(3, 2026, "2026-06-15")).toBe(3);
  });
  test("ano fechado vai até dezembro", () => {
    expect(mesDeCorte(null, 2025, "2026-06-15")).toBe(12);
    expect(mesDeCorte(9, 2025, "2026-06-15")).toBe(9);
  });
});

describe("ticket", () => {
  test("valor por TH; sem volume positivo é null", () => {
    expect(ticket(3600, 100)).toBe(36);
    expect(ticket(3600, 0)).toBeNull();
    expect(ticket(3600, -5)).toBeNull();
    expect(ticket(null, 100)).toBeNull();
  });
});

describe("distintos", () => {
  test("conta só quem tem saldo positivo", () => {
    const ls = [
      { cliente: "A", valor: 10 }, { cliente: "A", valor: -2 },
      { cliente: "B", valor: 5 }, { cliente: "B", valor: -5 },
      { cliente: "C", valor: -1 }, { cliente: null, valor: 9 },
    ];
    expect(distintos(ls, "cliente")).toBe(1);
  });
});

describe("tabelaAnos", () => {
  const V = [
    { ano: 2024, mes: 3, crop: "CAC", variedade: "HANA", valor: 100 },
    { ano: 2025, mes: 2, crop: "CAC", variedade: "HANA", valor: 50 },
    { ano: 2025, mes: 9, crop: "CAC", variedade: "HANA", valor: 70 },
    { ano: 2026, mes: 1, crop: "CAC", variedade: "HANA", valor: 60 },
    { ano: 2026, mes: 8, crop: "CAC", variedade: "HANA", valor: 999 },
    { ano: 2025, mes: 5, crop: "CAC", variedade: "SIRKANA", valor: 30 },
    { ano: 2026, mes: 4, crop: "MEM", variedade: "KICAYA", valor: 40 },
    { ano: 2022, mes: 1, crop: "MEM", variedade: "VELHA", valor: 5 },
  ];
  const t = tabelaAnos(V, "variedade", "crop", 2026, 6, "valor");
  const cac = t.grupos.find((g) => g.chave === "CAC")!;
  test("colunas: 2 anos fechados + YTD; mês depois do corte fica fora", () => {
    expect(cac.v).toEqual([100, 150, 60]);
    expect(t.total.v).toEqual([100, 150, 100]);
  });
  test("variação é YTD contra YTD do ano anterior, não contra o ano cheio", () => {
    expect(cac.variacao).toBeCloseTo(60 / 80 - 1);
    expect(cac.itens.find((i) => i.chave === "HANA")!.variacao).toBeCloseTo(60 / 50 - 1);
    expect(t.total.variacao).toBeCloseTo(100 / 80 - 1);
  });
  test("sem venda é null, nunca 0; item fora das 3 colunas some", () => {
    expect(cac.itens.find((i) => i.chave === "SIRKANA")!.v).toEqual([null, 30, null]);
    expect(cac.itens.find((i) => i.chave === "SIRKANA")!.variacao).toBeNull();
    const mem = t.grupos.find((g) => g.chave === "MEM")!;
    expect(mem.itens.map((i) => i.chave)).toEqual(["KICAYA"]);
  });
  test("conversão por ano entra antes da variação", () => {
    const meio = tabelaAnos(V, "variedade", "crop", 2026, 6, "valor", (v, a) => (v == null ? v : a === 2026 ? v / 2 : v));
    expect(meio.total.v[2]).toBe(50);
    expect(meio.total.variacao).toBeCloseTo(50 / 80 - 1);
  });
  test("sem grupo: um grupo só, lista plana", () => {
    const plano = tabelaAnos(V, "variedade", null, 2026, 6, "valor");
    expect(plano.grupos.length).toBe(1);
    expect(plano.grupos[0]!.itens.map((i) => i.chave).sort()).toEqual(["HANA", "KICAYA", "SIRKANA"]);
  });
  test("base mínima anula a variação", () => {
    expect(tabelaAnos(V, "variedade", "crop", 2026, 6, "valor", (v) => v, 1000).total.variacao).toBeNull();
  });
  test("dia de corte: o ano anterior compara até o mesmo dia; os anos cheios não mudam", () => {
    const D = [
      { ano: 2025, mes: 6, dia: 10, crop: "CAC", variedade: "HANA", valor: 40 },
      { ano: 2025, mes: 6, dia: 28, crop: "CAC", variedade: "HANA", valor: 60 },
      { ano: 2026, mes: 6, dia: 26, crop: "CAC", variedade: "HANA", valor: 30 },
    ];
    const t = tabelaAnos(D, "variedade", null, 2026, 6, "valor", (v) => v, 0, 26);
    expect(t.total.v).toEqual([null, 100, 30]);
    expect(t.total.variacao).toBeCloseTo(30 / 40 - 1);
  });
});

describe("corte por dia", () => {
  test("só o mês da última venda corta no dia", () => {
    expect(diaDeCorte(6, 2026, "2026-06-26")).toBe(26);
    expect(diaDeCorte(5, 2026, "2026-06-26")).toBe(31);
    expect(diaDeCorte(6, 2025, "2026-06-26")).toBe(31);
  });
  test("ateCorte: mês anterior inteiro, mês do corte até o dia; sem dia conta o mês", () => {
    expect(ateCorte({ mes: 5, dia: 31 }, 6, 26)).toBe(true);
    expect(ateCorte({ mes: 6, dia: 26 }, 6, 26)).toBe(true);
    expect(ateCorte({ mes: 6, dia: 27 }, 6, 26)).toBe(false);
    expect(ateCorte({ mes: 7, dia: 1 }, 6, 26)).toBe(false);
    expect(ateCorte({ mes: 6 }, 6, 26)).toBe(true);
  });
});

describe("ordenarAnos", () => {
  const ls = [
    { chave: "b", v: [null, null, 10] as (number | null)[], variacao: 0.5 },
    { chave: "a", v: [null, null, null] as (number | null)[], variacao: null },
    { chave: "c", v: [null, null, 30] as (number | null)[], variacao: -0.2 },
  ];
  test("por coluna, null sempre no fim", () => {
    expect(ordenarAnos(ls, 2, true).map((l) => l.chave)).toEqual(["c", "b", "a"]);
    expect(ordenarAnos(ls, 2, false).map((l) => l.chave)).toEqual(["b", "c", "a"]);
    expect(ordenarAnos(ls, 3, true).map((l) => l.chave)).toEqual(["b", "c", "a"]);
  });
  test("coluna -1 é o nome; não muta a entrada", () => {
    expect(ordenarAnos(ls, -1, false).map((l) => l.chave)).toEqual(["a", "b", "c"]);
    expect(ls.map((l) => l.chave)).toEqual(["b", "a", "c"]);
  });
});
