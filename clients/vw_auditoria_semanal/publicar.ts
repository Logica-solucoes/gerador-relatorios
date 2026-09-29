import { janela, semanaPassada } from "./queries.ts";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Campos = { titulo: string; referencia: string };

/** Padrão do que já foi publicado à mão no portal. `fim` é o domingo da semana lida. */
export function campos(fim: Date): Campos {
  return {
    titulo: `Relatório Semanal Auditoria - Semana ${Math.ceil(fim.getUTCDate() / 7)}`,
    referencia: `${MESES[fim.getUTCMonth()]}/${fim.getUTCFullYear()}`,
  };
}

export const jaPublicado = (lista: Campos[], c: Campos) =>
  lista.some((r) => r.titulo === c.titulo && r.referencia === c.referencia);

/** Sem default, mesma regra do banco: publicar no portal errado em silêncio é pior que falhar. */
function env(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não definida (clients/vw_auditoria_semanal/.env)`);
  return v;
}

/** O portal devolve erro com HTTP 200 e `status: 1` — o código HTTP sozinho não serve. */
async function portal(path: string, init: RequestInit = {}) {
  const r = await fetch(env("PORTAL_URL").replace(/\/$/, "") + path, init);
  const body = (await r.json().catch(() => null)) as { status: number; data: any; error: string | null } | null;
  if (!r.ok || body?.status !== 0) throw new Error(`portal ${path}: HTTP ${r.status} ${body?.error ?? ""}`.trim());
  return body.data;
}

export async function publicar(pdf: string) {
  const c = campos(janela(semanaPassada()).fim);
  if (c.titulo.length > 50 || c.referencia.length > 30) throw new Error(`campo longo demais para o portal: ${JSON.stringify(c)}`);

  const login = new FormData();
  login.append("login", env("PORTAL_LOGIN"));
  login.append("password", env("PORTAL_SENHA"));
  const { accessToken } = await portal("/api/login", { method: "POST", body: login });
  if (!accessToken) throw new Error("portal /api/login: sem accessToken na resposta");
  // O portal hoje aceita sem token; manda mesmo assim para não quebrar quando a autorização voltar.
  const headers = { Authorization: `Bearer ${accessToken}` };

  if (jaPublicado(await portal("/api/relatorio", { headers }), c)) {
    console.log(`· já publicado: ${c.titulo} · ${c.referencia}`);
    return;
  }

  const form = new FormData();
  form.append("titulo", c.titulo);
  form.append("assunto", "Auditoria");
  form.append("referencia", c.referencia);
  form.append("arquivo", Bun.file(pdf), "relatorio.pdf");
  form.append("arquivoMimeType", "application/pdf");
  await portal("/api/relatorio", { method: "POST", headers, body: form });
  console.log(`✓ publicado: ${c.titulo} · ${c.referencia}`);
}
