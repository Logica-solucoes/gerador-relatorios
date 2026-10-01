import { describe, expect, test } from "bun:test";
import { casarMunicipio, dividirUF, indiceMunicipios, limparHotspot, normalizarCrop, ufDoCodigo, ufsDoEstado } from "./normaliza";

describe("limparHotspot", () => {
  test("unifica grafias conhecidas", () => {
    expect(limparHotspot("MONTEALTO")).toBe("Monte Alto");
    expect(limparHotspot("MONTE ALTO")).toBe("Monte Alto");
    expect(limparHotspot("SÃO JOSE DO RIO PARDO")).toBe("São José do Rio Pardo");
    expect(limparHotspot("SAO JOSE RIO PARDO")).toBe("São José do Rio Pardo");
    expect(limparHotspot("Sta Cruz do Rio Pardo")).toBe("Santa Cruz do Rio Pardo");
    expect(limparHotspot("Chapada dos VEadeiros")).toBe("Chapada dos Veadeiros");
  });
  test("tira sufixos de sazonalidade e UF", () => {
    expect(limparHotspot("Bauru - Safra")).toBe("Bauru");
    expect(limparHotspot("Goianápolis - GO")).toBe("Goianápolis");
    expect(limparHotspot("Santarém, Pará")).toBe("Santarém");
  });
  test("caixa alta vira título; nulo fica nulo", () => {
    expect(limparHotspot("CAXIAS DO SUL")).toBe("Caxias do Sul");
    expect(limparHotspot("Irecê")).toBe("Irecê");
    expect(limparHotspot(null)).toBeNull();
    expect(limparHotspot("  ")).toBeNull();
  });
});

describe("dividirUF", () => {
  test("separa estados compostos; 0 e vazio viram lista vazia", () => {
    expect(dividirUF("BA/PE")).toEqual(["BA", "PE"]);
    expect(dividirUF("DF/GO")).toEqual(["DF", "GO"]);
    expect(dividirUF("MG")).toEqual(["MG"]);
    expect(dividirUF("0")).toEqual([]);
    expect(dividirUF(null)).toEqual([]);
  });
});

describe("normalizarCrop", () => {
  test("cebola tem um código só, como no PBI; WMR fica (vendas batem com o SQL)", () => {
    expect(normalizarCrop("ONS")).toBe("ONX");
    expect(normalizarCrop("ONI")).toBe("ONX");
    expect(normalizarCrop("WMW")).toBe("WMW");
    expect(normalizarCrop("WMR")).toBe("WMR");
    expect(normalizarCrop(null)).toBe("Sem crop");
  });
});

describe("casarMunicipio", () => {
  const idx = indiceMunicipios([
    { cod: 3170107, nome: "UBERABA", uf: "MG" },
    { cod: 2910800, nome: "IRECÊ", uf: "BA" },
    { cod: 1100015, nome: "SANTA LUZIA", uf: "RO" },
    { cod: 3157807, nome: "SANTA LUZIA", uf: "MG" },
  ]);
  test("casa sem acento e sem caixa, pela UF", () => {
    expect(casarMunicipio("Irece", ["BA"], idx)).toBe(2910800);
    expect(casarMunicipio("Uberaba", ["MG"], idx)).toBe(3170107);
  });
  test("homônimo resolve pela UF; UF composta tenta cada uma", () => {
    expect(casarMunicipio("Santa Luzia", ["MG"], idx)).toBe(3157807);
    expect(casarMunicipio("Santa Luzia", ["BA", "MG"], idx)).toBe(3157807);
  });
  test("sem UF ou sem casamento devolve null, nunca chuta", () => {
    expect(casarMunicipio("Santa Luzia", [], idx)).toBeNull();
    expect(casarMunicipio("Atlântida", ["MG"], idx)).toBeNull();
  });
});

test("uf por código e por nome", () => {
  expect(ufDoCodigo(3170107)).toBe("MG");
  expect(ufsDoEstado("Minas Gerais")).toEqual(["MG"]);
  expect(ufsDoEstado("GO/DF")).toEqual(["GO", "DF"]);
  expect(ufsDoEstado("Triângulo")).toEqual([]);
});
