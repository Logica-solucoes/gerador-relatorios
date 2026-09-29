import { janela, semanaPassada } from "./queries.ts";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Campos = { titulo: string; referencia: string };

/** Padrão do que já foi publicado à mão no portal. `fim` é o domingo da semana lida. */
export function campos(fim: Date): Campos {
  return {
    titulo: `Relatório Semanal Auditoria - Semana ${Math.ceil(fim.getUTCDate() / 7)}`,
    referencia: `${MESES[fim.getUTCMonth()]}/${fim.getUTCFullYear()}`,
  };
}

export const jaPublicado = (lista: Campos[], c: Campos) =>
  lista.some((r) => r.titulo === c.titulo && r.referencia === c.referencia);
