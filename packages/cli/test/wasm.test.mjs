/* SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile, readdir, mkdir, mkdtemp, writeFile, rm, chmod} from "node:fs/promises";
import {resolve} from "node:path";
import {validateModule, instantiate} from "../lib/wasm.mjs";
import {assertExtensionPackage} from "../lib/contracts.mjs";
const root=resolve(import.meta.dirname,"../../..");
const ids=["AniList","HitomiLA","Komga","LNori","MangaFire","MangaFox","MyAnimeList","NHentai","OmegaScans"];

test("Catalog contains all nine WASM extensions with matching digests",async()=>{
  const manifest=JSON.parse(await readFile(resolve(root,"dist/v1/stable/versioning.json")));
  assert.equal(manifest.schemaVersion,2);
  assert.deepEqual(manifest.sources.map(entry=>entry.id),ids);
  assert.deepEqual((await readdir(resolve(root,"dist/v1/stable/sources"))).sort(),ids);
  for(const entry of manifest.sources){
    const metadata=JSON.parse(await readFile(resolve(root,"extensions",entry.kind,entry.id,"extension.json")));
    assert.equal(entry.version,metadata.version);
    assert.equal(entry.extension.runtime,"wasm");
    assert.equal(entry.extension.apiVersion,"2.0");
    assert.equal(entry.extension.scriptURL,undefined);
    const bytes=await readFile(resolve(root,"dist/v1/stable",entry.extension.moduleURL));
    assert.equal(bytes.length,entry.extension.size);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.extension.sha256);
    assert.ok(!bytes.includes(Buffer.from(root)), "module must not embed checkout paths");
    assert.ok(!bytes.includes(Buffer.from("/Users/")), "module must not embed macOS home paths");
    assert.ok(!bytes.includes(Buffer.from("/home/")), "module must not embed Linux home paths");
    validateModule(bytes,entry);
  }
});

test("Validator rejects unsupported metadata, corrupt binaries and oversized modules",async()=>{
  const bytes=await readFile(resolve(root,"target/wasm32-unknown-unknown/release/manko_hitomi.wasm"));
  validateModule(bytes,{id:"HitomiLA",kind:"content"});
  assert.throws(()=>validateModule(bytes,{id:"not-HitomiLA",kind:"content"}));
  assert.throws(()=>validateModule(bytes,{id:"HitomiLA",kind:"tracker"}));
  assert.throws(()=>instantiate(Buffer.from("defineContentExtension({})")));
  assert.throws(()=>instantiate(bytes.subarray(0,bytes.length/2)));
  assert.throws(()=>instantiate(Buffer.alloc(10*1024*1024+1)));
  assert.throws(()=>instantiate(Buffer.from([0,97,115,109,1,0,0,0])));
});

test("SDK dispatch suspends, isolates owners and releases cancelled invocations",async()=>{
  const bytes=await readFile(resolve(root,"target/wasm32-unknown-unknown/release/manko_anilist.wasm"));
  const {dispatch}=instantiate(bytes);
  const request=dispatch({action:"invoke",invocationID:"first",method:"trackerSearch",arguments:{title:"fixture",kind:"manga"}});
  assert.ok(request.pending.length);
  const other=dispatch({action:"invoke",invocationID:"second",method:"authentication",arguments:{}});
  assert.equal(other.ok,true);
  assert.equal(dispatch({action:"cancel",invocationID:"first"}).ok,true);
  assert.equal(dispatch({action:"resume",invocationID:"first",responses:[]}).ok,false);
  assert.equal(dispatch({action:"invoke",invocationID:"first",method:"authentication",arguments:{}}).ok,true);
});

test("CLI scaffolds a compilable Rust package without modifying the published catalog",async()=>{
  await mkdir(resolve(root,"target/cli-tests"),{recursive:true});
  const directory=await mkdtemp(resolve(root,"target/cli-tests/scaffold-"));
  try{
    await writeFile(resolve(directory,"Cargo.toml"),'[workspace]\nmembers = []\n[workspace.package]\nedition="2021"\nlicense="Apache-2.0"\n');
    await writeFile(resolve(directory,"LICENSE"),await readFile(resolve(root,"LICENSE")));
    execFileSync(process.execPath,[resolve(root,"packages/cli/bin/manko-ext.mjs"),"new","--id","Fixture","--kind","tracker"],{env:{...process.env,MANKO_EXTENSION_ROOT:directory}});
    const metadata=await assertExtensionPackage(resolve(directory,"extensions/tracker/Fixture"),"tracker","Fixture");
    assert.equal(metadata.runtime,"wasm");
    assert.match(await readFile(resolve(directory,"Cargo.toml"),"utf8"),/members = \[\n  "extensions\/tracker\/Fixture",/);
    assert.match(await readFile(resolve(directory,"extensions/tracker/Fixture/src/lib.rs"),"utf8"),/export_extension!/);
    const cargo=resolve(directory,"fake-cargo.mjs"), log=resolve(directory,"cargo-args.json");
    await writeFile(cargo,`#!/usr/bin/env node\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2)));\n`);
    await chmod(cargo,0o755);
    execFileSync(process.execPath,[resolve(root,"packages/cli/bin/manko-ext.mjs"),"compile"],{env:{...process.env,MANKO_EXTENSION_ROOT:directory,CARGO:cargo}});
    const args=JSON.parse(await readFile(log,"utf8"));
    assert.equal(args.includes("--workspace"),false,"release builds must isolate extension dependency features");
    assert.deepEqual(args.slice(0,3),["build","-p","manko-fixture"]);
  } finally {await rm(directory,{recursive:true,force:true});}
});
