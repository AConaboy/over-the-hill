// Stand-in for the Workers runtime module under Node. Tests only exercise
// pure functions, so touching the database here is a test bug.
export const env = new Proxy(
  {},
  {
    get() {
      throw new Error("cloudflare:workers env isn't available in unit tests");
    },
  },
);

export function waitUntil(): void {}
