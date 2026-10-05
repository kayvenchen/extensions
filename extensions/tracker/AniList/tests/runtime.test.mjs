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
    if (body.query.includes("Media(id")) return runtimeResponse({ text: JSON.stringify({ data: { Media: { mediaListEntry: { mediaId: 1, status: "CURRENT", score: 80, progress: 4, progressVolumes: 1, updatedAt: 1_700_000_000 } } } }) });
    if (body.query.includes("SaveMediaListEntry")) return runtimeResponse({ text: JSON.stringify({ data: { SaveMediaListEntry: { mediaId: 1 } } }) });
    return runtimeResponse({ text: JSON.stringify({ data: { MediaListCollection: { lists: [{ name: "Reading", entries: [{ mediaId: 1, media: { id: 1, format: "MANGA", title: { userPreferred: "Fixture" }, coverImage: null } }] }] } } }) });
  }, { secureState: { oauth_access_token: "token" } });

  assert.equal(runtime.extension.authentication().mode, "oauth2Implicit");
  assert.deepEqual(plain(await runtime.extension.search({ title: "Fixture", kind: "manga" })), [{ id: "1", title: "Fixture", coverURL: "https://s4.anilist.co/fixture.jpg", mediaKind: "manga" }]);
  assert.equal((await runtime.extension.progress("1")).chapter, 4);
  await runtime.extension.update({ remoteWorkID: "1", chapter: 5, status: "CURRENT" });
  assert.equal((await runtime.extension.collections()).items[0].title, "Reading");
  assert.ok(runtime.calls.every(call => call.url === "https://graphql.anilist.co"));
});

test("AniList reports missing credentials and API errors without leaking response bodies", async () => {
  const unsigned = await loadTrackerExtension(main, () => runtimeResponse({ status: 500, text: "secret response" }));
  await assert.rejects(() => unsigned.extension.progress("1"), /authentication required/);
  unsigned.context.secureState.set("oauth_access_token", "token");
  await assert.rejects(() => unsigned.extension.progress("1"), /AniList request failed \(500\)/);
});
