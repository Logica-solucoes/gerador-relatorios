/** Preview local: o dashboard faz fetch de dados/*.json, e fetch não roda em file://. */
const RAIZ = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

Bun.serve({
  port: 4173,
  async fetch(req) {
    const caminho = decodeURIComponent(new URL(req.url).pathname);
    const arquivo = Bun.file(RAIZ + (caminho === "/" ? "index.html" : caminho.slice(1)));
    return (await arquivo.exists()) ? new Response(arquivo) : new Response("404", { status: 404 });
  },
});
console.log("http://localhost:4173");
