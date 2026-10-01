/** Limpeza do snapshot. Tudo explícito: o que não casa vai para pendencias.json, não some. */

const chave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Grafias vistas nos dados (key list e BASF consolidado). Chave sem acento, caixa alta. */
const GRAFIAS: Record<string, string> = {
  "MONTEALTO": "Monte Alto",
  "MONTE ALTO": "Monte Alto",
  "SAO JOSE DO RIO PARDO": "São José do Rio Pardo",
  "SAO JOSE RIO PARDO": "São José do Rio Pardo",
  "STA CRUZ DO RIO PARDO": "Santa Cruz do Rio Pardo",
  "CHAPADA DOS VEADEIROS": "Chapada dos Veadeiros",
  "PATOS DE MINAS": "Patos de Minas",
  "MARILANDIA DO SUL": "Marilândia do Sul",
  "MOGI GUACU": "Mogi Guaçu",
  "CARMOPOLIS DE MINAS": "Carmópolis de Minas",
  "CATALAO": "Catalão",
};

const MINUSCULAS = new Set(["de", "do", "da", "dos", "das", "e"]);
const titulo = (s: string) =>
  s.toLowerCase().split(" ").map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");

export function limparHotspot(s: string | null | undefined): string | null {
  if (s == null) return null;
  let t = s.trim().replace(/\s+/g, " ");
  if (!t) return null;
  t = t.replace(/\s*-\s*Safra$/i, "").replace(/\s*-\s*[A-Z]{2}$/, "").replace(/,\s*Par[aá]$/i, "");
  const g = GRAFIAS[chave(t)];
  if (g) return g;
  return t === t.toUpperCase() ? titulo(t) : t;
}

export function dividirUF(s: string | null | undefined): string[] {
  if (!s || s === "0") return [];
  return s.split("/").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}

/** Igual ao Power Query do PBI: ONS/ONI → ONX, WMR fora. */
export function normalizarCrop(kind: string | null | undefined): string | null {
  if (!kind) return "Sem crop";
  if (kind === "WMR") return null;
  return kind === "ONS" || kind === "ONI" ? "ONX" : kind;
}

export type IndiceMunicipios = Map<string, number>;

export function indiceMunicipios(ms: { cod: number; nome: string; uf: string }[]): IndiceMunicipios {
  return new Map(ms.map((m) => [`${m.uf}|${chave(m.nome)}`, m.cod]));
}

export function casarMunicipio(nome: string | null, ufs: string[], idx: IndiceMunicipios): number | null {
  if (!nome) return null;
  for (const uf of ufs) {
    const cod = idx.get(`${uf}|${chave(nome)}`);
    if (cod != null) return cod;
  }
  return null;
}

/** UF a partir do código IBGE do município (2 primeiros dígitos). */
const UF_POR_COD: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
export const ufDoCodigo = (cod: number) => UF_POR_COD[String(cod).slice(0, 2)] ?? null;

/** CEPEA usa nome de estado por extenso, às vezes composto ("GO/DF"). */
const UF_POR_NOME: Record<string, string> = {
  "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA", "CEARA": "CE",
  "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO", "MARANHAO": "MA", "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR",
  "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC",
  "SAO PAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO",
};
export function ufsDoEstado(s: string | null | undefined): string[] {
  if (!s) return [];
  const k = chave(s);
  if (UF_POR_NOME[k]) return [UF_POR_NOME[k]!];
  return dividirUF(s);
}
