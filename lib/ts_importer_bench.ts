import type { ImportMap } from "./import_map.ts";
import { TsImporter } from "./ts_importer.ts";

// Setup test modules URLs
const simpleModuleUrl = new URL("./testdata/simple.ts", import.meta.url);
const nestedModuleUrl = new URL("./testdata/nested_module.ts", import.meta.url);
const noImportsModuleUrl = new URL("./testdata/no_imports.ts", import.meta.url);
const circularModuleUrl = new URL("./testdata/circular_a.ts", import.meta.url);

// Create URLs for modules that don't use import maps (for comparison)
const simpleDepUrl = new URL("./testdata/simple_dep.ts", import.meta.url);

// Create import map
const importMap: ImportMap = {
  imports: {
    "@example/simple": new URL("./testdata/simple_dep.ts", import.meta.url).href,
    "@example/dep1": new URL("./testdata/dep1.ts", import.meta.url).href,
    "@example/dep2": new URL("./testdata/dep2.ts", import.meta.url).href,
    "@example/shared": new URL("./testdata/shared.ts", import.meta.url).href,
    "@example/circular-a": new URL("./testdata/circular_a.ts", import.meta.url).href,
    "@example/circular-b": new URL("./testdata/circular_b.ts", import.meta.url).href,
  },
};

// Create custom cache directory for benchmarks
const benchCacheDir = "./.bench_cache";

// Cleanup function
async function cleanup() {
  try {
    await Deno.remove(benchCacheDir, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// Benchmark: Simple module import (cold cache)
Deno.bench(
  "TsImporter.import() - simple module (cold cache)",
  async () => {
    await cleanup();
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(simpleModuleUrl.href);
  },
);

// Benchmark: Simple module import (warm cache)
Deno.bench(
  "TsImporter.import() - simple module (warm cache)",
  async (b) => {
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    // Pre-warm the cache
    await importer.import(simpleModuleUrl.href);

    b.start();
    await importer.import(simpleModuleUrl.href);
    b.end();
  },
);

// Benchmark: Module with no imports
Deno.bench("TsImporter.import() - module with no imports", async () => {
  await cleanup();
  const importer = new TsImporter(importMap, {
    cacheDir: benchCacheDir,
  });
  await importer.import(noImportsModuleUrl.href);
});

// Benchmark: Module with nested dependencies (cold cache)
Deno.bench(
  "TsImporter.import() - nested dependencies (cold cache)",
  async () => {
    await cleanup();
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(nestedModuleUrl.href);
  },
);

// Benchmark: Module with nested dependencies (warm cache)
Deno.bench(
  "TsImporter.import() - nested dependencies (warm cache)",
  async (b) => {
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    // Pre-warm the cache
    await importer.import(nestedModuleUrl.href);

    b.start();
    await importer.import(nestedModuleUrl.href);
    b.end();
  },
);

// Benchmark: Circular dependencies
Deno.bench("TsImporter.import() - circular dependencies", async () => {
  await cleanup();
  const importer = new TsImporter(importMap, {
    cacheDir: benchCacheDir,
  });
  await importer.import(circularModuleUrl.href);
});

// Benchmark: Multiple imports of same module (memory cache)
Deno.bench(
  "TsImporter.import() - repeated imports (memory cache)",
  async (b) => {
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    // First import to populate caches
    await importer.import(simpleModuleUrl.href);

    b.start();
    // Measure subsequent imports that hit memory cache
    for (let i = 0; i < 100; i++) {
      await importer.import(simpleModuleUrl.href);
    }
    b.end();
  },
);

// Benchmark: Import with large import map
Deno.bench("TsImporter.import() - large import map", async () => {
  await cleanup();

  // Create a large import map with many entries
  const largeImportMap: ImportMap = {
    imports: {
      ...importMap.imports,
      // Add many more entries
      ...Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [
          `@fake/module${i}`,
          `https://example.com/fake${i}.js`,
        ]),
      ),
    },
  };

  const importer = new TsImporter(largeImportMap, {
    cacheDir: benchCacheDir,
  });
  await importer.import(simpleModuleUrl.href);
});

// Benchmark: Import with scoped imports
Deno.bench("TsImporter.import() - scoped imports", async () => {
  await cleanup();

  const scopedImportMap: ImportMap = {
    imports: {},
    scopes: {
      [new URL("./testdata/", import.meta.url).href]: {
        "@example/simple": new URL("./testdata/simple_dep.ts", import.meta.url).href,
      },
    },
  };

  const importer = new TsImporter(scopedImportMap, {
    cacheDir: benchCacheDir,
  });
  await importer.import(simpleModuleUrl.href);
});

// === COMPARISON BENCHMARKS WITH NATIVE IMPORT ===

// Benchmark: Native dynamic import (baseline)
Deno.bench("Native import() - simple module", async () => {
  // Clear module cache by adding timestamp
  const url = `${simpleDepUrl.href}?t=${Date.now()}`;
  await import(url);
});

// Benchmark: Native dynamic import of module with no imports
Deno.bench("Native import() - module with no imports", async () => {
  const url = `${noImportsModuleUrl.href}?t=${Date.now()}`;
  await import(url);
});

// Benchmark: Native import with cached module
Deno.bench("Native import() - cached module", async (b) => {
  // First import to ensure it's cached
  await import(simpleDepUrl.href);

  b.start();
  // Measure cached imports
  for (let i = 0; i < 100; i++) {
    await import(simpleDepUrl.href);
  }
  b.end();
});

// Benchmark: TsImporter vs Native - side by side
Deno.bench({
  name: "Comparison: TsImporter vs Native (first import)",
  group: "import-comparison",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });
    await importer.import(noImportsModuleUrl.href);
  },
});

Deno.bench({
  name: "Comparison: Native import (first import)",
  group: "import-comparison",
  async fn() {
    const url = `${noImportsModuleUrl.href}?t=${Date.now()}`;
    await import(url);
  },
});

// Benchmark: Memory usage comparison
Deno.bench({
  name: "Memory: TsImporter - 10 different modules",
  group: "memory-comparison",
  baseline: true,
  async fn() {
    await cleanup();
    const importer = new TsImporter(importMap, {
      cacheDir: benchCacheDir,
    });

    // Import multiple different modules
    await importer.import(simpleModuleUrl.href);
    await importer.import(noImportsModuleUrl.href);
    await importer.import(nestedModuleUrl.href);
    await importer.import(circularModuleUrl.href);
    // Import some again to test caching
    await importer.import(simpleModuleUrl.href);
    await importer.import(noImportsModuleUrl.href);
  },
});

Deno.bench({
  name: "Memory: Native import - 10 different modules",
  group: "memory-comparison",
  async fn() {
    // Import same modules with native import
    await import(`${simpleDepUrl.href}?t=${Date.now()}`);
    await import(`${noImportsModuleUrl.href}?t=${Date.now()}`);
    await import(
      `${new URL("./testdata/lib.ts", import.meta.url).href}?t=${Date.now()}`
    );
    await import(
      `${new URL("./testdata/utils.ts", import.meta.url).href}?t=${Date.now()}`
    );
  },
});

// Cleanup after all benchmarks
globalThis.addEventListener("unload", () => {
  cleanup();
});
