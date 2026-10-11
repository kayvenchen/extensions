/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */
/* Copyright © 2026 manko Extension Contributors */

import { defineConfig } from "vitepress";

const base = process.env.MANKO_SITE_BASE || "/extensions/";

export default defineConfig({
  title: "manko Extensions",
  titleTemplate: ":title | manko Extensions",
  description: "Browse and install community extensions for manko.",
  base,
  outDir: "../../site",
  cleanUrls: true,
  lastUpdated: false,
  sitemap: {
    hostname: "https://kayvenchen.github.io/extensions/",
  },
  head: [
    ["meta", { name: "theme-color", content: "#ff9500" }],
    ["meta", { name: "color-scheme", content: "light dark" }],
    ["meta", { name: "referrer", content: "no-referrer-when-downgrade" }],
  ],
  themeConfig: {
    siteTitle: "manko Extensions",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Official", link: "/" },
      { text: "Community", link: "/community" },
      { text: "Installation", link: "/installation" },
      { text: "Extension List", link: "/extension-list" },
      {
        text: "Docs",
        items: [
          { text: "Guides", link: "/guides/" },
          { text: "FAQ", link: "/faq" },
          { text: "Support", link: "/support" },
          { text: "Development", link: "/development/" },
        ],
      },
    ],
    sidebar: [
      { text: "Installation", link: "/installation" },
      { text: "Extension List", link: "/extension-list" },
      {
        text: "Guides",
        link: "/guides/",
        collapsed: false,
        items: [
          { text: "Browse Extensions", link: "/guides/#browse-extensions" },
          { text: "Custom Catalogs", link: "/guides/#custom-catalogs" },
          { text: "Content Ratings", link: "/guides/#content-ratings" },
        ],
      },
      { text: "FAQ", link: "/faq" },
      { text: "Support", link: "/support" },
      {
        text: "Development",
        link: "/development/",
        collapsed: true,
        items: [
          { text: "Repository Layout", link: "/development/#repository-layout" },
          { text: "Validation", link: "/development/#validation-workflow" },
          { text: "Publishing", link: "/development/#publishing" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/k800k/extensions" }],
    editLink: {
      pattern: "https://github.com/k800k/extensions/edit/main/website/src/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: `Documentation site license: <a href="${base}LICENSE">GPL-3.0-or-later</a> · <a href="https://github.com/k800k/extensions">source</a>.`,
      copyright: "Copyright © 2026 manko Extension Contributors",
    },
    outline: [2, 3],
  },
  markdown: {
    image: {
      lazyLoading: true,
    },
  },
});
