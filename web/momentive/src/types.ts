/**
 * Contrato de dados do dashboard de exportação da Momentive.
 *
 * Este arquivo é a interface entre o gerador (hoje a planilha, depois o programa Python)
 * e a tela. Mudou coluna na origem? Muda aqui primeiro — o `tsc` acusa o resto.
 *
 * Regra de ouro: o dashboard **não** recalcula nem conserta dado. `estufagemH`, `cicloDias`
 * e `ajuste` chegam prontos do gerador. Um ciclo negativo que vaze para cá vira gráfico
 * negativo, exatamente como aconteceu no dashboard da Polaris.
 */

export type Modal = "FCL" | "LCL";

/** Nome de cada etapa do ciclo, na ordem em que acontecem. */
export type Etapa = "espera" | "estufagem" | "transito";

export interface EtapasCiclo {
  /** Retirada do vazio até chegar no cliente — container parado ou a caminho. */
  espera: number;
  /** Chegada até a saída do cliente. É `estufagemH` convertido para dias. */
  estufagem: number;
  /** Saída do cliente até a entrega no terminal. */
  transito: number;
}

export interface Embarque {
  /** `id_programacao` na planilha. */
  id: number;
  /** Número do CT-e. */
  cte: number;
  modal: Modal;
  /** Referência do embarque, ex. `EXP 240-241/2026`. Usada como rótulo nos gráficos. */
  ref: string;
  /** Número da reserva junto ao armador (booking). */
  reserva: string;
  /** Peso bruto em quilos. */
  peso: number;
  /** Carga perigosa (coluna `IMO` = `S`). */
  imo: boolean;

  /** Identificação do container. `null` em LCL — a carga é consolidada. */
  container: string | null;
  /** Tipo de equipamento (`20 DRY`, `40 HC`, ...). `null` em LCL. */
  tipo: string | null;
  /** Quantidade de volumes. `null` em FCL — lá a unidade é o container. */
  volumes: number | null;

  /** Retirada do container vazio, `YYYY-MM-DD`. `null` em LCL. */
  vazio: string | null;
  /** Data de carregamento, `YYYY-MM-DD`. */
  carregamento: string;
  /** Chegada no cliente, ISO com hora — início da estufagem. */
  chegada: string;
  /** Saída do cliente, ISO com hora — fim da estufagem. */
  saida: string;
  /** Entrega no terminal, ISO com hora. */
  terminal: string;
  /** Notas fiscais, separadas por vírgula. */
  nf: string;

  /** Horas decimais entre `chegada` e `saida`. Sempre > 0. */
  estufagemH: number;
  /** Dias corridos entre `vazio` e `terminal`. `null` em LCL, onde a métrica não existe. */
  cicloDias: number | null;

  /**
   * Onde o tempo do ciclo foi gasto, em dias. Somam `cicloDias` por construção.
   * `null` em LCL. O gerador garante que as três são positivas.
   *
   * Na base de jan–jul/2026 a estufagem é **2,5%** do ciclo: 56,7% é espera do
   * container e 40,8% é trânsito ao terminal. É esse contraste que o gráfico
   * de etapas existe para mostrar — não remova a decomposição achando que a
   * barra sólida já dizia a mesma coisa.
   */
  etapas: EtapasCiclo | null;

  /**
   * Preenchido quando o gerador corrigiu uma data obviamente errada na origem.
   * O texto explica o que foi ajustado e aparece na tabela e no rodapé da tela.
   * `null` no caso normal.
   */
  ajuste: string | null;
}

/** Recorte ativo no filtro de modal. */
export type Filtro = Modal | "TODOS";
