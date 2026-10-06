import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the pure logic in src/lib. They run under plain Node, so the
// Workers-only `cloudflare:workers` import is swapped for a stub — anything
// that actually touches the database isn't covered here.
export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(new URL("./test/cloudflare-workers-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
