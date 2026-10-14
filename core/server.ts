import { existsSync } from "node:fs";
import { gravar, limpar, novoId, resumir, textoResumo } from "./log";

type Saida = { exitCode: number; saida: string };
type Rodar = (client: string, hoje?: string) => Promise<Saida>;

/**
 * Cada execução é um processo com o .env só daquele cliente: o servidor não
 * carrega credencial de banco/portal de ninguém, e um cliente nunca vê a de outro.
 */
async function rodarBuild(client: string, hoje?: string): Promise<Saida> {
  const env: Record<string, string> = { CLIENT: client };
  for (const k of ["PATH", "HOME", "XDG_CACHE_HOME", "TZ"]) if (process.env[k]) env[k] = process.env[k]!;
  if (hoje) env.HOJE = hoje;
  const p = Bun.spawn(["bun", `--env-file=env/${client}.env`, "run", "core/build.ts", "--publicar"], {
    env, stdout: "pipe", stderr: "pipe", timeout: 5 * 60_000,
  });
  const [out, err, exitCode] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { exitCode, saida: (out + err).trim() };
}

export function app(token: string, rodar: Rodar = rodarBuild, dirLog = "out/logs") {
  const rodando = new Set<string>(); // ponytail: lock em memória, basta com uma réplica
  return async (req: Request) => {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/saude") return new Response("ok");

    const m = url.pathname.match(/^\/gerar\/([\w-]+)$/);
    if (req.method !== "POST" || !m) return new Response("não encontrado", { status: 404 });
    if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response("não autorizado", { status: 401 });

    const client = m[1]!;
    if (!existsSync(`clients/${client}`) || !existsSync(`env/${client}.env`))
      return Response.json({ ok: false, resumo: `cliente sem pasta ou sem env: ${client}` }, { status: 404 });

    const hoje: string | undefined = ((await req.json().catch(() => null)) as any)?.hoje;
    // toJSON: o Date aceita 2026-02-31 e vira 03/03 — publicaria a semana errada.
    if (hoje !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(hoje) && new Date(hoje + "T12:00:00Z").toJSON()?.startsWith(hoje)))
      return Response.json({ ok: false, resumo: `hoje inválido: ${hoje}` }, { status: 400 });

    if (rodando.has(client)) return Response.json({ ok: false, resumo: "já em execução" }, { status: 409 });
    rodando.add(client);
    try {
      const inicio = new Date();
      const { exitCode, saida } = await rodar(client, hoje);
      const duracaoMs = Date.now() - inicio.getTime();
      const id = novoId(inicio);
      const r = resumir(saida, exitCode);
      let arquivo = "(não gravado)";
      // Log que não grava não pode virar falha: o PDF pode já estar publicado.
      try {
        arquivo = gravar(dirLog, inicio, {
          id, cliente: client, hoje: hoje ?? null, semana: r.semana ?? null,
          exitCode, duracaoMs, etapa: r.etapa ?? null, erro: r.erro ?? null, saida,
        }, exitCode !== 0);
        limpar(dirLog, inicio);
      } catch (e) {
        console.error(`[${client}] ${id} log não gravado: ${e}`);
      }
      console.log(`[${client}] ${id} exit ${exitCode}${r.erro ? ` — ${r.erro}` : ""}`);
      const resumo = textoResumo({ cliente: client, id, arquivo, duracaoMs, exitCode, resumo: r });
      return Response.json({ ok: exitCode === 0, id, resumo }, { status: exitCode === 0 ? 200 : 500 });
    } finally {
      rodando.delete(client);
    }
  };
}

if (import.meta.main) {
  const token = process.env.GERADOR_TOKEN;
  if (!token) throw new Error("GERADOR_TOKEN não definida");
  // idleTimeout 0: o padrão (10s) derruba a conexão antes do PDF ficar pronto.
  Bun.serve({ port: 3000, idleTimeout: 0, fetch: app(token) });
  console.log("→ gerador ouvindo em :3000");
}
