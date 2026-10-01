/**
 * Plumbing de montagem dos dashboards BFM.
 *
 * O shell não sabe nada de domínio: recebe um gabarito HTML, hospeda, resolve
 * `data-el`, desenha Plot com a largura MEDIDA do container e limpa tudo no fim.
 * Quem sabe de embarque, nota fiscal ou container é o dashboard.
 */

import * as Plot from "@observablehq/plot";
import { estadoVazio } from "./blocos";
import type { FiltroDescrito } from "./filtros";
import { ESTILO_PLOT, LARGURA_COMPACTA } from "./tema";

/** Contrato de todo dashboard BFM, consumido pelo view-model Aurelia. */
export interface Dashboard<T> {
  /** Redesenha com outro conjunto de dados, preservando os filtros ativos. */
  atualizar(dados: T[]): void;
  /** Remove listeners e limpa o hospedeiro. Chame no `detached` do Aurelia. */
  destruir(): void;
  /** Recorte e números atuais — é daqui que o PDF e o XLSX leem. */
  estado(): EstadoDash<T>;
}

export interface EstadoDash<T> {
  /** Linhas visíveis depois dos filtros, na ordem da tabela. */
  recorte: T[];
  /** Recorte por extenso, na ordem da barra ("Cliente: Todos", "Estado: SP, RJ
   *  e mais 3"). Vai no painel de filtros do relatório PDF. */
  filtros: FiltroDescrito[];
  /** `CardKpi.id` → valor já formatado. Chaveado pelo id, NUNCA pelo rótulo
   *  visível: o PDF lê daqui e um ajuste de texto na tela não pode esvaziar
   *  um campo do relatório em silêncio. */
  kpis: Record<string, string>;
  /** Nome lógico → SVG desenhado, ou `null` se aquele gráfico está em estado vazio. */
  graficos: Record<string, SVGSVGElement | null>;
  /** Seções de gráfico na ordem da tela, com o MESMO texto de apoio que o
   *  `<h2>`/`<p>` mostram. O relatório PDF repete a narrativa da tela; sem isto
   *  ele teria gráfico sem nada que diga o que aquilo é. `grafico` é a chave em
   *  `graficos` — não o SVG, para o estado continuar sendo dado e não DOM
   *  duplicado. Opcional: o momentive não exporta PDF. */
  secoes?: { titulo: string; descricao: string; grafico: string }[];
  /** Recorte temporal da BASE INTEIRA (não do filtro), texto corrido — o mesmo
   *  que o hero mostra sob o título. Vai no canto direito do cabeçalho do PDF. */
  periodo?: string;
}

export interface Shell {
  readonly raiz: HTMLElement;
  el<T extends HTMLElement = HTMLElement>(nome: string): T;
  /** Mede o container e desenha; Plot precisa de largura explícita. */
  desenhar(nome: string, spec: Plot.PlotOptions): void;
  /** Troca o alvo por um estado vazio. `texto` aceita `<b>`. */
  vazio(nome: string, titulo: string, texto: string): void;
  /** SVG atualmente desenhado no alvo, ou `null` (estado vazio / nunca desenhado). */
  svg(nome: string): SVGSVGElement | null;
  /** Pouco espaço horizontal. Lê a largura do CONTAINER, não do viewport. */
  compacto(): boolean;
  /** Largura MEDIDA do container, em px. Para decisões que `compacto()` (um
   *  booleano) não resolve — ex.: cabe rótulo dentro de cada barra, dado
   *  quantas barras o recorte tem? Cai no padrão quando ainda não foi medido
   *  (clientWidth 0 no jsdom e no primeiro paint). */
  largura(): number;
  /** Chamado quando a LARGURA do container muda (debounce de 140 ms). */
  aoRedimensionar(cb: () => void): void;
  /**
   * Clique delegado na raiz, com limpeza automática no `destruir`.
   * Delegado e não preso no elemento: os renders trocam o `innerHTML` inteiro,
   * e um listener preso na linha da tabela ou no botão de voltar morreria junto
   * com o nó. Um listener, montado uma vez, removido uma vez.
   */
  aoClicarEm(seletor: string, cb: (alvo: HTMLElement) => void): void;
  /** Empilha limpeza a ser executada no `destruir`. */
  aoDestruir(cb: () => void): void;
  destruir(): void;
}

/** Largura mínima passada ao Plot. Sem isso o jsdom (clientWidth 0) gera SVG degenerado. */
const LARGURA_MINIMA = 320;
const LARGURA_PADRAO = 640;

/**
 * Largura do primeiro ancestral com layout real, subindo a partir de `el`.
 *
 * O dashboard inteiro nasce dentro do `<loader-component>` global do portal
 * (`app.html`), que o esconde com `display:none` (classe `aurelia-hide` do
 * Aurelia) enquanto o job de carregamento roda — e é dentro desse job que o
 * `montarDashboard()` monta o shell e desenha os gráficos pela primeira vez.
 * `clientWidth` de QUALQUER elemento dentro de uma árvore `display:none` é 0,
 * sem exceção — não tem trick de CSS local que resolva isso.
 *
 * Sem isto, o primeiro desenho caía no fallback `LARGURA_PADRAO` (640), e
 * assim que o loader revelava a tela o `ResizeObserver` (abaixo) detectava a
 * largura real e redesenhava — o gráfico "pulava" de tamanho na frente do
 * usuário. Subindo a árvore a partir do host até achar um ancestral que JÁ
 * está fora do `display:none` (ex.: o `<main>` do portal, sempre visível),
 * a largura que a gente mede é a mesma que o container vai ter quando for
 * revelado — o primeiro desenho já sai correto e o resize nunca dispara.
 */
function medir(el: HTMLElement): number {
  let atual: HTMLElement | null = el;
  while (atual) {
    if (atual.clientWidth > 0) return atual.clientWidth;
    atual = atual.parentElement;
  }
  return LARGURA_PADRAO;
}

export function criarShell(hospedeiro: HTMLElement, gabarito: string): Shell {
  const raiz = document.createElement("div");
  raiz.className = "bmd";
  raiz.innerHTML = gabarito;
  hospedeiro.replaceChildren(raiz);

  const limpezas: (() => void)[] = [];

  const el = <T extends HTMLElement = HTMLElement>(nome: string) =>
    raiz.querySelector(`[data-el="${nome}"]`) as T;

  /* Lido da LARGURA DO CONTAINER, não do viewport: o mesmo componente pode nascer
     num painel estreito do Aurelia em tela cheia de desktop. "Compacto" aqui é
     "pouco espaço", não "é celular". */
  const compacto = () => { const l = medir(raiz); return l > 0 && l < LARGURA_COMPACTA; };
  const largura = () => medir(raiz);

  function desenhar(nome: string, spec: Plot.PlotOptions): void {
    const alvo = el(nome);
    alvo.replaceChildren();
    const largura = Math.max(medir(alvo), LARGURA_MINIMA);
    alvo.append(Plot.plot({ ...ESTILO_PLOT, ...spec, width: largura }) as Node);
  }

  function vazio(nome: string, titulo: string, texto: string): void {
    el(nome).innerHTML = estadoVazio(titulo, texto);
  }

  function svg(nome: string): SVGSVGElement | null {
    return el(nome)?.querySelector("svg") ?? null;
  }

  /* ResizeObserver e não `resize` do window: o que decide o layout é a largura do
     CONTAINER, e ela muda sem o viewport mudar (menu lateral do portal abrindo).
     Compara a largura para não entrar em laço — redesenhar muda a ALTURA do
     conteúdo, e altura sozinha não deve disparar nada. */
  const aoRedimensionar = (cb: () => void) => {
    // `medir`, não `raiz.clientWidth`: nasce igual ao que o primeiro desenho já
    // usou. Se começasse em 0 (raiz ainda escondida atrás do loader), a
    // primeira leitura real do ResizeObserver ao revelar bateria diferente daqui
    // e disparava um redesenho redundante — o mesmo pulo que `medir` evita lá em cima.
    let larguraAnterior = Math.round(medir(raiz));
    // A PRIMEIRA correção pula o debounce: se `medir()` ainda assim errou o
    // palpite (ex.: `raiz` tinha padding/margem que o ancestral medido não
    // tinha), essa é a correção do erro do primeiro desenho — quanto mais
    // rápida, menos perceptível o "pulo". O debounce de 140 ms é para
    // redimensionamento de verdade depois (sidenav abrindo, janela mudando),
    // não para essa correção de largada.
    let primeira = true;
    let debounce: ReturnType<typeof setTimeout>;

    const observador = new ResizeObserver(() => {
      const largura = Math.round(raiz.clientWidth);
      /* Largura 0 é a raiz ESCONDIDA (o `<loader-component>` do portal ainda
         com `display:none`), não um container que encolheu. Sem esta guarda o
         observer disparava duas vezes de graça em toda montagem — some ao
         esconder, volta ao revelar — e cada uma redesenhava o dashboard
         inteiro, tabela e gráficos, antes da tela sequer aparecer. */
      if (largura === 0 || largura === larguraAnterior) return;

      larguraAnterior = largura;
      clearTimeout(debounce);
      debounce = setTimeout(cb, primeira ? 0 : 140);
      primeira = false;
    });
    observador.observe(raiz);

    limpezas.push(() => {
      observador.disconnect();
      clearTimeout(debounce);
    });
  };

  function aoClicarEm(seletor: string, cb: (alvo: HTMLElement) => void): void {
    const handler = (ev: Event) => {
      const alvo = (ev.target as HTMLElement | null)?.closest<HTMLElement>(seletor);
      if (alvo) cb(alvo);
    };
    raiz.addEventListener("click", handler);
    limpezas.push(() => raiz.removeEventListener("click", handler));
  }

  return {
    raiz,
    el,
    desenhar,
    vazio,
    svg,
    compacto,
    largura,
    aoRedimensionar,
    aoClicarEm,
    aoDestruir: (cb) => limpezas.push(cb),
    destruir() {
      // Ao contrário, para que quem registrou por último desmonte primeiro.
      for (let i = limpezas.length - 1; i >= 0; i--) limpezas[i]!();
      limpezas.length = 0;
      hospedeiro.replaceChildren();
    },
  };
}
