import { $ } from "@david/dax";
import { assertEquals } from "@std/assert";

/**
 * Here we are relying on transpileTypeScript to transpile the TypeScript to JavaScript.
 */
Deno.test("should be able to deno run e2e example", async () => {
  const result = await $`${Deno.execPath()} run -A ${import.meta.dirname!}/testdata/main.ts`.captureCombined().quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * Here we are relying on the normal deno import to transpile the TypeScript to JavaScript.
 */
Deno.test("should still work in passthrough mode with deno run", async () => {
  const result = await $`${Deno.execPath()} run -A ${import.meta.dirname!}/testdata/main.ts`.env({
    DENO_TS_IMPORTER_TRANSPILE_MODE: "passthrough",
  }).captureCombined().quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * Here we are relying on transpileTypeScript to transpile the TypeScript to JavaScript but from a compiled binary.
 */
Deno.test("should be able to compile and run the e2e example", async () => {
  const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
  const binPath = `${import.meta.dirname!}/testdata/main${exeSuffix}`;
  await $`${Deno.execPath()} compile -A --output ${binPath} ${import.meta.dirname!}/testdata/main.ts`;
  const result = await $`${binPath}`.captureCombined().quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * And finally this doesn't work because when compiled, the normal import statement loses it's ability to import TypeScript.
 * And we are not using transpileTypeScript in passthrough mode.
 */
Deno.test("should not work in passthrough mode when compiled", async () => {
  const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
  const binPath = `${import.meta.dirname!}/testdata/main${exeSuffix}`;
  await $`${Deno.execPath()} compile -A --output ${binPath} ${import.meta.dirname!}/testdata/main.ts`;
  const result = await $`${binPath}`.noThrow().env({
    DENO_TS_IMPORTER_TRANSPILE_MODE: "passthrough",
  }).captureCombined().quiet();
  assertEquals(result.code, 1);
  assertEquals(result.combined.trim().includes("SyntaxError: Unexpected token ':'"), true);
});
