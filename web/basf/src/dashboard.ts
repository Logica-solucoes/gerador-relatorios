import { alternarFiltro, deHash, definirFiltro, paraHash, trocarFonte, type Estado } from "./estado";
import type { DefAba, Dados } from "./abas/tipos";
import { chips, erroCarga, skeleton } from "./componentes";
import { criarShell } from "./shared/shell";
import { esc } from "./shared/formato";
import type { Aba, Carregar, Fonte, Recurso } from "./types";
import { mercado } from "./abas/mercado";
import { comparativo } from "./abas/comparativo";
import { clientes } from "./abas/clientes";
import { vendas } from "./abas/vendas";

const ABAS: DefAba[] = [mercado, comparativo, clientes, vendas];

const GABARITO = `
  <header class="bmd-hero2"><div><small>BASF | Nunhems · SHIFT BI</small><h1>Inteligência de Mercado</h1></div><small data-el="ultima"></small></header>
  <nav class="bmd-tabs" role="tablist" data-el="tabs"></nav>
  <div class="bmd-barra2"><div class="bmd-barra2__chips" data-el="chips"></div><div class="bmd-barra2__ctl" data-el="ctl"></div></div>
  <div class="bmd-aviso" data-el="aviso" hidden></div>
  <main class="bmd-corpo" data-el="corpo"></main>`;

export interface Montado { destruir(): void }

export function montarDashboard(host: HTMLElement, carregar: Carregar): Montado {
  const shell = criarShell(host, GABARITO);
  let estado: Estado = deHash(location.hash);
  const dados: Dados = {};
  const pendentes = new Map<Recurso, Promise<void>>();
  const falhas = new Map<Recurso, string>();

  const aba = () => ABAS.find((a) => a.id === estado.aba)!;

  function garantir(r: Recurso): Promise<void> {
    if (dados[r] || pendentes.has(r)) return pendentes.get(r) ?? Promise.resolve();
    const p = carregar(r)
      .then((ls) => { dados[r] = ls; falhas.delete(r); })
      .catch((e: unknown) => { falhas.set(r, e instanceof Error ? e.message : String(e)); })
      .finally(() => { pendentes.delete(r); render(); });
    pendentes.set(r, p);
    return p;
  }

  function aviso(txt: string) {
    const el = shell.el("aviso");
    el.textContent = txt;
    el.hidden = !txt;
  }

  function mudar(f: (e: Estado) => Estado) {
    estado = f(estado);
    history.replaceState(null, "", paraHash(estado));
    render();
  }

  function render() {
    const a = aba();
    shell.el("tabs").innerHTML = ABAS.map((x) =>
      `<button type="button" role="tab" data-aba="${x.id}" aria-selected="${x.id === estado.aba}"${x.id === estado.aba ? ' class="is-on"' : ""}>${esc(x.rotulo)}</button>`).join("");
    const meta = dados.meta?.find((m) => m.ultimaVenda);
    shell.el("ultima").textContent = meta ? `última venda ${String(meta.ultimaVenda).split("-").reverse().join("/")}` : "";
    garantir("meta");

    const recursos = a.recursos(estado);
    recursos.forEach(garantir);
    const corpo = shell.el("corpo");
    const falha = recursos.find((r) => falhas.has(r));
    if (falha) { corpo.innerHTML = erroCarga(falhas.get(falha)!); return; }
    if (recursos.some((r) => !dados[r])) { corpo.innerHTML = skeleton(); return; }

    const { dims, origem } = a.chips(estado);
    const base = dados[origem] ?? [];
    const opcoes = (dim: string) =>
      [...new Set(base.map((l) => l[dim]).filter((v) => v != null && v !== "").map(String))]
        .sort((x, y) => (dim === "ano" ? Number(y) - Number(x) : x.localeCompare(y, "pt-BR")));
    shell.el("chips").innerHTML = chips(dims, estado.filtros[estado.aba], opcoes);
    shell.el("ctl").innerHTML = a.controles(estado);
    a.render({ shell, estado, dados, mudar }, corpo);
  }

  shell.aoClicarEm("[data-aba]", (el) => mudar((e) => ({ ...e, aba: el.dataset.aba as Aba, drill: [], clienteAberto: null })));
  shell.aoClicarEm("[data-filtro]", (el) => mudar((e) => alternarFiltro(e, el.dataset.filtro!, el.dataset.v!)));
  shell.aoClicarEm("[data-chip-limpar]", (el) => mudar((e) => definirFiltro(e, el.dataset.chipLimpar!, [])));
  shell.aoClicarEm("[data-tentar]", () => { falhas.clear(); render(); });
  shell.aoClicarEm("[data-seg]", (el) => {
    const nome = el.dataset.seg!, v = el.dataset.v!;
    if (nome === "fonte") {
      const { estado: n, descartados } = trocarFonte(estado, v as Fonte);
      aviso(descartados.length ? `${descartados.join(", ")} não se aplica a ${v.toUpperCase()} — filtro removido.` : "");
      return mudar(() => n);
    }
    aviso("");
    mudar((e) => ({ ...e, [nome]: v, drill: nome === "dim" ? [] : e.drill }));
  });

  const aoMarcar = (ev: Event) => {
    const alvo = ev.target as HTMLInputElement;
    const dim = alvo.dataset?.chipOp;
    if (!dim) return;
    const marcados = Array.from(shell.raiz.querySelectorAll<HTMLInputElement>(`input[data-chip-op="${dim}"]:checked`)).map((i) => i.value);
    mudar((e) => definirFiltro(e, dim, marcados));
  };
  shell.raiz.addEventListener("change", aoMarcar);
  shell.aoDestruir(() => shell.raiz.removeEventListener("change", aoMarcar));
  shell.aoRedimensionar(render);

  render();
  return { destruir: () => shell.destruir() };
}
