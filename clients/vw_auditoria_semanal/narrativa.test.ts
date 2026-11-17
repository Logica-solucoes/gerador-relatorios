import { expect, test, describe } from "bun:test";
import type { Dados } from "./queries";
import { janela, maisComum, mesAteData, semanaPassada, SEMANAS_JANELA } from "./queries";
import * as n from "./narrativa";
import { base, semana } from "./fixture.test-util";

// A prosa daqui é derivada do dado: cada teste muda o número de entrada e exige
// que a frase mude junto. Se um passar com a frase idêntica, aquela afirmação
// virou texto fixo e passou a mentir no relatório.

const iso = (d: Date) => d.toISOString().slice(0, 10);

const seg = (s: string) => new Date(s + "T00:00:00Z");

describe("janela semanal", () => {
  test("as quatro datas saem da segunda-feira da semana atual", () => {
    const s = janela(seg("2026-08-17"));
    expect(iso(s.anterior)).toBe("2026-08-10");
    expect(iso(s.fim)).toBe("2026-08-23"); // domingo da semana atual
    expect(iso(s.janelaInicio)).toBe("2026-06-22");
  });

  test("as duas semanas são sempre segundas-feiras consecutivas", () => {
    for (const dia of ["2026-08-17", "2026-08-24", "2026-09-28", "2026-12-28"]) {
      const s = janela(seg(dia));
      expect(s.atual.getUTCDay()).toBe(1);
      expect(s.anterior.getUTCDay()).toBe(1);
      expect((s.atual.getTime() - s.anterior.getTime()) / 864e5).toBe(7);
      expect((s.fim.getTime() - s.atual.getTime()) / 864e5).toBe(6);
    }
  });

  test("a janela acumulada cobre SEMANAS_JANELA semanas até a atual", () => {
    const s = janela(seg("2026-08-17"));
    expect((s.atual.getTime() - s.janelaInicio.getTime()) / 864e5).toBe(SEMANAS_JANELA * 7);
  });

});

// O caso exato do pedido: gerando na terça 22/09, a semana é 14–20/09 contra
// 07–13/09 e o mês é 01–20/09. Recorte por data da auditoria, sem maturação.
describe("semana passada do calendário", () => {
  const dia = (s: string) => new Date(s + "T12:00:00Z");

  test("gerado em 22/09: 14–20/09 contra 07–13/09, mês 01–20/09", () => {
    const s = janela(semanaPassada(dia("2026-09-22")));
    expect(iso(s.atual)).toBe("2026-09-14");
    expect(iso(s.fim)).toBe("2026-09-20");
    expect(iso(s.anterior)).toBe("2026-09-07");
    const m = mesAteData(s);
    expect(iso(m.inicio)).toBe("2026-09-01");
    expect(iso(m.fim)).toBe("2026-09-20");
    expect(iso(m.antInicio)).toBe("2026-08-01");
    expect(iso(m.antFim)).toBe("2026-08-20");
  });

  test("qualquer dia da semana corrente aponta para a mesma semana fechada", () => {
    for (const d of ["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-27"])
      expect(iso(semanaPassada(dia(d)))).toBe("2026-09-14");
  });

  test("a semana corrente nunca entra, nem gerando no domingo", () => {
    // domingo 20/09 ainda é a semana 14–20; a fechada é 07–13
    expect(iso(semanaPassada(dia("2026-09-20")))).toBe("2026-09-07");
  });
});

describe("janela do mês", () => {
  test("primeira semana do mês fecha o mês anterior inteiro, contra o retrasado", () => {
    // semana 27/07–02/08: domingo dia 2 → mês de referência é julho fechado
    const m = mesAteData(janela(seg("2026-07-27")));
    expect(iso(m.inicio)).toBe("2026-07-01");
    expect(iso(m.fim)).toBe("2026-07-31");
    expect(iso(m.antInicio)).toBe("2026-06-01");
    expect(iso(m.antFim)).toBe("2026-06-30");
    expect(m.fechado).toBe(true);
    expect(m.dias).toBe(31);
    expect(m.diasAnt).toBe(30);
  });

  test("domingo no dia 7 ainda é primeira semana; no dia 8 não é", () => {
    expect(mesAteData(janela(seg("2026-09-28"))).fechado).toBe(true); // dom 04/10
    expect(mesAteData(janela(seg("2026-10-05"))).fechado).toBe(false); // dom 11/10
  });

  test("o recorte do mês anterior tem o mesmo número de dias", () => {
    for (const dia of ["2026-09-22", "2026-10-05", "2026-11-30", "2027-01-12"]) {
      const m = mesAteData(janela(seg(dia)));
      expect(m.dias).toBe(m.diasAnt);
      expect(iso(m.inicio).slice(8)).toBe("01");
      expect(iso(m.antInicio).slice(8)).toBe("01");
      expect(m.antFim.getTime()).toBeLessThan(m.inicio.getTime());
    }
  });

  test("mês anterior mais curto trunca no último dia dele, em vez de vazar para o mês seguinte", () => {
    // semana terminando 31/03 → o mesmo recorte em fevereiro não existe
    const m = mesAteData({ fim: new Date(Date.UTC(2027, 2, 31)) } as any);
    expect(iso(m.antFim)).toBe("2027-02-28");
    expect(m.dias).toBe(31);
    expect(m.diasAnt).toBe(28);
  });

  test("vira o ano sem quebrar", () => {
    const m = mesAteData({ fim: new Date(Date.UTC(2027, 0, 10)) } as any);
    expect(iso(m.antInicio)).toBe("2026-12-01");
    expect(iso(m.antFim)).toBe("2026-12-10");
  });
});

const com = (patch: Partial<Dados>): Dados => ({ ...base, ...patch });

const mes = (patch: Partial<Dados["mes"]> = {}): Dados["mes"] => ({ ...base.mes, ...patch });

describe("comparativo semanal", () => {
  test("vereditoContato inverte de 'subiu' para 'caiu'", () => {
    expect(n.vereditoContato(base)).toContain("subiu");
    expect(n.vereditoContato(base)).toContain("56,1%");
    expect(n.vereditoContato(base)).toContain("2,8 p.p.");
    const caindo = com({ atual: semana({ txContato: 40 }) });
    expect(n.vereditoContato(caindo)).toContain("caiu");
  });

  test("vereditoNps acusa o sinal, não só o valor", () => {
    expect(n.vereditoNps(base)).toContain("positivo");
    const ruim = com({ atual: semana({ npsGeral: -12 }) });
    expect(n.vereditoNps(ruim)).toContain("negativo");
  });

  test("tendencia pondera pelo n — a semana de 844 respostas não vale como a de 91", () => {
    const t = n.tendencia(base);
    // 1ª metade = 29/06 (844) e 06/07 (91): ponderada ≈ 46,2%, não a média simples 48,6%
    expect(t).toContain("46,2%");
    expect(t).toContain("em alta");
    const caindo = com({ serie: base.serie.map((x, i) => ({ ...x, tx: 70 - i * 8 })) });
    expect(n.tendencia(caindo)).toContain("em queda");
  });

  test("sem semanas suficientes, não inventa tendência", () => {
    expect(n.tendencia(com({ serie: base.serie.slice(0, 2) }))).toContain("não há semanas de auditoria suficientes");
  });
});

describe("o que está bom / ruim", () => {
  test("só entra no 'bom' o que o dado sustenta", () => {
    const bons = n.oQueEstaBom(base);
    expect(bons.some((x) => x.includes("Taxa de contato subiu"))).toBe(true);
    expect(bons.some((x) => x.includes("NPS subiu"))).toBe(true);

    // tudo piorando: a lista esvazia em vez de inventar boa notícia
    const pior = com({
      atual: semana({ txContato: 40, npsGeral: -30, txVendas: 1 }),
      tempo: [{ tempo: "Até 30 minutos", n: 5, pct: 2 }],
      regional: base.regional.map((r) => ({ ...r, atual: { ...r.atual, tx: 10 } })),
    });
    expect(n.oQueEstaBom(pior)).toHaveLength(0);
  });

  test("o 'ruim' acusa não-contato, lentidão e o desfecho mais comum", () => {
    const ruins = n.oQueEstaRuim(base);
    expect(ruins.some((x) => x.includes("43,9%"))).toBe(true); // 100 − 56,1
    expect(ruins.some((x) => x.includes("mais de um dia"))).toBe(true);
    expect(ruins.some((x) => x.includes("Não fui à concessionária"))).toBe(true);
  });

  test("taxa de contato alta tira o alerta de não-contato da lista", () => {
    const bom = com({ atual: semana({ txContato: 82 }) });
    expect(n.oQueEstaRuim(bom).some((x) => x.includes("ninguém entrou em contato"))).toBe(false);
  });
});

describe("perdas e correlação", () => {
  test("ondePerdemos nomeia o motivo, nunca a marca do concorrente", () => {
    const t = n.ondePerdemos(base);
    expect(t).toContain("35,3%");
    expect(t).toContain("484");
    expect(t).toContain("4×"); // 171 ÷ 39
    expect(t).not.toMatch(/Chevrolet|Fiat|Toyota|Hyundai/);
  });

  test("paraQuem dá o topo, soma a cauda e contrapõe aos declarados", () => {
    const t = n.paraQuem(base);
    expect(t).toContain("Chevrolet 9, Fiat 7, BYD 5, Hyundai 4");
    expect(t).toContain("outras 2 somam 3");
    expect(t).toContain("28 dos 39"); // 9+7+5+4+2+1 nomeadas, 39 declarados
    expect(t).toContain("Sem registro antes desta semana: Leapmotor");
  });

  test("paraQuem não chama marca de nova na primeira semana da janela", () => {
    const primeira = com({ periodo: { ...base.periodo, semanasJanela: 1 } });
    expect(n.paraQuem(primeira)).not.toContain("Sem registro");
    const semNova = com({ concorrencia: { ...base.concorrencia, novasSemana: [] } });
    expect(n.paraQuem(semNova)).not.toContain("Sem registro");
  });

  test("sem marca nomeada, não finge ranking", () => {
    const vazio = com({ concorrencia: { janela: [], novasSemana: [], mes: [] } });
    expect(n.paraQuem(vazio)).toContain("Nenhum cliente nomeou");
  });

  test("correlacaoNpsTempo detecta a escada e a faixa negativa", () => {
    const t = n.correlacaoNpsTempo(base);
    expect(t).toContain("Cada faixa de espera derruba o NPS");
    expect(t).toContain("67,8"); // 50,6 − (−17,2)
    expect(t).toContain("detratora na média");
  });

  test("escada quebrada muda o veredito, não força a conclusão", () => {
    const bagunca = com({
      npsTempo: [
        { tempo: "Até 30 minutos", nps: 10, n: 87 },
        { tempo: "Até duas horas", nps: 45, n: 60 },
        { tempo: "Até um dia", nps: 22.1, n: 95 },
        { tempo: "Mais de um dia", nps: 5, n: 134 },
      ],
    });
    const t = n.correlacaoNpsTempo(bagunca);
    expect(t).toContain("não é limpa");
    expect(t).not.toContain("detratora na média"); // faixa lenta positiva
  });

  test("sem as faixas extremas, não inventa correlação", () => {
    const magro = com({ npsTempo: [{ tempo: "Até um dia", nps: 22, n: 95 }] });
    expect(n.correlacaoNpsTempo(magro)).toContain("insuficiente");
  });

  test("vereditoPerdas fala de amostra, nunca da rede inteira", () => {
    const t = n.vereditoPerdas(base);
    expect(t).toContain("123 clientes ouvidos");
    expect(t).toContain("não projeção da rede");
    expect(t).toContain("caiu"); // 3 contra 6 na anterior
  });
});

describe("acumulado do mês", () => {
  test("vereditoMes compara contra o mesmo recorte de dias e inverte com o dado", () => {
    const t = n.vereditoMes(base);
    expect(t).toContain("subiu");
    expect(t).toContain("51,1%");
    expect(t).toContain("54,6%");
    expect(t).toContain("3,5 p.p.");
    const caindo = com({ mes: mes({ atual: { ...base.mes.atual, txContato: 40 } }) });
    expect(n.vereditoMes(caindo)).toContain("caiu");
  });

  // O caso que o dado real produz: a auditoria trabalha em mutirão e um mês
  // inteiro pode vir sem resposta. Ler 54% contra 0% seria cobertura, não queda.
  test("mês anterior sem auditoria vira 'nível', não evolução", () => {
    const vazio = com({ mes: mes({ anterior: { ...base.mes.anterior, nContato: 0, txContato: 0, npsGeral: 0 } }) });
    const t = n.vereditoMes(vazio);
    expect(t).toContain("vale como nível, não como evolução");
    expect(t).not.toContain("caiu");
    expect(n.subtituloMes(vazio)).toContain("não tem auditoria suficiente");
  });

  test("oQueOMesMostra diz se a semana e o mês concordam", () => {
    // semana subindo (53,3 → 56,1) e mês subindo (51,1 → 54,6)
    expect(n.oQueOMesMostra(base).some((x) => x.includes("mesmo lado"))).toBe(true);

    // semana caindo contra mês subindo: o texto tem que acusar a divergência
    const divergente = com({ atual: semana({ txContato: 45 }) });
    const itens = n.oQueOMesMostra(divergente);
    expect(itens.some((x) => x.includes("ainda não virou tendência"))).toBe(true);
    expect(itens.some((x) => x.includes("mesmo lado"))).toBe(false);
  });

  test("sem mês comparável, sobra o que não depende de comparação", () => {
    const vazio = com({ mes: mes({ anterior: { ...base.mes.anterior, nContato: 0 } }) });
    const itens = n.oQueOMesMostra(vazio);
    expect(itens.every((x) => !x.includes("mesmo lado") && !x.includes("NPS do mês"))).toBe(true);
    expect(itens.some((x) => x.includes("ninguém os procurou"))).toBe(true);
  });

  test("as perdas do mês continuam faladas como amostra ouvida", () => {
    const t = n.oQueOMesMostra(base).join(" ");
    expect(t).toContain("na amostra ouvida");
    expect(t).toContain("281");
    expect(t).toContain("R$ 4,0 mi");
  });

  test("subtituloMes avisa quando o recorte anterior é mais curto", () => {
    const fev = com({ mes: mes({ antInicio: "2027-02-01", antFim: "2027-02-28", dias: 31, diasAnt: 28 }) });
    expect(n.subtituloMes(fev)).toContain("o mês anterior é mais curto");
    expect(n.subtituloMes(base)).not.toContain("mais curto");
  });

  // A pergunta do questionário mudou em 17/08/2026: o recorte do mês anterior
  // que começa antes disso responde outra pergunta e mostraria uma falsa
  // melhora. Não compara, e diz o motivo, mesmo com amostra de sobra.
  test("mês anterior de antes da mudança do questionário não é comparado", () => {
    const mudou = com({ periodo: { ...base.periodo, inicioQuestionario: "2026-08-17" } });
    expect(n.mesComparavel(mudou)).toBe(false);
    expect(n.subtituloMes(mudou)).toContain("antes da mudança do questionário (17/08/2026)");
    expect(n.vereditoMes(mudou)).toContain("nível, não como evolução");
    expect(n.oQueOMesMostra(mudou).some((x) => x.includes("mesmo lado") || x.includes("não virou tendência"))).toBe(false);
    expect(n.mesComparavel(base)).toBe(true);
  });

  test("rotuloIntervalo abre as duas pontas", () => {
    expect(n.rotuloIntervalo("2026-08-01", "2026-08-23")).toBe("01/08/2026 a 23/08/2026");
  });
});

describe("o que aprendi", () => {
  test("as conclusões saem do dado e citam os números que as sustentam", () => {
    const itens = n.oQueAprendi(base);
    expect(itens.length).toBeGreaterThanOrEqual(3);
    expect(itens[0]!.texto).toContain("33,7%");
    expect(itens[0]!.texto).toContain("67,8");
    expect(itens.some((x) => x.titulo.includes("antes da loja"))).toBe(true);
    expect(itens.some((x) => x.titulo.includes("Site Ofertas"))).toBe(true);
    // toda conclusão tem texto: item vazio deixaria buraco no bloco
    expect(itens.every((x) => x.texto.length > 0 && x.titulo.length > 0)).toBe(true);
  });
});

describe("rótulos", () => {
  test("rotuloSemana abre a semana em intervalo de sete dias", () => {
    expect(n.rotuloSemana("2026-07-27")).toBe("27/07/2026 a 02/08/2026");
  });

  test("subtitulo dá o volume de auditorias das duas semanas", () => {
    expect(n.subtitulo(base)).toBe("280 auditorias realizadas nesta semana, 280 na anterior.");
    expect(n.subtitulo(com({ atual: semana({ auditados: 519 }) }))).toContain("519 auditorias");
  });
});

describe("faixa de tempo mais citada", () => {
  test("pega a de maior contagem e informa a participação", () => {
    const t = maisComum([{ rotulo: "Até um dia", n: 30 }, { rotulo: "Mais de um dia", n: 50 }, { rotulo: "Até 30 minutos", n: 20 }]);
    expect(t).toEqual({ tempo: "Mais de um dia", n: 50, pct: 50, total: 100 });
  });

  test("empate é determinístico, não depende da ordem de chegada", () => {
    const a = maisComum([{ rotulo: "Até um dia", n: 5 }, { rotulo: "Até 30 minutos", n: 5 }]);
    const b = maisComum([{ rotulo: "Até 30 minutos", n: 5 }, { rotulo: "Até um dia", n: 5 }]);
    expect(a).toEqual(b);
  });

  test("sem resposta devolve null", () => {
    expect(maisComum([])).toBeNull();
  });
});
