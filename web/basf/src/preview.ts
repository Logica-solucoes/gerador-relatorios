/** Entrypoint só do preview. No portal quem chama `montarDashboard` é o componente Aurelia. */
import { carregarArquivo } from "./carregar";
import { montarDashboard } from "./dashboard";

montarDashboard(document.getElementById("app")!, carregarArquivo("dados/"));
