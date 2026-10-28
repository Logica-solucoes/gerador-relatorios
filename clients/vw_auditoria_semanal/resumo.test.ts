import { expect, test } from "bun:test";
import type { Dados } from "./queries";
import { resumo } from "./resumo";
import { base, semana } from "./fixture.test-util";

const com = (patch: Partial<Dados>): Dados => ({ ...base, ...patch });

test("traz o período, os quatro KPIs e a direção contra a semana anterior", () => {
  const t = resumo(base);
  expect(t).toContain("27/07/2026 a 02/08/2026");
  expect(t).toContain("Taxa de contato: 56,1% (subiu 2,8 p.p. vs. semana anterior)");
  expect(t).toContain("NPS: 16,7 (subiu 22,3 pts");
  expect(t).toContain("Vendas perdidas: 3 (caiu 3 vs. semana anterior)");
  expect(t).toContain("Conversão dos auditados: 2,5%");
});

test("a direção acompanha o dado", () => {
  const t = resumo(com({ atual: semana({ txContato: 40 }) }));
  expect(t).toContain("Taxa de contato: 40,0% (caiu 13,3 p.p.");
  const parado = resumo(com({ atual: semana({ txContato: 53.3 }) }));
  expect(parado).toContain("Taxa de contato: 53,3% (estável");
});

test("é texto puro: sem tags HTML da narrativa", () => {
  expect(resumo(base)).not.toMatch(/<[a-z/][^>]*>/i);
});

test("diz o recorte que o chatbot deve repetir no banco", () => {
  const t = resumo(base);
  expect(t).toContain("data da auditoria");
  expect(t).toContain("dt_criacao");
  expect(t).toContain("17/08/2026");
  expect(t).toContain("amostra ouvida");
});

test("regional só com amostra suficiente: melhor e pior", () => {
  const t = resumo(base);
  expect(t).toContain("Melhor: R6, 56,0% em 20 respostas. Pior: R1, 51,0% em 20 respostas.");
  const fraca = resumo(com({ regional: base.regional.map((r) => ({ ...r, atual: { ...r.atual, n: 3 } })) }));
  expect(fraca).toContain("Nenhuma regional com 10 respostas ou mais");
});

test("mês sem recorte comparável não afirma evolução", () => {
  const t = resumo(com({ mes: { ...base.mes, anterior: { ...base.mes.anterior, nContato: 0 } } }));
  expect(t).toContain("Sem recorte comparável");
  expect(t).not.toContain("A semana e o mês apontam");
});

test("lista vazia vira frase, não seção em branco", () => {
  const t = resumo(com({
    atual: semana({ txContato: 70, npsGeral: 5 }),
    anterior: semana({ txContato: 70, npsGeral: 5 }),
    tempo: [], regional: [], motivo: [], piores: [],
  }));
  expect(t).toContain("nenhum indicador melhorou");
});
