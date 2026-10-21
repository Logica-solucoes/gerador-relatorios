import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

export type Resumo = { etapa?: string; erro?: string; semana?: string; relatorioId?: string };

/** Extrai da saída do build o que cabe num e-mail. O stack trace fica só no arquivo de log. */
export function resumir(saida: string, exitCode: number): Resumo {
  const linhas = saida.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const semana = linhas.findLast((l) => l.startsWith("→ semana "))?.slice("→ semana ".length);
  const relatorioId = linhas.findLast((l) => l.startsWith("relatorio_id: "))?.slice("relatorio_id: ".length);
  const etapa = linhas
    .findLast((l) => l.startsWith("→ ") && !l.startsWith("→ semana "))
    ?.replace(/^→ (\[[^\]]+\] )?/, "");
  const erro = exitCode === 0
    ? undefined
    : (linhas.findLast((l) => l.startsWith("error: "))?.slice("error: ".length) ?? linhas.at(-1));
  return { etapa, erro, semana, relatorioId };
}

const RETENCAO_DIAS = 90;

// Fuso do processo (TZ=America/Sao_Paulo no container): o arquivo vira à meia-noite de Brasília.
const dia = (d: Date) => d.toLocaleDateString("sv-SE");

export const novoId = (agora: Date) =>
  `${dia(agora).replaceAll("-", "")}-${agora.toLocaleTimeString("sv-SE").replaceAll(":", "")}-${crypto.randomUUID().slice(0, 4)}`;

export function textoResumo(x: {
  cliente: string; id: string; arquivo: string; duracaoMs: number; exitCode: number; resumo: Resumo;
}) {
  const { resumo: r } = x;
  return [
    `Cliente: ${x.cliente}`,
    r.semana && `Semana: ${r.semana}`,
    r.relatorioId && `Relatório no portal: ${r.relatorioId}`,
    x.exitCode !== 0 && r.etapa && `Parou em: ${r.etapa}`,
    r.erro && `Erro: ${r.erro}`,
    `Duração: ${Math.round(x.duracaoMs / 1000)}s`,
    `Log completo: ${x.arquivo} (id ${x.id})`,
  ].filter(Boolean).join("\n");
}

/** Uma linha JSON no arquivo do dia. Síncrono: o registro não se perde se o container cair logo depois. */
export function gravar(dir: string, agora: Date, registro: Record<string, unknown>, falhou: boolean) {
  const arquivo = join(dir, `${dia(agora)}.log`);
  const dest = pino.destination({ dest: arquivo, sync: true, mkdir: true });
  const log = pino({
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  }, dest);
  if (falhou) log.error(registro); else log.info(registro);
  dest.end();
  return arquivo;
}

// ponytail: rotação à mão em vez de pino-roll, que puxa date-fns (~11 MB) só para nomear arquivo.
export function limpar(dir: string, agora: Date) {
  const corte = dia(new Date(agora.getTime() - RETENCAO_DIAS * 864e5));
  for (const f of readdirSync(dir))
    if (/^\d{4}-\d{2}-\d{2}\.log$/.test(f) && f.slice(0, 10) < corte) rmSync(join(dir, f));
}
