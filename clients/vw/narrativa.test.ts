import { expect, test } from "bun:test";
import type { Modelo } from "./queries";
import { capturaEm, taxaConversaoEm, TAXA_ATENDIMENTO } from "./queries";
import { acoes, drill, estabilidade, estabilidadeOosOot, ganhoAtendimento, grupos, manchete, naoAtendidos, pesoCampanha, procedenciaCaptura, subconjunto, tituloEstabilidade, valorSuspeito, vereditoCampanha } from "./narrativa";

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

// 820 conversões no fixture; acumulado em 40% = 570 (69,51%), em 50% = 630 (76,83%).
// 45% cai no meio dos dois decis → 73,17%.
test("capturaEm interpola entre decis quando o corte não é decil", () => {
  const f = modelo([0.78, 0.72], 0.6).faixas_score;
  expect(capturaEm(f, 0.4)).toBeCloseTo(570 / 820, 6);
  expect(capturaEm(f, 0.5)).toBeCloseTo(630 / 820, 6);
  expect(capturaEm(f, 0.45)).toBeCloseTo(600 / 820, 6);
  // bordas: nada contactado captura nada, base inteira captura tudo
  expect(capturaEm(f, 0)).toBe(0);
  expect(capturaEm(f, 1)).toBeCloseTo(1, 6);
});

// mesmo fixture do teste de capturaEm: captura(45%) = 600/820 = 73,17%.
// taxaConversaoEm = captura/pct * taxaGeral = (600/820)/0.45 * taxaGeral.
test("taxaConversaoEm escala a taxa geral pelo ganho de captura no corte", () => {
  const f = modelo([0.78, 0.72], 0.6).faixas_score;
  expect(taxaConversaoEm(f, 0.45, 0.1)).toBeCloseTo((600 / 820 / 0.45) * 0.1, 6);
  // corte na base inteira: taxa volta a ser a taxa geral (captura=1, pct=1)
  expect(taxaConversaoEm(f, 1, 0.1)).toBeCloseTo(0.1, 6);
});

test("manchete e resumo saem do corte real de atendimento, não de um alvo fixo", () => {
  expect(manchete({ base: modelo([0.78, 0.72], 0.6) as never })).toContain("73,2%");
  expect(manchete({ base: modelo([0.78, 0.72], 0.6) as never })).toContain("45%");
});

test("ganhoAtendimento mede o vão contra a fila aleatória", () => {
  const t = ganhoAtendimento({ base: modelo([0.78, 0.72], 0.6) as never });
  expect(t).toContain("73,2%");
  // 73,17 − 45 = 28,2 p.p.
  expect(t).toContain("28,2 p.p.");
});

test("procedenciaCaptura mostra os dois decis que cercam o corte", () => {
  const t = procedenciaCaptura({ base: modelo([0.78, 0.72], 0.6) as never });
  expect(t).toContain("73,2%"); // o valor interpolado
  expect(t).toContain("40%"); // decil de baixo
  expect(t).toContain("50%"); // decil de cima
  expect(t).toContain("69,5%"); // 570/820 no decil de baixo
  expect(t).toContain("76,8%"); // 630/820 no decil de cima
  expect(t).toContain("interpolação");
});

test("naoAtendidos fala do corte, não da capacidade", () => {
  const t = naoAtendidos({ base: modelo([0.78, 0.72], 0.6) as never });
  expect(t).toContain("55%");
  expect(t).toContain("não aumenta a capacidade");
});

test("grupos somam as dez faixas em quente, morno e frio", () => {
  const gr = grupos(modelo([0.78, 0.72], 0.6));
  expect(gr.map((x) => [x.de, x.ate])).toEqual([
    [8, 10],
    [5, 7],
    [1, 4],
  ]);
  expect(gr[0]!.taxa).toBeCloseTo(490 / 3000, 6);
  expect(gr[0]!.pctVendas).toBeCloseTo(490 / 820, 6);
  // os três blocos cobrem 100% das vendas, sem sobra nem sobreposição
  expect(gr.reduce((s, x) => s + x.pctVendas, 0)).toBeCloseTo(1, 6);
  expect(gr.reduce((s, x) => s + x.volume, 0)).toBe(10000);
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
  expect(estabilidadeOosOot(modelo([0.73, 0.6], 0.6))).toContain("oscila entre períodos");
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
    coluna_detalhe: "Sub Origem › Sub Origem Nível 2",
    piso_volume: 1100,
    top_valores: vals.map((v, i) => ({ valor: `V${i}`, contribuicao_media: v, volume: 5000 })),
  });
  expect(drill(bloco([0.3, 0.1, -0.05]))).toContain("derruba");
  expect(drill(bloco([0.3, 0.1, 0.05]))).toContain("Nenhum dos 3");
});

test("valor suspeito acusa lixo de cadastro na folha do rotulo concatenado", () => {
  const bloco = (vals: string[]) => ({
    feature: "Sub Origem",
    coluna_detalhe: "Sub Origem › Sub Origem Nível 2",
    piso_volume: 1100,
    top_valores: vals.map((valor) => ({ valor, contribuicao_media: -0.34, volume: 17503 })),
  });
  // codigo cru depois do "›": um teste no rotulo inteiro nao pegaria
  expect(valorSuspeito(bloco(["Site Ofertas › WhatsApp", "Whatsapp › 0"]))).toContain("17.503 leads");
  expect(valorSuspeito(bloco(["Institucional › (sem cadastro)"]))).toContain("sem nenhum cadastro");
  // acusa o mais forte, nao o primeiro da lista, e soma o volume de todos
  const varios = {
    feature: "Sub Origem",
    coluna_detalhe: "Sub Origem › Sub Origem Nível 2",
    piso_volume: 1100,
    top_valores: [
      { valor: "Institucional › (sem cadastro)", contribuicao_media: 0.083, volume: 89340 },
      { valor: "Site Ofertas › Estou interessado", contribuicao_media: 0.018, volume: 665396 },
      { valor: "Whatsapp › (sem cadastro)", contribuicao_media: -0.377, volume: 38643 },
    ],
  };
  expect(valorSuspeito(varios)).toContain("Whatsapp › (sem cadastro)");
  expect(valorSuspeito(varios)).toContain("2 dos 3");
  expect(valorSuspeito(varios)).toContain("127.983 leads"); // 89.340 + 38.643
  expect(valorSuspeito(bloco(["Site Ofertas › WhatsApp", "Monte o Seu VW › Test Drive"]))).toBeNull();
  // nome de concessionaria com numero no meio nao e codigo cru
  expect(valorSuspeito(bloco(["V12 Motors"]))).toBeNull();
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

test("plano de acao traz a retroalimentacao de midia e nao fala mais de cadastro de produto", () => {
  const d = {
    base: modelo([0.78, 0.72], 0.6),
    a: modelo([0.83, 0.7], 0.5707),
    b: modelo([0.86, 0.73], 0.5921),
    campanha: { subconjunto: { n_linhas: 246143, pct_da_base_limpa: 0.1636, taxa_conversao: 0.0651 } },
  } as never;
  const titulos = acoes(d).map((a) => a.titulo);
  expect(titulos.some((t) => t.includes("Retroalimentar"))).toBe(true);
  expect(titulos.some((t) => t.includes("cadastro de produto"))).toBe(false);
  // toda acao tem texto: o filtro de texto nulo nao pode deixar buraco na numeracao
  expect(acoes(d).every((a) => a.texto.length > 0)).toBe(true);
});

test("TAXA_ATENDIMENTO é o único lugar onde o número da auditoria mora", () => {
  expect(TAXA_ATENDIMENTO).toBe(0.45);
});
