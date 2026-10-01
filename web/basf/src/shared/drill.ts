/**
 * Drilldown dos gráficos dos dashboards BFM.
 *
 * Substitui o `IDashboardDrilldownPlugin` do `au-chart`. O mecanismo é o do
 * próprio Plot: o transform `pointer` publica o dado sob o cursor em
 * `figure.value` e um `click` no figure lê esse valor. Não há query em `<rect>`
 * por índice — isso quebraria se o Plot mudasse a ordem de render das marcas.
 *
 * O estado é só isto: o CAMINHO de chaves escolhido até aqui. Quem sabe filtrar
 * os dados por esse caminho é o dashboard.
 */

import { esc } from "./formato";
import { ICONE } from "./icones";

export interface Drill<K> {
  /** 0 = raiz. */
  nivel(): number;
  /** Chave escolhida no nível anterior, ou `null` na raiz. */
  chave(): K | null;
  /** Caminho inteiro: `chaves()[i]` é a escolha feita no nível `i`. Em drill de
   *  3+ níveis é o que o filtro precisa — só a última chave não identifica o
   *  recorte (o dia "04" existe em todo mês de todo ano). */
  chaves(): K[];
  podeVoltar(): boolean;
  /** Desce um nível e redesenha. Sem efeito se já está no último. */
  descer(chave: K): void;
  /** Sobe um nível e redesenha. Sem efeito na raiz. */
  voltar(): void;
  /** Volta à raiz SEM redesenhar — quem chama já vai redesenhar. */
  reset(): void;
  /** "Ano" na raiz, "Mês · 2026" depois de descer. Vai no subtítulo da seção. */
  titulo(): string;
  /** Botão "voltar" em HTML, ou string vazia na raiz. */
  htmlVoltar(): string;
}

/** `rotulos[i]` é o nome do nível `i`. O comprimento define a profundidade máxima. */
export function criarDrill<K>(rotulos: string[], redesenhar: () => void): Drill<K> {
  /** Pilha, não uma chave só: descer empilha, voltar desempilha. Com uma chave
   *  única o `voltar` do 3º nível zerava a escolha do 1º junto e o nível
   *  intermediário ficava sem recorte nenhum ("Sem programações neste recorte"). */
  const chaves: K[] = [];
  const ultima = () => (chaves.length ? chaves[chaves.length - 1]! : null);

  return {
    nivel: () => chaves.length,
    chave: ultima,
    chaves: () => [...chaves],
    podeVoltar: () => chaves.length > 0,
    descer(k) {
      // `ligarClique` pode publicar `undefined` (ex.: clique num grupo vazio).
      // Sem esta guarda o nível desceria com uma chave inválida e o filtro do
      // dashboard (`e.uf === undefined`) nunca bateria com nenhum registro.
      if (k == null) return;
      if (chaves.length >= rotulos.length - 1) return;
      chaves.push(k);
      redesenhar();
    },
    voltar() {
      if (chaves.length === 0) return;
      chaves.pop();
      redesenhar();
    },
    reset() {
      chaves.length = 0;
    },
    titulo: () => {
      const k = ultima();
      return k == null ? rotulos[0]! : `${rotulos[chaves.length]} · ${String(k)}`;
    },
    htmlVoltar: () =>
      chaves.length === 0
        ? ""
        : `<button type="button" class="bmd-voltar" data-el-voltar>${ICONE.voltar}Voltar para ${esc(rotulos[chaves.length - 1]!)}</button>`,
  };
}

/* ── ponteiro sobrevivendo ao redesenho ───────────────────────────────────────
   O `Plot.pointer` só publica em `figure.value` quando RECEBE um `pointermove`,
   e cada redesenho troca o SVG por um nó novo, que nasce sem valor nenhum.
   Com o cursor parado sobre uma barra — exatamente o que acontece ao voltar do
   drill, já que o botão fica logo acima do gráfico — nenhum evento novo chega:
   o gráfico ficava "morto" (sem hover, clique sem efeito) até o usuário mexer o
   mouse de propósito. Guardamos a última posição e reencenamos o `pointermove`
   no SVG recém-desenhado. */
let ponteiroX = NaN;
let ponteiroY = NaN;
let rastreando = false;

function rastrearPonteiro(): void {
  if (rastreando || typeof document === "undefined") return;
  rastreando = true;
  document.addEventListener("pointermove", (ev) => {
    ponteiroX = ev.clientX;
    ponteiroY = ev.clientY;
  }, { passive: true, capture: true });
}

function reencenarPonteiro(figura: SVGSVGElement): void {
  if (Number.isNaN(ponteiroX) || typeof PointerEvent === "undefined") return;
  // Só se o cursor estiver mesmo sobre este gráfico: fora dele o `Plot.pointer`
  // ainda casaria a marca mais próxima dentro do raio dele e o gráfico
  // "acenderia" sozinho sem o mouse estar em cima.
  const r = figura.getBoundingClientRect();
  if (ponteiroX < r.left || ponteiroX > r.right || ponteiroY < r.top || ponteiroY > r.bottom) return;

  figura.dispatchEvent(new PointerEvent("pointermove", {
    clientX: ponteiroX, clientY: ponteiroY, pointerType: "mouse", bubbles: true,
  }));
}

/** O `click` do figure lê o dado que o `Plot.pointer` publicou em `value`. */
export function ligarClique<T>(figura: SVGSVGElement, aoClicar: (d: T) => void): void {
  rastrearPonteiro();
  reencenarPonteiro(figura);

  figura.addEventListener("click", () => {
    const raw = (figura as SVGSVGElement & { value?: unknown }).value;
    // Com `Plot.groupX`, o `reduceData` padrão (`reduceIdentity`) publica em
    // `value` um ARRAY com os itens do grupo — não o objeto único que os
    // dashboards esperam. Sem isso `p.chave` vinha `undefined` e o drill
    // descia com chave inválida (ver `descer`).
    const d = (Array.isArray(raw) ? raw[0] : raw) as T | null | undefined;
    // `null`/`undefined` é clique no fundo do gráfico, fora de qualquer marca.
    if (d != null) aoClicar(d);
  });
}
