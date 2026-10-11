import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse} from "../../test-runtime.mjs";
const path=resolve(import.meta.dirname,"../main.wasm");
const args=(operation,extra={})=>({operation,baseURL:"https://server.test/opds/",options:{},...extra});
test("OPDS compiled Atom parser resolves links, entities and next-page state",async()=>{
 const {extension,calls}=await loadContentExtension(path,request=>{
  const url=new URL(request.url);const second=url.searchParams.get("page")==="2";
  return runtimeResponse({text:`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>${second?"two":"one"}</id><title>Fixture &amp; Book</title><author><name>Writer</name></author><link rel="http://opds-spec.org/acquisition" href="book.epub" type="application/epub+zip"/></entry>${second?"":'<link rel="next" href="?page=2"/>'}</feed>`});
 });
 assert.ok((await extension.connector(args("capabilities"))).includes("acquisition"));
 const first=await extension.connector(args("browse",{query:{page:1,filters:{}}}));assert.equal(first.nextPage,2);assert.equal(first.items[0].title,"Fixture & Book");assert.equal(first.items[0].coverURL,null);
 const second=await extension.connector(args("browse",{query:{page:2,filters:{}}}));assert.equal(second.items[0].remoteID,"two");assert.equal(second.nextPage,null);
 const work=await extension.connector(args("details",{remoteID:"one"}));assert.deepEqual(work.authors,["Writer"]);
 const chapter=(await extension.connector(args("installments",{remoteID:"one",page:1}))).items[0];assert.equal(chapter.format,"epub");
 const count=calls.length;assert.equal(await extension.connector(args("acquisition",{remoteID:chapter.remoteID})),"https://server.test/opds/book.epub");assert.equal(calls.length,count);
});
for(const id of ["OPDS","Kavita","Suwayomi"]) for(const status of [401,404,500]) test(`${id} preserves HTTP ${status} failure`,async()=>{
 const module=resolve(import.meta.dirname,`../../${id}/main.wasm`);
 const {extension}=await loadContentExtension(module,()=>runtimeResponse({status,text:"{}"}));
 await assert.rejects(extension.connector({...args("capabilities"),baseURL:"https://server.test/"}));
});
