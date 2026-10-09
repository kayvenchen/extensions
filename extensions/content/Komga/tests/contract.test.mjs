/* SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import {resolve} from "node:path";
import {assertContentExtension} from "../../../../packages/cli/lib/contracts.mjs";
test("Komga declares a valid user-configured content connector", () => assertContentExtension(resolve(import.meta.dirname, ".."), "Komga"));
