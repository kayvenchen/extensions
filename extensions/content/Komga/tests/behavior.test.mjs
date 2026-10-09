/* SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse} from "../../test-runtime.mjs";
const modulePath=resolve(import.meta.dirname,"../main.wasm");
const series={id:"series-1",name:"Fallback",metadata:{title:"Fixture Series",language:"en",tags:["manga"],status:"ENDED",authors:[{name:"Writer",role:"writer"}]}};
const books=[{id:"book-1",name:"First",metadata:{numberSort:1},media:{mediaType:"application/zip",pagesCount:20}},{id:"book-2",name:"Second",media:{mediaType:"application/pdf"}},{id:"book-3",name:"Third",media:{mediaType:"application/epub+zip"}}];
const baseURL="http://192.168.1.9:8080/komga/";
const args=(operation,extra={})=>({operation,baseURL,options:{libraryID:"library-1"},...extra});

test("compiled Komga uses configured endpoints, filters and pagination",async()=>{
 const {extension,calls}=await loadContentExtension(modulePath,request=>{
  const url=new URL(request.url);
  assert.equal(url.origin,"http://192.168.1.9:8080");
  assert.equal(request.headers.Authorization,undefined,"credentials are supplied by the native host");
  if(url.pathname.endsWith("/libraries")) return runtimeResponse({text:"[]"});
  if(url.pathname.endsWith("/books")) return runtimeResponse({text:JSON.stringify({content:books,last:false,totalPages:2,totalElements:4})});
  if(url.pathname.endsWith("/series/series-1")) return runtimeResponse({text:JSON.stringify(series)});
  assert.equal(url.pathname,"/komga/api/v1/series");
  assert.equal(url.searchParams.get("page"),"1");
  assert.equal(url.searchParams.get("size"),"25");
  assert.equal(url.searchParams.get("sort"),"metadata.titleSort,desc");
  assert.equal(url.searchParams.get("library_id"),"override");
  assert.equal(url.searchParams.get("search"),"example & title");
  return runtimeResponse({text:JSON.stringify({content:[series],last:false,totalPages:3,totalElements:51})});
 });
 assert.deepEqual(await extension.connectorInfo({}),{kind:"komga",version:1});
 assert.ok((await extension.connector(args("capabilities"))).includes("acquisition"));
 const result=await extension.connector(args("search",{query:{text:"example & title",page:2,pageSize:25,filters:{libraryID:"override",sort:"metadata.titleSort,desc"}}}));
 assert.equal(result.items[0].title,"Fixture Series");assert.equal(result.nextPage,3);assert.equal(result.totalCount,51);
 const work=await extension.connector(args("details",{remoteID:"series-1"}));assert.deepEqual(work.authors,["Writer"]);assert.equal(work.status,"completed");
 const chapters=await extension.connector(args("installments",{remoteID:"series-1",page:1}));
 assert.deepEqual(chapters.items.map(book=>book.format),["cbz","pdf","epub"]);assert.equal(chapters.nextPage,2);
 const count=calls.length;
 assert.equal(await extension.connector(args("acquisition",{remoteID:"book-1"})),baseURL+"api/v1/books/book-1/file");
 assert.equal(calls.length,count,"publication bytes are downloaded natively");
});

test("compiled Komga handles raw-array pages and configuration defaults",async()=>{
 const {extension}=await loadContentExtension(modulePath,request=>{
  const url=new URL(request.url);assert.equal(url.searchParams.get("page"),"0");
  assert.equal(url.searchParams.get("library_id"),"library-1");
  return runtimeResponse({text:JSON.stringify([series])});
 });
 const page=await extension.connector(args("browse",{query:{page:1,pageSize:40,filters:{}}}));
 assert.equal(page.nextPage,null);assert.equal(page.totalCount,1);
});

for(const [status,type] of [[401,"authenticationRequired"],[404,"notFound"],[500,"serviceError"]]) test(`Komga maps HTTP ${status}`,async()=>{
 const {extension}=await loadContentExtension(modulePath,()=>runtimeResponse({status,text:"{}"}));
 await assert.rejects(extension.connector(args("details",{remoteID:"series-1"})),error=>error.type===type);
});

test("Komga rejects malformed pages, identifiers and missing server context",async()=>{
 const {extension,calls}=await loadContentExtension(modulePath,()=>runtimeResponse({text:"{invalid"}));
 await assert.rejects(extension.connector(args("browse",{query:{page:1,filters:{}}})),error=>error.type==="invalidResponse");
 const count=calls.length;
 for(const remoteID of ["","..","../other","a/b","%2f"]) await assert.rejects(extension.connector(args("acquisition",{remoteID})),error=>error.type==="invalidIdentifier");
 await assert.rejects(extension.connector({operation:"capabilities"}),error=>error.type==="invalidResponse");
 await assert.rejects(extension.search({}),error=>error.type==="unsupportedOperation");
 assert.equal(calls.length,count);
});
