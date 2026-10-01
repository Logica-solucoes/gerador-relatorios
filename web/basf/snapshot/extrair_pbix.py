"""Extrai as tabelas já transformadas do .pbix para web/basf/dados/_bruto/*.json.

Sem regra de negócio: a normalização mora em montar.ts (testada). Aqui só se escolhe
tabela, renomeia coluna e aplica o filtro que a PRÓPRIA página do PBI aplica.
"""
from pathlib import Path
from pbixray import PBIXRay

RAIZ = Path(__file__).resolve().parents[3]
INTAKE = RAIZ / "_intake" / "basf" / "arquivos basf"
SAIDA = RAIZ / "web" / "basf" / "dados" / "_bruto"
SAIDA.mkdir(parents=True, exist_ok=True)

m = PBIXRay(str(INTAKE / "Dashboard Mercado BASF - BANCO.pbix"))
f = PBIXRay(str(INTAKE / "forecast.pbix"))


def gravar(nome, df, colunas):
    df = df[list(colunas)].rename(columns=colunas)
    df.to_json(SAIDA / f"{nome}.json", orient="records", force_ascii=False)
    print(f"{nome}: {len(df)}")


gravar("basf", m.get_table("BASF"), {
    "Ano Estudo": "ano", "Estado": "uf", "cidade_mapa": "municipio", "hotspot_dexpara": "hotspot",
    "Regional": "regional", "Sales Specialist": "rtv", "Crop": "crop", "Crop_descricao": "cropDesc",
    "segmento_dexpara": "segmento", "op/hy/f2_dexpara": "hy",
    "Área Semeio Direto (HA)": "area", "DOSE (TH/HA)_Semeio Direto": "dose", "TOTAL TH": "th",
    "Potencial R$": "potencial", "Potencial euro": "potencialEur",
})

ibge = m.get_table("IBGE")
A = "Área plantada ou destinada à colheita (Hectares)"
# Página IBGE do PBI exclui Espécie = "Total". GR e MI ficam de fora: nenhuma visão usa.
ibge = ibge[(ibge["Espécie"] != "Total") & ibge["Nível"].isin(["BR", "UF", "ME", "MU"]) & (ibge[A] > 0)]
gravar("ibge", ibge, {"Nível": "nivel", "Ano": "ano", "Espécie": "especie", "estado_v2": "uf",
                      "Cód.": "cod", "Descrição": "nome", A: "area"})

gravar("abcsem", m.get_table("ABCSEM"), {
    "Ano": "ano", "Espécie": "especie", "Tipo": "tipo", "segmento_dexpara": "segmento", "CROP": "crop",
    "produtos_selecionados": "selecionado",
    "Área Total Estimada do Mercado de Sementes (ha)": "area",
    "Volume Total Estimado do Mercado (M ou Kg) TH": "volume",
    "Valor Total Estimado do Mercado de Sementes (R$)": "valor",
})

cepea = m.get_table("CEPEA")
# Filtros da página CEPEA: Estimativa = Consolidado; Região ≠ Brasil e não nula.
cepea = cepea[(cepea["Estimativa"] == "Consolidado") & cepea["Região"].notna() & (cepea["Região"] != "Brasil")]
gravar("cepea", cepea, {"Ano Civil": "ano", "Ano Safra": "safra", "Região": "regiao", "Estado": "estado",
                        "Regional": "regional", "Produto": "produto", "Itens Projeção": "item", "Valor": "valor"})

gravar("resumo", m.get_table("Dados Mercado Total"),
       {"Fonte": "fonte", "Ano": "ano", "Espécie": "especie", "Área total": "area", "Total TH": "th"})
gravar("resumoSeg", m.get_table("Dados Basf e ABCSEM"), {
    "Fonte": "fonte", "Ano": "ano", "Espécie": "especie", "segmento_dexpara": "segmento",
    "hy/op/f2_dexpara": "hy", "CROP": "crop", "Área total": "area", "Total TH": "th"})

gravar("clientes", m.get_table("Key Customer List"), {
    "Customer": "cliente", "Crop": "crop", "hotspot_dexpara": "hotspot", "Sales Specialist": "rtv",
    "Regional": "regional", "Acesso": "acesso", "Ano": "ano", "Área (HA)": "area", "Dose TH (HA)": "dose",
    "TOTAL TH": "mercado", "Vendas de COPA (TH)": "copa", "Enxertia (TH)": "enxertia",
    "Vendas de ENXERTIA (TH)": "vendasEnx", "TOTAL TH (COPA + ENXERTIA)": "mercadoCopaEnx",
    "Potencial R$": "potencial", "vendas pontencial basf R$": "vendasPotencial"})

gravar("municipios", m.get_table("Municípios e Coord# Sedes 2013"),
       {"GEOCODIGO_MUNICIPIO": "cod", "NOME_MUNICIPIO": "nome", "LATITUDE": "lat", "LONGITUDE": "lon"})

gravar("depara_cliente_hotspot", m.get_table("dexpara Cliente - Hotspot"),
       {"CUST_NO": "custNo", "CROP": "crop", "hotspot_dexpara": "hotspot"})
gravar("depara_item_segmento", m.get_table("de x para Produtos x segmento"),
       {"item_desc": "item", "Segmento II": "segmentoII"})
gravar("depara_segmento", m.get_table("de x para segmento"),
       {"Segmento II": "segmentoII", "dexpara segmento": "segmento"})
gravar("sales_specialist", m.get_table("Sales Specialist"),
       {"PRIMARY_CONTACT": "cod", "SALESPERSON_NAME": "nome", "Regional": "regional"})
gravar("taxa", f.get_table("Budget Rate"), {"Ano": "ano", "Rate": "taxa"})
