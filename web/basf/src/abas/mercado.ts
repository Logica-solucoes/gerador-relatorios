import type { DefAba } from "./tipos";

export const mercado: DefAba = {
  id: "mercado",
  rotulo: "Mercado",
  recursos: () => ["basf"],
  chips: () => ({ dims: { ano: "Ano" }, origem: "basf" }),
  controles: () => "",
  render: (_ctx, corpo) => { corpo.innerHTML = '<div class="bmd-card">Em construção</div>'; },
};
