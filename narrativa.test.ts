import { expect, test } from "bun:test";
import { manchete, tituloBridge, tituloMix, textoMix, leiturasCultura, tituloAquisicao, legendaDevolucoes, lista, metaCobertura, prioridadeAcao } from "./narrativa";

// O ponto destes testes: provar que a prosa VIRA quando os dados viram.
// Se alguém voltar a escrever "caiu" fixo no template, isto quebra.

test("manchete acompanha o sinal", () => {
  expect(manchete(-47.7)).toContain("caiu pela");
  expect(manchete(-22)).toContain("recuou");
  expect(manchete(-3)).toContain("estável");
  expect(manchete(31)).toContain("cresceu");
});

test("titulo do waterfall inverte quando ha crescimento", () => {
  expect(tituloBridge(-47.7, 31.77e6)).toBe("Onde foram os R$ 31,77 milhões");
  expect(tituloBridge(12, 8e6)).toBe("De onde vieram os R$ 8,00 milhões");
});

test("titulo de mix cobre os quatro quadrantes", () => {
  expect(tituloMix(-42.8, -66.9)).toBe("Receita cai, volume despenca");
  expect(tituloMix(10, -5)).toBe("Receita sobe, volume cai");
  expect(tituloMix(-10, 5)).toBe("Volume cresce, receita não acompanha");
  expect(tituloMix(10, 15)).toBe("Receita e volume na mesma direção");
});

test("texto de mix distingue reajuste de mudanca de mix", () => {
  expect(textoMix(28.42, 49.17, -66.9)).toContain("mudança de mix");
  expect(textoMix(50, 40, -5)).toContain("pressiona margem");
  expect(textoMix(50, 51, -21)).toContain("praticamente estável");
});

test("leituras de cultura refletem os quadrantes ocupados", () => {
  const todasCaindo = [
    { cultura: "Melancia", dPreco: 0.5, dVol: -45, fat: 15e6 },
    { cultura: "Cenoura", dPreco: -22, dVol: -62, fat: 1e6 },
  ];
  const t1 = leiturasCultura(todasCaindo);
  expect(t1).toContain("Todas as 2 culturas perderam volume");
  expect(t1).toContain("Melancia"); // segurou preco
  expect(t1).toContain("Cenoura"); // cedeu ambos

  const mistoOuCrescendo = [
    { cultura: "Melancia", dPreco: 3, dVol: 12, fat: 15e6 },
    { cultura: "Cebola", dPreco: 1, dVol: -8, fat: 3e6 },
  ];
  const t2 = leiturasCultura(mistoOuCrescendo);
  expect(t2).toContain("1 de 2 culturas perderam volume");
  expect(t2).toContain("Melancia"); // listada como em crescimento
  expect(t2).not.toContain("Todas as");

  const tudoCrescendo = [{ cultura: "Melancia", dPreco: 3, dVol: 12, fat: 15e6 }];
  expect(leiturasCultura(tudoCrescendo)).toContain("Todas as culturas ganharam volume");
});

test("titulo de aquisicao muda com a cobertura", () => {
  expect(tituloAquisicao(1.05e6, -6.71e6)).toBe("O motor de aquisição parou"); // 16%
  expect(tituloAquisicao(3e6, -6e6)).toBe("A aquisição não cobre a saída"); // 50%
  expect(tituloAquisicao(8e6, -6e6)).toBe("A aquisição está repondo a base"); // 133%
});

test("'pior ano da serie' e verificado, nao assumido", () => {
  const piorAgora = [{ ano: 2024, perc: 1.2 }, { ano: 2025, perc: 2.4 }, { ano: 2026, perc: 4.8 }];
  expect(legendaDevolucoes(piorAgora)).toBe("2026 é o pior ano da série.");

  const piorNoPassado = [{ ano: 2024, perc: 9 }, { ano: 2025, perc: 2.4 }, { ano: 2026, perc: 4.8 }];
  const txt = legendaDevolucoes(piorNoPassado);
  expect(txt).not.toContain("pior ano da série");
  expect(txt).toContain("2024");
});

test("meta de cobertura nao pede pra 'elevar' o que ja passou da meta", () => {
  expect(metaCobertura(62, 85)).toBe("Elevar cobertura contratual de 62% para 85%.");
  expect(metaCobertura(90, 85)).toBe("Manter cobertura contratual acima de 85%, hoje em 90%.");
  expect(metaCobertura(85, 85)).toContain("Manter"); // no limiar, nao ha o que "elevar"
});

test("prioridade da acao segue se ha R$ calculavel, nao a posicao na tabela", () => {
  expect(prioridadeAcao(true)).toBe("Alta");
  expect(prioridadeAcao(false)).toBe("Média");
});

test("lista concatena em portugues", () => {
  expect(lista(["Melancia"])).toBe("Melancia");
  expect(lista(["Melancia", "Cebola"])).toBe("Melancia e Cebola");
  expect(lista(["Melancia", "Cebola", "Melão"])).toBe("Melancia, Cebola e Melão");
});
