import { findDenoConfigFile } from "@brad-jones/deno-config";
import { ensureDir } from "@std/fs";
import { isAbsolute, join } from "@std/path";
import { fromFileUrl } from "@std/path/from-file-url";
import type ts from "typescript";
import { getCachePath, getDefaultDenoCacheDir, getDenoCacheFilePath, getDenoCacheMetadataPath } from "./cache.ts";
import type { ImportMap } from "./import_map.ts";
import { loadImportMap } from "./load_import_map.ts";
import { createOriginalUrlComment, replaceImportMeta } from "./replace_import_meta.ts";
import { replaceImports } from "./replace_imports.ts";
import { transpileTypeScript } from "./ts_transpiler.ts";

/**
 * Configuration options for TsImporter.
 */
export type TsImporterOptions = {
  /**
   * Optional import map configuration to apply to module imports.
   *
   * @example
   * ```typescript
   * {
   *   importMap: {
   *     imports: {
   *       "lodash": "https://cdn.skypack.dev/lodash",
   *       "@utils/": "./src/utils/"
   *     }
   *   }
   * }
   * ```
   */
  importMap?: ImportMap;

  /**
   * Custom cache directory path.
   *
   * If provided as a relative path, it will be resolved relative to the current working directory.
   * If not provided, defaults to Deno's cache directory under "import_map_importer" subdirectory.
   *
   * @example
   * ```typescript
   * // Use absolute path
   * { cacheDir: "/tmp/my-cache" }
   *
   * // Use relative path (resolved to CWD)
   * { cacheDir: ".cache/imports" }
   *
   * // Use default Deno cache directory
   * {}
   * ```
   */
  cacheDir?: string;

  /**
   * Whether to clear Deno's module cache before importing.
   * This can help resolve issues when importing modules from directories
   * with their own deno.jsonc files.
   *
   * @default false
   */
  clearDenoCache?: boolean;

  /**
   * Whether to automatically discover and merge import maps from deno.json/deno.jsonc files
   * when importing local modules.
   *
   * When enabled, the importer will look for deno.json files in the same directory as
   * the imported module and merge their import maps with the configured import map.
   *
   * @default true
   */
  autoDiscoverImportMap?: boolean;

  /**
   * TypeScript transpilation mode for processing modules.
   *
   * - "strip": Fast type stripping only (default) - removes TypeScript syntax
   * - "transpile": Full TypeScript compilation with configured compiler options
   * - "passthrough": Return code as-is without any transformation
   *
   * Can also be controlled via the `DENO_TS_IMPORTER_TRANSPILE_MODE` environment variable.
   *
   * @default "strip"
   */
  tsTranspileMode?: "transpile" | "strip" | "passthrough";

  /**
   * Optional TypeScript compiler options to override defaults when `tsTranspileMode` is "transpile".
   *
   * These options are merged with the default Deno-optimized compiler settings.
   * Has no effect when using "strip" or "passthrough" modes.
   *
   * @example
   * ```typescript
   * {
   *   tsCompilerOptions: {
   *     target: ts.ScriptTarget.ES2020,
   *     jsx: ts.JsxEmit.Preserve
   *   }
   * }
   * ```
   */
  tsCompilerOptions?: ts.CompilerOptions;
};

/**
 * A high-performance import map processor that transforms and caches JavaScript/TypeScript modules.
 *
 * This class applies import map transformations to module imports and caches the results
 * for improved performance. It handles both local files and remote URLs, processes
 * dependencies recursively, and provides several optimizations:
 *
 * - Memory caching of loaded modules
 * - Disk caching of transformed source code
 * - Pre-processed import maps for O(1) lookups
 * - Parallel dependency processing
 * - Circular dependency detection
 * - Optimized file I/O operations
 *
 * @example
 * ```typescript ignore
 * const importer = new TsImporter({
 *   importMap: {
 *     imports: {
 *       "lodash": "https://cdn.skypack.dev/lodash",
 *       "@utils/": "./src/utils/"
 *     }
 *   }
 * });
 * const module = await importer.import<{ default: any }>("./src/main.ts");
 * ```
 */
export class TsImporter {
  #cache: Map<string, unknown> = new Map();
  #cacheDir: string;
  #transformedModules: Map<string, string> = new Map();
  #processingModules: Set<string> = new Set();
  #transformationPromises: Map<string, Promise<string>> = new Map();
  #importMap?: ImportMap;

  // Option to clear Deno's cache
  #clearDenoCache: boolean;

  // Option to auto-discover import maps from deno.json
  #autoDiscoverImportMap: boolean;

  // TypeScript transpilation options
  #tsTranspileOptions: {
    mode?: "transpile" | "strip" | "passthrough";
    compilerOptions?: ts.CompilerOptions;
  };

  /**
   * Creates a new TsImporter instance.
   *
   * @param options - Optional configuration including import map, cache directory, and other settings
   */
  constructor(
    options: TsImporterOptions = {},
  ) {
    // Set import map
    this.#importMap = options.importMap;

    // Handle both absolute and relative cache directory paths
    if (options.cacheDir) {
      // Use isAbsolute from std/path to properly detect absolute paths
      this.#cacheDir = isAbsolute(options.cacheDir) ? options.cacheDir : join(Deno.cwd(), options.cacheDir);
    } else {
      // Default to Deno's cache directory for easier cache management
      this.#cacheDir = join(getDefaultDenoCacheDir(), "brad_jones_ts_importer");
    }

    // Set cache clearing option
    this.#clearDenoCache = options.clearDenoCache ?? false;

    // Set auto-discover import map option
    this.#autoDiscoverImportMap = options.autoDiscoverImportMap ?? true;

    // Set TypeScript transpile options
    this.#tsTranspileOptions = {
      mode: options.tsTranspileMode,
      compilerOptions: options.tsCompilerOptions,
    };
  }

  /**
   * Imports a module after applying import map transformations.
   *
   * This method resolves the module specifier, applies import map transformations,
   * processes all dependencies recursively, caches the results, and returns the
   * loaded module. Subsequent imports of the same module will be served from cache.
   *
   * @param specifier - The module specifier to import (relative path, absolute URL, or bare specifier)
   * @param importMap - Optional import map to use for this import. If not provided, uses the instance's import map.
   * @returns A promise that resolves to the imported module
   *
   * @example
   * ```typescript ignore
   * const importer = new TsImporter();
   *
   * // Import with a specific import map
   * const utils = await importer.import<{ helper: Function }>("./utils.ts", {
   *   imports: { "@std/": "https://deno.land/std@0.224.0/" }
   * });
   *
   * // Import using a bare specifier (resolved via import map from constructor)
   * const importer2 = new TsImporter({
   *   importMap: {
   *     imports: { "lodash": "https://cdn.skypack.dev/lodash" }
   *   }
   * });
   * const lodash = await importer2.import<typeof import("lodash")>("lodash");
   * ```
   */
  async import<T>(specifier: string, importMap?: ImportMap): Promise<T> {
    // Memory cache check
    if (this.#cache.has(specifier)) {
      return this.#cache.get(specifier) as T;
    }

    const url = new URL(specifier, import.meta.url);

    // Clear Deno's cache if requested
    if (this.#clearDenoCache) {
      await this.#clearDenoCacheForUrl(url);
    }

    // Discover import map from deno.jsonc if importing from a local file and no import map provided
    let effectiveImportMap = importMap ?? this.#importMap;
    if (this.#autoDiscoverImportMap && !importMap && url.protocol === "file:") {
      const configFilePath = await findDenoConfigFile(fromFileUrl(url));
      if (configFilePath) {
        const config = await loadImportMap(configFilePath);
        effectiveImportMap = {
          imports: { ...effectiveImportMap?.imports, ...config?.imports ?? {} },
          scopes: { ...effectiveImportMap?.scopes, ...config?.scopes ?? {} },
        };
      }
    }

    const transformedUrl = await this.#transformModule(url, effectiveImportMap);
    console.log({ specifier, url, transformedUrl, effectiveImportMap });
    const module = await import(transformedUrl) as T;

    this.#cache.set(specifier, module);
    return module;
  }

  async #transformModule(moduleUrl: URL, importMap?: ImportMap): Promise<string> {
    const urlString = moduleUrl.href;

    // Clear Deno's cache for this module if requested
    if (this.#clearDenoCache && moduleUrl.protocol === "file:") {
      await this.#clearDenoCacheForUrl(moduleUrl);
    }

    // Check if already transformed
    if (this.#transformedModules.has(urlString)) {
      return this.#transformedModules.get(urlString)!;
    }

    // Handle circular dependencies
    if (this.#processingModules.has(urlString)) {
      // If we're already processing this module, wait for the existing promise
      const existingPromise = this.#transformationPromises.get(urlString);
      if (existingPromise) {
        return existingPromise;
      }
      return urlString;
    }

    // Note: Disk cache check could be implemented here for further optimization

    this.#processingModules.add(urlString);

    // Create and store the transformation promise
    const transformationPromise = (async () => {
      try {
        // Read the module content
        const originalCode = await this.#readModuleContent(moduleUrl);

        // Transpile TypeScript to JavaScript.
        const transpiledCode = transpileTypeScript(originalCode, this.#tsTranspileOptions);

        // Quick check if module has any imports or uses import.meta.url
        if (
          !this.#hasImports(transpiledCode) &&
          !this.#hasImportMetaUrl(transpiledCode)
        ) {
          // Skip transformation for modules without imports or import.meta.url
          return await this.#cacheModule(urlString, transpiledCode, importMap);
        }

        // Pre-process import map for optimized replacer
        const importEntries = importMap ? Object.entries(importMap.imports) : [];
        const scopeEntries = new Map<string, Array<[string, string]>>();
        if (importMap?.scopes) {
          for (const [scope, imports] of Object.entries(importMap.scopes)) {
            scopeEntries.set(scope, Object.entries(imports));
          }
        }

        // Create optimized replacer function
        const applyImportMapToSpecifier = this.#createOptimizedReplacer(
          urlString,
          importEntries,
          scopeEntries,
        );

        // Collect dependencies during replacement
        const originalToTransformedSpecifiers = new Map<string, string>();
        const allLocalSpecifiers = new Set<string>();
        const replacerWithDependencyCollection = (
          specifier: string,
        ): string => {
          // Track all local imports (relative and file://)
          if (this.#isRelativeOrFileUrl(specifier)) {
            allLocalSpecifiers.add(specifier);
          }
          const transformed = applyImportMapToSpecifier(specifier);
          originalToTransformedSpecifiers.set(specifier, transformed);
          return transformed;
        };

        // First pass: replace imports and collect dependencies
        let transformedCode = await replaceImports(
          urlString,
          transpiledCode,
          replacerWithDependencyCollection,
        );

        // Replace import.meta.url with the original URL
        transformedCode = replaceImportMeta(transformedCode, urlString);

        // Register cache URL early for circular dependencies
        const cacheUrl = this.#getCacheUrl(urlString, transformedCode, importMap);
        this.#transformedModules.set(urlString, cacheUrl);

        // Process dependencies in parallel (optimization)
        const transformedToCachedUrls = await this.#processDependenciesParallel(
          originalToTransformedSpecifiers,
          allLocalSpecifiers,
          moduleUrl,
          importMap,
        );

        // Second pass: replace dependency paths with cached paths
        const finalCode = transformedToCachedUrls.size > 0
          ? await replaceImports(
            urlString,
            transformedCode,
            (specifier) => transformedToCachedUrls.get(specifier) || specifier,
          )
          : transformedCode;

        // Add comment banner and write final code to cache
        const codeWithBanner = createOriginalUrlComment(urlString) + finalCode;
        await this.#writeToCache(cacheUrl, codeWithBanner);
        return cacheUrl;
      } finally {
        this.#processingModules.delete(urlString);
        this.#transformationPromises.delete(urlString);
      }
    })();

    this.#transformationPromises.set(urlString, transformationPromise);
    return transformationPromise;
  }

  // Optimized module content reading
  async #readModuleContent(moduleUrl: URL): Promise<string> {
    console.log(`Reading module content from ${moduleUrl.href}`);

    if (moduleUrl.protocol === "file:") {
      return Deno.readTextFile(fromFileUrl(moduleUrl));
    }

    const response = await fetch(moduleUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${moduleUrl.href}: ${response.statusText}`,
      );
    }
    return response.text();
  }

  // Quick check if module has imports
  #hasImports(code: string): boolean {
    // Quick regex check for import/export statements
    return /(?:import|export)\s+(?:.*\s+from\s+|)['"]/m.test(code);
  }

  // Quick check if module uses import.meta properties or methods
  #hasImportMetaUrl(code: string): boolean {
    // Quick regex check for import.meta.url, filename, dirname, or resolve()
    return /\bimport\s*\.\s*meta\s*\.\s*(url|filename|dirname|resolve\s*\()/
      .test(code);
  }

  // Cache a module and return its cache URL
  async #cacheModule(urlString: string, code: string, importMap?: ImportMap): Promise<string> {
    // Replace import.meta.url even for modules without imports
    const processedCode = this.#hasImportMetaUrl(code) ? replaceImportMeta(code, urlString) : code;

    // Add comment banner if code was processed
    const finalCode = processedCode !== code ? createOriginalUrlComment(urlString) + processedCode : processedCode;

    const cacheUrl = this.#getCacheUrl(urlString, finalCode, importMap);
    await this.#writeToCache(cacheUrl, finalCode);
    this.#transformedModules.set(urlString, cacheUrl);
    return cacheUrl;
  }

  // Get cache URL for a module
  #getCacheUrl(urlString: string, code: string, importMap?: ImportMap): string {
    // Use empty import map if none provided to ensure consistent cache behavior
    const effectiveImportMap = importMap ?? { imports: {} };
    const cachePath = getCachePath(urlString, code, effectiveImportMap);
    const fullCachePath = join(this.#cacheDir, cachePath);
    return new URL(`file://${fullCachePath}`).href;
  }

  // Write content to cache file
  async #writeToCache(cacheUrl: string, content: string): Promise<void> {
    const cachePath = fromFileUrl(cacheUrl);
    const dir = join(cachePath, "..");

    await ensureDir(dir);
    await Deno.writeTextFile(cachePath, content);
  }

  // Create optimized replacer using pre-processed data
  #createOptimizedReplacer(
    urlString: string,
    importEntries: Array<[string, string]>,
    scopeEntries: Map<string, Array<[string, string]>>,
  ): (specifier: string) => string {
    return (specifier: string): string => {
      // Check imports first (most common case)
      for (const [key, value] of importEntries) {
        if (specifier === key || specifier.startsWith(key + "/")) {
          const suffix = specifier.slice(key.length);
          return value + suffix;
        }
      }

      // Check scopes if available
      if (scopeEntries.size > 0) {
        for (const [scope, entries] of scopeEntries) {
          if (urlString.startsWith(scope)) {
            for (const [key, value] of entries) {
              if (specifier === key || specifier.startsWith(key + "/")) {
                const suffix = specifier.slice(key.length);
                return value + suffix;
              }
            }
          }
        }
      }

      return specifier;
    };
  }

  // Process dependencies in parallel
  async #processDependenciesParallel(
    originalToTransformedSpecifiers: Map<string, string>,
    allLocalSpecifiers: Set<string>,
    moduleUrl: URL,
    importMap?: ImportMap,
  ): Promise<Map<string, string>> {
    const transformedToCachedUrls = new Map<string, string>();
    const promises: Promise<void>[] = [];

    // Process all transformed specifiers
    for (const [, transformedSpecifier] of originalToTransformedSpecifiers) {
      const shouldProcess = this.#isRelativeOrFileUrl(transformedSpecifier) ||
        this.#isHttpUrl(transformedSpecifier) ||
        this.#isJsr(transformedSpecifier) ||
        this.#isNpm(transformedSpecifier);

      if (shouldProcess) {
        promises.push(
          this.#processDependency(transformedSpecifier, moduleUrl, importMap)
            .then((cachedUrl) => {
              transformedToCachedUrls.set(transformedSpecifier, cachedUrl);
            })
            .catch((error) => {
              // If transformation fails, keep the resolved URL to avoid broken imports
              const resolvedUrl = this.#isRelativeOrFileUrl(transformedSpecifier)
                ? new URL(transformedSpecifier, moduleUrl).href
                : transformedSpecifier;
              console.warn(
                `Failed to transform ${transformedSpecifier}: ${error.message}`,
              );
              transformedToCachedUrls.set(transformedSpecifier, resolvedUrl);
            }),
        );
      }
    }

    // Also process local specifiers that weren't transformed by import map
    for (const localSpecifier of allLocalSpecifiers) {
      // Skip if already processed as a transformed specifier
      if (!originalToTransformedSpecifiers.has(localSpecifier)) {
        promises.push(
          this.#processDependency(localSpecifier, moduleUrl, importMap)
            .then((cachedUrl) => {
              transformedToCachedUrls.set(localSpecifier, cachedUrl);
            })
            .catch((error) => {
              // If transformation fails, keep the resolved URL to avoid broken imports
              const resolvedUrl = this.#isRelativeOrFileUrl(localSpecifier)
                ? new URL(localSpecifier, moduleUrl).href
                : localSpecifier;
              console.warn(
                `Failed to transform ${localSpecifier}: ${error.message}`,
              );
              transformedToCachedUrls.set(localSpecifier, resolvedUrl);
            }),
        );
      }
    }

    await Promise.all(promises);
    return transformedToCachedUrls;
  }

  // Process a single dependency
  async #processDependency(specifier: string, baseUrl: URL, importMap?: ImportMap): Promise<string> {
    const resolvedUrl = this.#isRelativeOrFileUrl(specifier) ? new URL(specifier, baseUrl) : new URL(specifier);
    return await this.#transformModule(resolvedUrl, importMap);
  }

  // Optimized URL checks
  #isRelativeOrFileUrl(specifier: string): boolean {
    const firstChar = specifier[0];
    return firstChar === "." || firstChar === "/" ||
      specifier.startsWith("file://");
  }

  #isHttpUrl(specifier: string): boolean {
    return specifier.startsWith("http://") || specifier.startsWith("https://");
  }

  #isJsr(specifier: string): boolean {
    return specifier.startsWith("jsr:");
  }

  #isNpm(specifier: string): boolean {
    return specifier.startsWith("npm:");
  }

  // Clear Deno's module cache for a specific URL
  async #clearDenoCacheForUrl(url: URL): Promise<void> {
    const cachedPath = getDenoCacheFilePath(url.href);
    const metadataPath = getDenoCacheMetadataPath(url.href);

    // Check if the cached file exists before trying to remove
    try {
      await Deno.stat(cachedPath);
      // Remove cached file and metadata, ignoring errors
      await Deno.remove(cachedPath).catch(() => {});
      await Deno.remove(metadataPath).catch(() => {});
    } catch {
      // File doesn't exist, nothing to remove
    }
  }
}
