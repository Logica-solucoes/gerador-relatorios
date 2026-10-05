/** Limpeza do snapshot. Tudo explícito: o que não casa vai para pendencias.json, não some. */

const chave = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

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

/** ONS/ONI → ONX como no PBI. WMR fica (o PBI tira): vendas batem com o SQL e o relatório PDF. */
export function normalizarCrop(kind: string | null | undefined): string {
  if (!kind) return "Sem crop";
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
/** Estado errado na fonte, achado pela região declarada ("Rio Grande do Norte" em "Sul" é a área do RS). */
export const ESTADO_TROCADO: Record<string, string> = { "RIO GRANDE DO NORTE|SUL": "Rio Grande do Sul" };
export function estadoCorrigido(estado: string | null | undefined, regiao: string | null | undefined): string | null {
  if (!estado || !regiao) return null;
  return ESTADO_TROCADO[`${chave(estado)}|${chave(regiao)}`] ?? null;
}

export function ufsDoEstado(s: string | null | undefined): string[] {
  if (!s) return [];
  const k = chave(s);
  if (UF_POR_NOME[k]) return [UF_POR_NOME[k]!];
  return dividirUF(s);
}

const REGIAO_POR_UF: Record<string, string> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste",
  PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste", PR: "Sul", RS: "Sul", SC: "Sul",
};
/** CEPEA traz estado em região errada (RN em "Sul", SP em "Sul"). A UF decide; UFs de regiões diferentes, não. */
export function regiaoDasUfs(ufs: string[]): string | null {
  const rs = new Set(ufs.map((u) => REGIAO_POR_UF[u]));
  return rs.size === 1 ? [...rs][0] ?? null : null;
}

/**
 * CEPEA: só hectare ("Mi. Planta" repete a área do tomate em outra unidade). A linha só de região
 * é a soma dos estados dela: cai quando o produto/ano/item já vem aberto por estado, dentro da mesma
 * estimativa (Consolidado e "Estimativa agosto/24" se complementam por produto, não se repetem).
 */
export function limparCepea<T extends Record<string, unknown>>(ls: T[]): T[] {
  const ha = ls.filter((l) => l.unidade === "ha.");
  const chaveC = (l: T) => `${l.produto}|${l.ano}|${l.item}|${l.estimativa}`;
  const comEstado = new Set(ha.filter((l) => l.estado).map(chaveC));
  return ha.filter((l) => l.estado || !comEstado.has(chaveC(l)));
}

const CLIENTES_BR10_PARA_BR02 = new Set(["A SEMENTEIRA PROD AGR LTDA", "NATIVA AGRICOLA LTDA", "NATIVO AGRICOLA LTDA"]);

/**
 * Carteira do PBI Sales: WMW desses 3 clientes é da BR02, mesmo vindo como BR10. BR04/BR07 saíram
 * do time; o PBI apagava o nome ("(Em branco)"), a BASF pediu o nome junto com os demais.
 */
export function rtvDe(cod: string | null, cliente: string | null, kind: string | null, nomes: Map<string, string>): { cod: string | null; rtv: string } {
  const c = cod === "BR10" && kind === "WMW" && cliente != null && CLIENTES_BR10_PARA_BR02.has(cliente.trim()) ? "BR02" : cod;
  if (!c) return { cod: null, rtv: "Sem RTV" };
  return { cod: c, rtv: nomes.get(c) ?? c };
}
