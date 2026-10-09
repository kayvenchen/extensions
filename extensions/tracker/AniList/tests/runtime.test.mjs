/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrackerExtension, runtimeResponse } from "../../../content/test-runtime.mjs";

const main = resolve(dirname(fileURLToPath(import.meta.url)), "..", "main.wasm");
const plain = value => JSON.parse(JSON.stringify(value));

test("AniList covers authentication, search, progress, update, and collections", async () => {
  const runtime = await loadTrackerExtension(main, request => {
    const body = JSON.parse(request.body);
    if (body.query.includes("Page(page")) return runtimeResponse({ text: JSON.stringify({ data: { Page: { media: [{ id: 1, format: "MANGA", title: { userPreferred: "Fixture" }, coverImage: { large: "https://s4.anilist.co/fixture.jpg" } }] } } }) });
    if (body.query.includes("Media(id")) return runtimeResponse({ text: JSON.stringify({ data: { Media: { mediaListEntry: { mediaId: 1, status: "reading", score: 80, progress: 4, progressVolumes: 1, updatedAt: 1_700_000_000 } } } }) });
    if (body.query.includes("SaveMediaListEntry")) return runtimeResponse({ text: JSON.stringify({ data: { SaveMediaListEntry: { mediaId: 1 } } }) });
    if (body.query.includes("Viewer")) return runtimeResponse({ text: JSON.stringify({ data: { Viewer: { id: 42 } } }) });
    return runtimeResponse({ text: JSON.stringify({ data: { MediaListCollection: { lists: [{ name: "Reading", entries: [{ mediaId: 1, media: { id: 1, format: "MANGA", title: { userPreferred: "Fixture" }, coverImage: null } }] }] } } }) });
  }, { secureState: { oauth_access_token: "token" } });

  assert.equal(runtime.extension.authentication().mode, "oauth2Implicit");
  assert.deepEqual(plain(await runtime.extension.search({ title: "Fixture", kind: "manga" })), [{ id: "1", title: "Fixture", coverURL: "https://s4.anilist.co/fixture.jpg", mediaKind: "manga" }]);
  assert.equal((await runtime.extension.progress("1")).chapter, 4);
  await runtime.extension.update({ remoteWorkID: "1", chapter: 5, status: "reading" });
  assert.equal((await runtime.extension.collections()).items[0].title, "Reading");
  assert.ok(runtime.calls.every(call => call.url === "https://graphql.anilist.co"));
});

test("AniList collections use the authenticated user and preserve lists larger than 500 entries", async () => {
  const entries = Array.from({ length: 501 }, (_, index) => ({ media: { id: index + 1, format: "MANGA", title: { userPreferred: `Title ${index + 1}` } } }));
  const runtime = await loadTrackerExtension(main, request => {
    const body = JSON.parse(request.body);
    assert.equal(request.headers.Authorization, "Bearer token");
    if (body.query.includes("Viewer")) return runtimeResponse({ text: JSON.stringify({ data: { Viewer: { id: 42 } } }) });
    assert.match(body.query, /userId: \$userID/);
    assert.doesNotMatch(body.query, /chunk:|perChunk:/);
    assert.equal(body.variables.userID, 42);
    return runtimeResponse({ text: JSON.stringify({ data: { MediaListCollection: { lists: [{ name: "Custom", entries }] } } }) });
  }, { secureState: { oauth_access_token: "token" } });
  const page = await runtime.extension.collections();
  assert.equal(page.items[0].items.length, 501);
  assert.equal(page.items[0].items[500].id, "501");
});

test("AniList rejects a missing authenticated viewer before requesting collections", async () => {
  const runtime = await loadTrackerExtension(main, () => runtimeResponse({ text: JSON.stringify({ data: { Viewer: null } }) }), { secureState: { oauth_access_token: "token" } });
  await assert.rejects(() => runtime.extension.collections(), /no authenticated user/);
  assert.equal(runtime.calls.length, 1);
});

test("AniList reports missing credentials and API errors without leaking response bodies", async () => {
  const unsigned = await loadTrackerExtension(main, () => runtimeResponse({ status: 500, text: "secret response" }));
  await assert.rejects(() => unsigned.extension.progress("1"), /authentication required/);
  unsigned.context.secureState.set("oauth_access_token", "token");
  await assert.rejects(() => unsigned.extension.progress("1"), /AniList request failed \(500\)/);
});

test("AniList preserves fuzzy dates, totals and canonical scores; date writes distinguish clear from omit", async () => {
  const variables = [];
  const runtime = await loadTrackerExtension(main, request => {
    const body = JSON.parse(request.body);
    if (body.query.includes("SaveMediaListEntry")) {
      variables.push(body.variables);
      return runtimeResponse({ text: JSON.stringify({ data: { SaveMediaListEntry: { mediaId: 1 } } }) });
    }
    assert.match(body.query, /score\(format: POINT_100\)/);
    return runtimeResponse({ text: JSON.stringify({ data: { Media: { chapters: 127, volumes: 13, mediaListEntry: {
      mediaId: 1, status: "CURRENT", score: 85, progress: 19, progressVolumes: 2, updatedAt: 1700000000,
      startedAt: { year: 2024, month: 2, day: null }, completedAt: { year: null, month: null, day: null }
    } } } }) });
  }, { secureState: { oauth_access_token: "token" } });
  assert.equal((await runtime.extension.trackingCapabilities()).supportsDateUpdates, true);
  const progress = plain(await runtime.extension.progress("1"));
  assert.deepEqual(progress.startDate, { year: 2024, month: 2 });
  assert.equal(progress.finishDate, null);
  assert.equal(progress.totalChapters, 127);
  assert.equal(progress.totalVolumes, 13);
  assert.equal(progress.score, 8.5);
  assert.equal(progress.status, "reading");
  await runtime.extension.update({ remoteWorkID: "1", score: 8, status: "rereading", dateUpdates: { startDate: null } });
  assert.deepEqual(variables[0].startedAt, { year: null, month: null, day: null });
  assert.equal(variables[0].scoreRaw, 80);
  assert.equal(variables[0].status, "REPEATING");
  assert.equal(Object.hasOwn(variables[0], "completedAt"), false);
  await runtime.extension.update({ remoteWorkID: "1", score: null, dateUpdates: { finishDate: { year: 2024, month: 3, day: 1 } } });
  assert.equal(variables[1].scoreRaw, 0);
  assert.deepEqual(variables[1].completedAt, { year: 2024, month: 3, day: 1 });
  assert.equal(Object.hasOwn(variables[1], "startedAt"), false);
});

test("AniList round trips every status and limits updates to supplied fields", async () => {
  const statuses = { planning: "PLANNING", reading: "CURRENT", completed: "COMPLETED", paused: "PAUSED", dropped: "DROPPED", rereading: "REPEATING" };
  let remote;
  const runtime = await loadTrackerExtension(main, request => {
    const body = JSON.parse(request.body);
    if (body.query.includes("SaveMediaListEntry")) {
      assert.deepEqual(Object.keys(body.variables).sort(), ["mediaID", "status"]);
      remote = body.variables.status;
      return runtimeResponse({ text: JSON.stringify({ data: { SaveMediaListEntry: { mediaId: 1 } } }) });
    }
    return runtimeResponse({ text: JSON.stringify({ data: { Media: { mediaListEntry: { mediaId: 1, status: remote, updatedAt: 1700000000 } } } }) });
  }, { secureState: { oauth_access_token: "token" } });
  for (const [status, native] of Object.entries(statuses)) {
    await runtime.extension.update({ remoteWorkID: "1", status });
    assert.equal(remote, native);
    assert.equal((await runtime.extension.progress("1")).status, status);
  }
});

test("AniList rejects GraphQL errors even in a successful HTTP response", async () => {
  const runtime = await loadTrackerExtension(main, () => runtimeResponse({ text: JSON.stringify({ errors: [{ message: "private account details" }], data: null }) }), { secureState: { oauth_access_token: "token" } });
  await assert.rejects(() => runtime.extension.update({ remoteWorkID: "1", chapter: 2 }), error => error.message === "AniList returned a GraphQL error");
});


test("AniList omits the format filter for manga and supplies NOVEL only for book searches", async () => {
  const formats = [];
  const runtime = await loadTrackerExtension(main, request => {
    const body = JSON.parse(request.body);
    assert.equal(body.variables.search, "One Piece");
    formats.push(Object.hasOwn(body.variables, "format") ? body.variables.format : "omitted");
    return runtimeResponse({ text: JSON.stringify({ data: { Page: { media: [] } } }) });
  });
  await runtime.extension.search({ title: "One Piece", kind: "manga" });
  await runtime.extension.search({ title: "One Piece", kind: "lightNovel" });
  await runtime.extension.search({ title: "One Piece", kind: "book" });
  assert.deepEqual(formats, ["omitted", "NOVEL", "NOVEL"]);
});
