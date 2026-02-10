import { DenoDir } from "@deno/cache-dir";
//import { createGraph } from "@deno/graph";
import { $ } from "@david/dax";
import { assert } from "@std/assert";
import { encodeHex } from "@std/encoding";
import { fromFileUrl, join, SEPARATOR } from "@std/path";

// "https://jsr.io/@brad-jones/cdkts/0.4.1/lib/constructs/mod.ts"
async function cacheInfo(specifier: string) {
  const url = new URL(specifier);
  const local = join(new DenoDir().root, "remote", await urlToFilename(url));
  const emit = join(new DenoDir().root, "gen", await getCacheFilenameWithExtension(url, "js"));
  return { local, emit };
}

async function getCacheFilenameDisk(url: URL): Promise<string | undefined> {
  const scheme = url.protocol.replace(":", "");
  const out: [string, ...string[]] = [scheme];

  switch (scheme) {
    case "wasm": {
      const { hostname, port } = url;
      out.push(port ? `${hostname}_PORT${port}` : hostname);
      out.push(...url.pathname.split("/"));
      break;
    }
    case "http":
    case "https":
    case "data":
    case "blob":
      return await urlToFilename(url);
    case "file": {
      const path = fromFileUrl(url);
      if (!path) {
        return undefined;
      }
      const { host } = url;
      if (host) {
        out.push("UNC");
        out.push(host.replaceAll(":", "_"));
      }
      const pathComponents = path.split(SEPARATOR).filter((p) => p.length > 0);
      if (Deno.build.os === "windows") {
        if (host) {
          // windows will have the host in the result of fromFileUrl, so remove it
          pathComponents.shift();
        }

        const first = pathComponents.shift();
        assert(first);
        out.push(first.replace(/:$/, ""));
      }
      out.push(...pathComponents);
      break;
    }
    default:
      return undefined;
  }
  return join(...out);
}

async function hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

async function getCacheFilenameWithExtension(
  url: URL,
  extension: string,
): Promise<string> {
  const base = await getCacheFilenameDisk(url);
  return base ? `${base}.${extension}` : "";
}

function baseUrlToFilename(url: URL): string {
  const scheme = url.protocol.replace(":", "");
  const out: [string, ...string[]] = [scheme];

  switch (scheme) {
    case "http":
    case "https": {
      const host = url.hostname;
      const hostPort = url.port;
      out.push(hostPort ? `${host}_PORT${hostPort}` : host);
      break;
    }
    case "data":
    case "blob":
      break;
    default:
      throw new TypeError(
        `Don't know how to create cache name for scheme: ${scheme}`,
      );
  }

  return join(...out);
}

async function urlToFilename(url: URL) {
  const cacheFilename = baseUrlToFilename(url);
  let restStr = url.pathname;
  const query = url.search;
  if (query) {
    restStr += `?${query}`;
  }
  const hashedFilename = await hash(restStr);
  return join(cacheFilename, hashedFilename);
}

console.log(await cacheInfo("https://jsr.io/@brad-jones/cdkts/0.4.1/lib/constructs/mod.ts"));

//createGraph("jsr:@brad-jones/cdkts/constructs", {});

// C:\Users\BradJones\Projects\Personal\deno-ts-importer\.pixi\envs\default\var\cache\deno\deps\https\jsr.io\82a71f6a2cbf1e952f0234bb770292bc90e7dd047d51e96541c36b87fb58383c
// C:\Users\BradJones\Projects\Personal\deno-ts-importer\.pixi\envs\default\var\cache\deno\remote\https\jsr.io\53832ef956df9ec18af80bbfad208e07ad4535da7f5b380ea241119811b7abf1

/*
/** Provides information about the state of the cache, which is used by
   * things like [`deno_graph`](https://deno.land/x/deno_graph) to enrich the
   * information about a module graph. *
  cacheInfo = (specifier: string): CacheInfo => {
    // when we are "read-only" (e.g. Deploy) we can access sync versions of APIs
    // so we can't return the cache info synchronously.
    if (this.#readOnly) {
      return {};
    }
    const url = new URL(specifier);
    const local = this.#httpCache.getCacheFilename(url);
    const emitCache = DiskCache.getCacheFilenameWithExtension(url, "js");
    const emit = emitCache
      ? join(this.#diskCache.location, emitCache)
      : undefined;
    return {
      local: isFileSync(local) ? local : undefined,
      emit: emit && isFileSync(emit) ? emit : undefined,
    };
  };
*/
