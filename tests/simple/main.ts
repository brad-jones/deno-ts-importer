import { TsImporter } from "@brad-jones/deno-ts-importer";
import { toFileUrl } from "@std/path/to-file-url";

const importer = new TsImporter();
const filePath = toFileUrl(await Deno.realPath("./tests/simple/foo.ts")).toString();
const module = await importer.import<{ foo: () => string }>(filePath);
console.log(module.foo());
