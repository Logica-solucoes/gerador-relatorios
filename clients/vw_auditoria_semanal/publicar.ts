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

/** `POST /api/relatorio` responde `{ status: 0, data: { id: 10 } }`. */
export const extrairId = (data: any): string | undefined => (data?.id != null ? String(data.id) : undefined);

/** Sem default, mesma regra do banco: publicar no portal errado em silêncio é pior que falhar. */
function env(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} não definida (clients/vw_auditoria_semanal/.env)`);
  return v;
}

/** O portal devolve erro com HTTP 200 e `status: 1` — o código HTTP sozinho não serve. */
async function portal(path: string, init: RequestInit = {}) {
  const r = await fetch(env("PORTAL_URL").replace(/\/$/, "") + path, init);
  // Os ids são snowflake (~4e17), acima de 2^53: no JSON.parse perdem os últimos dígitos. Vira string antes.
  const texto = (await r.text()).replace(/"id"\s*:\s*(\d{16,})/g, '"id":"$1"');
  const body = (() => { try { return JSON.parse(texto); } catch { return null; } })() as { status: number; data: any; error: string | null } | null;
  if (!r.ok || body?.status !== 0) throw new Error(`portal ${path}: HTTP ${r.status} ${body?.error ?? ""}`.trim());
  return body.data;
}

/** Devolve o id do relatório no portal; o build o imprime em `relatorio_id:` para o servidor repassar ao n8n. */
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

  const lista = await portal("/api/relatorio", { headers });
  if (jaPublicado(lista, c)) {
    console.log(`· já publicado: ${c.titulo} · ${c.referencia}`);
    return extrairId(lista.find((r: Campos) => r.titulo === c.titulo && r.referencia === c.referencia));
  }

  const form = new FormData();
  form.append("titulo", c.titulo);
  form.append("assunto", "Auditoria");
  form.append("referencia", c.referencia);
  form.append("arquivo", Bun.file(pdf), "relatorio.pdf");
  form.append("arquivoMimeType", "application/pdf");
  const id = extrairId(await portal("/api/relatorio", { method: "POST", headers, body: form }));
  console.log(`✓ publicado: ${c.titulo} · ${c.referencia}${id ? ` · id ${id}` : ""}`);
  return id;
}
