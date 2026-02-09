import stripTypes from "@fcrozatier/type-strip";
import ts from "typescript";

/**
 * Transpiles TypeScript code to JavaScript by either stripping types or fully transpiling.
 *
 * @param code - The TypeScript source code to transpile
 * @param options - Optional configuration object
 * @param options.mode - The transpilation mode to use:
 *   - "strip": Fast type stripping only (default)
 *   - "transpile": Full TypeScript compilation with configured compiler options
 *   - "passthrough": Return the code as-is without any transformation
 * @param options.compilerOptions - Optional TypeScript compiler options to override defaults.
 *   Only applies when mode is "transpile". These options are merged with the default
 *   Deno-optimized compiler settings.
 * @returns The transpiled JavaScript code
 *
 * @remarks
 * The transpile mode can be controlled via:
 * 1. The `options.mode` parameter
 * 2. The `DENO_TS_IMPORTER_TRANSPILE_MODE` environment variable
 * 3. Defaults to "strip" if neither is specified
 *
 * When using "transpile" mode, the function uses TypeScript's compiler with
 * strict settings optimized for Deno runtime compatibility.
 */
export function transpileTypeScript(
  code: string,
  options?: { mode?: "transpile" | "strip" | "passthrough"; compilerOptions?: ts.CompilerOptions },
): string {
  const transpileMode = options?.mode ?? Deno.env.get("DENO_TS_IMPORTER_TRANSPILE_MODE") ?? "strip";

  if (transpileMode === "passthrough") {
    return code;
  }

  if (transpileMode === "strip") {
    return stripTypes(code);
  }

  return ts.transpileModule(code, {
    /* see: https://docs.deno.com/runtime/reference/ts_config_migration/#ts-compiler-options */
    compilerOptions: {
      allowUnreachableCode: false,
      allowUnusedLabels: false,
      baseUrl: "./",
      checkJs: false,
      jsx: ts.JsxEmit.React,
      jsxFactory: "React.createElement",
      jsxFragmentFactory: "React.Fragment",
      keyofStringsOnly: false,
      lib: ["deno.window"],
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noErrorTruncation: false,
      noFallthroughCasesInSwitch: false,
      noImplicitAny: true,
      noImplicitOverride: true,
      noImplicitReturns: false,
      noImplicitThis: true,
      noImplicitUseStrict: true,
      noStrictGenericChecks: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noUncheckedIndexedAccess: false,
      paths: {},
      rootDirs: [],
      strict: true,
      strictBindCallApply: true,
      strictFunctionTypes: true,
      strictPropertyInitialization: true,
      strictNullChecks: true,
      suppressExcessPropertyErrors: false,
      suppressImplicitAnyIndexErrors: false,
      useUnknownInCatchVariables: true,
      ...options?.compilerOptions,
    },
  }).outputText;
}
