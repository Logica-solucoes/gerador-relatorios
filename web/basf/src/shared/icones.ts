/** Tabler outline, traço 2, só os glifos usados. Um set, um peso (UI stack). */
const svg = (d: string) =>
  `<svg class="bmd-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONE = {
  voltar: svg('<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>'),
  fechar: svg('<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>'),
  mais: svg('<path d="M12 5l0 14"/><path d="M5 12l14 0"/>'),
  abrir: svg('<path d="M9 6l6 6l-6 6"/>'),
  aberto: svg('<path d="M6 9l6 6l6 -6"/>'),
  repetir: svg('<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>'),
} as const;
