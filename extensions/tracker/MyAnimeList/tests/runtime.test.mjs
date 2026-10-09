/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrackerExtension, runtimeResponse } from "../../../content/test-runtime.mjs";

const main = resolve(dirname(fileURLToPath(import.meta.url)), "..", "main.wasm");
const plain = value => JSON.parse(JSON.stringify(value));

test("MyAnimeList covers PKCE metadata, search, progress, update, and collections", async () => {
  const runtime = await loadTrackerExtension(main, request => {
    const url = new URL(request.url);
    if (url.pathname === "/v2/manga") return runtimeResponse({ text: JSON.stringify({ data: [{ node: { id: 2, title: "Fixture", media_type: "manga", main_picture: { large: "https://cdn.myanimelist.net/fixture.jpg" } } }] }) });
    if (url.pathname === "/v2/manga/2") return runtimeResponse({ text: JSON.stringify({ id: 2, my_list_status: { status: "reading", is_rereading: false, score: 8, num_volumes_read: 1, num_chapters_read: 4, updated_at: "2026-01-01T00:00:00Z" } }) });
    if (url.pathname.endsWith("/my_list_status")) return runtimeResponse({ text: JSON.stringify({ status: "reading", num_chapters_read: 5, num_volumes_read: 1 }) });
    return runtimeResponse({ text: JSON.stringify({ data: [{ node: { id: 2, title: "Fixture", media_type: "manga" }, list_status: { status: "reading" } }], paging: {} }) });
  }, { secureState: { oauth_access_token: "token" } });

  const auth = runtime.extension.authentication();
  assert.equal(auth.mode, "oauth2PKCE");
  assert.equal(auth.pkceMethod, "plain");
  assert.deepEqual(plain(await runtime.extension.search({ title: "Fixture", kind: "manga" })), [{ id: "2", title: "Fixture", coverURL: "https://cdn.myanimelist.net/fixture.jpg", mediaKind: "manga" }]);
  assert.equal((await runtime.extension.progress("2")).score, 8);
  await runtime.extension.update({ remoteWorkID: "2", chapter: 5, score: 9, status: "reading" });
  assert.equal((await runtime.extension.collections()).items[0].id, "mal-reading");
  assert.ok(runtime.calls.every(call => call.headers.Authorization === "Bearer token"));
});

test("MyAnimeList handles missing progress, credentials, and API failures", async () => {
  const runtime = await loadTrackerExtension(main, () => runtimeResponse({ status: 404, text: "{}" }), { secureState: { oauth_access_token: "token" } });
  assert.equal(await runtime.extension.progress("2"), null);
  runtime.context.secureState.remove("oauth_access_token");
  await assert.rejects(() => runtime.extension.search({ title: "Fixture", kind: "manga" }), /authentication required/);
  runtime.context.secureState.set("oauth_access_token", "token");
  const failed = await loadTrackerExtension(main, () => runtimeResponse({ status: 503, text: "private details" }), { secureState: { oauth_access_token: "token" } });
  await assert.rejects(() => failed.extension.search({ title: "Fixture", kind: "manga" }), /MyAnimeList request failed \(503\)/);
});

test("MAL returns partial dates and unknown totals without claiming date-write support", async () => {
  const forms = [];
  const runtime = await loadTrackerExtension(main, request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/my_list_status")) {
      forms.push(new URLSearchParams(request.body));
      return runtimeResponse({ text: "{}" });
    }
    assert.match(url.searchParams.get("fields"), /num_chapters/);
    return runtimeResponse({ text: JSON.stringify({ id: 2, num_chapters: 0, num_volumes: 13, my_list_status: {
      status: "reading", score: 0, num_chapters_read: 19, num_volumes_read: 2,
      start_date: "2024-02", finish_date: "2024-03-01", updated_at: "2026-01-01T00:00:00Z"
    } }) });
  }, { secureState: { oauth_access_token: "token" } });
  assert.equal((await runtime.extension.trackingCapabilities()).supportsDateUpdates, false);
  const progress = plain(await runtime.extension.progress("2"));
  assert.deepEqual(progress.startDate, { year: 2024, month: 2 });
  assert.deepEqual(progress.finishDate, { year: 2024, month: 3, day: 1 });
  assert.equal(progress.totalChapters, null);
  assert.equal(progress.totalVolumes, 13);
  assert.equal(progress.score, null);
  assert.equal(progress.status, "reading");
  await runtime.extension.update({ remoteWorkID: "2", score: null, dateUpdates: { startDate: null } });
  assert.equal(forms[0].get("score"), "0");
  assert.equal(forms[0].has("start_date"), false);
});

test("MAL collection pagination advances the offset and keeps every status group", async () => {
  const offsets = [];
  const runtime = await loadTrackerExtension(main, request => {
    const url = new URL(request.url);
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    return runtimeResponse({ text: JSON.stringify({ data: [{ node: { id: offset + 1, title: `Title ${offset + 1}` }, list_status: { status: offset ? "on_hold" : "plan_to_read" } }], paging: offset ? {} : { next: "https://api.myanimelist.net/v2/users/@me/mangalist?offset=100" } }) });
  }, { secureState: { oauth_access_token: "token" } });
  const first = await runtime.extension.collections();
  assert.equal(first.items[0].title, "Plan to Read");
  assert.deepEqual(plain(first.nextCursor.metadata), {});
  const second = await runtime.extension.collections({ cursor: JSON.parse(first.nextCursor.value) });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(second.items[0].title, "On Hold");
  assert.equal(second.items[0].items[0].id, "101");
  assert.equal(second.nextCursor, null);
});

test("MAL round trips every status and limits updates to supplied fields", async () => {
  const statuses = { planning: "plan_to_read", reading: "reading", completed: "completed", paused: "on_hold", dropped: "dropped", rereading: "reading" };
  let remote;
  const runtime = await loadTrackerExtension(main, request => {
    if (request.method === "PUT") {
      const form = new URLSearchParams(request.body);
      remote = Object.fromEntries(form);
      assert.deepEqual([...form.keys()].sort(), ["is_rereading", "status"]);
      return runtimeResponse({ text: "{}" });
    }
    return runtimeResponse({ text: JSON.stringify({ my_list_status: { ...remote, is_rereading: remote.is_rereading === "true", updated_at: "2026-01-01T00:00:00Z" } }) });
  }, { secureState: { oauth_access_token: "token" } });
  for (const [status, native] of Object.entries(statuses)) {
    await runtime.extension.update({ remoteWorkID: "2", status });
    assert.equal(remote.status, native);
    assert.equal((await runtime.extension.progress("2")).status, status);
  }
});
