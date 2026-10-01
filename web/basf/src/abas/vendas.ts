import type { DefAba } from "./tipos";

export const vendas: DefAba = {
  id: "vendas",
  rotulo: "Vendas",
  recursos: () => ["vendas"],
  chips: () => ({ dims: { ano: "Ano" }, origem: "vendas" }),
  controles: () => "",
  render: (_ctx, corpo) => { corpo.innerHTML = '<div class="bmd-card">Em construção</div>'; },
};
