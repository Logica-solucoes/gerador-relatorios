/**
 * Controles de filtro dos dashboards BFM.
 *
 * Hoje só `busca`: <input> com lista de sugestões própria, vanilla de propósito
 * (o `md-lookup` do Materialize traz o CSS do portal para dentro da área
 * escopada `.bmd` e o visual quebra). Os filtros por chip ficam em `componentes.ts`.
 */

import { esc } from "./formato";

export interface Controle<T> {
  readonly el: HTMLElement;
  /** Rótulo visível do campo. O relatório PDF escreve "Cliente: Todos" a partir
   *  daqui — sem ele, o painel de recorte só teria a chave interna do controle. */
  readonly rotulo: string;
  valor(): T;
  /** Valor atual em texto, para o cabeçalho do PDF. Nunca string vazia. */
  descricao(): string;
  /** Zera SEM disparar `aoMudar` — quem limpa redesenha uma vez só no fim. */
  limpar(): void;
}

/** Um campo da barra por extenso: é o que o relatório PDF imprime. */
export interface FiltroDescrito {
  rotulo: string;
  valor: string;
}

let seq = 0;
/** ids únicos: dois dashboards podem coexistir no DOM durante a troca de rota. */
const novoId = (prefixo: string) => `bmd-${prefixo}-${++seq}`;

function envelope(rotulo: string, conteudo: HTMLElement): HTMLElement {
  const div = document.createElement("div");
  div.className = "bmd-filtro";
  div.setAttribute("data-rotulo", rotulo);
  div.append(conteudo);
  return div;
}

/* ── busca com sugestões ───────────────────────────────────────────────────
   Era `<input list>` + `<datalist>`. O comportamento estava certo, o visual não:
   o popup do datalist é chrome do NAVEGADOR, não conteúdo da página. No
   Chrome/Windows sai um painel preto de sistema, com fonte e espaçamento
   próprios, encostado num multiselect branco de 8px de raio — e nenhuma
   propriedade CSS o alcança. A única saída é desenhar a lista.

   Continua sem lib nova: um `<div role="listbox">` reusando `.bmd-ms__lista`,
   a mesma folha do multiselect, para os dois popups da barra serem a mesma
   coisa. O teclado (↑ ↓ Enter Esc) está implementado aqui porque era o que o
   nativo dava de graça, e trocar de visual não pode custar acesso por teclado. */

/** Sugestões mostradas por vez. Teto alto de propósito: o campo abre com a
 *  lista INTEIRA e o usuário estreita digitando — com 8 itens ele não conseguia
 *  navegar a lista, só adivinhar. A caixa rola (`max-height` no CSS). O teto
 *  continua existindo porque a base de notas fiscais tem milhares de valores
 *  distintos e montar milhares de nós a cada tecla trava o campo. */
const MAX_SUGESTOES = 200;

/** Casa "sao paulo" com "São Paulo". A base vem acentuada e quem filtra digita
 *  sem acento — sem isto o campo parece quebrado para metade das cidades.
 *
 *  Exportado porque o casamento do texto mora em quem filtra, não aqui: o
 *  `busca()` só devolve o que foi digitado, e cada dashboard decide se compara
 *  por igualdade (Polaris) ou por trecho (Momentive). Os dois precisam
 *  normalizar do mesmo jeito que a lista de sugestões. */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function busca(rotulo: string, opcoes: string[], aoMudar: () => void): Controle<string> {
  const id = novoId("sug");

  const input = document.createElement("input");
  input.type = "text";
  // `browser-default` é a escape hatch oficial do Materialize: sem ela o
  // seletor global `input[type=text]:not(.browser-default)` do portal (mais
  // específico que `.bmd-busca`) sobrescreve borda/altura do campo.
  input.className = "bmd-busca browser-default";
  input.placeholder = rotulo;
  // Sem isto o autofill do navegador abre o painel DELE por cima do nosso.
  input.autocomplete = "off";
  input.setAttribute("aria-label", rotulo);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", id);

  const lista = document.createElement("div");
  lista.id = id;
  lista.className = "bmd-ms__lista bmd-sug";
  lista.setAttribute("role", "listbox");
  lista.setAttribute("aria-label", rotulo);
  lista.hidden = true;

  const caixa = document.createElement("div");
  caixa.className = "bmd-busca__wrap";
  caixa.append(input, lista);

  /** O que está na lista agora — recortado por `MAX_SUGESTOES`. */
  let visiveis: string[] = [];
  /** Índice sob as setas do teclado; -1 = nenhum, e aí Enter cai no texto livre. */
  let marcado = -1;

  // Pelo seletor e não por `children`: a lista também carrega linhas de aviso
  // ("Nenhum resultado", "e mais N"), que as setas do teclado não devem marcar.
  const itens = () => Array.from(lista.querySelectorAll<HTMLElement>(".bmd-sug__i"));

  function fechar(): void {
    lista.hidden = true;
    input.setAttribute("aria-expanded", "false");
    marcado = -1;
  }

  /** `foco = true`: ignora o texto atual e mostra a lista inteira. É o caso do
   *  clique/Tab num campo que já tem uma opção escolhida — filtrando pelo valor
   *  atual a única opção que casa é ela mesma, e a lista "trava" nela até o
   *  usuário apagar o texto para enxergar as outras. Digitação continua
   *  filtrando normalmente (`input` chama com `foco = false`). */
  function abrir(foco = false): void {
    const alvo = foco ? "" : normalizar(input.value.trim());
    const casaram = opcoes.filter((o) => normalizar(o).includes(alvo));
    visiveis = casaram.slice(0, MAX_SUGESTOES);
    const restante = casaram.length - visiveis.length;

    /* A lista NÃO fecha mais quando nada casa. Fechando, o campo ficava sem
       resposta nenhuma no meio da digitação — indistinguível de quebrado, e
       reabrir exigia apagar tudo. Aberta e vazia, ela diz qual é o problema. */
    lista.innerHTML =
      (visiveis.length
        ? visiveis
          .map((o) => `<div class="bmd-sug__i" role="option" aria-selected="false">${esc(o)}</div>`)
          .join("")
        : `<div class="bmd-sug__nota">Nenhum resultado</div>`)
      + (restante > 0
        ? `<div class="bmd-sug__nota">e mais ${restante} — continue digitando</div>`
        : "");

    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    marcado = -1;
  }

  function marcar(i: number): void {
    const its = itens();
    if (!its.length) return;

    // Circular: descer no último volta ao primeiro, que é o que o datalist fazia.
    marcado = (i + its.length) % its.length;
    its.forEach((el, k) => {
      el.classList.toggle("is-marcado", k === marcado);
      el.setAttribute("aria-selected", String(k === marcado));
    });
    // jsdom não implementa scrollIntoView e o teste do teclado quebraria nele.
    its[marcado]!.scrollIntoView?.({ block: "nearest" });
  }

  function escolher(texto: string): void {
    input.value = texto;
    input.classList.toggle("is-ativo", texto.trim().length > 0);
    fechar();
    aoMudar();
  }

  /* Digitar só ABRE/filtra a lista — não redesenha o dashboard. Com `aoMudar`
     no `input` o dash reagregaria a base inteira a cada tecla. Quem dispara o
     redesenho é a escolha de um item ou o `change` (Enter/blur), exatamente
     como era com o datalist. */
  // Seleciona o texto junto: digitar por cima substitui a opção escolhida sem
  // precisar apagar antes — o mesmo comportamento que um <select> nativo dá de graça.
  const abrirTudo = () => { abrir(true); input.select(); };

  input.addEventListener("input", () => abrir());
  input.addEventListener("focus", abrirTudo);
  // O navegador só dispara `focus` na TROCA de foco — clicar de novo num campo
  // que já está focado (lista fechada por Esc, por ter escolhido um item, ou
  // por ter clicado fora e voltado no mesmo gesto) não gera um novo `focus`,
  // e a lista ficava travada fechada até um blur seguido de refoco de verdade.
  input.addEventListener("click", () => { if (lista.hidden) abrirTudo(); });

  input.addEventListener("change", () => {
    input.classList.toggle("is-ativo", input.value.trim().length > 0);
    aoMudar();
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();                       // não move o cursor no texto
      if (lista.hidden) return abrir();
      return marcar(marcado + (ev.key === "ArrowDown" ? 1 : -1));
    }

    // Só engole o Enter quando há item marcado. Sem marcação ele precisa seguir
    // para o `change` e filtrar pelo texto livre — buscar por um pedaço de nome
    // que não está na lista é uso legítimo do campo.
    if (ev.key === "Enter" && !lista.hidden && marcado >= 0) {
      ev.preventDefault();
      return escolher(visiveis[marcado]!);
    }

    if (ev.key === "Escape" && !lista.hidden) {
      // Para no popup: sem isto o Esc fecharia junto o modal/rota por baixo.
      ev.stopPropagation();
      fechar();
    }
  });

  /* `mousedown` e não `click`: o click só chega DEPOIS do blur do input, e o
     blur já teria fechado a lista — o item sumiria de baixo do cursor e o
     clique cairia no vazio. O `preventDefault` segura o foco no campo. */
  lista.addEventListener("mousedown", (ev) => {
    const alvo = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".bmd-sug__i");
    if (!alvo) return;
    ev.preventDefault();
    escolher(alvo.textContent ?? "");
  });

  input.addEventListener("blur", fechar);

  return {
    el: envelope(rotulo, caixa),
    rotulo,
    valor: () => input.value.trim(),
    descricao: () => input.value.trim() || "Todos",
    limpar() {
      input.value = "";
      input.classList.remove("is-ativo");
      fechar();
    },
  };
}
