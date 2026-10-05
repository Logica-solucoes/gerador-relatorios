/**
 * Contrato de dados do BI Mercado. Interface entre o snapshot (lab) / API (portal) e a tela.
 * Mudou coluna na origem? Muda aqui primeiro.
 *
 * Regra: o dashboard filtra e soma. Não recalcula regra de negócio — de-paras, hotspot,
 * segmento, crop, potencial e regional chegam prontos.
 */
export type Fonte = "basf" | "ibge" | "abcsem" | "cepea";
export type Aba = "mercado" | "comparativo" | "clientes" | "vendas" | "evolucao" | "analise" | "tabela";
export type Valor = string | number | null;
export type Linha = Record<string, Valor>;

/** Formato no fio: nomes de coluna uma vez, linhas em array. Corta ~60% do JSON do IBGE. */
export interface TabelaFio { c: string[]; r: Valor[][] }

export type Recurso = Fonte | "resumo" | "resumoSeg" | "clientes" | "vendas" | "meta" | "municipios";
export type Carregar = (r: Recurso) => Promise<Linha[]>;

/*
 * Colunas por recurso (todas presentes em toda linha; ausência = null):
 *
 * basf       ano, uf, cod, municipio, hotspot, regional, rtv, crop, cropDesc, segmento, hy,
 *            area, dose, th, potencial, potencialEur
 * ibge       nivel ("BR"|"UF"|"ME"|"MU"), ano, especie, uf, meso, cod, nome, area
 * abcsem     ano, especie, tipo, segmento (bruto: Híbrido, OP...), crop, selecionado (0|1), area, volume, valor
 * cepea      ano, safra, regiao, uf, estado, regional, produto, item, area (ha; só "Consolidado",
 *            sem linha de região já aberta por estado; região corrigida pela UF)
 * resumo     fonte, ano, especie, area, th                       (Dados Mercado Total)
 * resumoSeg  fonte, ano, especie, segmento, hy, crop, area, th   (Dados Basf e ABCSEM)
 * clientes   cliente, crop, hotspot, rtv, regional, acesso, ano, area, dose, mercado, copa,
 *            enxertia, vendasEnx, mercadoCopaEnx, potencial, vendasPotencial
 * vendas     ano, mes, dia, crop, variedade, rtv, regional, cliente, hotspot, segmento, valor, th
 *            (rtv já com a carteira do PBI Sales: snapshot/normaliza.ts rtvDe)
 * meta       ano, budget, forecast, taxa, ultimaVenda (ISO; só na linha do maior ano)
 * municipios cod, nome, uf, lat, lon
 */
