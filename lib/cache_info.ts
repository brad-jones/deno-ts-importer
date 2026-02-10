import { encodeHex } from "@std/encoding";
import { join, toFileUrl } from "@std/path";
import { getDefaultDenoCacheDir } from "./cache.ts";

/**
 * The cacheInfo method was removed from @deno/cache-dir.
 * For the last know implementation, see: https://github.com/denoland/deno_cache_dir/tree/081752d9530461c7ab99fe2644edca03dc9b37d1
 *
 * This implementation is based on the logic from that version,
 * but adapted to work with the current Deno APIs and to be
 * self-contained within this project.
 *
 * We really only need it for JSR imports as @deno/loader returns local file:// URLs for npm specifiers.
 */
export async function cacheInfo(specifier: string) {
  return toFileUrl(join(getDefaultDenoCacheDir(), "remote", await urlToFilename(new URL(specifier))));
}

async function hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
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
