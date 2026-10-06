// A10 and A11: after a deploy, check the site answers and stays locked.
//   npm run qa:staging                                   staging
//   QA_SITE=https://overthehill.live npm run qa:staging  production
//
// Signed-in requests go through the staging-curl helper, which holds
// staging's Cloudflare Access service token (QA_STAGING_CURL if it's
// elsewhere); they're skipped for any other site. Staging keeps the whole
// site behind Access, so there its public pages are checked signed in too.
// QA_WORKERS_DEV_URL, if set, is checked to refuse admin as well.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const SITE = (process.env.QA_SITE ?? "https://staging.overthehill.live").replace(/\/$/, "");
const IS_STAGING = new URL(SITE).hostname.startsWith("staging.");
const STAGING_CURL = process.env.QA_STAGING_CURL ?? `${homedir()}/.config/over-the-hill/staging-curl`;
const canSignIn = IS_STAGING && existsSync(STAGING_CURL);

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

/** A signed-in request: { status, body }. */
function signedIn(path) {
  const out = execFileSync(STAGING_CURL, ["GET", path], { encoding: "latin1", maxBuffer: 20e6 });
  const status = Number(/\n--\nstatus: (\d+)/.exec(out)?.[1] ?? 0);
  return { status, body: out.slice(0, out.lastIndexOf("\n--\nstatus:")) };
}

const home = await fetch(`${SITE}/`, { redirect: "manual" });
const wholeSiteLocked = home.status === 302 && (home.headers.get("location") ?? "").includes("cloudflareaccess.com");
console.log(`${SITE}: ${wholeSiteLocked ? "whole site behind Access" : "public site open"}\n`);

// public pages answer (and send the security policy, where it can be seen)
const PUBLIC = ["/", "/location", "/privacy", "/rsvp", "/rsvp/not-a-real-token"];
for (const path of PUBLIC) {
  if (!wholeSiteLocked) {
    const response = await fetch(SITE + path, { redirect: "manual" });
    check(response.status === 200, `${path} answers (${response.status})`);
    check((response.headers.get("content-security-policy") ?? "").includes("script-src 'self'"), `${path} sends the security policy`);
  } else if (canSignIn) {
    const { status, body } = signedIn(path);
    check(status === 200 && body.includes("<main"), `${path} answers when signed in (${status})`);
  }
}

// the hosts' pages refuse anyone not signed in
const LOCKED = ["/admin", "/admin/import", "/admin/report", "/admin/checkin", "/checkin/ANY", "/api/admin/export.csv", "/api/admin/checkin-sheet.pdf"];
for (const base of [SITE, process.env.QA_WORKERS_DEV_URL?.replace(/\/$/, "")].filter(Boolean)) {
  for (const path of LOCKED) {
    const response = await fetch(base + path, { redirect: "manual" });
    check([302, 401, 403].includes(response.status), `${base}${path} is locked without Access (${response.status})`);
  }
}

// and work when signed in
if (canSignIn) {
  try {
    check(/<h1>Guests/.test(signedIn("/admin").body), "admin guest list loads when signed in");
    check(/<h1>Planning report/.test(signedIn("/admin/report").body), "report loads when signed in");
    check(signedIn("/api/admin/export.csv").body.includes("Name,Invited by"), "CSV downloads when signed in");
    check(signedIn("/api/admin/checkin-sheet.pdf").body.includes("%PDF-"), "check-in PDF downloads when signed in");
  } catch (error) {
    check(false, `signed-in checks (staging-curl at ${STAGING_CURL}): ${error.message.split("\n")[0]}`);
  }
} else {
  console.log("skip  signed-in checks (only on staging, with the staging-curl helper)");
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
