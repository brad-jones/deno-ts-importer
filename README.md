<div align="center">

### 🚀 deno-ts-importer

_Dynamically import TypeScript from compiled Deno binaries!_

[![Built with Deno](https://img.shields.io/badge/Built%20with-Deno-00ADD8?style=flat&logo=deno)](https://deno.com/)
[![JSR Version](https://img.shields.io/jsr/v/%40brad-jones/deno-ts-importer?style=flat&logo=jsr)](https://jsr.io/@brad-jones/deno-ts-importer)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)

---

</div>

## Overview

This project is a fork of [deno-import-map-importer](https://github.com/lambdalisue/deno-import-map-importer) by [@lambdalisue](https://github.com/lambdalisue). We extend our gratitude for the original implementation that made this project possible.

**Why this fork exists:** The main purpose of this fork is to add TypeScript transpilation functionality (`transpileTypeScript`), enabling the importer to work from compiled Deno binaries that still need to import TypeScript source files. Without this feature, compiled Deno executables lose the ability to dynamically import `.ts` files since the TypeScript compiler is not available at runtime.

## Features

- **TypeScript Transpilation**: Three modes to handle TypeScript code:
  - `strip` - Fast type stripping (default)
  - `transpile` - Full TypeScript compilation with configurable compiler options
  - `passthrough` - No transformation (useful when Deno runtime handles TypeScript)
- **Import Map Support**: Apply import maps to module imports for flexible dependency resolution
- **High Performance**: Multiple optimization strategies
  - Memory caching of loaded modules
  - Disk caching of transformed source code
  - Pre-processed import maps for O(1) lookups
  - Parallel dependency processing
- **Circular Dependency Detection**: Handles complex module graphs safely
- **Works in Compiled Binaries**: Import TypeScript files from `deno compile` executables
- **Flexible Cache Management**: Customize cache location or use Deno's default cache

## Installation

```typescript
import { TsImporter } from "jsr:@brad-jones/deno-ts-importer";
```

Or add to your `deno.json`:

```json
{
  "imports": {
    "@brad-jones/deno-ts-importer": "jsr:@brad-jones/deno-ts-importer@^0.0.0"
  }
}
```

## Usage

### Basic Example

```typescript
import { TsImporter } from "@brad-jones/deno-ts-importer";
import { toFileUrl } from "@std/path/to-file-url";

// Create an importer with an import map
const importer = new TsImporter({
  imports: {
    "lodash": "https://cdn.skypack.dev/lodash",
    "@utils/": "./src/utils/",
  },
});

// Import a TypeScript module
const module = await importer.import<{ foo: () => string }>(
  toFileUrl("./foo.ts").toString(),
);

console.log(module.foo());
```

### Using in Compiled Binaries

The key use case for this package - importing TypeScript from compiled executables:

```typescript
import { TsImporter } from "@brad-jones/deno-ts-importer";

// This works in both `deno run` and `deno compile` outputs
const importer = new TsImporter({ imports: {} });
const module = await importer.import<MyModule>("./my-module.ts");
```

Compile your application:

```bash
deno compile -A --output myapp main.ts
```

Your compiled binary can now dynamically import TypeScript files!

### Transpilation Modes

#### Strip Mode (Default)

Fast type stripping using [@fcrozatier/type-strip](https://jsr.io/@fcrozatier/type-strip):

```typescript
const importer = new TsImporter({ imports: {} }, {
  tsTranspileMode: "strip", // or omit for default
});
```

#### Transpile Mode

Full TypeScript compilation with custom compiler options:

```typescript
import ts from "typescript";

const importer = new TsImporter({ imports: {} }, {
  tsTranspileMode: "transpile",
  tsCompilerOptions: {
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
  },
});
```

#### Passthrough Mode

No transformation - let Deno's runtime handle TypeScript:

```typescript
const importer = new TsImporter({ imports: {} }, {
  tsTranspileMode: "passthrough",
});
```

Or via environment variable:

```bash
DENO_TS_IMPORTER_TRANSPILE_MODE=passthrough deno run main.ts
```

### Custom Cache Directory

```typescript
const importer = new TsImporter({ imports: {} }, {
  // Absolute path
  cacheDir: "/tmp/my-cache",
  // Or relative path (resolved from CWD)
  // cacheDir: ".cache/imports"
});
```

### Import Map with Scopes

```typescript
const importer = new TsImporter({
  imports: {
    "react": "https://esm.sh/react@18",
  },
  scopes: {
    "https://esm.sh/": {
      "react": "https://esm.sh/react@17",
    },
  },
});
```

## API Reference

### `TsImporter`

The main class for processing modules with import maps.

#### Constructor

```typescript
constructor(importMap: ImportMap, options?: TsImporterOptions)
```

**Parameters:**

- `importMap`: An import map configuration object with `imports` and optional `scopes`
- `options`: Optional configuration object

#### `import<T>(specifier: string): Promise<T>`

Imports a module after applying import map transformations.

**Parameters:**

- `specifier`: The module specifier to import (relative path, absolute URL, or bare specifier)

**Returns:** Promise resolving to the imported module

### `TsImporterOptions`

Configuration options for `TsImporter`:

```typescript
type TsImporterOptions = {
  /**
   * Custom cache directory path.
   * Can be absolute or relative (resolved to CWD).
   * Defaults to Deno's cache directory under "import_map_importer".
   */
  cacheDir?: string;

  /**
   * Whether to clear Deno's module cache before importing.
   * Useful for resolving issues with nested deno.jsonc files.
   * @default false
   */
  clearDenoCache?: boolean;

  /**
   * TypeScript transpilation mode.
   * Can also be set via DENO_TS_IMPORTER_TRANSPILE_MODE env var.
   * @default "strip"
   */
  tsTranspileMode?: "transpile" | "strip" | "passthrough";

  /**
   * TypeScript compiler options (only used in "transpile" mode).
   * Merged with default Deno-optimized settings.
   */
  tsCompilerOptions?: ts.CompilerOptions;
};
```

### `ImportMap`

Import map structure following the [Import Maps specification](https://github.com/WICG/import-maps):

```typescript
type ImportMap = {
  imports: Imports;
  scopes?: Scopes;
};

type Imports = Record<string, string>;
type Scopes = Record<string, Imports>;
```

### Helper Functions

#### `loadImportMap(path: string): Promise<ImportMap>`

Loads an import map from a JSON file.

```typescript
import { loadImportMap } from "@brad-jones/deno-ts-importer";

const importMap = await loadImportMap("./import_map.json");
```

## How It Works

1. **Module Resolution**: Resolves the module specifier using the provided import map
2. **TypeScript Transpilation**: Converts TypeScript to JavaScript based on the selected mode
3. **Import Transformation**: Recursively processes all import statements in the module
4. **Caching**: Stores transformed modules in memory and on disk for fast subsequent loads
5. **Circular Detection**: Tracks processing modules to handle circular dependencies safely

## Why Use This?

### Problem

When you compile a Deno application with `deno compile`, the resulting binary loses the ability to dynamically import TypeScript files because the TypeScript compiler is not included in the executable.

```typescript
// This works with `deno run`
const module = await import("./my-module.ts");

// But FAILS with a compiled binary from `deno compile`
// Error: SyntaxError: Unexpected token...
```

### Solution

`deno-ts-importer` includes a lightweight TypeScript transpiler that runs at import time:

```typescript
import { TsImporter } from "@brad-jones/deno-ts-importer";

const importer = new TsImporter({ imports: {} });
// This works in both `deno run` AND compiled binaries!
const module = await importer.import("./my-module.ts");
```

## License

MIT - See [LICENSE](LICENSE) file

## Credits

This project is a fork of [deno-import-map-importer](https://github.com/lambdalisue/deno-import-map-importer) by [@lambdalisue](https://github.com/lambdalisue). The original project provided the foundation for import map processing and caching.
