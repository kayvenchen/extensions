/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MINIMAL_AVIF_BYTES, MINIMAL_GIF_BYTES, MINIMAL_WEBP_BYTES, loadContentExtension, runtimeResponse, metadataCacheFixture } from "../../test-runtime.mjs";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "../main.wasm");
const manifest = JSON.parse(await readFile(resolve(dirname(mainPath), "extension.json"), "utf8"));

test("HitomiLA retains only the legacy bounded page-host declarations", () => {
  const pageHosts = manifest.allowedHTTPSHosts.filter(host => /^a[0-9]+\.gold-usergeneratedcontent\.net$/.test(host));
  assert.deepEqual(pageHosts, [
    "a1.gold-usergeneratedcontent.net",
    "a2.gold-usergeneratedcontent.net"
  ]);
  assert.ok(!manifest.allowedHTTPSHosts.some(host => host.includes("*")));
});

function nozomi(ids) {
  const bytes = Buffer.alloc(ids.length * 4);
  ids.forEach((id, index) => bytes.writeInt32BE(id, index * 4));
  return bytes;
}

function gallery(id) {
  const hash = id.toString(16).padStart(64, "0");
  return {
    id: String(id),
    title: `Sanitized Gallery ${id}`,
    japanese_title: `Alternate ${id}`,
    language: "english",
    language_localname: "English",
    type: "manga",
    date: "2026-01-01 00:00:00+00",
    galleryurl: `/manga/sanitized-gallery-${id}.html`,
    artists: [{ artist: "Sample Creator" }],
    groups: [{ group: "Sample Group" }],
    parodys: [{ parody: "Sample Series" }],
    characters: [{ character: "Sample Character" }],
    tags: [
      { tag: "landscape" },
      { tag: "blue sky", female: "1" },
      { tag: "glasses", male: "1" }
    ],
    files: [{ hash, name: "001.png", hasavif: 1, haswebp: 1, width: 800, height: 1200 }]
  };
}

const routing = `
'use strict';
gg = { m: function(g) {
var o = 1;
switch (g) {
case 256:
o = 0; break;
}
return o;
},
s: function(h) { var m = /(..)(.)$/.exec(h); return parseInt(m[2]+m[1], 16).toString(10); },
b: '123/'
};`;

function galleryAssignment(id) {
  return `var galleryinfo = ${JSON.stringify(gallery(id))};`;
}

const sortIndexes = [
  ["newest", "index"],
  ["date-published", "date/published"],
  ["popular-today", "popular/today"],
  ["popular-week", "popular/week"],
  ["popular-month", "popular/month"],
  ["popular-year", "popular/year"]
];
const catalogIDs = Array.from({ length: 60 }, (_, index) => index + 1);

function sortResponder(indexPath, ids, extraIndexes = {}) {
  return request => {
    const path = new URL(request.url).pathname;
    if (path === indexPath) return runtimeResponse({ url: request.url, bytes: nozomi(ids) });
    if (Object.hasOwn(extraIndexes, path)) return runtimeResponse({ url: request.url, bytes: nozomi(extraIndexes[path]) });
    const match = /^\/galleries\/(\d+)\.js$/.exec(path);
    if (match) return runtimeResponse({ url: request.url, text: galleryAssignment(Number(match[1])) });
    throw new Error(`Unexpected request ${request.url}`);
  };
}

test("HitomiLA exposes one paginated catalog and every site order", async () => {
  const loaded = await loadContentExtension(mainPath, () => { throw new Error("No network expected"); });
  assert.deepEqual(Array.from(loaded.extension.discoverSections(), section => ({ ...section })), [
    { id: "latest", title: "Catalog (English)", type: 3 }
  ]);
  const configuration = loaded.extension.searchFilters();
  assert.equal(configuration.defaultSortID, "newest");
  assert.deepEqual(Array.from(configuration.sortOptions, option => [option.id, option.title]), [
    ["newest", "Newest (Date Added)"], ["date-published", "Date Published"],
    ["popular-today", "Popular Today"], ["popular-week", "Popular This Week"],
    ["popular-month", "Popular This Month"], ["popular-year", "Popular This Year"], ["random", "Random"]
  ]);
});

test("HitomiLA pages each site index in order for browsing, searching and language-only selections", async () => {
  for (const [sort, index] of sortIndexes) {
    for (const method of ["discover", "search"]) {
      for (const language of ["english", "japanese"]) {
        for (const cache of [undefined, metadataCacheFixture()]) {
          const ids = sort === "newest" ? catalogIDs : catalogIDs.slice().reverse();
          const path = `/n/${index}-${language}.nozomi`;
          const loaded = await loadContentExtension(mainPath, sortResponder(path, ids), { cache });
          const input = { sectionId: "latest", sort, ...(language === "japanese" ? {
            selections: [{ fieldID: "language", value: language, polarity: "include" }]
          } : {}) };
          const first = await loaded.extension[method](input);
          const second = await loaded.extension[method]({ ...input, metadata: first.metadata });
          const third = await loaded.extension[method]({ ...input, metadata: second.metadata });
          assert.deepEqual(Array.from([...first.items, ...second.items, ...third.items], item => Number(item.workId)), ids,
            `${method}.${sort}.${language}.${Boolean(cache)}`);
          assert.equal(third.metadata, null);
          const indexes = loaded.calls.filter(call => call.url.endsWith(".nozomi"));
          assert.ok(indexes.every(call => new URL(call.url).pathname === path));
          assert.equal(indexes.length, 3, "each page requests its bounded byte range");
        }
      }
    }
  }
});

test("HitomiLA applies inclusions and exclusions without replacing the site's ranking order", async () => {
  for (const [sort, index] of sortIndexes) {
    for (const method of ["discover", "search"]) {
      const ranked = [8, 1, 5, 3, 7, 4, 2, 6];
      const path = `/n/${index}-japanese.nozomi`;
      const loaded = await loadContentExtension(mainPath, sortResponder(path, ranked, {
        "/n/tag/landscape-japanese.nozomi": [1, 2, 4, 5, 7, 8],
        "/n/artist/sample-japanese.nozomi": [1, 4, 5, 7, 8],
        "/n/tag/blocked-japanese.nozomi": [5, 7]
      }));
      const result = await loaded.extension[method]({
        sectionId: "latest", sort, query: "artist:sample",
        selections: [
          { fieldID: "language", value: "japanese", polarity: "include" },
          { fieldID: "tag", value: "landscape", polarity: "include" },
          { fieldID: "tag", value: "blocked", polarity: "exclude" }
        ]
      });
      assert.deepEqual(Array.from(result.items, item => Number(item.workId)), [8, 1, 4], `${method}.${sort}`);
      assert.equal(result.metadata, null);
    }
  }
});

test("HitomiLA returns empty pages for missing or empty rankings, including filtered searches", async () => {
  for (const [sort, index] of sortIndexes) {
    for (const method of ["discover", "search"]) {
      for (const status of [200, 404]) {
        const loaded = await loadContentExtension(mainPath, request => {
          const path = new URL(request.url).pathname;
          if (path === `/n/${index}-english.nozomi`) return runtimeResponse({ url: request.url, status, bytes: nozomi([]) });
          if (path === "/n/tag/landscape-english.nozomi") return runtimeResponse({ url: request.url, bytes: nozomi([1, 2]) });
          throw new Error(`Unexpected request ${request.url}`);
        });
        for (const query of ["", "tag:landscape"]) {
          const result = await loaded.extension[method]({ sectionId: "latest", sort, query });
          assert.equal(result.items.length, 0, `${method}.${sort}.${status}.${query}`);
          assert.equal(result.metadata, null);
        }
      }
    }
  }
});

test("HitomiLA random ordering survives pagination and runtime restart, and refresh chooses a new seed", async () => {
  for (const method of ["discover", "search"]) {
    const cache = metadataCacheFixture();
    let random = 0.2;
    const seededMath = Object.create(Math);
    seededMath.random = () => random;
    const responder = sortResponder("/n/index-japanese.nozomi", catalogIDs, {
      "/n/tag/landscape-japanese.nozomi": catalogIDs,
      "/n/tag/blocked-japanese.nozomi": [2, 9, 12]
    });
    const options = { cache, globals: { Math: seededMath } };
    const loaded = await loadContentExtension(mainPath, responder, options);
    const input = { sectionId: "latest", sort: "random", selections: [
      { fieldID: "language", value: "japanese", polarity: "include" },
      { fieldID: "tag", value: "landscape", polarity: "include" },
      { fieldID: "tag", value: "blocked", polarity: "exclude" }
    ] };
    const first = await loaded.extension[method](input);
    const restarted = await loadContentExtension(mainPath, responder, options);
    const second = await restarted.extension[method]({ ...input, metadata: first.metadata });
    const repeated = await restarted.extension[method]({ ...input, metadata: first.metadata });
    const third = await restarted.extension[method]({ ...input, metadata: second.metadata });
    assert.deepEqual(Array.from(second.items, item => item.workId), Array.from(repeated.items, item => item.workId));
    assert.equal(second.metadata.randomSeed, first.metadata.randomSeed);
    const actual = Array.from([...first.items, ...second.items, ...third.items], item => Number(item.workId));
    const eligible = catalogIDs.filter(id => ![2, 9, 12].includes(id));
    assert.deepEqual(actual.slice().sort((left, right) => left - right), eligible);
    assert.notDeepEqual(actual, eligible);
    assert.equal(third.metadata, null);
    const callsBeforeRefresh = restarted.calls.length;
    random = 0.8;
    const refreshed = await restarted.extension[method](input);
    assert.notEqual(refreshed.metadata.randomSeed, first.metadata.randomSeed);
    assert.notDeepEqual(Array.from(refreshed.items, item => item.workId), Array.from(first.items, item => item.workId));
    assert.equal(restarted.calls.length, callsBeforeRefresh, "new shuffles reuse the cached candidate list and gallery metadata");
    assert.ok(!restarted.calls.some(call => call.url.endsWith(".nozomi")), "pagination reuses candidate IDs after a runtime restart");
    await assert.rejects(() => loaded.extension[method]({ ...input, metadata: { page: 2, randomSeed: 0 } }), /seed is invalid/);
  }
});

test("HitomiLA random catalog pagination works without filters or a host cache", async () => {
  for (const method of ["discover", "search"]) {
    const loaded = await loadContentExtension(mainPath, sortResponder("/n/index-english.nozomi", catalogIDs));
    const input = { sectionId: "latest", sort: "random" };
    const first = await loaded.extension[method](input);
    const second = await loaded.extension[method]({ ...input, metadata: first.metadata });
    const third = await loaded.extension[method]({ ...input, metadata: second.metadata });
    const ids = Array.from([...first.items, ...second.items, ...third.items], item => Number(item.workId));
    assert.deepEqual(ids.slice().sort((left, right) => left - right), catalogIDs);
    assert.equal(third.metadata, null);
    assert.equal(loaded.calls.filter(call => call.url.endsWith(".nozomi")).length, 1);
  }
});

test("HitomiLA accepts decoded complete catalogs when the HTTP transport retains gzip headers", async () => {
  for (const sort of [...sortIndexes.map(([id]) => id), "random"]) {
    for (const method of ["discover", "search"]) {
      const loaded = await loadContentExtension(mainPath, request => {
        const path = new URL(request.url).pathname;
        if (path.endsWith(".nozomi")) {
          assert.match(request.headers.Range, /^bytes=[0-9]+-[0-9]+$/);
          assert.equal(request.headers["Accept-Encoding"], "identity");
          return runtimeResponse({
            url: request.url, mimeType: "application/x-nozomi",
            headers: { "Content-Encoding": "gzip", "Content-Length": "37" },
            bytes: nozomi(catalogIDs)
          });
        }
        const match = /^\/galleries\/(\d+)\.js$/.exec(path);
        if (match) return runtimeResponse({ url: request.url, text: galleryAssignment(Number(match[1])) });
        throw new Error(`Unexpected request ${request.url}`);
      }, { cache: metadataCacheFixture() });
      const input = { sectionId: "latest", sort };
      const first = await loaded.extension[method](input);
      const second = await loaded.extension[method]({ ...input, metadata: first.metadata });
      assert.equal(first.items.length, 25, `${method}.${sort}`);
      assert.equal(second.items.length, 25);
      assert.equal(loaded.calls.filter(call => call.url.endsWith(".nozomi")).length, sort === "random" ? 1 : 2);
      const ids = Array.from([...first.items, ...second.items], item => item.workId);
      assert.equal(new Set(ids).size, 50);
    }
  }
});

test("HitomiLA decodes ranged Nozomi IDs, limits metadata concurrency, and caches routing", async () => {
  let active = 0;
  let maximum = 0;
  let routingRequests = 0;
  const ids = Array.from({ length: 25 }, (_, index) => index + 1);
  const loaded = await loadContentExtension(mainPath, async request => {
    const url = new URL(request.url);
    if (url.pathname === "/n/index-english.nozomi") {
      assert.equal(request.headers.Range, "bytes=0-99");
      assert.equal(request.headers["Accept-Encoding"], "identity");
      return runtimeResponse({
        url: request.url,
        status: 206,
        mimeType: "application/x-nozomi",
        headers: { "Content-Range": "bytes 0-99/200" },
        bytes: nozomi(ids)
      });
    }
    if (/^\/galleries\/[0-9]+\.js$/.test(url.pathname)) {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5));
      active--;
      const id = Number(url.pathname.match(/[0-9]+/)[0]);
      return runtimeResponse({ url: request.url, text: galleryAssignment(id) });
    }
    if (url.pathname === "/gg.js") {
      routingRequests++;
      return runtimeResponse({ url: request.url, text: routing });
    }
    if (url.hostname === "atn.gold-usergeneratedcontent.net" || /^a[0-9]+\./.test(url.hostname)) {
      const avif = url.pathname.endsWith(".avif");
      return runtimeResponse({
        url: request.url,
        mimeType: avif ? "image/avif" : "image/webp",
        bytes: avif ? MINIMAL_AVIF_BYTES : MINIMAL_WEBP_BYTES
      });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });

  const page = await loaded.extension.discover({ sectionId: "latest" });
  assert.equal(page.items.length, 25);
  assert.equal(page.items[0].type, "work");
  assert.equal(page.items[0].workId, "1");
  assert.equal(page.items[0].imageUrl, `https://atn.gold-usergeneratedcontent.net/avifbigtn/1/00/${gallery(1).files[0].hash}.avif`);
  assert.ok(page.items.every(item => {
    const url = new URL(item.imageUrl);
    return url.protocol === "https:" && manifest.allowedHTTPSHosts.includes(url.hostname);
  }), "every emitted cover uses a declared HTTPS host");
  assert.equal(page.metadata.page, 2);
  assert.equal(maximum, 4);
  assert.equal(routingRequests, 0, "cover generation no longer depends on gg.js routing");
  const cover = await loaded.extension.imagePageContent({ url: page.items[0].imageUrl });
  assert.equal(cover.mimeType, "image/avif");

  const work = await loaded.extension.details("2");
  assert.equal(work.workInfo.artist, "Sample Creator");
  assert.equal(work.workInfo.author, "Sample Creator, Sample Group");
  assert.ok(work.workInfo.searchFacets.some(facet => facet.fieldID === "artist" && facet.presentation === "creator"));
  assert.ok(work.workInfo.searchFacets.some(facet => facet.fieldID === "female" && facet.presentation === "tag"));
  assert.ok(work.workInfo.searchFacets.some(facet => facet.fieldID === "male" && facet.presentation === "tag"));
  assert.deepEqual(
    Array.from(new Set(work.workInfo.searchFacets.map(facet => facet.groupTitle))),
    ["Artists", "Groups", "Series", "Characters", "Female", "Male", "Tags", "Language", "Type"]
  );
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a2.gold-usergeneratedcontent.net/123/512/${gallery(2).files[0].hash}.avif`);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/avif");
  const overriddenWork = await loaded.extension.details("1");
  const [overriddenInstallment] = await loaded.extension.installments(overriddenWork);
  const overriddenSequence = await loaded.extension.imagePages(overriddenInstallment);
  assert.equal(overriddenSequence.pages[0], `https://a1.gold-usergeneratedcontent.net/123/256/${gallery(1).files[0].hash}.avif`);
  assert.equal(routingRequests, 1, "routing configuration remains cached for the bounded refresh window");
});

test("HitomiLA uses current indexed suggestions, including typo recovery and namespaces", async () => {
  let failures = 1;
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    assert.equal(url.hostname,"tagindex.hitomi.la");
    if (url.pathname === "/global/g/l/a/s/e/s.json") return runtimeResponse({url:request.url,status:404});
    if (failures) { failures--; throw new Error("temporary suggestion failure"); }
    return runtimeResponse({url:request.url,text:JSON.stringify([["glasses",42,"female"],["glasses",20,"male"],["unrelated",100,"tag"]])});
  });
  await assert.rejects(() => loaded.extension.searchSuggestions({query:"glass"}),/temporary/);
  const matches = await loaded.extension.searchSuggestions({query:"glases",limit:3});
  assert.deepEqual(Array.from(matches,value=>[value.fieldID,value.value]),[["female","glasses"],["male","glasses"]]);
  const count = loaded.calls.length;
  await loaded.extension.searchSuggestions({query:"glases",limit:3});
  assert.equal(loaded.calls.length,count,"successful lookup pages are cached");
  assert.equal(loaded.extension.searchFilters().fields.find(field=>field.id === "language").maximumSelections,1);
});

test("HitomiLA never persists malformed suggestion rows and retries corrected responses", async () => {
  let count = 0;
  const loaded = await loadContentExtension(mainPath, request => runtimeResponse({
    url: request.url,
    text: JSON.stringify(++count === 1 ? [["",42,"tag"]] : [["glasses",42,"tag"]])
  }), {cache: metadataCacheFixture()});
  await assert.rejects(() => loaded.extension.searchSuggestions({query:"glass"}), /Malformed suggestion/);
  assert.equal((await loaded.extension.searchSuggestions({query:"glass"}))[0].value,"glasses");
  await loaded.extension.searchSuggestions({query:"glass"});
  assert.equal(count,2);
});

test("HitomiLA applies language overrides, namespaces, intersections, and negative terms", async () => {
  const indexURLs = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".nozomi")) {
      indexURLs.push(url.pathname);
      if (url.pathname.includes("/artist/sample-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([1, 2]) });
      if (url.pathname.includes("/tag/female:blue%20sky-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([1, 3]) });
      if (url.pathname.includes("/tag/blocked-japanese.nozomi")) return runtimeResponse({ url: request.url, bytes: nozomi([2]) });
      if (url.pathname === "/n/index-japanese.nozomi") return runtimeResponse({ url: request.url, bytes: nozomi([3, 2, 1]) });
    }
    if (url.pathname === "/galleries/1.js") return runtimeResponse({ url: request.url, text: galleryAssignment(1) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    throw new Error(`Unexpected request ${request.url}`);
  });
  const result = await loaded.extension.search({ query: "language:japanese artist:sample female:blue_sky -tag:blocked" });
  assert.deepEqual(indexURLs, [
    "/n/artist/sample-japanese.nozomi",
    "/n/tag/female:blue%20sky-japanese.nozomi",
    "/n/tag/blocked-japanese.nozomi",
    "/n/index-japanese.nozomi"
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].workId, "1");
  assert.equal(result.metadata, null);
});

test("HitomiLA falls back to the original GIF representation when AVIF is unavailable", async () => {
  const gifGallery = gallery(9);
  gifGallery.files[0] = { ...gifGallery.files[0], name: "animated.gif", hasavif: 0, haswebp: 0 };
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/9.js") return runtimeResponse({ url: request.url, text: `var galleryinfo = ${JSON.stringify(gifGallery)};` });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    if (/^a[0-9]+\./.test(url.hostname)) return runtimeResponse({ url: request.url, mimeType: "image/gif", bytes: MINIMAL_GIF_BYTES });
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("9");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a2.gold-usergeneratedcontent.net/123/2304/${gifGallery.files[0].hash}.gif`);
  const image = await loaded.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(image.mimeType, "image/gif");
});

test("HitomiLA registers only exact computed dynamic page origins", async () => {
  const dynamicRouting = routing
    .replace("var o = 1;", "var o = 7;")
    .replace("o = 0; break;", "o = 4; break;");
  const requestedHosts = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/1.js") return runtimeResponse({ url: request.url, text: galleryAssignment(1) });
    if (url.pathname === "/galleries/2.js") return runtimeResponse({ url: request.url, text: galleryAssignment(2) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: dynamicRouting });
    if (/^a[0-9]+\.gold-usergeneratedcontent\.net$/.test(url.hostname)) {
      requestedHosts.push(url.hostname);
      return runtimeResponse({ url: request.url, mimeType: "image/avif", bytes: MINIMAL_AVIF_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("2");
  const [installment] = await loaded.extension.installments(work);
  const sequence = await loaded.extension.imagePages(installment);
  assert.equal(sequence.pages[0], `https://a8.gold-usergeneratedcontent.net/123/512/${gallery(2).files[0].hash}.avif`);
  assert.ok(!manifest.allowedHTTPSHosts.includes("a8.gold-usergeneratedcontent.net"));
  await loaded.extension.imagePageContent({ url: sequence.pages[0] });

  const overriddenWork = await loaded.extension.details("1");
  const [overriddenInstallment] = await loaded.extension.installments(overriddenWork);
  const overriddenSequence = await loaded.extension.imagePages(overriddenInstallment);
  assert.equal(overriddenSequence.pages[0], `https://a5.gold-usergeneratedcontent.net/123/256/${gallery(1).files[0].hash}.avif`);
  await loaded.extension.imagePageContent({ url: overriddenSequence.pages[0] });
  assert.deepEqual(requestedHosts, ["a8.gold-usergeneratedcontent.net", "a5.gold-usergeneratedcontent.net"]);

  const unregistered = sequence.pages[0].replace("//a8.", "//a9.");
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: unregistered }),
    error => error.name === "InvalidIdentifierError"
  );
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: sequence.pages[0].replace("https://", "http://") }),
    error => error.name === "InvalidResponseError" && /HTTPS/.test(error.message)
  );
  await assert.rejects(
    () => loaded.extension.imagePageContent({ url: sequence.pages[0].replace(".net/", ".net.example/") }),
    error => error.name === "InvalidIdentifierError"
  );

  const fresh = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: dynamicRouting });
    if (url.hostname === "a8.gold-usergeneratedcontent.net") {
      return runtimeResponse({ url: request.url, mimeType: "image/avif", bytes: MINIMAL_AVIF_BYTES });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const revalidated = await fresh.extension.imagePageContent({ url: sequence.pages[0] });
  assert.equal(revalidated.mimeType, "image/avif");
});

test("HitomiLA rejects routing offsets above its bounded dynamic range", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleries/2.js") return runtimeResponse({ url: request.url, text: galleryAssignment(2) });
    if (url.pathname === "/gg.js") {
      return runtimeResponse({
        url: request.url,
        text: routing.replace("var o = 1;", "var o = 1000;")
      });
    }
    throw new Error(`Unexpected request ${request.url}`);
  });
  const work = await loaded.extension.details("2");
  const [installment] = await loaded.extension.installments(work);
  await assert.rejects(
    () => loaded.extension.imagePages(installment),
    error => error.name === "InvalidResponseError" && /routing configuration/.test(error.message)
  );
});

function bTreeNode(key, dataAddress, dataLength) {
  const bytes = Buffer.alloc(464);
  let offset = 0;
  bytes.writeInt32BE(1, offset); offset += 4;
  bytes.writeInt32BE(key.length, offset); offset += 4;
  key.copy(bytes, offset); offset += key.length;
  bytes.writeInt32BE(1, offset); offset += 4;
  bytes.writeBigUInt64BE(BigInt(dataAddress), offset); offset += 8;
  bytes.writeInt32BE(dataLength, offset); offset += 4;
  for (let index = 0; index < 17; index++) {
    bytes.writeBigUInt64BE(0n, offset);
    offset += 8;
  }
  return bytes;
}

test("HitomiLA resolves title indexes through ordinary HTTP when native image resources are available", async () => {
  const key = createHash("sha256").update("sample", "utf8").digest().subarray(0, 4);
  const galleryData = Buffer.alloc(8);
  galleryData.writeInt32BE(1, 0);
  galleryData.writeInt32BE(7, 4);
  const node = bTreeNode(key, 20, galleryData.length);
  const ranges = [];
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname === "/galleriesindex/version") return runtimeResponse({ url: request.url, text: "123456\n" });
    if (url.pathname.endsWith(".index")) {
      ranges.push(request.headers.Range);
      return runtimeResponse({ url: request.url, status: 206, headers: {"Content-Range":"bytes 0-463/1000"}, bytes: node });
    }
    if (url.pathname.endsWith(".data")) {
      ranges.push(request.headers.Range);
      return runtimeResponse({ url: request.url, status: 206, headers: {"Content-Range":"bytes 20-27/1000"}, bytes: galleryData });
    }
    if (url.pathname === "/n/index-english.nozomi") return runtimeResponse({ url: request.url, bytes: nozomi([7]) });
    if (url.pathname === "/galleries/7.js") return runtimeResponse({ url: request.url, text: galleryAssignment(7) });
    if (url.pathname === "/gg.js") return runtimeResponse({ url: request.url, text: routing });
    throw new Error(`Unexpected request ${request.url}`);
  });
  loaded.context.http.imageResource = () => { throw new Error("Native image resources require an active image request."); };
  const result = await loaded.extension.search({ query: "sample" });
  assert.equal(result.items[0].workId, "7");
  assert.deepEqual(ranges, ["bytes=0-463", "bytes=20-27"]);
});

test("HitomiLA fails closed on malformed Nozomi and gallery assignment data", async () => {
  let mode = "nozomi";
  const loaded = await loadContentExtension(mainPath, request => {
    if (mode === "nozomi") {
      return runtimeResponse({
        url: request.url,
        status: 206,
        mimeType: "application/x-nozomi",
        headers: { "Content-Range": "bytes 0-2/200" },
        bytes: [0, 0, 1]
      });
    }
    return runtimeResponse({ url: request.url, text: "var galleryinfo = {title: 'not json'};" });
  });
  await assert.rejects(() => loaded.extension.discover({ sectionId: "latest" }), error => error.name === "InvalidResponseError");
  mode = "gallery";
  await assert.rejects(() => loaded.extension.details("1"), error => error.name === "InvalidResponseError");
});

test("HitomiLA rejects compressed and inconsistent ranged Nozomi representations", async () => {
  const cases = [
    {
      headers: {
        "Content-Range": "bytes 0-3/200",
        "Content-Encoding": "gzip"
      },
      mimeType: "application/x-nozomi",
      bytes: nozomi([1])
    },
    {
      headers: { "Content-Range": "bytes 4-7/200" },
      mimeType: "application/x-nozomi",
      bytes: nozomi([1])
    },
    {
      headers: { "Content-Range": "bytes 0-3/200" },
      mimeType: "text/html",
      bytes: nozomi([1])
    }
  ];
  for (const fixture of cases) {
    const loaded = await loadContentExtension(mainPath, request => {
      assert.equal(request.headers["Accept-Encoding"], "identity");
      return runtimeResponse({
        url: request.url,
        status: 206,
        ...fixture
      });
    });
    await assert.rejects(
      () => loaded.extension.discover({ sectionId: "latest" }),
      error => error.name === "InvalidResponseError"
    );
  }
});


test("HitomiLA reuses gallery metadata across the typed app bridge, coalesces requests, and expires it", async () => {
  let now = 1_000;
  let galleryRequests = 0;
  const loaded = await loadContentExtension(mainPath, async request => {
    if (request.url.endsWith("/gg.js")) return runtimeResponse({ url: request.url, text: routing });
    galleryRequests++;
    await Promise.resolve();
    return runtimeResponse({ url: request.url, text: galleryAssignment(42) });
  }, { globals: { Date: class extends Date { static now() { return now; } } } });
  const [first, second] = await Promise.all([loaded.extension.details("42"), loaded.extension.details("42")]);
  assert.equal(galleryRequests, 1);
  assert.equal(first.workId, second.workId);
  const typedWork = { workId: first.workId, workInfo: first.workInfo };
  const [chapter] = await loaded.extension.installments(typedWork);
  const typedChapter = { installmentId: chapter.installmentId, workId: chapter.workId };
  assert.equal((await loaded.extension.imagePages(typedChapter)).pages.length, 1);
  assert.equal(galleryRequests, 1, "details → installments → pages must reuse the validated gallery");
  now += 30 * 60 * 1000;
  await loaded.extension.details("42");
  assert.equal(galleryRequests, 2);
});

test("HitomiLA evicts old gallery metadata and retries invalid responses", async () => {
  const counts = new Map();
  let invalid = true;
  const loaded = await loadContentExtension(mainPath, request => {
    const id = Number(new URL(request.url).pathname.match(/[0-9]+/)[0]);
    counts.set(id, (counts.get(id) || 0) + 1);
    return runtimeResponse({ url: request.url, text: invalid ? "invalid" : galleryAssignment(id) });
  });
  await assert.rejects(() => loaded.extension.details("1"));
  invalid = false;
  for (let id = 1; id <= 101; id++) await loaded.extension.details(String(id));
  await loaded.extension.details("101");
  assert.equal(counts.get(101), 1);
  await loaded.extension.details("1");
  assert.equal(counts.get(1), 3, "failed responses are not cached and the oldest successful entry is evicted");
});

test("every Hitomi filter maps canonical namespaces through discovery, search and exclusions",async()=>{
 for(const field of ["tag","female","male","artist","group","series","character","language","type"]){
  for(const polarity of field==="language"?["include"]:["include","exclude"]){
   for(const scope of ["search","discover"]){
    for(const page of [1,2]){
     const loaded=await loadContentExtension(mainPath,request=>runtimeResponse({url:request.url,status:404}));
     const value=field==="language"?"japanese":"blue sky";
     await loaded.extension[scope]({sectionId:"latest",selections:[{fieldID:field,value,polarity}],metadata:{page}});
     const expected=field==="language"?"/n/index-japanese.nozomi":`/n/${["female","male"].includes(field)?"tag":field}/${["female","male"].includes(field)?field+":":""}blue%20sky-english.nozomi`;
     assert.ok(loaded.calls.some(call=>new URL(call.url).pathname===expected),`${field}.${polarity}.${scope}.${page}`);
    }
   }
  }
 }
 for(const scope of ["search","discover"]){
  const loaded=await loadContentExtension(mainPath,request=>runtimeResponse({url:request.url,status:404}));
  await loaded.extension[scope]({sectionId:"latest",sort:"popular-week",metadata:{page:2}});
  assert.equal(new URL(loaded.calls[0].url).pathname,"/n/popular/week-english.nozomi");
  assert.equal(loaded.calls[0].headers.Range,"bytes=100-199");
 }
});


test("HitomiLA keeps discovery and search Nozomi requests on ordinary HTTP", async () => {
  const loaded = await loadContentExtension(mainPath, request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".nozomi")) {
      return runtimeResponse({ url: request.url, mimeType: "application/x-nozomi", bytes: nozomi([1]) });
    }
    if (url.pathname === "/galleries/1.js") return runtimeResponse({ url: request.url, text: galleryAssignment(1) });
    throw new Error(`Unexpected request ${request.url}`);
  });
  loaded.context.http.imageResource = () => { throw new Error("Native image resources require an active image request."); };
  for (const [method, input] of [
    ["discover", { sectionId: "latest" }],
    ["discover", { sectionId: "popular" }],
    ["search", { query: "" }],
    ["search", { query: "tag:landscape" }]
  ]) {
    const result = await loaded.extension[method](input);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].workId, "1");
  }
});

test("HitomiLA preserves native cover resources, base64 fallbacks, and cache invalidation", async () => {
  const loaded = await loadContentExtension(mainPath, () => { throw new Error("unexpected legacy request"); });
  const hash = "a".repeat(64);
  const result = await loaded.extension.imagePageContent({
    url: `https://atn.gold-usergeneratedcontent.net/avifbigtn/a/aa/${hash}.avif`,
    http: { imageResource: async request => {
      assert.equal(request.headers.Referer, "https://hitomi.la/");
      return { status: 200, resourceID: "owned-cover", mimeType: "image/avif", headers: {} };
    } }
  });
  assert.equal(result.resourceID, "owned-cover");
  assert.equal(result.dataBase64, undefined);
  for (const method of ["request", "imageResource"]) {
    const fallback = await loaded.extension.imagePageContent({
      url: `https://atn.gold-usergeneratedcontent.net/avifbigtn/a/aa/${hash}.avif`,
      http: { [method]: async request => runtimeResponse({ url: request.url, mimeType: "image/avif", bytes: MINIMAL_AVIF_BYTES }) }
    });
    assert.equal(fallback.dataBase64, Buffer.from(MINIMAL_AVIF_BYTES).toString("base64"));
    assert.equal(fallback.resourceID, undefined);
  }
  await loaded.extension.invalidateCache();
});


test("Hitomi cache-aware pagination shares bounded ranges and metadata across restart", async () => {
  const cache = metadataCacheFixture();
  const bytes = Buffer.alloc(30 * 4);
  for (let index = 0; index < 30; index++) bytes.writeInt32BE(index + 1, index * 4);
  const responder = request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".nozomi")) {
      const [, startText, endText] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.Range);
      const start = Number(startText), end = Math.min(Number(endText), bytes.length - 1);
      assert.equal(Number(endText) - start + 1, 100);
      return runtimeResponse({url: request.url, status:206, mimeType:"application/x-nozomi",
        headers:{"Content-Range":`bytes ${start}-${end}/${bytes.length}`}, bytes:bytes.subarray(start,end+1)});
    }
    const id = /\/galleries\/(\d+)\.js$/.exec(url.pathname)?.[1];
    if (id) return runtimeResponse({url:request.url, text:galleryAssignment(Number(id))});
    if (url.pathname === "/gg.js") return runtimeResponse({url:request.url, text:routing});
    throw new Error(`Unexpected ${request.url}`);
  };
  const loaded = await loadContentExtension(mainPath, responder, {cache});
  const first = await loaded.extension.discover({sectionId:"latest"});
  const second = await loaded.extension.discover({sectionId:"latest", metadata:first.metadata});
  assert.equal(first.items.length,25); assert.equal(second.items.length,5);
  assert.equal(loaded.calls.filter(call => call.url.endsWith(".nozomi")).length,2);
  const restarted = await loadContentExtension(mainPath, responder, {cache});
  await restarted.extension.discover({sectionId:"latest"});
  assert.equal(restarted.calls.length,0);
  await restarted.extension.details("1");
  assert.equal(restarted.calls.length,0);
  cache.setReload(true);
  await restarted.extension.details("1");
  cache.setReload(false);
  await restarted.extension.details("2");
  assert.equal(restarted.calls.filter(call => call.url.includes("/galleries/")).length,1);
});

test("Hitomi invalid cached galleries are removed and index versions partition immutable data", async () => {
  const cache = metadataCacheFixture();
  cache.entries.set("hitomi:gallery-v2:42", {value:'var galleryinfo={"id":99,"title":"Wrong","files":[]};',time:0});
  const loaded = await loadContentExtension(mainPath, request => runtimeResponse({url:request.url,text:galleryAssignment(42)}), {cache});
  await loaded.extension.details("42");
  assert.equal(loaded.calls.length,1);
  cache.advance(1799); await loaded.extension.details("42"); assert.equal(loaded.calls.length,1);
  cache.advance(1); await loaded.extension.details("42"); assert.equal(loaded.calls.length,2);
});

test("Hitomi large galleries keep catalog and detail payloads compact without truncating readers", async () => {
  const value = gallery(8);
  value.files = Array.from({length:1070}, (_, index) => ({...value.files[0], name:`${index+1}.png`}));
  const loaded = await loadContentExtension(mainPath, request => {
    if (request.url.endsWith(".nozomi")) return runtimeResponse({url:request.url, bytes:nozomi([8])});
    if (request.url.endsWith("/gg.js")) return runtimeResponse({url:request.url, text:routing});
    return runtimeResponse({url:request.url, text:`var galleryinfo=${JSON.stringify(value)};`});
  }, {cache:metadataCacheFixture()});
  const page = await loaded.extension.discover({sectionId:"latest"});
  assert.equal(page.items[0].files, undefined);
  const details = await loaded.extension.details("8");
  assert.equal(details.files, undefined);
  const [installment] = await loaded.extension.installments({workId:details.workId, workInfo:details.workInfo});
  assert.equal(installment.files, undefined);
  const images = await loaded.extension.imagePages({installmentId:installment.installmentId, workId:installment.workId});
  assert.equal(images.pages.length,1070);
  value.files[1069].hash = "invalid";
  await loaded.extension.invalidateCache();
  await assert.rejects(() => loaded.extension.discover({sectionId:"latest"}));
});
