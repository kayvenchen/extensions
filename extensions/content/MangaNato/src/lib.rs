// Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0
use manko_sdk::{Context, Operation};
use serde_json::Value;
fn run(context: Context, method: String, args: Value) -> Operation {
    manko_mangabox::run(
        manko_mangabox::Provider {
            name: "MangaNato",
            base: "https://www.manganato.gg/",
        },
        context,
        method,
        args,
    )
}
manko_sdk::export_extension!("MangaNato", "content", run);
