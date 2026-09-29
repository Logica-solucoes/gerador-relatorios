import { expect, test, describe } from "bun:test";
import type { Dados } from "./queries";
import * as n from "./narrativa";

// Estes testes provam que a prosa é derivada do dado, não escrita à mão: cada um
// muda o número de entrada e exige que a frase mude junto. Se um deles passar com
// a frase idêntica, aquela afirmação virou texto fixo e mentiu no relatório.

// 10 decis, 820 conversões no total — mesmo fixture do modelo em clients/vw.
// captura(40%) = 570/820 = 69,51%; corte = kpis.txContato/100 = 0,4.
const faixasScore = [0.26, 0.13, 0.1, 0.08, 0.06, 0.05, 0.05, 0.04, 0.03, 0.02].map((t, i) => ({
  faixa: i + 1, volume: 1000, pct_base: 0.1, conversoes: Math.round(t * 1000), taxa_conversao: t,
}));
const captura40 = 570 / 820;
const mult = captura40 / 0.4;

const base: Dados = {
  periodo: { inicio: "2026-06-01", fim: "2026-08-17", fimDisponivel: "2026-08-03", diasLag: 15 },
  faixasScore,
  projecao: {
    corte: 0.4,
    nContato: 1000,
    captura: captura40,
    mult,
    taxaHoje: 0.03,
    taxaOrdenada: 0.03 * mult,
    vendasHoje: 2400,
    vendasOrdenada: 2400 * mult,
    vendasExtras: 2400 * (mult - 1),
  },
  kpis: {
    leadsCriados: 100_000,
    leadsDisponiveis: 80_000,
    vendas: 3_000,
    txVendas: 3.8,
    abordados: 8_000,
    txAbordados: 8,
    telValidos: 7_000,
    txTelValidos: 87.5,
    txContato: 40,
    nContato: 1_000,
    txPreencheu: 80,
    nPreencheu: 900,
    npsGeral: 20,
    nNps: 400,
    txWpp: 95,
    nWpp: 300,
    leadsRecuperar: 300,
    vendasRecuperadas: 5,
    perdasAtendimento: 20,
    perdasConcorrencia: 40,
    perdasTotal: 60,
    faturamentoPerdido: 7_800_000,
  },
  funil: [
    { etapa: "Leads criados no período", n: 100_000 },
    { etapa: "Abordados pela auditoria", n: 8_000 },
    { etapa: "Telefone válido", n: 7_000 },
    { etapa: "Responderam alguma pergunta", n: 2_000 },
    { etapa: "Responderam “houve contato?”", n: 1_000 },
    { etapa: "Disseram que houve contato", n: 400 },
  ],
  contatoMes: [
    { mes: "Jun/26", tx: 40, n: 500 },
    { mes: "Jul/26", tx: 50, n: 400 },
  ],
  contatoDia: [
    { dia: new Date("2026-06-01T00:00:00Z"), tx: 40, n: 200 },
    { dia: new Date("2026-06-02T00:00:00Z"), tx: 60, n: 100 },
    { dia: new Date("2026-06-03T00:00:00Z"), tx: 100, n: 1 },
  ],
  npsNotas: [
    { nota: 1, n: 50 },
    { nota: 5, n: 20 },
    { nota: 8, n: 30 },
    { nota: 10, n: 100 },
  ],
  tempo: [
    { tempo: "Até 30 minutos", n: 100 },
    { tempo: "Até duas horas", n: 60 },
    { tempo: "Até um dia", n: 80 },
    { tempo: "Mais de um dia", n: 160 },
  ],
  npsTempo: [
    { tempo: "Até 30 minutos", nps: 50, n: 90 },
    { tempo: "Até duas horas", nps: 40, n: 60 },
    { tempo: "Até um dia", nps: 30, n: 80 },
    { tempo: "Mais de um dia", nps: -20, n: 130 },
  ],
  statusTempo: [
    { tempo: "Até 30 minutos", total: 100, status: [{ status: "Comprei de outra marca", n: 2 }, { status: "Comprei um VW Zero", n: 98 }] },
    { tempo: "Mais de um dia", total: 100, status: [{ status: "Comprei de outra marca", n: 8 }, { status: "Comprei um VW Zero", n: 92 }] },
  ],
  status: [
    { status: "Não fui à concessionária", n: 200 },
    { status: "Comprei um VW Zero", n: 100 },
    { status: "Comprei um VW Seminovo", n: 50 },
    { status: "Comprei de outra marca", n: 50 },
  ],
  statusNaoPreencheu: [
    { status: "Não fui à concessionária", n: 50 },
    { status: "Comprei de outra marca", n: 50 },
  ],
  canalUso: [{ canal: "WhatsApp", n: 300 }],
  npsCanal: [
    { canal: "WhatsApp", nps: 20, n: 300 },
    { canal: "Ligação", nps: 80, n: 20 },
    { canal: "E-Mail", nps: 100, n: 1 },
  ],
  canalPreferencia: [
    { pedido: "Whatsapp", usado: "WhatsApp", n: 280 },
    { pedido: "Telefone", usado: "WhatsApp", n: 18 },
    { pedido: "Telefone", usado: "Ligação", n: 2 },
  ],
  npsRegional: [
    { regional: "1", nps: 0, n: 50 },
    { regional: "2", nps: 30, n: 50 },
  ],
  npsModelo: [
    { modelo: "POLO", nps: 10, n: 100 },
    { modelo: "TERA", nps: 40, n: 100 },
    { modelo: "ID.BUZZ", nps: 90, n: 3 },
  ],
  contatoRegional: [
    { regional: "1", tx: 30, n: 200 },
    { regional: "2", tx: 60, n: 200 },
  ],
  contatoModelo: [
    { modelo: "POLO", tx: 45, n: 300 },
    { modelo: "TERA", tx: 55, n: 250 },
  ],
  tabelaRegional: [
    { regional: "1", leads: 20_000, vendas: 400, txContato: 30, nContato: 200, txConcorrencia: 1, perdas: 10 },
    { regional: "2", leads: 15_000, vendas: 700, txContato: 60, nContato: 200, txConcorrencia: 2, perdas: 6 },
  ],
  dnCobertura: { total: 400, comAmostra: 20, piso: 10 },
  tabelaDn: [
    { dn: "0001", nome: "Loja Alfa", grupo: "ALFA", leads: 1000, txContato: 70, nContato: 20, concorrencia: 1, perdas: 5 },
    { dn: "0002", nome: "Loja Beta", grupo: "BETA", leads: 900, txContato: 20, nContato: 15, concorrencia: 2, perdas: 8 },
  ],
  sentimento: {
    volume: { positivo: 10, neutro: 200, negativo: 90 },
    palavras: [
      { palavra: "atendimento", n: 12, sentimento: "negativo" },
      { palavra: "obrigado", n: 8, sentimento: "neutro" },
      { palavra: "retorno", n: 5, sentimento: "negativo" },
    ],
    comentarios: [{ texto: "muito tempo sem retorno da loja", sentimento: "negativo" }],
  },
  concorrencia: [
    { marca: "Chevrolet", modelo: "Tracker", rotulo: "Chevrolet Tracker", n: 3 },
    { marca: "Fiat", modelo: "Cronos", rotulo: "Fiat Cronos", n: 1 },
  ],
  contatoOrigem: [
    { origem: "Outlet", tx: 62, n: 30 },
    { origem: "Site Ofertas", tx: 44, n: 600 },
  ],
  subOrigem: [
    { origem: "Site Ofertas", leads: 60_000, vendas: 1_800, tx: 3 },
    { origem: "Outlet", leads: 4_000, vendas: 200, tx: 5 },
  ],
};

/** Cópia com um pedaço trocado — evita mutar `base` entre testes. */
const com = (patch: Partial<Dados>): Dados => ({ ...base, ...patch });

describe("funil e alcance", () => {
  test("resumoFunil traz os quatro degraus que cita", () => {
    const t = n.resumoFunil(base);
    expect(t).toContain("100.000");
    expect(t).toContain("8.000");
    expect(t).toContain("2.000");
    expect(t).toContain("1.000");
  });

  test("alcanceAuditoria muda quando a auditoria alcança mais gente", () => {
    const dobro = com({ funil: base.funil.map((f, i) => (i === 1 ? { ...f, n: 16_000 } : f)) });
    expect(n.alcanceAuditoria(dobro)).not.toBe(n.alcanceAuditoria(base));
  });
});

describe("taxa de contato", () => {
  test("o veredito vira 'pouco mais da metade' acima de 50%", () => {
    expect(n.vereditoContato(base)).toContain("Menos da metade");
    const alto = com({ kpis: { ...base.kpis, txContato: 62 } });
    expect(n.vereditoContato(alto)).toContain("Pouco mais da metade");
  });

  test("tendenciaContato inverte de 'subiu' para 'caiu'", () => {
    expect(n.tendenciaContato(base)).toContain("subiu");
    const caindo = com({ contatoMes: [{ mes: "Jun/26", tx: 50, n: 500 }, { mes: "Jul/26", tx: 40, n: 400 }] });
    expect(n.tendenciaContato(caindo)).toContain("caiu");
  });

  test("com um mês só, não inventa comparação", () => {
    const um = com({ contatoMes: [{ mes: "Jun/26", tx: 40, n: 500 }] });
    expect(n.tendenciaContato(um)).toContain("dois meses fechados");
  });

  test("licaoAmostraDia conta os dias fracos de verdade", () => {
    expect(n.licaoAmostraDia(base)).toContain("1 dos 3 dias");
    const semFracos = com({ contatoDia: base.contatoDia.slice(0, 2) });
    expect(n.licaoAmostraDia(semFracos)).toContain("0 dos 2 dias");
  });
});

describe("projeção da taxa de conversão", () => {
  test("projecaoVendas ancora no período disponível, não num mês", () => {
    const t = n.projecaoVendas(base);
    expect(t).toContain("40%"); // corte
    expect(t).toContain("3,0%"); // taxaHoje
    expect(t).toContain("5,2%"); // taxaOrdenada
    expect(t).toContain("1,74×"); // mult
    expect(t).toContain("4.171"); // vendasOrdenada
    expect(t).toContain("2.400"); // vendasHoje
    expect(t).toContain("1.771"); // vendasExtras
  });

  test("cuidadoProjecao nomeia as duas fontes: amostra e modelo externo", () => {
    const t = n.cuidadoProjecao(base);
    expect(t).toContain("1.000"); // nContato
    expect(t).toContain("40%"); // corte
    expect(t).toContain("Lead Scoring");
    expect(t).toContain("direção");
  });

  test("mudar o corte muda o veredito, não é texto fixo", () => {
    const outro = com({ projecao: { ...base.projecao, corte: 0.3, nContato: 500 } });
    expect(n.cuidadoProjecao(outro)).toContain("30%");
    expect(n.cuidadoProjecao(outro)).toContain("500");
  });
});

describe("NPS", () => {
  test("leituraNps repete o NPS geral e o n", () => {
    const t = n.leituraNps(base);
    expect(t).toContain("20,0");
    expect(t).toContain("400");
  });

  test("polarizacaoNps aponta a nota mais dada", () => {
    expect(n.polarizacaoNps(base)).toContain("a nota mais dada é 10");
    const invertido = com({ npsNotas: [{ nota: 1, n: 300 }, { nota: 10, n: 10 }] });
    expect(n.polarizacaoNps(invertido)).toContain("a nota mais dada é 1");
  });
});

describe("tempo de resposta", () => {
  test("escadaTempo compara a faixa mais rápida com a mais lenta", () => {
    const t = n.escadaTempo(base);
    expect(t).toContain("50,0");
    expect(t).toContain("-20,0");
    expect(t).toContain("70,0 pontos");
  });

  test("escadaTempo avisa quando falta faixa", () => {
    const parcial = com({ npsTempo: [{ tempo: "Até 30 minutos", nps: 50, n: 90 }] });
    expect(n.escadaTempo(parcial)).toContain("Ainda não há resposta suficiente");
  });

  test("escadaOutraMarca calcula o fator entre as pontas", () => {
    expect(n.escadaOutraMarca(base)).toContain("4,0 vezes mais");
    const plano = com({
      statusTempo: base.statusTempo.map((t) => ({
        ...t,
        status: [{ status: "Comprei de outra marca", n: 5 }, { status: "Comprei um VW Zero", n: 95 }],
      })),
    });
    expect(n.escadaOutraMarca(plano)).toContain("1,0 vezes mais");
  });
});

describe("desfecho e formulário", () => {
  test("leituraStatus nomeia a resposta mais comum", () => {
    expect(n.leituraStatus(base)).toContain("Não fui à concessionária");
    const outro = com({ status: [{ status: "Comprei um VW Zero", n: 500 }, ...base.status] });
    expect(n.leituraStatus(outro)).toContain("“Comprei um VW Zero”");
  });

  test("leituraFormulario compara os dois grupos", () => {
    const t = n.leituraFormulario(base);
    expect(t).toContain("12,5%"); // 50 de 400 no grupo geral
    expect(t).toContain("50,0%"); // 50 de 100 entre quem não preencheu
  });
});

describe("canal", () => {
  test("leituraCanal mostra quem pediu telefone e recebeu WhatsApp", () => {
    expect(n.leituraCanal(base)).toContain("18 de 20");
  });

  test("npsPorCanal exclui canal abaixo do piso da comparação", () => {
    const t = n.npsPorCanal(base);
    expect(t).toContain("WhatsApp");
    expect(t).toContain("Ligação");
    expect(t).toContain("não é comparável");
  });
});

describe("recortes", () => {
  test("leituraRegional usa as pontas reais", () => {
    const t = n.leituraRegional(base);
    expect(t).toContain("Regional 1");
    expect(t).toContain("Regional 2");
  });

  test("leituraModelo ignora modelo abaixo do piso", () => {
    const t = n.leituraModelo(base);
    expect(t).toContain("TERA");
    expect(t).not.toContain("ID.BUZZ");
    expect(t).toContain("1 modelos ficaram de fora");
  });

  test("leituraDn cita cobertura e as duas pontas", () => {
    const t = n.leituraDn(base);
    expect(t).toContain("400 concessionárias");
    expect(t).toContain("Loja Alfa");
    expect(t).toContain("Loja Beta");
  });

  test("leituraContatoOrigem some quando não há o que comparar", () => {
    const uma = com({ contatoOrigem: [base.contatoOrigem[0]!] });
    expect(n.leituraContatoOrigem(uma)).toBe("");
  });
});

describe("perdas, sentimento e concorrência", () => {
  test("leituraPerdas quebra o total nos dois componentes", () => {
    const t = n.leituraPerdas(base);
    expect(t).toContain("60 vendas perdidas");
    expect(t).toContain("20");
    expect(t).toContain("40");
  });

  test("leituraSentimento acompanha a proporção", () => {
    expect(n.leituraSentimento(base)).toContain("30,0%");
    const positivo = com({ sentimento: { ...base.sentimento, volume: { positivo: 200, neutro: 90, negativo: 10 } } });
    expect(n.leituraSentimento(positivo)).toContain("66,7%");
  });

  test("leituraConcorrencia contrapõe declarados e identificados", () => {
    const t = n.leituraConcorrencia(base);
    expect(t).toContain("50 clientes"); // declararam "comprei de outra marca"
    expect(t).toContain("4"); // identificaram a marca
    expect(t).toContain("Chevrolet Tracker");
  });

  test("sem marca identificada, não finge que há", () => {
    const vazio = com({ concorrencia: [] });
    expect(n.leituraConcorrencia(vazio)).toContain("Ainda não há nenhuma marca");
  });
});

describe("capa", () => {
  test("periodo usa fuso fixo — 01/06 não vira 31/05", () => {
    expect(n.periodo(base)).toBe("01/06/2026 a 17/08/2026");
  });

  test("subtituloCapa carrega os três volumes", () => {
    const t = n.subtituloCapa(base);
    expect(t).toContain("100.000");
    expect(t).toContain("8.000");
    expect(t).toContain("2.000");
  });
});
