# QA suite

Part A of the QA plan: the checks that run automatically. Part B (the
team's manual tests) is in the shared QA plan doc.

| Command | What it runs | When |
| --- | --- | --- |
| `npm run qa` | Unit tests, type check, then every browser test below | Before every staging deploy, and before production |
| `npm run qa:browser` | Just the browser tests | While working on something |
| `npm run qa:staging` | Staging answers, stays locked, and admin works signed in | After each staging deploy |
| `QA_SITE=https://overthehill.live npm run qa:staging` | The same against production (no signed-in checks) | After a production deploy |

## What the browser tests cover

| File | Plan | Covers |
| --- | --- | --- |
| `tests/csp.spec.ts` | A4 | The strict Content Security Policy blocks nothing of ours, on every public page (production build, phone and laptop) and every admin page |
| `tests/guest.spec.ts` | A5 | Opening an invite (RSVP-by date from their link, Paying text before the form), replying yes and no, days with dates, lift share and glamping fields, editing, calendar file, expired and made-up links, find-my-link |
| `tests/admin.spec.ts` | A6 | Search and every filter, headline numbers, status badges (not opened, opened, expired), Copy message, Copy link, the Sent tick box, add, edit and history, regenerate, the Payments page's stage guide and payment-due emails, editing, previewing and test-sending emails, phone layout |
| `tests/import.spec.ts` | A7 | Importing a made-up sheet a phase at a time, re-importing, and every to-fix action |
| `tests/report.spec.ts` | A8 | Report, CSV (formula guard), the check-in PDF, checking in by search and by ticket |
| `tests/motion.spec.ts` | A9 | Butterfly, reduced motion, the payment celebration, labels and headings |
| `tests/a11y.spec.ts` | A12 | WCAG 2.2 AA with axe on every guest and admin page (phone and laptop), the skip link, Pause animations, reflow at 320px. The manual accessibility tests are B8 in the QA plan doc |

## How it works

- It starts its own dev server on port 4322 (with its own Vite cache, so it
  can't disturb yours on 4321) and a production build on 4399, or reuses
  them if already running. For a fresh build, `npx astro preview stop` first.
- It uses the **local** database only. It seeds QA guests (ids start `qa-`,
  names contain `Qatest`) and removes them afterwards; nothing else is
  touched. `QA_KEEP_DATA=1` keeps them for a look after a failure.
- Emails go to `delivered@resend.dev`, Resend's test address: accepted,
  never delivered.
- Failures leave a trace in `qa/test-results/`:
  `npx playwright show-trace qa/test-results/<test>/trace.zip`.
- Stripe's checkout can't be driven from here: payments by card are in the
  team's manual tests (Part B, P-01 to P-06).
- There are no Stripe keys locally, so the RSVP page is always at the
  "nothing to pay yet" stage here. The deposit and full-price stages (what
  the Paying text says, going straight to pay on yes) are covered by unit
  tests of `nextPayment` and the emails, and checked by hand on staging.
