/** Entrypoint do preview do Sales. No portal: componente Aurelia próprio chamando montarDashboard com SALES. */
import { carregarArquivo } from "./carregar";
import { montarDashboard } from "./dashboard";
import { SALES } from "./paineis";

montarDashboard(document.getElementById("app")!, carregarArquivo("dados/"), SALES);
