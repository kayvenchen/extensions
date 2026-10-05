<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Layout adapted from Aidoku Community Sources; MIT notice: /aidoku-catalog-license.txt -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { withBase } from "vitepress";
import { buildAddRepositoryLink, buildInstallLink, DEFAULT_CATALOG, normalizeCatalog, type CatalogSource, type NormalizedCatalog } from "../lib/catalog";
import { compareLanguages, filterSources, groupSources, isInstallable, languageLabel, PROVIDER_HOMEPAGES } from "../lib/source-list";

const catalog = ref<NormalizedCatalog | null>(DEFAULT_CATALOG);
const loading = ref(true);
const error = ref("");
const filters = reactive({ search: "", language: "", rating: "" });
let request: AbortController | undefined;

const sources = computed(() => catalog.value?.sources ?? []);
const languages = computed(() => [...new Set(sources.value.map((source) => languageLabel(source.languages)))].sort(compareLanguages));
const visibleSources = computed(() => filterSources(sources.value, filters));
const groups = computed(() => groupSources(visibleSources.value));
const addLink = computed(() => catalog.value && !loading.value ? buildAddRepositoryLink(catalog.value.repository.url) : undefined);

function installLink(source: CatalogSource) {
  return !loading.value && isInstallable(source) ? buildInstallLink(source.repository.url, [source.id]) : undefined;
}

function iconURL(source: CatalogSource) {
  return source.iconURL?.startsWith(source.repository.url)
    ? withBase(`/dist/v1/stable/${source.iconURL.slice(source.repository.url.length)}`)
    : source.iconURL ?? undefined;
}

function ratingDescription(source: CatalogSource) {
  return source.contentRating === "ADULT" ? "This source contains primarily NSFW content" : "This source contains NSFW content";
}

async function loadCatalog() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch(withBase("/dist/v1/stable/catalog.json"), { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
    catalog.value = normalizeCatalog(await response.json(), { isDefault: true });
  } catch (failure) {
    if (controller.signal.aborted) return;
    catalog.value = null;
    error.value = "Error loading sources. Please try again.";
  } finally {
    if (request === controller) loading.value = false;
  }
}

onMounted(loadCatalog);
onUnmounted(() => request?.abort());
</script>

<template>
  <div class="source-catalog">
    <a class="skip-link" href="#source-list">Skip to sources</a>
    <a id="github-link" href="https://github.com/k800k/extensions" target="_blank" rel="noopener noreferrer" aria-label="GitHub Repository">
      <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    </a>
    <header>
      <h1>manko Sources</h1>
      <p>Browse community-maintained Manko extensions. Add this repository to Manko to install and update sources from within the app.</p>
    </header>
    <main>
      <div id="add-repo-btn">
        <a :href="addLink || undefined" :aria-disabled="!addLink">Add Repository</a>
        <p>Requires <b>Manko</b>.</p>
      </div>
      <div id="filter-container" role="region" aria-label="Catalog filters">
        <div class="filter-group">
          <label for="source-search" class="filter-label">Search</label>
          <input id="source-search" v-model="filters.search" type="search" placeholder="Search sources..." autocomplete="off">
        </div>
        <div id="filter-menus-row">
          <div class="filter-group">
            <label for="language-select" class="filter-label">Language</label>
            <div class="select-wrapper">
              <select id="language-select" v-model="filters.language">
                <option value="">All Languages</option>
                <option v-for="language in languages" :key="language" :value="language">{{ language }}</option>
              </select>
              <svg class="select-chevron" viewBox="0 0 1024 1024" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0-42.752 0z" /></svg>
            </div>
          </div>
          <div class="filter-group">
            <label for="rating-select" class="filter-label">Content Rating</label>
            <div class="select-wrapper">
              <select id="rating-select" v-model="filters.rating">
                <option value="">All Content Ratings</option>
                <option value="SAFE">Safe</option>
                <option value="MATURE">Contains NSFW</option>
                <option value="ADULT">NSFW</option>
              </select>
              <svg class="select-chevron" viewBox="0 0 1024 1024" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0-42.752 0z" /></svg>
            </div>
          </div>
        </div>
      </div>
      <div v-if="error" class="load-message" role="alert">{{ error }} <button type="button" @click="loadCatalog">Try Again</button></div>
      <p v-else-if="loading" class="load-message" role="status">Loading sources…</p>
      <div class="source-list-header-row"><span class="total-count" aria-live="polite">Total: {{ visibleSources.length }}</span></div>
      <div id="source-list" :aria-busy="loading">
        <p v-if="!loading && !error && !visibleSources.length" class="empty">No sources found.</p>
        <section v-for="group in groups" :key="group.language" class="language-section" :aria-label="group.language">
          <div class="language-header-row"><h2>{{ group.language }}</h2></div>
          <ul>
            <li v-for="source in group.sources" :key="source.id" class="source-row">
              <div class="source-left">
                <div class="source-info-wrapper">
                  <img v-if="iconURL(source)" class="source-icon" :src="iconURL(source)" :alt="`${source.name} icon`" width="40" height="40" loading="lazy">
                  <span v-else class="source-icon icon-placeholder" aria-hidden="true">{{ source.name.slice(0, 1) }}</span>
                  <div class="source-info-row-stack">
                    <div class="source-title-row">
                      <span class="source-name">{{ source.name }}</span>
                      <span class="source-version">v{{ source.version }}</span>
                      <span v-if="['MATURE', 'ADULT'].includes(source.contentRating)" class="source-rating-badge" :class="source.contentRating === 'ADULT' ? 'source-rating-18' : 'source-rating-17'" tabindex="0" :aria-label="ratingDescription(source)">
                        {{ source.contentRating === 'ADULT' ? '18+' : '17+' }}
                        <span class="tooltip" role="tooltip">{{ ratingDescription(source) }}</span>
                      </span>
                    </div>
                    <div v-if="PROVIDER_HOMEPAGES[source.id]" class="source-url">{{ PROVIDER_HOMEPAGES[source.id] }}</div>
                  </div>
                </div>
              </div>
              <div class="source-right">
                <a class="source-download" :href="installLink(source)" :aria-disabled="!installLink(source)" :aria-label="isInstallable(source) ? `Install ${source.name} in Manko` : `${source.name} is unavailable for installation`" :title="isInstallable(source) ? `Open ${source.name} in Manko` : 'Unavailable for installation'">↓</a>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </main>
    <footer><a :href="withBase('/installation')">Installation help</a> · <a :href="withBase('/guides/')">Documentation</a></footer>
  </div>
</template>

<style scoped src="../source-list.css" />
