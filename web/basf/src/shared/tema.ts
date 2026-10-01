/**
 * Paleta e constantes visuais do dashboard BASF BI Mercado.
 * Fonte ÚNICA de cor de série: o Plot pinta inline a partir daqui.
 * Laranja é a marca do portal; verde é a segunda série (hortaliça);
 * azul BASF só na marca; vermelho só alerta. Ver `## UI stack` no CLAUDE.md.
 */
export const C = {
  o50: "#FFF8ED", o100: "#FFEFD4", o200: "#FFDBA8", o300: "#F7B04A",
  o500: "#F39500", o600: "#E07B00", o700: "#B95D02",
  verde: "#4F8A2A", verde300: "#A9CF8A",
  azulBasf: "#004A96",
  alerta: "#C60023",
  ink: "#24180B", muted: "#7D6B57", border: "#ECE2D3", surface: "#FFFFFF",
  anterior: "#CDBBA3",
} as const;

/** Cor de cada fonte no Comparativo. */
export const COR_FONTE: Record<string, string> = {
  BASF: C.o500, ABCSEM: C.verde, IBGE: C.azulBasf, CEPEA: "#9B7B5B",
};

/** Escala para composição (barra 100%) e choropleth. */
export const ESCALA = [C.o500, C.o300, C.o200, C.verde, C.verde300, "#D9CBB6"];

export const LARGURA_COMPACTA = 640;

/** Ver comentário original no LogicaDash (shared/tema.ts): raio grande e finito. */
export const RAIO_PONTEIRO_BANDA = 10_000;

export const ESTILO_PLOT = {
  style: {
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
    fontSize: "12px",
    background: "transparent",
    color: C.muted,
  },
} as const;

const MIN_ESPACO_TICK = 26;

export function ticksEixoX(dominio: string[], largura: number): string[] | undefined {
  const maxVisiveis = Math.max(1, Math.floor(largura / MIN_ESPACO_TICK));
  const passo = Math.max(1, Math.ceil(dominio.length / maxVisiveis));
  return passo > 1 ? dominio.filter((_, i) => i % passo === 0) : undefined;
}
