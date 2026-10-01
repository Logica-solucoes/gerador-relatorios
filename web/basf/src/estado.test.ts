import { describe, expect, test } from "bun:test";
import { alternarFiltro, deHash, definirFiltro, inicial, paraHash, trocarFonte } from "./estado";

describe("trocarFonte", () => {
  test("descarta filtro que a fonte nova não tem e avisa", () => {
    let e = inicial();
    e = definirFiltro(e, "rtv", ["Wenio Barbosa"]);
    e = definirFiltro(e, "uf", ["MG"]);
    const { estado, descartados } = trocarFonte(e, "ibge");
    expect(estado.fonte).toBe("ibge");
    expect(estado.filtros.mercado.rtv).toBeUndefined();
    expect(estado.filtros.mercado.uf).toEqual(["MG"]);
    expect(descartados).toEqual(["RTV"]);
  });
  test("métrica inexistente na fonte nova volta para a padrão", () => {
    let e = { ...inicial(), metrica: "dose" };
    expect(trocarFonte(e, "abcsem").estado.metrica).toBe("volume");
    e = { ...inicial(), metrica: "area" };
    expect(trocarFonte(e, "ibge").estado.metrica).toBe("area");
  });
});

describe("filtros", () => {
  test("ano é compartilhado entre mercado e comparativo", () => {
    const e = definirFiltro(inicial(), "ano", ["2024"]);
    expect(e.filtros.comparativo.ano).toEqual(["2024"]);
    expect(e.filtros.clientes.ano).toBeUndefined();
  });
  test("alternar: clicar de novo remove", () => {
    let e = alternarFiltro(inicial(), "uf", "MG");
    expect(e.filtros.mercado.uf).toEqual(["MG"]);
    e = alternarFiltro(e, "uf", "MG");
    expect(e.filtros.mercado.uf).toBeUndefined();
  });
  test("não muta o estado de entrada", () => {
    const a = inicial();
    definirFiltro(a, "uf", ["SP"]);
    expect(a.filtros.mercado.uf).toBeUndefined();
  });
});

describe("hash", () => {
  test("ida e volta sem perda", () => {
    let e = inicial();
    e = { ...e, aba: "mercado", metrica: "th", agrupar: "rtv", dim: "hotspot" };
    e = trocarFonte(e, "basf").estado;
    e = definirFiltro(e, "uf", ["MG", "São Paulo, SP"]);
    e = definirFiltro(e, "ano", ["2024"]);
    const volta = deHash(paraHash(e));
    expect(volta.aba).toBe("mercado");
    expect(volta.fonte).toBe("basf");
    expect(volta.metrica).toBe("th");
    expect(volta.agrupar).toBe("rtv");
    expect(volta.dim).toBe("hotspot");
    expect(volta.filtros.mercado).toEqual({ uf: ["MG", "São Paulo, SP"], ano: ["2024"] });
    expect(volta.filtros.comparativo.ano).toEqual(["2024"]);
  });
  test("hash vazio ou lixo cai no inicial", () => {
    expect(deHash("")).toEqual(inicial());
    expect(deHash("#xyz?fonte=nada").aba).toBe("mercado");
    expect(deHash("#xyz?fonte=nada").fonte).toBe("basf");
  });
});

describe("deHash", () => {
  test("valores inválidos caem no padrão da fonte", () => {
    const e = deHash("#mercado?fonte=ibge&m=zzz&dim=zzz&f.rtv=X&f.uf=");
    expect(e.fonte).toBe("ibge");
    expect(e.metrica).toBe("area");
    expect(e.dim).toBe("uf");
    expect(e.filtros.mercado.rtv).toBeUndefined();
    expect(e.filtros.mercado.uf).toBeUndefined();
  });
  test("valores válidos são mantidos", () => {
    const e = deHash("#mercado?fonte=abcsem&m=valor&dim=tipo&f.uf=&f.tipo=A&f.tipo=B");
    expect(e.metrica).toBe("valor");
    expect(e.dim).toBe("tipo");
    expect(e.filtros.mercado.tipo).toEqual(["A", "B"]);
  });
});

describe("item da CEPEA", () => {
  test("padrão é Área Cepea, como o slicer do PBI; vai e volta no hash só na CEPEA", () => {
    expect(inicial().itemCepea).toBe("Área Cepea");
    const e = { ...trocarFonte(inicial(), "cepea").estado, itemCepea: "Área IBGE" };
    expect(deHash(paraHash(e)).itemCepea).toBe("Área IBGE");
    expect(paraHash(inicial())).not.toContain("item=");
  });
  test("item desconhecido cai no padrão; item não é mais filtro de chip", () => {
    expect(deHash("#mercado?fonte=cepea&item=zzz").itemCepea).toBe("Área Cepea");
    expect(deHash("#mercado?fonte=cepea&f.item=Área IBGE").filtros.mercado.item).toBeUndefined();
  });
});
