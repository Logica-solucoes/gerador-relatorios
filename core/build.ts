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

/** Gera HTML (e PDF, se weasyprint estiver disponível) pra um cliente. */
export async function gerar(client: string) {
  const { conectar, carregar } = await import(`../clients/${client}/queries.ts`);
  const { documento, titulo } = await import(`../clients/${client}/pages.ts`);

  const pool = await conectar();
  console.log(`→ [${client}] carregando dados…`);
  const dados = await carregar(pool);
  await pool.close();

  console.log(`→ [${client}] renderizando gráficos e páginas…`);
  const theme = await Bun.file(`clients/${client}/theme.css`).text();
  const base = await Bun.file("core/styles.base.css").text();
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
${await fontes()}
${theme}
${base}
</style>
</head>
<body>
${documento(dados)}
</body>
</html>`;

  await Bun.write(`out/${client}/relatorio.html`, html);
  console.log(`✓ out/${client}/relatorio.html (${(html.length / 1024).toFixed(0)} KB)`);

  if (Bun.which("weasyprint")) {
    console.log(`→ [${client}] gerando PDF…`);
    const p = Bun.spawn(["weasyprint", `out/${client}/relatorio.html`, `out/${client}/relatorio.pdf`], { stderr: "inherit" });
    if ((await p.exited) !== 0) throw new Error("weasyprint falhou");
    const pdfSize = (await Bun.file(`out/${client}/relatorio.pdf`).stat()).size;
    console.log(`✓ out/${client}/relatorio.pdf (${(pdfSize / 1024).toFixed(0)} KB)`);
  } else {
    console.log("· weasyprint não encontrado — só o HTML foi gerado (use o container para o PDF)");
  }
}

if (import.meta.main) {
  const client = process.env.CLIENT;
  if (!client) throw new Error("CLIENT não definida. Ex: CLIENT=basf bun run core/build.ts");
  await gerar(client);
}
