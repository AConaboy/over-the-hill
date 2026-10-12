import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sql } from "../db";
import { expectNoSidewaysScroll, PHONE, watchForErrors } from "./helpers";

// Songs for the playlist: once they've paid, a guest picks up to three on
// their own card on their page, while hosts have songs switched on (admin
// Playlist). The QA dev server has no Spotify keys, so the pretend Spotify
// in src/lib/spotify.ts answers (a few made-up songs; nothing leaves the
// machine).
test.describe.configure({ mode: "serial" });

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
let songsSetting: string | undefined;

const setSongsOpen = (open: boolean) =>
  sql(`insert into settings (key, value, updated_at) values ('songs_open', '${open ? 1 : 0}', ${NOW})
       on conflict (key) do update set value = excluded.value`);

// Their own guests (made here rather than in seed.sql, so the other specs'
// lists and counts don't change): one who's paid their deposit, and one
// who's said yes but not paid.
test.beforeAll(() => {
  songsSetting = sql<{ value: string }>("select value from settings where key = 'songs_open'")[0]?.value;
  sql("delete from guests where id in ('qa-songs', 'qa-songs-unpaid')");
  sql(`insert into guests (id, token, token_expires_at, ticket_ref, name, email, attendance, status, registered_at, payment_status, amount_paid_pence,
                           invite_sent_at, created_at, updated_at)
       values ('qa-songs', 'qa-token-songs', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QATEST09', 'QA Songs Qatest', 'delivered@resend.dev',
               'yes', 'rsvp_yes', ${NOW}, 'deposit_paid', 2000, ${NOW}, ${NOW}, ${NOW}),
              ('qa-songs-unpaid', 'qa-token-songs-unpaid', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), null, 'QA Songs Unpaid Qatest', null,
               'yes', 'rsvp_yes', null, 'unpaid', 0, ${NOW}, ${NOW}, ${NOW})`);
  setSongsOpen(true);
});

test.afterAll(() => {
  sql("delete from guests where id in ('qa-songs', 'qa-songs-unpaid')");
  if (songsSetting === undefined) sql("delete from settings where key = 'songs_open'");
  else sql(`update settings set value = '${songsSetting}' where key = 'songs_open'`);
});

const picks = () =>
  sql<{ title: string; position: number; added_at: string | null }>(
    "select title, position, added_at from song_picks where guest_id = 'qa-songs' order by position",
  );

async function addSong(page: Page, query: string, title: string) {
  await page.getByLabel("Search for a song or artist").fill(query);
  await page.getByRole("button", { name: new RegExp(`${title}.*Add`) }).click();
}

async function saveSongs(page: Page) {
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Save songs" }).click()]);
}

test("songs only show while hosts have them switched on", async ({ page }) => {
  setSongsOpen(false);
  await page.goto("/rsvp/qa-token-songs");
  await expect(page.locator("#songs")).toHaveCount(0);
  setSongsOpen(true);
  await page.goto("/rsvp/qa-token-songs");
  await expect(page.getByRole("heading", { name: "Your songs for the playlist" })).toBeVisible();
});

test("a guest who's paid picks songs on their own card, up to three", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.setViewportSize(PHONE);
  await page.goto("/rsvp/qa-token-songs");
  // their songs are a card of their own, not one of their answers
  await expect(page.locator(".flower-list")).not.toContainText("Songs");
  // the boxes for links are for when there's no JavaScript
  await expect(page.locator("#song-1")).toBeHidden();

  await addSong(page, "queen", "Dancing Queen");
  await expect(page.locator(".song-status")).toHaveText("Added Dancing Queen by ABBA. 1 of 3 songs picked.");
  // one already picked shows as picked, not addable
  await page.getByLabel("Search for a song or artist").fill("queen");
  await expect(page.getByRole("button", { name: /Dancing Queen.*Picked/ })).toBeDisabled();
  // Enter in the search searches; it doesn't send the form
  await page.getByLabel("Search for a song or artist").fill("killers");
  await page.getByLabel("Search for a song or artist").press("Enter");
  await expect(page).not.toHaveURL(/songs=/);
  await addSong(page, "killers", "Mr. Brightside");
  await addSong(page, "beatles", "Here Comes the Sun");
  // three's the limit
  const search = page.locator("#song-search");
  await expect(search).toBeDisabled();
  await expect(page.locator("label[for=song-search]")).toHaveText("You’ve picked 3 songs. Remove one to choose another.");
  await page.getByRole("button", { name: "Remove Mr. Brightside" }).click();
  await expect(search).toBeEnabled();
  await addSong(page, "weeknd", "Blinding Lights");
  await expectNoSidewaysScroll(page);

  await saveSongs(page);
  await expect(page).toHaveURL(/songs=saved#songs$/);
  await expect(page.getByText("Saved your songs.")).toBeVisible();
  await expect(page.locator(".song-chosen li")).toHaveCount(3);
  expect(picks().map((p) => p.title)).toEqual(["Dancing Queen", "Here Comes the Sun", "Blinding Lights"]);
  expect(picks().every((p) => p.added_at)).toBe(true);
  expect(sql("select 1 from guest_events where guest_id = 'qa-songs' and action = 'songs'")).toHaveLength(1);

  const { violations } = await new AxeBuilder({ page })
    .include("#songs")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // changing them
  await page.getByRole("button", { name: "Remove Dancing Queen" }).click();
  await saveSongs(page);
  expect(picks().map((p) => [p.title, p.position])).toEqual([["Here Comes the Sun", 1], ["Blinding Lights", 2]]);
  checkErrors();
});

test("without JavaScript, a guest pastes Spotify links instead", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/rsvp/qa-token-songs");
  await expect(page.locator("#song-1")).toBeVisible();
  // their current picks are there as links
  await expect(page.locator("#song-1")).toHaveValue("https://open.spotify.com/track/5ghIJDpPoe3CfHMGu71E6T");
  await page.fill("#song-3", "https://open.spotify.com/track/7GhIk7Il098yCjg4BQjzvb?si=0123abcd");
  await page.fill("#song-2", "some song I like");
  // sent with Enter: Playwright's click waits for the button to be still,
  // which it can't tell with JavaScript off
  await Promise.all([page.waitForNavigation(), page.locator("#song-2").press("Enter")]);
  // the one that wasn't a link is mentioned, the rest are saved
  await expect(page.getByText("A song you picked couldn't be found on Spotify just now.")).toBeVisible();
  expect(picks().map((p) => p.title)).toEqual(["Here Comes the Sun", "Dancing Queen"]);
  await context.close();
});

test("a guest who hasn't paid is told paying unlocks songs, and can't pick any", async ({ page, request }) => {
  await page.goto("/rsvp/qa-token-songs-unpaid");
  await expect(page.locator("#songs")).toContainText("Once your deposit's paid, you can pick up to three songs");
  await expect(page.getByRole("button", { name: "Save songs" })).toHaveCount(0);

  // a browser's own fetch sends Origin (Astro refuses a cross-site form post)
  const headers = { Origin: "http://localhost:4322" };
  const search = (token: string) => request.post("/api/rsvp/songs/search", { form: { token, q: "queen" }, headers });
  const good = await search("qa-token-songs");
  expect(good.status()).toBe(200);
  expect((await good.json()).tracks[0].title).toBe("Dancing Queen");
  expect((await search("qa-token-songs-unpaid")).status()).toBe(403);
  expect((await search("qa-token-not-real")).status()).toBe(403);
  expect((await search("qa-token-expired")).status()).toBe(403);

  // nor can they save any by posting the form themselves
  await request.post("/api/rsvp/songs/save", { form: { token: "qa-token-songs-unpaid", songs: "7GhIk7Il098yCjg4BQjzvb" }, headers, maxRedirects: 0 });
  expect(sql("select 1 from song_picks where guest_id = 'qa-songs-unpaid'")).toHaveLength(0);
});

test("hosts switch songs on and off, and see every song on Playlist, the guest's page and the CSV", async ({ page, request }) => {
  await page.goto("/admin/playlist");
  await expect(page.getByText("Pretend Spotify", { exact: false })).toBeVisible();
  const row = page.locator(".admin-table tr", { hasText: "Here Comes the Sun" });
  await expect(row).toContainText("QA Songs Qatest");
  await expect(row).toContainText("Yes");

  const toggle = page.getByLabel("Guests can pick songs");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await Promise.all([page.waitForNavigation(), page.locator("#settings button[type=submit]").click()]);
  await expect(page.getByText("Songs are off")).toBeVisible();
  expect(sql<{ value: string }>("select value from settings where key = 'songs_open'")[0].value).toBe("0");
  await page.getByLabel("Guests can pick songs").check();
  await Promise.all([page.waitForNavigation(), page.locator("#settings button[type=submit]").click()]);
  expect(sql<{ value: string }>("select value from settings where key = 'songs_open'")[0].value).toBe("1");

  await page.goto("/admin/guests/qa-songs/edit");
  await expect(page.locator("#songs")).toContainText("Here Comes the Sun – The Beatles");
  const csv = await (await request.get("/api/admin/export.csv")).text();
  expect(csv).toContain("Here Comes the Sun – The Beatles; Dancing Queen – ABBA");
});

test("saying no takes their songs off", async ({ page }) => {
  await page.goto("/rsvp/qa-token-songs?edit=1");
  await page.selectOption("#attendance", "no");
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  expect(picks()).toEqual([]);
  await expect(page.locator("#songs")).toHaveCount(0);
});
