# Guest sign-up and tickets — overview for hosts

This explains, in plain terms, how we're planning to handle guest sign-ups and (later) tickets for Over the Hill. It's for the other hosts to sanity-check before we build anything. The full technical spec lives alongside this in `signup-ticketing-spec.md` if anyone wants the details.

## What's changing

Right now, RSVP is a public form on the website that anyone with the link can fill in, and responses land in an email inbox. We're replacing that with:

- A **personal sign-up link for each invited guest** — not a public form.
- Responses saved somewhere we can actually browse, search, and edit — not just a pile of emails.
- A simple on-screen **confirmation/ticket** guests see once they've signed up.
- A foundation that lets us add a deposit or ticket payment later, without redoing any of this.

## How a guest signs up

1. We send each guest their own personal link (by email or WhatsApp, same as now — nothing is automated on our end).
2. They open it and see a form pre-filled with their name, already addressed to them.
3. They fill in the details below and submit.
4. If they're attending, they see a confirmation on screen with a small QR code — a lightweight "you're on the list" ticket. No payment involved at this stage.
5. They also automatically get a confirmation email straight away, summarising what they submitted with a link back to their personal ticket page — this part is sent by the system itself, not something we do manually.
6. They can come back to the same link any time to see their answers or change their mind (e.g. plans change, dietary needs update). Resubmitting just updates their existing record and sends them a fresh confirmation email — it doesn't create a duplicate.

Because the link is personal to them, nobody else can see or edit their answers, and they can't see anyone else's.

**Links expire if unused.** If a guest doesn't fill the form in, their link stops working after 30 days (a number we can tune) — this is just to stop old, unanswered invite links sitting around indefinitely. If they've already responded, their link keeps working forever so they can still view or update it. If someone's link has lapsed (or they've lost it), a host can generate them a fresh one from the admin page in a couple of clicks.

## What data we collect from each guest

- Name (pre-filled, since we're inviting them)
- Email and phone number
- Whether they're attending
- Arrival and departure days
- Camping / accommodation plans, and whether they're bringing a car or campervan
- Dietary requirements or allergies
- Accessibility requirements
- Any other notes they want to leave us

This is the same information the current RSVP form asks for — we're not adding new questions, just changing how it's collected and stored.

Note: guests don't get to bring uninvited plus-ones — one invite is one person. A guest can, however, be invited by more than one of us (the system will track that).

## The "ticket" (QR code)

Once someone confirms they're attending, they get a QR code on screen. For now it's just a friendly confirmation they can screenshot — it doesn't do anything functional yet. Later, this is the same code we'd use to check people in at the gate, and the same code that would show "paid" once ticket payments are added — so nobody gets a second, different code when that happens.

## How we (the hosts) manage the list

- We'll have a private, password-protected admin page where we can:
  - See everyone's status at a glance (invited / responded / attending / not attending), including whether their confirmation email actually went through.
  - Filter the list down to just the guests each of us personally invited, so it's quick to find and copy our own people's links without scrolling past everyone else's.
  - Fix a typo in someone's contact details.
  - Add a new guest to the list ourselves (e.g. someone we decide to invite later), which gives them their own personal link straight away.
  - Regenerate a guest's link if it's expired, lost, or we just want to invalidate the old one.
- This replaces having to dig through spreadsheet rows or email threads to see where things stand.

## What happens with payments (later, not yet)

No payment is part of this first stage — sign-up stays free-to-submit, same as it is now. When we're ready to add a deposit or full ticket price (all in GBP, £):

- We'd set up a simple payment link (via Stripe) for the amount we want to collect.
- A guest's payment would automatically be matched back to their record, so we always know who's paid and how much.
- Guests wouldn't need a new link or a new QR code — they'd just see their existing ticket update to show "deposit paid" or "paid in full" once they've paid.
- We'd still be able to see and, if needed, manually correct payment status ourselves.

## What this doesn't change

- We're still sending the *initial invite links* to guests ourselves — there's no automatic mass emailing of invites. The only automated email is the confirmation a guest gets after they submit their own RSVP.
- The site's other pages (about, camping, food, activities, travel, FAQs, line-up, the game) stay the same in content — they're just being rebuilt on a more capable foundation so features like this are possible.

## Questions for the other hosts

- Is the list of data we're collecting above complete, or is there anything else we should be asking guests for?
- Are we happy with a single shared admin password for now, or do we want individual logins per host?
- Any concerns about guests being able to revisit and change their answers at any time?
- Is 30 days a sensible default before an unanswered link expires, or would we rather it be shorter/longer?
