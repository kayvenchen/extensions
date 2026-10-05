<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright © 2025 Inkdex -->
<!-- Copyright © 2026 manko Extension Contributors -->

# Frequently Asked Questions

## General

::: details Are any extensions published right now?
Yes. The catalog lists two content extensions (HitomiLA and NHentai) and two tracker extensions (AniList and MyAnimeList).
:::

::: details What extension types are supported?
Content and tracker extensions. Theme extensions remain unsupported; this does not remove ordinary website or reader color themes.
:::

::: details Does this repository include manga or comics?
No. It publishes extension metadata and versioned WebAssembly. External services decide what they host, and users remain responsible for accessing only services and material they are authorized to use.
:::

::: details Does adding the repository install every extension?
No. Adding a repository makes its catalog visible to manko. You still choose each extension through manko's install flow.
:::

## Installation and repositories

::: details What is a compatible custom catalog?
For manko installation, it is an HTTPS directory containing `versioning.json`, or the full URL to that file. Each source must have a unique ID and be a content or tracker extension; theme entries are rejected. Add other publishers' repositories directly in Manko.
:::

::: details Where are custom catalogs stored?
Repositories are managed inside Manko. The website displays this repository's catalog without an account or saved selections.
:::

::: details Why will a custom catalog not load?
For repositories added in Manko, check the repository address and its `versioning.json`. If this website cannot load its catalog, choose **Try Again**. Invalid metadata or an HTTP error disables the website's installation actions until the catalog loads successfully.
:::

## Support

::: details Where should I report a security vulnerability?
Do not open a public issue containing sensitive details. Follow the repository's [Security Policy](https://github.com/k800k/extensions/blob/main/SECURITY.md).
:::
