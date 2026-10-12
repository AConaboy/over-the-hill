// URLs for the hand-written CSS and JS in public/, with a content hash on
// the end (worked out at build time in astro.config.mjs), so they can be
// cached for a year (see public/_headers) and still update on every change.

declare const __ASSET_HASHES__: Record<string, string>;

export function asset(path: string): string {
  const hash = __ASSET_HASHES__[path];
  return hash ? `${path}?v=${hash}` : path;
}
