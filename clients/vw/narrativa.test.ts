import { expect, test } from "bun:test";
import type { Modelo } from "./queries";
import { cadastroRepetido, drill, valorSuspeito, estabilidade, estabilidadeOosOot, tituloEstabilidade, manchete, pesoCampanha, subconjunto, vereditoCampanha, vereditoMeta } from "./narrativa";

const faixas = (taxas: number[]) =>
  taxas.map((t, i) => ({ faixa: i + 1, volume: 1000, pct_base: 0.1, conversoes: Math.round(t * 1000), taxa_conversao: t }));

const modelo = (auc: [number, number], recall: number): Modelo => ({
  metricas: {
    treino: { auc: auc[0], ks: 0.5, recall_30: 0.8 },
    oos: { auc: 0.75, ks: 0.4, recall_30: 0.65 },
    oot: { auc: auc[1], ks: 0.32, recall_30: recall },
  },
  faixas_score: faixas([0.26, 0.13, 0.1, 0.08, 0.06, 0.05, 0.05, 0.04, 0.03, 0.02]),
  importancia_features: [{ feature: "TX_CONV_DN_30D", importance_relativa: 1, importance_acumulada: 1 }],
  drilldown: [],
});

test("veredito da meta acompanha o Recall@30% do OOT", () => {
  expect(vereditoMeta({ base: modelo([0.78, 0.72], 0.64) as never })).toContain("Meta atingida");
  expect(vereditoMeta({ base: modelo([0.78, 0.72], 0.5963) as never })).toContain("praticamente atingida");
  expect(vereditoMeta({ base: modelo([0.78, 0.72], 0.42) as never })).toContain("não atingida");
});

test("manchete usa o recall real, não um número fixo", () => {
  expect(manchete({ base: modelo([0.78, 0.72], 0.5963) as never })).toContain("59,6%");
  expect(manchete({ base: modelo([0.78, 0.72], 0.71) as never })).toContain("71,0%");
});

test("estabilidade distingue generalização de overfitting", () => {
  expect(estabilidade(modelo([0.777, 0.722], 0.6))).toContain("generalizou");
  expect(estabilidade(modelo([0.789, 0.721], 0.6))).toContain("memorização");
  expect(estabilidade(modelo([0.98, 0.71], 0.6))).toContain("overfitting");
});

test("titulo do card acompanha a mesma faixa de queda", () => {
  expect(tituloEstabilidade(modelo([0.777, 0.722], 0.6))).toBe("O modelo se sustenta no tempo");
  expect(tituloEstabilidade(modelo([0.789, 0.721], 0.6))).toContain("memorização");
  expect(tituloEstabilidade(modelo([0.98, 0.71], 0.6))).toContain("não se repete");
});

test("OOS x OOT separa futuro dificil de modelo instavel", () => {
  // oos fixo em 0,75 no fixture: com OOT 0,721 a distancia ate o treino e maior
  expect(estabilidadeOosOot(modelo([0.789, 0.721], 0.6))).toContain("bem menor");
  expect(estabilidadeOosOot(modelo([0.73, 0.60], 0.6))).toContain("oscila entre períodos");
});

test("veredito do experimento segue o sinal e o tamanho do ganho", () => {
  const ab = (a: number, b: number) => ({ a: modelo([0.83, 0.7], a), b: modelo([0.86, 0.73], b) });
  // +2,14 p.p. é o dado real do experimento — cruza o limiar de 2 p.p.
  expect(vereditoCampanha(ab(0.5707, 0.5921))).toContain("de forma relevante");
  expect(vereditoCampanha(ab(0.5707, 0.58))).toContain("levemente");
  expect(vereditoCampanha(ab(0.5707, 0.54))).toContain("pioraram");
});

test("drill-down muda quando não há contribuição negativa", () => {
  const bloco = (vals: number[]) => ({
    feature: "Sub Origem",
    coluna_detalhe: "Sub Origem Nível 2",
    piso_volume: 1100,
    top_valores: vals.map((v, i) => ({ valor: `V${i}`, contribuicao_media: v, volume: 5000 })),
  });
  expect(drill(bloco([0.3, 0.1, -0.05]))).toContain("derruba");
  expect(drill(bloco([0.3, 0.1, 0.05]))).toContain("Nenhum dos 3");
});

test("cadastro repetido só acusa quando o termo se repete", () => {
  const bloco = (vals: string[]) => ({
    feature: "FamilyProduct",
    coluna_detalhe: "Descrição do Veículo",
    piso_volume: 1100,
    top_valores: vals.map((valor) => ({ valor, contribuicao_media: 0.4, volume: 5000 })),
  });
  expect(cadastroRepetido(bloco(["Taos", "TAOS", "Taos Highline", "Polo"]))).toContain("3 dos 4");
  expect(cadastroRepetido(bloco(["Polo", "Virtus", "Amarok"]))).toContain("consistente");
  // "Novo T-Cross" e "T-Cross" sao a mesma familia; o hifen nao pode virar corte de token
  expect(cadastroRepetido(bloco(["Novo T-Cross", "T-Cross", "T-Cross Sense 200", "Nivus"]))).toContain('variações de "T-Cross"');
});

test("valor suspeito acusa codigo cru como categoria, e so ele", () => {
  const bloco = (vals: string[]) => ({
    feature: "Sub Origem",
    coluna_detalhe: "Sub Origem Nível 2",
    piso_volume: 1100,
    top_valores: vals.map((valor) => ({ valor, contribuicao_media: -0.34, volume: 17503 })),
  });
  expect(valorSuspeito(bloco(["WhatsApp", "0", "Test Drive"]))).toContain("17.503 leads");
  expect(valorSuspeito(bloco(["WhatsApp", "Test Drive"]))).toBeNull();
});

test("subconjunto compara a conversão do recorte com a da base", () => {
  const d = (taxa: number) => ({
    base: { dados: { taxa_conversao_geral: 0.1026 } } as never,
    campanha: { subconjunto: { n_linhas: 246143, pct_da_base_limpa: 0.1636, taxa_conversao: taxa } } as never,
  });
  expect(subconjunto(d(0.0651))).toContain("abaixo");
  expect(subconjunto(d(0.15))).toContain("acima");
});

test("peso das colunas de campanha soma só o que existe no modelo B", () => {
  const b = {
    ...modelo([0.86, 0.73], 0.59),
    importancia_features: [
      { feature: "Product Service", importance_relativa: 0.11, importance_acumulada: 0.11 },
      { feature: "NOM_FORMAT", importance_relativa: 0.007, importance_acumulada: 0.117 },
      { feature: "Regional", importance_relativa: 0.02, importance_acumulada: 0.137 },
    ],
  };
  const texto = pesoCampanha({ b }, ["Product Service", "NOM_FORMAT", "Funnel Stage"]);
  expect(texto).toContain("2 colunas");
  expect(texto).toContain("11,7%");
});
