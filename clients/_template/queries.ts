// TEMPLATE — copie esta pasta pra clients/<novo-cliente>/ e adapte.
// Ver NOVO_CLIENTE.md na raiz do repo pro processo completo de onboarding.

/** Mock: troque por conexão real (SQL Server, outro banco, ou leitura de
 *  CSV/planilha — a única exigência é devolver algo que `carregar` aceite). */
export async function conectar() {
  return null;
}

export async function carregar(_pool: unknown) {
  return {
    kpi: { label: "Receita YTD", valor2025: 1_000_000, valor2026: 1_250_000 },
    serie: [
      { mes: "Jan", valor: 80_000 },
      { mes: "Fev", valor: 95_000 },
      { mes: "Mar", valor: 110_000 },
    ],
  };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
