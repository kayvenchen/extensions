<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import SourceList from "./components/SourceList.vue";

const { frontmatter } = useData();
</script>

<template>
  <SourceList v-if="frontmatter.layout === 'catalog'" :key="frontmatter.pack || 'official'" :pack="frontmatter.pack" />
  <DefaultTheme.Layout v-else />
</template>
