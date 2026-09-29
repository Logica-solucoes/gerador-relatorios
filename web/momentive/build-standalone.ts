/**
 * Gera `momentive-standalone.html`: um arquivo único, auto-contido, para anexar em e-mail
 * ou abrir em qualquer máquina sem build e sem internet.
 *
 *   bun run dash:momentive:file
 *
 * Inlina o bundle, o CSS e as fontes (Geist / Geist Mono em base64, subset latin). O único
 * motivo de embutir fonte em vez de linkar o Google Fonts é o "sem internet": o destinatário
 * pode abrir o anexo no avião e a tipografia continua sendo a que a gente escolheu.
 */

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const p = (...partes: string[]) => `${AQUI}${partes.join("/")}`;

/* O Google Fonts serve woff2 só para UA moderno; com o UA do bun ele devolve ttf. */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CSS_FONTES =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap";

async function fontesEmbutidas(): Promise<string> {
  const css = await (await fetch(CSS_FONTES, { headers: { "User-Agent": UA } })).text();

  // Cada @font-face vem repetido por subset (cyrillic, greek, vietnamese, latin-ext, latin).
  // Só o latin interessa — os outros dobrariam o arquivo sem servir a um relatório em pt-BR.
  const blocos = css.split("/*").filter((b) => b.trimStart().startsWith("latin */"));
  if (!blocos.length) throw new Error("nenhum subset latin encontrado no CSS do Google Fonts");

  const saida: string[] = [];
  for (const bloco of blocos) {
    const url = bloco.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) continue;
    const buf = await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    saida.push(
      bloco
        .replace(/^[^{]*\{/, "@font-face {")
        .replace(/src:\s*url\(https:[^)]+\)/, `src: url(data:font/woff2;base64,${b64})`)
        .replace(/unicode-range:[^;]+;/, "")   // sem os outros subsets, o range perde a função
        .trim(),
    );
    console.log(`  fonte  ${url.split("/").pop()}  ${(buf.byteLength / 1024).toFixed(0)} kB`);
  }
  return saida.join("\n");
}

const build = await Bun.build({
  entrypoints: [p("src", "preview.ts")],
  target: "browser",
  minify: true,
});
if (!build.success) { console.error(build.logs); process.exit(1); }
const js = await build.outputs[0]!.text();

const css = await Bun.file(p("src", "dashboard.css")).text();
console.log("Baixando fontes…");
const fontes = await fontesEmbutidas();

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Momentive · Exportação · BFM Transportes</title>
<style>
${fontes}
/* O elemento body é do shell, nao do componente — por isso nao esta em dashboard.css.
   Sem o override de impressao, o fundo cinza pinta a sobra da ultima folha
   abaixo do rodape e parece um retangulo vazio no PDF. */
body { margin: 0; background: #FAFBFC; }
@media print { body { background: #fff; } }
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`;

const destino = p("momentive-standalone.html");
await Bun.write(destino, html);
console.log(`\n${destino}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
