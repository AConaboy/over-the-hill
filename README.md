# Over the Hill

Website and guest sign-up/ticketing system for Over the Hill.

Built with [Astro](https://astro.build) (SSR, via the `@astrojs/cloudflare` adapter),
[Cloudflare D1](https://developers.cloudflare.com/d1/) for guest data, and
[Resend](https://resend.com) for RSVP confirmation emails. See
`docs/signup-ticketing-spec.md` for the design and `docs/deployment.md` for
how to set this up from scratch.

## Deploying

GitHub Actions deploys on every push: **any branch → staging**
(`staging.overthehill.live`, hosts only) and **`main` → production**
(`overthehill.live`). Checks (type-check, tests, build) run first, and on
every PR. Work on a branch, check it on staging, then merge via a PR. See
`docs/deployment.md` for details and the one-off setup.

## Project structure

```text
/
├── public/            static assets (css, images, favicon)
├── src/
│   ├── layouts/        shared page layout
│   ├── components/     Nav, TicketQr, LinkProblemNotice
│   ├── lib/             D1/Resend access, guest data logic
│   └── pages/
│       ├── *.astro      static content pages (about, camping, food, …)
│       ├── rsvp/         RSVP landing + per-guest [token] form
│       ├── ticket/       per-guest [token] ticket/status view
│       ├── admin/        guest list, add/edit, protected by Cloudflare Access
│       └── api/          form-submission handlers
├── migrations/          D1 SQL schema
├── .github/workflows/   CI checks + deploys (staging / production)
├── wrangler.jsonc       Cloudflare Worker config, production + env.staging
└── docs/                spec + deployment guide
```

## Commands

| Command           | Action                                       |
| ------------------ | --------------------------------------------- |
| `npm install`      | Install dependencies                          |
| `npm run dev`       | Start local dev server at `localhost:4321`    |
| `npm run build`     | Build for production (`./dist/`)              |
| `npm run preview`   | Preview the production build locally          |
| `npm run check`     | Type-check the project                        |
| `npm test`          | Run the unit tests (pure logic in `src/lib`)  |

Copy `.env.example` to `.env` and fill in a real Resend value to run locally
(D1 needs no secret — see `docs/deployment.md`).
