/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {loadContentExtension,runtimeResponse,MINIMAL_WEBP_BYTES} from '../../test-runtime.mjs';
const providers=[['MangaKakalot','www.mangakakalot.gg'],['MangaNato','www.manganato.gg'],['MangaBat','www.mangabats.com']];
const listing='<div class="panel_story_list"><div class="story_item"><a href="/manga/sample" title="Sample &amp; Story"><img src="https://s1.mkklcdnv6temp.com/covers/sample.jpg"></a></div></div><div class="panel_page_number"><a href="?page=2">2</a></div>';
const info='<div class="panel-story-info"><h1>Sample Story</h1><span class="info-image"><img src="https://s1.mkklcdnv6temp.com/covers/sample.jpg"></span><table class="variations-tableInfo"><tr><td>Author:</td><td><a>Author One</a></td></tr><tr><td>Status:</td><td>Ongoing</td></tr><tr><td>Genres:</td><td><a>Adventure</a></td></tr></table></div><div id="panel-story-info-description">A synthetic synopsis.</div>';
const indexed=info+'<div id="chapter-list-container" data-comic-slug="sample" data-api-url="/api/chapters/__SLUG__" data-chapter-url-template="/chapter/__MANGA__/__CHAPTER__"></div>';
const legacy=info+'<div class="row-content-chapter"><a href="/manga/sample/chapter-2">Chapter 2</a><a href="/manga/sample/chapter-1">Chapter 1</a><a href="/manga/sample/chapter-1">Duplicate</a></div>';
for(const [name,host] of providers){
 const main=resolve(import.meta.dirname,`../../${name}/main.wasm`);
 const response=(r,text)=>runtimeResponse({url:r.url,text});
 test(`${name}: catalog, query encoding, cursor and supported filters`,async()=>{
  const loaded=await loadContentExtension(main,r=>response(r,new URL(r.url).searchParams.get('page')==='2'?'<div class="panel_story_list"></div>':listing));
  const first=await loaded.extension.discover({sectionId:'hot'});
  assert.equal(first.items[0].workId,'manga/sample');assert.equal(first.items[0].title,'Sample & Story');assert.equal(first.metadata.page,2);
  assert.equal(new URL(loaded.calls[0].url).searchParams.get('filter'),'7');
  const empty=await loaded.extension.discover({sectionId:'hot',metadata:first.metadata});assert.deepEqual(empty.items,[]);assert.equal(empty.metadata,null);
  await loaded.extension.search({query:'One Piece'});assert.equal(new URL(loaded.calls.at(-1).url).pathname,'/search/story/one_piece');
  await loaded.extension.search({query:'',sort:'latest',selections:[{fieldID:'status',value:'completed'},{fieldID:'genre',value:'Action'}]});
  assert.equal(new URL(loaded.calls.at(-1).url).pathname,'/genre/action');assert.equal(new URL(loaded.calls.at(-1).url).searchParams.get('filter'),'5');
  await assert.rejects(loaded.extension.search({query:'sample',selections:[{fieldID:'genre',value:'action'}]}));
  await assert.rejects(loaded.extension.search({query:'',metadata:{page:0}}));
  assert.ok(loaded.calls.every(r=>r.headers.Referer===`https://${host}/`));
 });
 test(`${name}: details and complete paginated chapter API`,async()=>{
  const loaded=await loadContentExtension(main,r=>{
   const url=new URL(r.url);if(!url.pathname.startsWith('/api/'))return response(r,indexed);
   const offset=Number(url.searchParams.get('offset'));
   return response(r,JSON.stringify({data:{chapters:Array.from({length:offset===0?500:3},(_,i)=>({chapter_name:`Chapter ${offset+i+1}`,chapter_slug:`chapter-${offset+i+1}`,chapter_num:offset+i+1})),pagination:{has_more:offset===0}}}));
  });
  const detail=await loaded.extension.details('manga/sample');assert.equal(detail.workInfo.author,'Author One');assert.equal(detail.workInfo.status,'ongoing');
  const chapters=await loaded.extension.installments({workId:'manga/sample'});assert.equal(chapters.length,503);assert.equal(chapters.at(-1).number,503);assert.equal(chapters[0].installmentId,'manga/sample|chapter/sample/chapter-1');
  assert.equal(new URL(loaded.calls.at(-1).url).searchParams.get('offset'),'500');
 });
 test(`${name}: legacy chapters, CDN arrays and image acquisition`,async()=>{
  const loaded=await loadContentExtension(main,r=>r.imageResource?runtimeResponse({url:r.url,mimeType:'image/webp',bytes:MINIMAL_WEBP_BYTES}):response(r,new URL(r.url).pathname.includes('chapter-')?'<script>var cdns = ["https://s1.mkklcdnv6temp.com"]; var chapterImages = ["pages/1.webp", "pages/2.webp"];</script>':legacy));
  const chapters=await loaded.extension.installments({workId:'manga/sample'});assert.equal(chapters.length,2);
  const pages=await loaded.extension.imagePages({workId:'manga/sample',installmentId:chapters[0].installmentId});assert.equal(pages.pages.length,2);
  const image=await loaded.extension.imagePageContent({url:pages.pages[0]});assert.equal(image.mimeType,'image/webp');assert.ok(image.dataBase64);
  await assert.rejects(loaded.extension.imagePages({workId:'manga/other',installmentId:chapters[0].installmentId}));
  await assert.rejects(loaded.extension.imagePageContent({url:'https://s1.mkklcdnv6temp.com.evil.test/1.webp'}));
 });
 test(`${name}: HTML image layout and malformed pages`,async()=>{
  const loaded=await loadContentExtension(main,r=>response(r,'<div class="container-chapter-reader"><img data-src="https://s1.mkklcdnv6temp.com/1.webp"><img src="https://s1.mkklcdnv6temp.com/2.webp"></div>'));
  const pages=await loaded.extension.imagePages({workId:'manga/sample',installmentId:'manga/sample|chapter/sample/one'});assert.equal(pages.pages.length,2);
  const malformed=await loadContentExtension(main,r=>response(r,'<html>Unexpected layout</html>'));
  await assert.rejects(malformed.extension.search({query:'sample'}));await assert.rejects(malformed.extension.details('manga/sample'));await assert.rejects(malformed.extension.imagePages({workId:'manga/sample',installmentId:'manga/sample|chapter/sample/one'}));
 });
 test(`${name}: challenged documents and images hand off without retry loops`,async()=>{
  for(const args of [{status:403,headers:{'cf-mitigated':'challenge'},text:'<title>Just a moment...</title>'},{status:200,text:'<title>Just a moment...</title>'}]){
   const loaded=await loadContentExtension(main,r=>runtimeResponse({url:r.url,...args}));
   await assert.rejects(loaded.extension.search({query:'one piece'}),e=>e.type==='challengeRequired');assert.equal(loaded.challenges.length,1);assert.equal(loaded.calls.length,1);
  }
  const image=await loadContentExtension(main,r=>runtimeResponse({url:r.url,status:403,headers:{'cf-mitigated':'challenge'}}));
  await assert.rejects(image.extension.imagePageContent({url:'https://s1.mkklcdnv6temp.com/1.webp'}),e=>e.type==='challengeRequired');assert.equal(image.challenges.length,1);
 });
 test(`${name}: rejects bad redirects, pagination stalls and rate limits`,async()=>{
  const redirected=await loadContentExtension(main,r=>runtimeResponse({url:'https://evil.test/',text:listing}));await assert.rejects(redirected.extension.search({query:'one piece'}));
  const limited=await loadContentExtension(main,r=>runtimeResponse({url:r.url,status:429,headers:{'retry-after':'12'}}));await assert.rejects(limited.extension.search({query:'one piece'}),e=>e.type==='rateLimited'&&e.retryAfterSeconds===12);
  const stalled=await loadContentExtension(main,r=>response(r,r.url.includes('/api/')?JSON.stringify({data:{chapters:[],pagination:{has_more:true}}}):indexed));await assert.rejects(stalled.extension.installments({workId:'manga/sample'}));
 });
}
