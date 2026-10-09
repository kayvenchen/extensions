/* SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse,metadataCacheFixture,MINIMAL_WEBP_BYTES} from "../../test-runtime.mjs";
const main=resolve(import.meta.dirname,"../main.wasm");
const workID="1/sample-novel",bookID="11/sample-novel-volume-1";
function card(id,title=`Sample ${id}`){return `<article class="card" data-id="${id}" data-t="${title}" data-a="Sample Author" data-tags="fantasy,adventure" data-d="2026" data-v="2" data-rel="${100-id}"><figure><a href="/series/${id}/${id===1?'sample-novel':`sample-${id}`}" title="${title}"><img src="https://cdn.lnori.com/cover/${id}.webp"></a></figure></article>`;}
const library=`<section id="grid">${Array.from({length:26},(_,i)=>card(i+1)).join('')}${card(1)}</section><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>`;
const schema={name:"Sample & Story",url:`https://lnori.com/series/${workID}`,image:"https://cdn.lnori.com/cover/1.webp",author:{name:"Sample Author"},description:"A sample synopsis",hasPart:[{name:"Volume 1",position:"1",url:`https://lnori.com/book/${bookID}`},{name:"Volume 1",position:"1",url:`https://lnori.com/book/${bookID}`}]};
const series=`<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
const bookSchema={id:"11",additionalProperty:[{name:"series_id",value:"1"},{name:"series_slug",value:"sample-novel"}]};
const book=`<script type="application/ld+json">${JSON.stringify(bookSchema)}</script><h1 id="book-title">Sample &amp; Story Vol. 1</h1><a href="/series/${workID}">Series</a><article class="content-body"><section id="chapter1"><h2>Chapter One</h2><p onclick="bad()">A &amp; B<script>bad()</script></p><picture><source srcset="https://img.lnori.com/11-01.jxl"><img src="https://img.lnori.com/11-01.jpg" onerror="bad()"></picture></section></article>`;
function responder(request){
 const path=new URL(request.url).pathname;
 assert.equal(request.method,"GET");
 if(path==="/library")return runtimeResponse({url:request.url,text:library});
 if(path===`/series/${workID}`)return runtimeResponse({url:request.url,text:series});
 if(path===`/book/${bookID}`)return runtimeResponse({url:request.url,text:book});
 if(request.imageResource)return runtimeResponse({url:request.url,mimeType:"image/webp",bytes:MINIMAL_WEBP_BYTES});
 throw new Error(`Unexpected ${request.url}`);
}
test("LNORI caches the complete catalog, pages unique series and filters locally",async()=>{
 const cache=metadataCacheFixture();const loaded=await loadContentExtension(main,responder,{cache});
 const first=await loaded.extension.discover({sectionId:"library"});
 assert.equal(first.items.length,25);assert.equal(first.metadata.page,2);assert.equal(first.items[0].workId,workID);assert.equal(first.items[0].mediaKind,"lightNovel");
 const last=await loaded.extension.discover({sectionId:"library",metadata:first.metadata});assert.equal(last.items.length,1);assert.equal(last.metadata,null);assert.equal(loaded.calls.length,1);
 const search=await loaded.extension.search({query:"sample 3",selections:[{fieldID:"genre",value:"fantasy"}]});assert.equal(search.items.length,1);
 const excluded=await loaded.extension.search({selections:[{fieldID:"genre",value:"fantasy",polarity:"exclude"}]});assert.equal(excluded.items.length,0);
 const suggestions=await loaded.extension.searchSuggestions({fieldID:"genre",query:"fan"});assert.deepEqual(suggestions.map(s=>s.value),["fantasy"]);
 const restarted=await loadContentExtension(main,responder,{cache});await restarted.extension.search({query:"sample"});assert.equal(restarted.calls.length,0);
 cache.setReload(true);await restarted.extension.search({query:"sample"});assert.equal(restarted.calls.length,1);
});
test("LNORI volumes use the app's XHTML contract and remove executable markup",async()=>{
 const loaded=await loadContentExtension(main,responder,{cache:metadataCacheFixture()});
 const detail=await loaded.extension.details(workID);assert.equal(detail.workInfo.primaryTitle,"Sample & Story");assert.equal(detail.workInfo.mediaKind,"lightNovel");
 const volumes=await loaded.extension.installments(detail);assert.equal(volumes.length,1);assert.equal(volumes[0].format,"xhtml");
 const publication=await loaded.extension.publicationContent(volumes[0]);assert.equal(publication.mimeType,"application/xhtml+xml");assert.ok(publication.text.includes('<section id="chapter1">'));assert.ok(publication.text.includes("A &amp; B"));assert.ok(publication.text.includes('src="https://img.lnori.com/11-01.jpg"'));assert.ok(!publication.text.includes("bad()"));assert.ok(!publication.text.includes("srcset"));
 await loaded.extension.publicationContent(volumes[0]);assert.equal(loaded.calls.length,2);
 await loaded.extension.imagePageContent({url:"https://img.lnori.com/11-01.jpg"});assert.equal(loaded.calls.at(-1).imageResource,true);
 await assert.rejects(loaded.extension.publicationContent({...volumes[0],installmentId:"12/unrelated"}),{type:"invalidIdentifier"});
});
test("LNORI rejects bad paths and doesn't cache failed catalog responses",async()=>{
 let attempts=0;const loaded=await loadContentExtension(main,request=>runtimeResponse({url:request.url,text:++attempts===1?"<html>Broken library</html>":library}),{cache:metadataCacheFixture()});
 await assert.rejects(loaded.extension.search({query:""}),{type:"invalidResponse"});await loaded.extension.search({query:""});assert.equal(attempts,2);
 for(const id of ["1","../secret","1/%2e%2e","1/name?x=y"])await assert.rejects(loaded.extension.details(id),{type:"invalidIdentifier"});
 await assert.rejects(loaded.extension.search({metadata:{page:0}}),{type:"invalidCursor"});
 await assert.rejects(loaded.extension.imagePageContent({url:"https://evil.test/cover.jpg"}),{type:"hostNotAllowed"});
});

test("LNORI accepts legitimate long title slugs and binds books to the series metadata",async()=>{
 const titleSlug='a'.repeat(205);const source=card(1).replace('/1/sample-novel',`/1/${titleSlug}`);
 const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:source}));assert.equal((await loaded.extension.search({})).items[0].workId,`1/${titleSlug}`);
 const mismatch=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:new URL(r.url).pathname.startsWith('/series/')?series:book.replace('"value":"1"','"value":"2"')}));
 await assert.rejects(mismatch.extension.publicationContent({installmentId:bookID,workId:workID}),{type:'invalidResponse'});
});
test("LNORI large catalogs and long volumes retain all identities and reading text",async()=>{
 const largeLibrary=Array.from({length:884},(_,i)=>card(i+1)).join('');
 const paragraphs=Array.from({length:4000},(_,i)=>`<p>Original sample paragraph ${i} &amp; illustration notes.</p>`).join('');
 const largeBook=`<script type="application/ld+json">${JSON.stringify(bookSchema)}</script><h1 id="book-title">Original sample volume</h1><article class="content-body"><section id="chapter1">${paragraphs}</section></article>`;
 const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:new URL(r.url).pathname==='/library'?largeLibrary:new URL(r.url).pathname.startsWith('/series/')?series:largeBook}),{cache:metadataCacheFixture()});
 const last=await loaded.extension.search({metadata:{page:36}});assert.equal(last.items.length,9);assert.equal(last.metadata,null);
 const found=await loaded.extension.search({query:'Sample 884'});assert.equal(found.items[0].workId,'884/sample-884');assert.equal(loaded.calls.length,1);
 const volume=await loaded.extension.publicationContent({installmentId:bookID,workId:workID});
 assert.equal((volume.text.match(/Original sample paragraph/g)||[]).length,4000);assert.ok(volume.text.includes('paragraph 3999 &amp;'));assert.ok(volume.text.includes('<section id="chapter1">'));
});

test("LNORI streams nested sections exactly once and strips unsafe markup",async()=>{
 const nested=book.replace('<h2>Chapter One</h2>', '<section id="nested"><h2>Chapter One</h2><p>Original nested paragraph &copy; &lt;value&gt;</p></section><!-- Ignore > --><STYLE>unsafe-style</STYLE><SCRIPT>unsafe-script</SCRIPT>');
 const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:new URL(r.url).pathname.startsWith('/series/')?series:nested}),{cache:metadataCacheFixture()});
 const content=await loaded.extension.publicationContent({installmentId:bookID,workId:workID});
 assert.equal((content.text.match(/Original nested paragraph/g)||[]).length,1);
 assert.ok(content.text.includes('© &lt;value&gt;'));assert.ok(content.text.includes('<section id="nested">'));assert.ok(!content.text.includes('unsafe-'));
});


test("LNORI streaming descriptor does not fetch the full volume", async () => {
 const loaded = await loadContentExtension(main, () => { throw new Error("No HTTP should be needed"); });
 const stream = await loaded.extension.publicationStream({installmentId: bookID, workId: workID});
 assert.equal(stream.id, bookID); assert.equal(stream.workId, workID);
 assert.equal(stream.url, `https://lnori.com/book/${bookID}`);
 assert.equal(stream.headers.Referer, "https://lnori.com/"); assert.equal(loaded.calls.length, 0);
 await assert.rejects(loaded.extension.publicationStream({installmentId: "../secret", workId: workID}), {type:"invalidIdentifier"});
});
