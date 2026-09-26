## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## New pages

Every page uses `src/layouts/Layout.astro`, which loads the wandering butterfly (`public/js/butterfly.js`) on every page except `/admin`. When adding a page:

- Give it a `PageHero` (or another `.page-hero h1`): without the poster, the butterfly's home is standing on that heading (falling back to the header logo).
- Give it places to land: stops come from `perches()` in `public/js/butterfly.js`. Page headings, cards (`.content-block`), form labels and buttons inside `.page-content` are already covered; add any new kind of element there, and add its text to `TEXT` (or to `FIELDS` for things like images and inputs) so the butterfly never sits over it.
- Check it on a phone and a laptop: it should only ever land where you can see it.
