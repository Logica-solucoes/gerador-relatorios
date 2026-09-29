import { expect, test } from "bun:test";
import { janela, semanaPassada } from "./queries";
import { campos, jaPublicado } from "./publicar";

const dia = (s: string) => new Date(s + "T00:00:00Z");

test("bate com o que foi publicado à mão em 22/09 (semana 14–20/09)", () => {
  const fim = janela(semanaPassada(dia("2026-09-22"))).fim;
  expect(campos(fim)).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Setembro/2026" });
});

test("número da semana e mês saem do domingo", () => {
  expect(campos(dia("2026-09-27"))).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 4", referencia: "Setembro/2026" });
  expect(campos(dia("2026-08-31"))).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 5", referencia: "Agosto/2026" });
});

test("semana que cruza o mês vai para o mês do domingo", () => {
  const fim = janela(semanaPassada(dia("2026-10-06"))).fim; // 28/09–04/10
  expect(campos(fim)).toEqual({ titulo: "Relatório Semanal Auditoria - Semana 1", referencia: "Outubro/2026" });
});

test("duplicado exige título e referência iguais", () => {
  const lista = [{ titulo: "Relatório Semanal Auditoria - Semana 3", assunto: "Auditoria", referencia: "Setembro/2026" }];
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Setembro/2026" })).toBe(true);
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 3", referencia: "Outubro/2026" })).toBe(false);
  expect(jaPublicado(lista, { titulo: "Relatório Semanal Auditoria - Semana 4", referencia: "Setembro/2026" })).toBe(false);
});
