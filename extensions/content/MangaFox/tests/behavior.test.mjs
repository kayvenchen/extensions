/* SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse,metadataCacheFixture,MINIMAL_WEBP_BYTES} from "../../test-runtime.mjs";
const main=resolve(import.meta.dirname,"../main.wasm");
const row='<li><a href="/manga/sample_manga/" title="Sample &amp; Story"><img src="//fmcdn.mfcdn.net/store/cover.jpg?token=public&amp;ttl=1799999999"></a></li>';
function catalog(search,page){return `<ul class="manga-list-${search?4:1}-list line">${page===1?row+row:''}</ul><div class="pager-list-left">${page===1?`<a href="${search?'/search?page=2&amp;title=sample':'/directory/2.html'}">2</a>`:''}</div>`;}
const series=`<img class="detail-info-cover-img" src="//fmcdn.mfcdn.net/store/cover.jpg"><span class="detail-info-right-title-font">Sample Story</span><span class="detail-info-right-title-tip">Ongoing</span><p class="detail-info-right-say"><a>Sample Author</a></p><p class="fullcontent">Full synopsis</p><div id="chapterlist"><a href="/manga/sample_manga/v01/c001/1.html" title="Chapter 1">Chapter 1</a><a href="/manga/sample_manga/v01/c001/1.html">Chapter 1 repeated</a><a href="/manga/sample_manga/c002.5/1.html">Chapter 2.5</a></div><a href="/manga/recommended/c001/1.html">Recommended Comic</a>`;
function reader(page){return `<div id="viewer"><a><img id="image" src="//zjcdn.mangafox.me/store/${page}.webp?token=public&amp;ttl=1799999999"></a><img style="display:none" src="//evil.test/preload.jpg"></div><select class="mangaread-page">${[1,2,3].map(i=>`<option value="//m.fanfox.net/manga/sample_manga/v01/c001/${i}.html">${i}</option>`).join('')}</select>`;}
function responder(request){const url=new URL(request.url);let html;
 if(url.pathname.startsWith('/directory'))html=catalog(false,url.pathname==='/directory/'?1:2);
 else if(url.pathname==='/search')html=catalog(true,Number(url.searchParams.get('page')));
 else if(url.pathname==='/manga/sample_manga/')html=series;
 else if(url.hostname==='m.fanfox.net')html=reader(Number(url.pathname.split('/').at(-1).replace('.html','')));
 else if(request.imageResource)return runtimeResponse({url:request.url,mimeType:'image/webp',bytes:MINIMAL_WEBP_BYTES});
 else throw new Error(`Unexpected ${request.url}`);
 return runtimeResponse({url:request.url,text:html});
}
test("MangaFox preserves catalog identities, pagination, entities and cache reuse",async()=>{
 const cache=metadataCacheFixture();const loaded=await loadContentExtension(main,responder,{cache});
 const first=await loaded.extension.discover({sectionId:'directory'});assert.equal(first.items.length,1);assert.equal(first.items[0].workId,'sample_manga');assert.equal(first.items[0].title,'Sample & Story');assert.equal(first.metadata.page,2);
 const last=await loaded.extension.discover({sectionId:'directory',metadata:first.metadata});assert.equal(last.items.length,0);assert.equal(last.metadata,null);
 const searched=await loaded.extension.search({query:'sample & story'});assert.equal(searched.items.length,1);assert.equal(new URL(loaded.calls.at(-1).url).searchParams.get('title'),'sample & story');
 const restarted=await loadContentExtension(main,responder,{cache});await restarted.extension.discover({sectionId:'directory'});assert.equal(restarted.calls.length,0);
});
test("MangaFox opens chapters with one HTML request and resolves images lazily",async()=>{
 const loaded=await loadContentExtension(main,responder,{cache:metadataCacheFixture()});const detail=await loaded.extension.details('sample_manga');assert.equal(detail.workInfo.synopsis,'Full synopsis');
 const chapters=await loaded.extension.installments(detail);assert.equal(chapters.length,2);assert.equal(chapters[0].volume,1);assert.equal(chapters[1].number,2.5);
 const list=await loaded.extension.imagePages(chapters[0]);assert.equal(list.pages.length,3);assert.equal(loaded.calls.length,2);
 await loaded.extension.imagePageContent({url:list.pages[0]});assert.equal(loaded.calls.length,3,'first page reuses the chapter HTML');assert.equal(loaded.calls.at(-1).headers.Referer,list.pages[0]);
 await loaded.extension.imagePageContent({url:list.pages[2]});assert.equal(loaded.calls.length,5,'only the requested page is resolved');assert.equal(loaded.calls.at(-1).imageResource,true);assert.equal(new URL(loaded.calls.at(-1).url).pathname,'/store/3.webp');
 assert.ok(loaded.calls.every(r=>!r.url.includes('evil.test')));
 await assert.rejects(loaded.extension.imagePages({...chapters[0],workId:'another'}),{type:'invalidIdentifier'});
});
test("MangaFox rejects unsafe page paths and malformed reader markup",async()=>{
 const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:'<div id="viewer"><img id="image" src="https://evil.test/page.jpg"></div>'}),{cache:metadataCacheFixture()});
 await assert.rejects(loaded.extension.imagePages({installmentId:'sample_manga/v01/c001',workId:'sample_manga'}),{type:'hostNotAllowed'});
 await assert.rejects(loaded.extension.imagePageContent({url:'https://m.fanfox.net/manga/sample_manga/v01/c001/0.html'}),{type:'invalidResponse'});
 await assert.rejects(loaded.extension.imagePageContent({url:'https://m.fanfox.net/manga/sample_manga/v01/c001/1.html?other=1'}),{type:'invalidResponse'});
 await assert.rejects(loaded.extension.imagePageContent({url:'https://evil.test/page.jpg'}),{type:'hostNotAllowed'});
});
test("MangaFox long chapter indexes retain order, metadata and decimal identities",async()=>{
 const largeSeries=series.slice(0,series.indexOf('<div id="chapterlist">'))+`<div id="chapterlist">${Array.from({length:1230},(_,i)=>`<a href="/manga/sample_manga/c${1230-i}/1.html" title="Chapter ${1230-i} &amp; title"><div><p>Chapter ${1230-i}</p><p>2026</p></div></a>`).join('')}</div>`;
 const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,text:largeSeries}),{cache:metadataCacheFixture()});
 const chapters=await loaded.extension.installments({workId:'sample_manga'});assert.equal(chapters.length,1230);assert.equal(chapters[0].number,1230);assert.equal(chapters.at(-1).number,1);assert.equal(chapters[0].title,'Chapter 1230 & title');
 await loaded.extension.installments({workId:'sample_manga'});assert.equal(loaded.calls.length,1);
});
