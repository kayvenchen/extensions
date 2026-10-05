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
  assert.equal((await runtime.extension.progress("2")).score, 80);
  await runtime.extension.update({ remoteWorkID: "2", chapter: 5, score: 90, status: "CURRENT" });
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
