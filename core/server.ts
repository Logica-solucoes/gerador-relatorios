import { existsSync } from "node:fs";

type Resultado = { ok: boolean; log: string };
type Rodar = (client: string, hoje?: string) => Promise<Resultado>;

/**
 * Cada execução é um processo com o .env só daquele cliente: o servidor não
 * carrega credencial de banco/portal de ninguém, e um cliente nunca vê a de outro.
 */
async function rodarBuild(client: string, hoje?: string): Promise<Resultado> {
  const env: Record<string, string> = { CLIENT: client };
  for (const k of ["PATH", "HOME", "XDG_CACHE_HOME", "TZ"]) if (process.env[k]) env[k] = process.env[k]!;
  if (hoje) env.HOJE = hoje;
  const p = Bun.spawn(["bun", `--env-file=env/${client}.env`, "run", "core/build.ts", "--publicar"], {
    env, stdout: "pipe", stderr: "pipe", timeout: 5 * 60_000,
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  const log = (out + err).trim().split("\n").slice(-30).join("\n");
  console.log(`[${client}] exit ${code}\n${log}`);
  return { ok: code === 0, log };
}

export function app(token: string, rodar: Rodar = rodarBuild) {
  const rodando = new Set<string>(); // ponytail: lock em memória, basta com uma réplica
  return async (req: Request) => {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/saude") return new Response("ok");

    const m = url.pathname.match(/^\/gerar\/([\w-]+)$/);
    if (req.method !== "POST" || !m) return new Response("não encontrado", { status: 404 });
    if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response("não autorizado", { status: 401 });

    const client = m[1]!;
    if (!existsSync(`clients/${client}`) || !existsSync(`env/${client}.env`))
      return Response.json({ ok: false, log: `cliente sem pasta ou sem env: ${client}` }, { status: 404 });

    const hoje: string | undefined = ((await req.json().catch(() => null)) as any)?.hoje;
    // toJSON: o Date aceita 2026-02-31 e vira 03/03 — publicaria a semana errada.
    if (hoje !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(hoje) && new Date(hoje + "T12:00:00Z").toJSON()?.startsWith(hoje)))
      return Response.json({ ok: false, log: `hoje inválido: ${hoje}` }, { status: 400 });

    if (rodando.has(client)) return Response.json({ ok: false, log: "já em execução" }, { status: 409 });
    rodando.add(client);
    try {
      const r = await rodar(client, hoje);
      return Response.json(r, { status: r.ok ? 200 : 500 });
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
