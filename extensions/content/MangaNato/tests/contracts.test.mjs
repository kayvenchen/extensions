import test from "node:test";
import {resolve} from "node:path";
import {assertContentExtension} from "../../../../packages/cli/lib/contracts.mjs";
test("MangaNato declares a valid API 2.0 extension",()=>assertContentExtension(resolve(import.meta.dirname,".."),"MangaNato"));
