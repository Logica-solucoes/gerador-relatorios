/**
 * Paleta e constantes visuais do dashboard BASF BI Mercado.
 * Fonte ÚNICA de cor de série: o Plot pinta inline a partir daqui.
 * Laranja é a marca do portal; verde é a segunda série (hortaliça);
 * azul BASF só na marca; vermelho só erro. Número ruim (delta negativo) é laranja, nunca verde. Ver `## UI stack` no CLAUDE.md.
 */
export const C = {
  o50: "#FFF8ED", o100: "#FFEFD4", o200: "#FFDBA8", o300: "#F7B04A",
  o500: "#F39500", o600: "#E07B00", o700: "#B95D02",
  verde: "#4F8A2A",
  azulBasf: "#004A96",
  alerta: "#C60023",
  ink: "#24180B", muted: "#7D6B57", border: "#ECE2D3", surface: "#FFFFFF",
  anterior: "#CDBBA3",
} as const;

/**
 * Dados: magnitude em verde (um tom, claro → escuro); laranja só no destaque (maior, ano atual,
 * pontos do mapa). Categorias em ordem fixa, validada para daltonismo (dataviz validate_palette,
 * todos os pares das 4 primeiras: as linhas do Comparativo se cruzam).
 */
export const VERDE = ["#EEF5E6", "#CFE3BC", "#A3C985", "#6FA850", "#4F8A2A", "#36611C"] as const;
export const CATEGORIAS = ["#F39500", "#1F78B4", "#2E7D32", "#B0306A", "#7E57C2", "#D4A72C"] as const;
export const OUTROS = "#D9CFC1";

/** Cor de cada fonte no Comparativo: mesma ordem das categorias. */
export const COR_FONTE: Record<string, string> = {
  BASF: CATEGORIAS[0], IBGE: CATEGORIAS[1], ABCSEM: CATEGORIAS[2], CEPEA: CATEGORIAS[3],
};

/** A cor segue a categoria, não a posição: ordem pelo total sem filtro, o recorte não repinta. */
export function coresPorChave(chavesNaOrdem: string[]): (chave: string) => string {
  const mapa = new Map(chavesNaOrdem.slice(0, CATEGORIAS.length).map((k, i) => [k, CATEGORIAS[i]!]));
  return (k) => mapa.get(k) ?? OUTROS;
}

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
