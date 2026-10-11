import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {loadContentExtension,runtimeResponse} from "../../test-runtime.mjs";
const path=resolve(import.meta.dirname,"../main.wasm");
const args=(operation,extra={})=>({operation,baseURL:"https://server.test/suwayomi/",options:{sourceID:"42"},...extra});
test("Suwayomi compiled metadata and bounded page routes never update reading progress",async()=>{
 const manga={id:3,title:"Fixture",author:"Writer",genre:["manga"]};
 const {extension,calls}=await loadContentExtension(path,request=>{
  assert.equal(new URL(request.url).pathname,"/suwayomi/api/graphql");
  const {query,variables}=request.body;let data;
  if(query.includes("MankoDiscovery"))data={serverSettings:{ip:"localhost"}};
  else if(query.includes("MankoChapters"))data={chapters:{nodes:[{id:8,name:"Chapter",sourceOrder:2,pageCount:3}]}};
  else if(query.includes("MankoSearch")){assert.equal(variables.source,42);assert.equal(variables.page,2);data={searchSourceManga:{mangas:[manga],hasNextPage:true}};}
  else data={manga};
  return runtimeResponse({text:JSON.stringify({data})});
 });
 assert.ok((await extension.connector(args("capabilities"))).includes("imageSequence"));
 const page=await extension.connector(args("search",{query:{text:"Fixture",page:2}}));assert.equal(page.nextPage,3);
 assert.equal((await extension.connector(args("details",{remoteID:"3"}))).coverURL,null);
 const chapter=(await extension.connector(args("installments",{remoteID:"3",page:1}))).items[0];assert.equal(chapter.remoteID,"3:2:8");
 assert.equal(chapter.format,"remoteImageSequence");
 const count=calls.length;
 const pages=await extension.connector(args("imagePages",{remoteID:chapter.remoteID,pageCount:3,query:{page:1,pageSize:2}}));assert.equal(pages.nextPage,2);assert.deepEqual(pages.items.map(v=>v.index),[0,1]);
 assert.ok(pages.items.every(v=>v.resourceURL.endsWith("updateProgress=false")));
 assert.ok((await extension.connector(args("acquisition",{remoteID:chapter.remoteID}))).endsWith("markAsRead=false"));assert.equal(calls.length,count);
 await assert.rejects(extension.connector(args("imagePages",{remoteID:chapter.remoteID,pageCount:50001})));
 await assert.rejects(extension.connector(args("details",{remoteID:"18446744073709551616"})));
});
