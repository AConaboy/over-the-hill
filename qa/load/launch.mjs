#!/usr/bin/env node
// Launch-night load test, against staging only: hosts send 300 invites from
// admin over an hour, and guests open their links and reply. Replayed
// faster than real time (--speed, default 5: an hour in 12 minutes).
//
//   node qa/load/launch.mjs setup     300 load-test guests + payments closed
//   node qa/load/launch.mjs run       the evening (prints a summary)
//   node qa/load/launch.mjs teardown  removes them, restores payments
//
// Every request goes through ~/.config/over-the-hill/staging-curl (staging's
// Access service token, never read here). The guests' confirmation emails
// are switched off (confirmation_email_sent_at in the future, see
// canSendConfirmationEmail), so the test sends no email.
//
// Cloudflare's free-plan quotas are per account, shared with production,
// so only some hosts keep reloading the guest list (--polling-hosts, default
// 3 of the 10): enough to measure, without spending production's day.
// Measure CPU with `wrangler tail over-the-hill-staging --format json`.

import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const CURL = join(homedir(), ".config/over-the-hill/staging-curl");
const DB = ["d1", "execute", "over-the-hill-staging", "--remote", "--env", "staging"];
const GUESTS = 300;
const HOSTS = 10;
const STATE = new URL("./.load-state.json", import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]),
);
const SPEED = Number(args.speed ?? 5);
const POLLING_HOSTS = Number(args["polling-hosts"] ?? 3);
const CONCURRENCY = Number(args.concurrency ?? 16);

const pad = (n) => String(n).padStart(3, "0");
const guestId = (i) => `load-${pad(i)}`;
const token = (i) => `load-token-${pad(i)}-qx7`;
const host = (i) => `Loadtest Host ${(i % HOSTS) + 1}`;

function sql(query, json = false) {
  return execFileSync("npx", ["wrangler", ...DB, ...(json ? ["--json"] : []), "--command", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function setup() {
  const settings = JSON.parse(sql("select key, value from settings where key in ('deposits_open', 'balance_open')", true))[0].results;
  writeFileSync(STATE, JSON.stringify({ settings }));
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const guests = [];
  const inviters = [];
  for (let i = 1; i <= GUESTS; i++) {
    guests.push(
      `('${guestId(i)}', '${token(i)}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'Guest ${pad(i)} Loadtest', 'pending', 'invited', '1', '2099-01-01T00:00:00.000Z', ${now}, ${now})`,
    );
    inviters.push(`('load-inv-${pad(i)}', '${guestId(i)}', '${host(i)}')`);
  }
  sql(
    `delete from guests where id like 'load-%';
     insert into guests (id, token, token_expires_at, name, attendance, status, invite_phase, confirmation_email_sent_at, created_at, updated_at)
       values ${guests.join(",\n")};
     insert into guest_inviters (id, guest_id, inviter_name) values ${inviters.join(",\n")};
     update settings set value = '0' where key in ('deposits_open', 'balance_open');`,
  );
  console.log(`Set up ${GUESTS} load-test guests; payments closed (was ${JSON.stringify(settings)}).`);
}

function teardown() {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { settings: [] };
  const restore = state.settings.map((s) => `update settings set value = '${s.value}' where key = '${s.key}';`).join("\n");
  sql(`delete from guests where id like 'load-%';\n${restore}`);
  console.log(`Removed the load-test guests; restored ${JSON.stringify(state.settings)}.`);
}

// --- The evening ---

const results = [];
let running = 0;
const queue = [];

function request(label, method, path, fields = []) {
  return new Promise((resolve) => {
    const go = () => {
      running++;
      const started = performance.now();
      const child = spawn(CURL, [method, path, ...fields], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("close", () => {
        running--;
        const status = Number(out.match(/status: (\d+)/)?.[1] ?? 0);
        results.push({ label, status, ms: performance.now() - started });
        if (queue.length) queue.shift()();
        resolve(status);
      });
    };
    if (running < CONCURRENCY) go();
    else queue.push(go);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const real = (seconds) => (seconds * 1000) / SPEED;
const rand = (a, b) => a + Math.random() * (b - a);

async function guest(i) {
  // most open within the evening, some a while after the message lands
  if (Math.random() > 0.85) return;
  await sleep(real(Math.random() < 0.6 ? rand(10, 300) : rand(300, 1800)));
  await request("chat link preview", "GET", `/rsvp/${token(i)}`);
  await sleep(real(rand(5, 60)));
  await request("guest opens invite", "GET", `/rsvp/${token(i)}`);
  if (Math.random() > 0.7) return; // read it, will reply later
  await sleep(real(rand(60, 300)));
  const yes = Math.random() < 0.85;
  await request("guest replies", "POST", "/api/rsvp", [
    `token=${token(i)}`,
    `email=delivered+load${pad(i)}@resend.dev`,
    `attendance=${yes ? "yes" : "no"}`,
    ...(yes ? ["arrivalDay=fri", "departureDay=sun", "camping=camping", "vehicle=car", "dietary=Vegetarian"] : []),
  ]);
  await request("guest's page after replying", "GET", `/rsvp/${token(i)}?submitted=1`);
}

async function sends() {
  // 300 invites over the hour, spread across the 10 hosts
  const gap = real(3600 / GUESTS);
  const guests = [];
  for (let i = 1; i <= GUESTS; i++) {
    await request("host marks invite sent", "POST", `/api/admin/guests/${guestId(i)}/sent`, ["sent=1", "back=/admin"]);
    guests.push(guest(i));
    await sleep(gap);
  }
  return Promise.all(guests);
}

async function pollingHost(h, until) {
  const views = ["/admin", "/admin", `/admin?inviter=${encodeURIComponent(host(h))}`, "/admin?kind=notSent", "/admin?q=Loadtest"];
  await sleep(rand(0, real(60)));
  while (Date.now() < until) {
    await request("host loads guest list", "GET", views[Math.floor(Math.random() * views.length)]);
    if (Math.random() < 0.15) await request("host opens a guest", "GET", `/admin/guests/${guestId(1 + Math.floor(Math.random() * GUESTS))}/edit`);
    await sleep(real(rand(40, 80)));
  }
}

async function run() {
  const started = Date.now();
  const until = started + real(3600 + 1800);
  console.log(`Replaying the evening at ${SPEED}x: about ${Math.round(real(5400) / 60000)} minutes.`);
  const timer = setInterval(() => console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${results.length} requests`), 30000);
  const hosts = Array.from({ length: POLLING_HOSTS }, (_, h) => pollingHost(h, until));
  const extras = (async () => {
    await sleep(real(1800));
    await request("report", "GET", "/admin/report");
    await request("CSV export", "GET", "/api/admin/export.csv");
  })();
  await Promise.all([sends(), ...hosts, extras]);
  clearInterval(timer);
  summary(Date.now() - started);
}

function summary(elapsed) {
  const byLabel = new Map();
  for (const r of results) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
  console.log(`\n${results.length} requests in ${Math.round(elapsed / 1000)}s`);
  console.log("route | count | statuses | p50 ms | p95 ms (includes ~100-300 ms of curl + TLS from here)");
  for (const [label, rs] of byLabel) {
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
    const statuses = Object.entries(rs.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}))
      .map(([s, n]) => `${s}×${n}`)
      .join(" ");
    console.log(`${label} | ${rs.length} | ${statuses} | ${Math.round(pct(ms, 50))} | ${Math.round(pct(ms, 95))}`);
  }
  writeFileSync(new URL("./.load-results.json", import.meta.url), JSON.stringify(results));
}

const command = process.argv[2];
if (command === "setup") setup();
else if (command === "teardown") teardown();
else if (command === "run") await run();
else console.log("usage: node qa/load/launch.mjs setup | run [--speed=5 --polling-hosts=3] | teardown");
