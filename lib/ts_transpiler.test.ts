import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import ts from "typescript";
import { transpileTypeScript } from "./ts_transpiler.ts";

describe("transpileTypeScript", () => {
  const typescriptCode = `
    interface User {
      name: string;
      age: number;
    }

    function greet(user: User): string {
      return \`Hello, \${user.name}!\`;
    }

    const user: User = { name: "Alice", age: 30 };
    console.log(greet(user));
  `;

  describe("strip mode (default)", () => {
    it("should strip types by default", () => {
      const result = transpileTypeScript(typescriptCode);

      // Should not contain TypeScript type annotations
      assertEquals(result.includes("interface User"), false);
      assertEquals(result.includes(": User"), false);
      assertEquals(result.includes(": string"), false);
      assertEquals(result.includes(": number"), false);

      // Should still contain the runtime code
      assertStringIncludes(result, "function greet");
      assertStringIncludes(result, "user.name");
      assertStringIncludes(result, "console.log");
    });

    it("should strip types when mode is explicitly 'strip'", () => {
      const result = transpileTypeScript(typescriptCode, { mode: "strip" });

      assertEquals(result.includes("interface User"), false);
      assertEquals(result.includes(": User"), false);
      assertStringIncludes(result, "function greet");
    });

    it("should handle complex type annotations", () => {
      const complexCode = `
        type Point = { x: number; y: number };
        const transform = <T extends Point>(p: T): T => p;
        const point: Point = { x: 1, y: 2 };
      `;

      const result = transpileTypeScript(complexCode, { mode: "strip" });

      assertEquals(result.includes("type Point"), false);
      assertEquals(result.includes("<T extends Point>"), false);
      assertEquals(result.includes(": T"), false);
      assertStringIncludes(result, "const transform");
      assertStringIncludes(result, "const point");
    });

    it("should preserve code without types", () => {
      const jsCode = `
        const add = (a, b) => a + b;
        console.log(add(1, 2));
      `;

      const result = transpileTypeScript(jsCode, { mode: "strip" });

      assertStringIncludes(result, "const add");
      assertStringIncludes(result, "a + b");
      assertStringIncludes(result, "console.log");
    });
  });

  describe("transpile mode", () => {
    it("should fully transpile TypeScript code", () => {
      const result = transpileTypeScript(typescriptCode, { mode: "transpile" });

      // Should not contain TypeScript type annotations
      assertEquals(result.includes("interface User"), false);
      assertEquals(result.includes(": User"), false);
      assertEquals(result.includes(": string"), false);

      // Should contain runtime code
      assertStringIncludes(result, "greet");
      assertStringIncludes(result, "user.name");
    });

    it("should transpile with custom compiler options", () => {
      const code = `const x: number = 42;`;
      const result = transpileTypeScript(code, {
        mode: "transpile",
        compilerOptions: {
          target: ts.ScriptTarget.ES5,
        },
      });

      // ES5 should use 'var' instead of 'const'
      assertStringIncludes(result, "var x");
    });

    it("should handle JSX in transpile mode", () => {
      const jsxCode = `
        const element = <div>Hello</div>;
      `;

      const result = transpileTypeScript(jsxCode, { mode: "transpile" });

      // Should transform JSX to React.createElement
      assertStringIncludes(result, "React.createElement");
    });

    it("should transpile enums", () => {
      const enumCode = `
        enum Color {
          Red,
          Green,
          Blue
        }
        const color: Color = Color.Red;
      `;

      const result = transpileTypeScript(enumCode, { mode: "transpile" });

      // Enums are transpiled to IIFE pattern
      assertStringIncludes(result, "Color");
      // Should not have the type annotation
      assertEquals(result.includes(": Color"), false);
    });

    it("should transpile decorators when enabled", () => {
      const decoratorCode = `
        function logged(target: any, key: string) {}
        class Example {
          @logged
          method() {}
        }
      `;

      const result = transpileTypeScript(decoratorCode, {
        mode: "transpile",
        compilerOptions: {
          experimentalDecorators: true,
        },
      });

      assertStringIncludes(result, "class Example");
      assertStringIncludes(result, "method");
    });
  });

  describe("passthrough mode", () => {
    it("should return code unchanged in passthrough mode", () => {
      const result = transpileTypeScript(typescriptCode, { mode: "passthrough" });

      assertEquals(result, typescriptCode);
    });

    it("should preserve exact formatting in passthrough mode", () => {
      const code = `   const   x  :  number   =   42  ;   `;
      const result = transpileTypeScript(code, { mode: "passthrough" });

      assertEquals(result, code);
    });
  });

  describe("environment variable mode", () => {
    it("should respect DENO_TS_IMPORTER_TRANSPILE_MODE=transpile", () => {
      const originalValue = Deno.env.get("DENO_TS_IMPORTER_TRANSPILE_MODE");

      try {
        Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", "transpile");
        const result = transpileTypeScript(typescriptCode);

        // Should transpile, not just strip
        assertEquals(result.includes("interface User"), false);
        assertStringIncludes(result, "greet");
      } finally {
        if (originalValue !== undefined) {
          Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", originalValue);
        } else {
          Deno.env.delete("DENO_TS_IMPORTER_TRANSPILE_MODE");
        }
      }
    });

    it("should respect DENO_TS_IMPORTER_TRANSPILE_MODE=passthrough", () => {
      const originalValue = Deno.env.get("DENO_TS_IMPORTER_TRANSPILE_MODE");

      try {
        Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", "passthrough");
        const result = transpileTypeScript(typescriptCode);

        assertEquals(result, typescriptCode);
      } finally {
        if (originalValue !== undefined) {
          Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", originalValue);
        } else {
          Deno.env.delete("DENO_TS_IMPORTER_TRANSPILE_MODE");
        }
      }
    });

    it("should respect DENO_TS_IMPORTER_TRANSPILE_MODE=strip", () => {
      const originalValue = Deno.env.get("DENO_TS_IMPORTER_TRANSPILE_MODE");

      try {
        Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", "strip");
        const result = transpileTypeScript(typescriptCode);

        assertEquals(result.includes("interface User"), false);
        assertEquals(result.includes(": User"), false);
        assertStringIncludes(result, "function greet");
      } finally {
        if (originalValue !== undefined) {
          Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", originalValue);
        } else {
          Deno.env.delete("DENO_TS_IMPORTER_TRANSPILE_MODE");
        }
      }
    });

    it("should prefer explicit mode option over environment variable", () => {
      const originalValue = Deno.env.get("DENO_TS_IMPORTER_TRANSPILE_MODE");

      try {
        Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", "transpile");
        const result = transpileTypeScript(typescriptCode, { mode: "passthrough" });

        // Should use passthrough despite env var saying transpile
        assertEquals(result, typescriptCode);
      } finally {
        if (originalValue !== undefined) {
          Deno.env.set("DENO_TS_IMPORTER_TRANSPILE_MODE", originalValue);
        } else {
          Deno.env.delete("DENO_TS_IMPORTER_TRANSPILE_MODE");
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = transpileTypeScript("");
      assertEquals(result, "");
    });

    it("should handle code with only whitespace", () => {
      const code = "   \n\n  \t  \n  ";
      const result = transpileTypeScript(code);
      assertEquals(result, code);
    });

    it("should handle code with comments", () => {
      const code = `
        // This is a comment
        /* Multi-line
           comment */
        const x: number = 42;
      `;

      const result = transpileTypeScript(code, { mode: "strip" });

      assertStringIncludes(result, "// This is a comment");
      assertStringIncludes(result, "/* Multi-line");
      assertStringIncludes(result, "const x");
      assertEquals(result.includes(": number"), false);
    });

    it("should handle async/await syntax", () => {
      const code = `
        async function fetchData(): Promise<string> {
          const response = await fetch("https://example.com");
          return await response.text();
        }
      `;

      const result = transpileTypeScript(code, { mode: "strip" });

      assertStringIncludes(result, "async function fetchData");
      assertStringIncludes(result, "await fetch");
      assertEquals(result.includes(": Promise<string>"), false);
    });

    it("should handle template literals", () => {
      const code = `
        const name: string = "World";
        const greeting: string = \`Hello, \${name}!\`;
      `;

      const result = transpileTypeScript(code, { mode: "strip" });

      assertStringIncludes(result, "const name");
      assertStringIncludes(result, "`Hello, ${name}!`");
      assertEquals(result.includes(": string"), false);
    });

    it("should handle class syntax", () => {
      const code = `
        class Animal {
          name: string;

          constructor(name: string) {
            this.name = name;
          }

          speak(): void {
            console.log(\`\${this.name} makes a sound.\`);
          }
        }
      `;

      const result = transpileTypeScript(code, { mode: "strip" });

      assertStringIncludes(result, "class Animal");
      assertStringIncludes(result, "constructor");
      assertStringIncludes(result, "speak");
      assertEquals(result.includes(": string"), false);
      assertEquals(result.includes(": void"), false);
    });

    it("should handle namespace declarations in transpile mode", () => {
      const code = `
        namespace Utils {
          export function log(msg: string): void {
            console.log(msg);
          }
        }
      `;

      const result = transpileTypeScript(code, { mode: "transpile" });

      assertStringIncludes(result, "Utils");
      assertEquals(result.includes(": string"), false);
      assertEquals(result.includes(": void"), false);
    });

    it("should handle union and intersection types", () => {
      const code = `
        type StringOrNumber = string | number;
        type Person = { name: string } & { age: number };
        const value: StringOrNumber = "hello";
        const person: Person = { name: "Alice", age: 30 };
      `;

      const result = transpileTypeScript(code, { mode: "strip" });

      assertEquals(result.includes("type StringOrNumber"), false);
      assertEquals(result.includes("type Person"), false);
      assertStringIncludes(result, "const value");
      assertStringIncludes(result, "const person");
    });
  });

  describe("compiler options", () => {
    it("should use default compiler options when not provided", () => {
      const code = `const x: number = 42;`;
      const result = transpileTypeScript(code, { mode: "transpile" });

      // Should transpile successfully with defaults
      assertStringIncludes(result, "x");
      assertEquals(result.includes(": number"), false);
    });

    it("should merge custom compiler options with defaults", () => {
      const code = `const x = 42;`;
      const result1 = transpileTypeScript(code, {
        mode: "transpile",
        compilerOptions: { target: ts.ScriptTarget.ES5 },
      });

      const result2 = transpileTypeScript(code, {
        mode: "transpile",
        compilerOptions: { target: ts.ScriptTarget.ESNext },
      });

      // Both should transpile, potentially with different output
      assertStringIncludes(result1, "42");
      assertStringIncludes(result2, "42");
    });
  });
});
