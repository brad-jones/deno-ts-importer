import { TsImporter } from "@brad-jones/deno-ts-importer";
import { toFileUrl } from "@std/path/to-file-url";
import type MyStack from "./my_stack.ts";

const importer = new TsImporter();
const filePath = toFileUrl(await Deno.realPath("./tests/complex/my_stack.ts")).toString();
const module = await importer.import<{ default: typeof MyStack }>(filePath);
console.log(await new module.default().toHcl());
