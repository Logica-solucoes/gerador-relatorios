/** Entrypoint só do preview standalone: pendura o dashboard com o snapshot embutido.
 *  No portal, quem chama `montarDashboard` é o custom element do Aurelia — este arquivo
 *  não entra no bundle de produção. */
import { montarDashboard } from "./dashboard";
import { EMBARQUES } from "./dados";

montarDashboard(document.getElementById("app")!, EMBARQUES);
