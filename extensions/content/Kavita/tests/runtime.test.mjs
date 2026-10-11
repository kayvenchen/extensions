import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse} from "../../test-runtime.mjs";
const path=resolve(import.meta.dirname,"../main.wasm");
const args=(operation,extra={})=>({operation,baseURL:"https://server.test/kavita/",options:{libraryID:"4"},...extra});
test("Kavita compiled operations preserve pagination, filters and publication formats",async()=>{
 const series={id:1,name:"Title",localizedName:"Fixture",originalName:"Alternative",format:3,writers:[{name:"Writer"}],publicationStatus:2};
 const {extension,calls}=await loadContentExtension(path,request=>{
  const url=new URL(request.url);assert.equal(url.origin,"https://server.test");assert.equal(request.headers.Authorization,undefined);
  if(url.pathname.endsWith("libraries"))return runtimeResponse({text:"[]"});
  if(url.pathname.endsWith("all-v2")){
   assert.equal(url.searchParams.get("PageNumber"),"2");assert.equal(url.searchParams.get("libraryId"),"5");
   assert.equal(request.body.sortOptions.isAscending,false);assert.equal(request.body.statements[0].value,"Fixture");
   return runtimeResponse({text:JSON.stringify([series])});
  }
  if(url.pathname.endsWith("volumes"))return runtimeResponse({text:JSON.stringify([{number:2,chapters:[{id:8,title:"Chapter",number:"1",files:[{filePath:"book.epub"}]},{id:9,range:"Two",files:[{filePath:"book.pdf"}]},{id:10,range:"Three",files:[{filePath:"book.cbz"}]}]}])});
  return runtimeResponse({text:JSON.stringify(series)});
 });
 assert.equal((await extension.connectorInfo({})).kind,"kavita");
 assert.ok((await extension.connector(args("capabilities"))).includes("acquisition"));
 const page=await extension.connector(args("search",{query:{text:"Fixture",page:2,pageSize:1,filters:{libraryID:"5",sort:"titleDescending"}}}));
 assert.equal(page.nextPage,3);assert.deepEqual(page.items[0].alternativeTitles,["Alternative"]);
 assert.equal((await extension.connector(args("details",{remoteID:"1"}))).kind,"lightNovel");
 const chapters=await extension.connector(args("installments",{remoteID:"1",page:1}));
 assert.deepEqual(chapters.items.map(v=>v.format),["epub","pdf","cbz"]);
 const count=calls.length;assert.equal(await extension.connector(args("acquisition",{remoteID:"8"})),"https://server.test/kavita/api/Download/chapter?chapterId=8");assert.equal(calls.length,count);
 await assert.rejects(extension.connector(args("details",{remoteID:"../1"})));
});
