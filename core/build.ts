import { rmSync } from "node:fs";

const PESOS = { 400: "normal", 500: "500", 600: "600", 700: "700" } as const;

/** Embute as woff2 em base64 para o HTML rodar offline e o PDF carregar a fonte. */
async function fontes() {
  const faces = await Promise.all(
    Object.entries(PESOS).map(async ([peso, weight]) => {
      const b64 = Buffer.from(await Bun.file(`core/fonts/Geist-${peso}.woff2`).arrayBuffer()).toString("base64");
      return `@font-face{font-family:Geist;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    }),
  );
  return faces.join("\n");
}

async function logos() {
  const b64 = async (f: string) => Buffer.from(await Bun.file(f).arrayBuffer()).toString("base64");
  return `.logo .mark{background-image:url(data:image/png;base64,${await b64("core/dash.png")})}
.logo .mark.vw{background-image:url(data:image/png;base64,${await b64("core/vw.png")})}`;
}

/** Gera HTML (e PDF, se weasyprint estiver disponível) pra um cliente. */
export async function gerar(client: string) {
  const { conectar, carregar } = await import(`../clients/${client}/queries.ts`);
  const { documento, titulo } = await import(`../clients/${client}/pages.ts`);

  const pool = await conectar();
  console.log(`→ [${client}] carregando dados…`);
  const dados = await carregar(pool);
  await pool?.close(); // cliente sem banco (CSV, planilha) devolve null em conectar()

  console.log(`→ [${client}] renderizando gráficos e páginas…`);
  // base primeiro, theme depois: com especificidade igual quem vem por último
  // vence, e é o theme do cliente que tem de sobrescrever. Na ordem inversa
  // `.capa .rodape` do theme era silenciosamente ignorado pelo `.capa .rodape`
  // da base — o rodapé da capa saía desenhado por cima do índice, sem erro.
  const theme = await Bun.file(`clients/${client}/theme.css`).text();
  const base = await Bun.file("core/styles.base.css").text();
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
${await fontes()}
${base}
${await logos()}
${theme}
</style>
</head>
<body>
${documento(dados)}
</body>
</html>`;

  // Apaga antes: o servidor devolve este arquivo como contexto, e um resumo de
  // rodada antiga junto de um build novo seria contexto plausível e errado.
  rmSync(`out/${client}/resumo.txt`, { force: true });
  if (await Bun.file(`clients/${client}/resumo.ts`).exists()) {
    const { resumo } = await import(`../clients/${client}/resumo.ts`);
    await Bun.write(`out/${client}/resumo.txt`, resumo(dados));
    console.log(`✓ out/${client}/resumo.txt`);
  }

  await Bun.write(`out/${client}/relatorio.html`, html);
  console.log(`✓ out/${client}/relatorio.html (${(html.length / 1024).toFixed(0)} KB)`);

  if (Bun.which("weasyprint")) {
    console.log(`→ [${client}] gerando PDF…`);
    const p = Bun.spawn(["weasyprint", `out/${client}/relatorio.html`, `out/${client}/relatorio.pdf`], { stderr: "inherit", timeout: 4 * 60_000 });
    if ((await p.exited) !== 0) throw new Error("weasyprint falhou");
    const pdfSize = (await Bun.file(`out/${client}/relatorio.pdf`).stat()).size;
    console.log(`✓ out/${client}/relatorio.pdf (${(pdfSize / 1024).toFixed(0)} KB)`);
  } else {
    console.log("· weasyprint não encontrado — só o HTML foi gerado (use o container para o PDF)");
  }
}

if (import.meta.main) {
  const client = process.env.CLIENT;
  // O .env vive em clients/<id>/, fora do cwd — o auto-load do Bun nao o pega,
  // dai o --env-file explicito. Sem ele a falha e' um DB_HOST ausente confuso.
  if (!client) throw new Error("CLIENT não definida. Ex: CLIENT=basf bun --env-file=clients/basf/.env run core/build.ts");
  await gerar(client);

  // Só com a flag: o loop local de design nunca publica.
  if (process.argv.includes("--publicar")) {
    // Checa o weasyprint, não o arquivo: um PDF antigo em out/ seria publicado no lugar do novo.
    if (!Bun.which("weasyprint")) throw new Error("--publicar sem PDF — rode no container (weasyprint)");
    if (!(await Bun.file(`clients/${client}/publicar.ts`).exists())) {
      console.log(`· ${client} não tem publicar.ts — só gera`);
    } else {
      const { publicar } = await import(`../clients/${client}/publicar.ts`);
      const id = await publicar(`out/${client}/relatorio.pdf`);
      if (id) console.log(`relatorio_id: ${id}`);
    }
  }
}
