/** Baixa a malha de UFs do IBGE, corrige os anéis e grava `src/geo/uf.json` (versionado).
 *  Roda uma vez; a malha de estados não muda. `properties.uf` = sigla. */
import { corrigirAneis, type Colecao } from "../src/geo";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const URL_MALHA = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF";
const URL_UFS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

const malha = (await (await fetch(URL_MALHA)).json()) as Colecao;
const ufs = (await (await fetch(URL_UFS)).json()) as { id: number; sigla: string }[];
const sigla = new Map(ufs.map((u) => [String(u.id), u.sigla]));
for (const f of malha.features) f.properties = { uf: sigla.get(String(f.properties.codarea)) };
if (malha.features.length !== 27 || malha.features.some((f) => !f.properties.uf)) {
  throw new Error(`malha inesperada: ${malha.features.length} feições`);
}
await Bun.write(`${AQUI}../src/geo/uf.json`, JSON.stringify(corrigirAneis(malha)));
console.log("uf.json: 27 UFs");
