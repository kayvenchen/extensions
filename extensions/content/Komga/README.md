# Komga connector pilot

This API 2.0 content extension implements connector profile v1. Install one package, then create independent Komga connections using manko’s native Add Server form. Existing connections select the installed connector in Source Settings; native remains the default until explicitly changed.

The host sends only the server URL, non-secret options and operation arguments. It owns source/work/chapter identities, Keychain credentials, endpoint validation and EPUB/PDF/CBZ downloads. Requests use the existing Komga REST routes and respect reverse-proxy base paths. Each connection has separate runtime/cookie/cache state.

This is an original Rust port of manko’s Apache-2.0 Swift Komga adapter. No Komga server code is included. The icon is an original lettermark. Publication remains gated with the other locally prepared extensions. Keep this catalog unpublished until the connector-capable app is released.
