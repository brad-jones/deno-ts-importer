import { outdent } from "@cspotcode/outdent";
import { $ } from "@david/dax";
import { assertEquals } from "@std/assert";

/**
 * Here we are relying on transpileTypeScript to transpile the TypeScript to JavaScript.
 */
Deno.test("should be able to deno run e2e example", async () => {
  const result = await $`${Deno.execPath()} run -A ${import.meta.dirname!}/simple/main.ts`.noThrow().captureCombined()
    .quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * Here we are relying on the normal deno import to transpile the TypeScript to JavaScript.
 */
Deno.test("should still work in passthrough mode with deno run", async () => {
  const result = await $`${Deno.execPath()} run -A ${import.meta.dirname!}/simple/main.ts`.env({
    DENO_TS_IMPORTER_TRANSPILE_MODE: "passthrough",
  }).noThrow().captureCombined().quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * Here we are relying on transpileTypeScript to transpile the TypeScript to JavaScript but from a compiled binary.
 */
Deno.test("should be able to compile and run the e2e example", async () => {
  const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
  const binPath = `${import.meta.dirname!}/simple/main${exeSuffix}`;
  await $`${Deno.execPath()} compile -A --output ${binPath} ${import.meta.dirname!}/simple/main.ts`;
  const result = await $`${binPath}`.noThrow().captureCombined().quiet();
  assertEquals(result.combined.trim(), "foo");
});

/**
 * And finally this doesn't work because when compiled, the normal import statement loses it's ability to import TypeScript.
 * And we are in effect not using transpileTypeScript when in passthrough mode.
 */
Deno.test("should not work in passthrough mode when compiled", async () => {
  const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
  const binPath = `${import.meta.dirname!}/simple/main${exeSuffix}`;
  await $`${Deno.execPath()} compile -A --output ${binPath} ${import.meta.dirname!}/simple/main.ts`;
  const result = await $`${binPath}`.noThrow().env({
    DENO_TS_IMPORTER_TRANSPILE_MODE: "passthrough",
  }).captureCombined().quiet();
  assertEquals(result.code, 1);
  assertEquals(result.combined.trim().includes("SyntaxError: Unexpected token ':'"), true);
});

Deno.test("should be able to deno run e2e complex example", async () => {
  const result = await $`${Deno.execPath()} run -A ${import.meta.dirname!}/complex/main.ts`.noThrow().captureCombined()
    .quiet();
  assertEquals(
    result.combined.trim(),
    outdent`
      terraform {
        required_version = ">=1,<2.0"
        required_providers {
          local = {
            source  = "hashicorp/local"
            version = "2.6.1"
          }
        }
      }

      resource "local_file" "hello" {
        filename = "\${path.module}/message.txt"
        content  = "Hello World"
      }
    `,
  );
});

Deno.test("should be able to compile and run the e2e complex example", async () => {
  const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
  const binPath = `${import.meta.dirname!}/complex/main${exeSuffix}`;
  await $`${Deno.execPath()} compile -A --output ${binPath} ${import.meta.dirname!}/complex/main.ts`;
  const result = await $`${binPath}`.noThrow().captureCombined().quiet();
  assertEquals(
    result.combined.trim(),
    outdent`
      terraform {
        required_version = ">=1,<2.0"
        required_providers {
          local = {
            source  = "hashicorp/local"
            version = "2.6.1"
          }
        }
      }

      resource "local_file" "hello" {
        filename = "\${path.module}/message.txt"
        content  = "Hello World"
      }
    `,
  );
});
