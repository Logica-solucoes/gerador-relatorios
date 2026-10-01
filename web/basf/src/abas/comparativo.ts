import type { DefAba } from "./tipos";

export const comparativo: DefAba = {
  id: "comparativo",
  rotulo: "Comparativo",
  recursos: () => ["resumo"],
  chips: () => ({ dims: { ano: "Ano" }, origem: "resumo" }),
  controles: () => "",
  render: (_ctx, corpo) => { corpo.innerHTML = '<div class="bmd-card">Em construção</div>'; },
};
