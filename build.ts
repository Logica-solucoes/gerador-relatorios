import { conectar, carregar } from "./queries";
import { documento } from "./pages";

const PESOS = { 400: "normal", 500: "500", 600: "600", 700: "700" } as const;

/** Embute as woff2 em base64 para o HTML rodar offline e o PDF carregar a fonte. */
async function fontes() {
  const faces = await Promise.all(
    Object.entries(PESOS).map(async ([peso, weight]) => {
      const b64 = Buffer.from(await Bun.file(`fonts/Geist-${peso}.woff2`).arrayBuffer()).toString("base64");
      return `@font-face{font-family:Geist;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    }),
  );
  return faces.join("\n");
}

const pool = await conectar();
console.log("→ consultando SQL Server…");
const dados = await carregar(pool);
await pool.close();

console.log("→ renderizando gráficos e páginas…");
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>BASF Sementes — Diagnóstico Executivo YTD 2026</title>
<style>
${await fontes()}
${await Bun.file("styles.css").text()}
</style>
</head>
<body>
${documento(dados)}
</body>
</html>`;

await Bun.write("out/relatorio.html", html);
console.log(`✓ out/relatorio.html (${(html.length / 1024).toFixed(0)} KB)`);

// WeasyPrint só existe no container; localmente o HTML basta para iterar no Chrome.
if (Bun.which("weasyprint")) {
  console.log("→ gerando PDF…");
  const p = Bun.spawn(["weasyprint", "out/relatorio.html", "out/relatorio.pdf"], { stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error("weasyprint falhou");
  console.log(`✓ out/relatorio.pdf (${((await Bun.file("out/relatorio.pdf").stat()).size / 1024).toFixed(0)} KB)`);
} else {
  console.log("· weasyprint não encontrado — só o HTML foi gerado (use o container para o PDF)");
}
