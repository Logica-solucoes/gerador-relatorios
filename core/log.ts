export type Resumo = { etapa?: string; erro?: string; semana?: string };

/** Extrai da saída do build o que cabe num e-mail. O stack trace fica só no arquivo de log. */
export function resumir(saida: string, exitCode: number): Resumo {
  const linhas = saida.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const semana = linhas.findLast((l) => l.startsWith("→ semana "))?.slice("→ semana ".length);
  const etapa = linhas
    .findLast((l) => l.startsWith("→ ") && !l.startsWith("→ semana "))
    ?.replace(/^→ (\[[^\]]+\] )?/, "");
  const erro = exitCode === 0
    ? undefined
    : (linhas.findLast((l) => l.startsWith("error: "))?.slice("error: ".length) ?? linhas.at(-1));
  return { etapa, erro, semana };
}
