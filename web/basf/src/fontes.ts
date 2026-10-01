import type { Filtros } from "./calc";
import type { Fonte, Linha } from "./types";

export interface DefFonte {
  rotulo: string;
  /** dimensão → rótulo do chip. Ordem = ordem na barra. */
  dims: Record<string, string>;
  /** métrica → rótulo. A primeira é a padrão. */
  metricas: Record<string, string>;
  /** Dimensões do ranking (bar-list), na ordem dos botões. */
  rankings: string[];
  temMapa: boolean;
}

export const FONTES: Record<Fonte, DefFonte> = {
  basf: {
    rotulo: "BASF",
    dims: { ano: "Ano", regional: "Regional", crop: "Crop", hotspot: "Hotspot", segmento: "Segmento", rtv: "RTV", uf: "Estado" },
    metricas: { area: "Área (ha)", dose: "Dose TH/ha", th: "Total TH" },
    rankings: ["uf", "hotspot", "regional", "crop"],
    temMapa: true,
  },
  ibge: {
    rotulo: "IBGE",
    dims: { ano: "Ano", especie: "Espécie", uf: "Estado", meso: "Mesorregião" },
    metricas: { area: "Área (ha)" },
    rankings: ["uf", "meso"],
    temMapa: true,
  },
  abcsem: {
    rotulo: "ABCSEM",
    dims: { ano: "Ano", especie: "Espécie", tipo: "Tipo", segmento: "Segmento" },
    metricas: { volume: "Volume (M ou kg)", area: "Área (ha)", valor: "Valor (R$)" },
    rankings: ["especie", "tipo", "segmento"],
    temMapa: false,
  },
  cepea: {
    rotulo: "CEPEA",
    dims: { ano: "Ano", produto: "Produto", item: "Item", regiao: "Região", uf: "Estado", regional: "Regional" },
    metricas: { area: "Área (ha)" },
    rankings: ["regiao", "uf", "regional"],
    temMapa: true,
  },
};

export const ROTULO_DIM: Record<string, string> = {
  uf: "Estado", hotspot: "Hotspot", regional: "Regional", crop: "Crop", meso: "Mesorregião",
  especie: "Espécie", tipo: "Tipo", segmento: "Segmento", regiao: "Região", rtv: "RTV",
};

/**
 * IBGE: os níveis NÃO somam entre si (2024: BR 232.102 ha, MU 326.067 ha).
 * Cada visão lê o nível certo. Nunca some município para total.
 */
export type Visao = "total" | "uf" | "meso" | "mapa";
const NIVEL: Record<Visao, string> = { total: "BR", uf: "UF", meso: "ME", mapa: "MU" };

export function linhasIbge(ls: Linha[], visao: Visao, f: Filtros): Linha[] {
  // Com mesorregião filtrada só o nível ME tem `meso` para casar; município não tem: mapa sem pontos.
  if (f.meso?.length) return visao === "mapa" ? [] : ls.filter((l) => l.nivel === "ME");
  // Com estado filtrado o nível BR não tem `uf` para casar: o total vem dos UFs.
  const nivel = visao === "total" && f.uf?.length ? "UF" : NIVEL[visao];
  return ls.filter((l) => l.nivel === nivel);
}
