import { expect, test } from "@playwright/test";
import { sql } from "../db";
import { expectNoSidewaysScroll, PHONE, watchForErrors } from "./helpers";

// Songs for the playlist: a guest picks up to three on their RSVP. The QA
// dev server has no Spotify keys, so the pretend Spotify in
// src/lib/spotify.ts answers (a few made-up songs; nothing leaves the
// machine).
test.describe.configure({ mode: "serial" });

// Its own guest (sent their link, not replied yet), made here rather than in
// seed.sql so the other specs' lists and counts don't change.
test.beforeAll(() => {
  sql("delete from guests where id = 'qa-songs'");
  sql(`insert into guests (id, token, token_expires_at, name, email, attendance, status, invite_sent_at, created_at, updated_at)
       values ('qa-songs', 'qa-token-songs', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QA Songs Qatest',
               'delivered@resend.dev', 'pending', 'invited', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
});

test.afterAll(() => {
  sql("delete from guests where id = 'qa-songs'");
});

const picks = () =>
  sql<{ title: string; position: number; added_at: string | null }>(
    "select title, position, added_at from song_picks where guest_id = 'qa-songs' order by position",
  );

async function addSong(page: import("@playwright/test").Page, query: string, title: string) {
  await page.getByLabel("Search for a song or artist").fill(query);
  await page.getByRole("button", { name: new RegExp(`${title}.*Add`) }).click();
}

test("picking songs with the search, up to three, and changing them", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.setViewportSize(PHONE);
  await page.goto("/rsvp/qa-token-songs?edit=1");
  await page.selectOption("#attendance", "yes");
  const songs = page.locator("fieldset.song-picks");
  await expect(songs.locator("legend")).toHaveText("Songs for the playlist (optional)");
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
  await expect(page).toHaveURL(/edit=1/);
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


  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  await expect(page.locator(".flower-list")).toContainText(
    "Songs for the playlist: Dancing Queen – ABBA; Here Comes the Sun – The Beatles; Blinding Lights – The Weeknd",
  );
  await expect(page.getByRole("link", { name: /Listen to the playlist on Spotify/ })).toBeVisible();
  expect(picks().map((p) => p.title)).toEqual(["Dancing Queen", "Here Comes the Sun", "Blinding Lights"]);
  expect(picks().every((p) => p.added_at)).toBe(true);
  expect(sql("select 1 from guest_events where guest_id = 'qa-songs' and action = 'songs'")).toHaveLength(1);

  // editing: their picks are there to change
  await page.goto("/rsvp/qa-token-songs?edit=1");
  await expect(page.locator(".song-chosen li")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove Dancing Queen" }).click();
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  expect(picks().map((p) => [p.title, p.position])).toEqual([["Here Comes the Sun", 1], ["Blinding Lights", 2]]);
  checkErrors();
});

test("without JavaScript, a guest pastes Spotify links instead", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/rsvp/qa-token-songs?edit=1");
  await expect(page.locator("#song-1")).toBeVisible();
  // their current picks are there as links
  await expect(page.locator("#song-1")).toHaveValue("https://open.spotify.com/track/5ghIJDpPoe3CfHMGu71E6T");
  await page.fill("#song-3", "https://open.spotify.com/track/7GhIk7Il098yCjg4BQjzvb?si=0123abcd");
  await page.fill("#song-2", "some song I like");
  // sent with Enter: Playwright's click waits for the button to be still,
  // which it can't tell with JavaScript off
  await Promise.all([page.waitForNavigation(), page.locator("#song-2").press("Enter")]);
  // the one that wasn't a link is mentioned, the rest are saved
  await expect(page.getByRole("heading", { name: "We couldn't add all your songs" })).toBeVisible();
  expect(picks().map((p) => p.title)).toEqual(["Here Comes the Sun", "Dancing Queen"]);
  await context.close();
});

test("the song search only answers a guest's own live link", async ({ request }) => {
  // a browser's own fetch sends Origin (Astro refuses a cross-site form post)
  const ask = (token: string) =>
    request.post("/api/rsvp/songs", { form: { token, q: "queen" }, headers: { Origin: "http://localhost:4322" } });
  const good = await ask("qa-token-songs");
  expect(good.status()).toBe(200);
  expect((await good.json()).tracks[0].title).toBe("Dancing Queen");
  expect((await ask("qa-token-not-real")).status()).toBe(403);
  expect((await ask("qa-token-expired")).status()).toBe(403);
});

test("hosts see every song on Playlist, on the guest's page and in the CSV", async ({ page, request }) => {
  await page.goto("/admin/playlist");
  await expect(page.getByText("Pretend Spotify", { exact: false })).toBeVisible();
  const row = page.locator(".admin-table tr", { hasText: "Here Comes the Sun" });
  await expect(row).toContainText("QA Songs Qatest");
  await expect(row).toContainText("Yes");
  await page.goto("/admin/guests/qa-songs/edit");
  await expect(page.locator("#songs")).toContainText("Here Comes the Sun – The Beatles");
  const csv = await (await request.get("/api/admin/export.csv")).text();
  expect(csv).toContain("Here Comes the Sun – The Beatles; Dancing Queen – ABBA");
});

test("saying no takes their songs off", async ({ page }) => {
  await page.goto("/rsvp/qa-token-songs?edit=1");
  await page.selectOption("#attendance", "no");
  await expect(page.locator("fieldset.song-picks")).toBeHidden();
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  expect(picks()).toEqual([]);
});
