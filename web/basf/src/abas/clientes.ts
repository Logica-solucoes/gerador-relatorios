import type { DefAba } from "./tipos";

export const clientes: DefAba = {
  id: "clientes",
  rotulo: "Clientes",
  recursos: () => ["clientes"],
  chips: () => ({ dims: { ano: "Ano" }, origem: "clientes" }),
  controles: () => "",
  render: (_ctx, corpo) => { corpo.innerHTML = '<div class="bmd-card">Em construção</div>'; },
};
