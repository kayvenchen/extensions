/* SPDX-License-Identifier: GPL-3.0-or-later */
import type { CatalogSource } from "./catalog";

// Provider homepages verified against the checked-in extension implementations.
// These are display metadata, not API endpoints or script download locations.
export const PROVIDER_HOMEPAGES: Record<string, string> = {
  AniList: "https://anilist.co",
  HitomiLA: "https://hitomi.la",
  MyAnimeList: "https://myanimelist.net",
  NHentai: "https://nhentai.net",
};

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

export function languageLabel(languages: string[]): string {
  if (!languages.length) return "Unknown";
  if (languages.length > 1 || languages.includes("multi")) return "Multi-Language";
  try {
    return languageNames.of(languages[0]) ?? languages[0];
  } catch {
    return languages[0];
  }
}

export function compareLanguages(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "Multi-Language") return -1;
  if (right === "Multi-Language") return 1;
  return left.localeCompare(right);
}

export function isInstallable(source: CatalogSource): boolean {
  return !["serviceunavailable", "retired"].includes(source.availability.toLowerCase());
}

export function filterSources(
  sources: CatalogSource[],
  filters: { search: string; language: string; rating: string },
): CatalogSource[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return sources.filter((source) => {
    const label = languageLabel(source.languages);
    const languageMatches = !filters.language || label === filters.language ||
      (filters.language !== "Multi-Language" && source.languages.some((code) => languageLabel([code]) === filters.language));
    return languageMatches && (!filters.rating || source.contentRating === filters.rating) &&
      (!query || `${source.name} ${source.id} ${PROVIDER_HOMEPAGES[source.id] ?? ""}`.toLocaleLowerCase().includes(query));
  });
}

export function groupSources(sources: CatalogSource[]): { language: string; sources: CatalogSource[] }[] {
  const groups = new Map<string, CatalogSource[]>();
  for (const source of sources) {
    const label = languageLabel(source.languages);
    const group = groups.get(label) ?? [];
    group.push(source);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareLanguages(left, right))
    .map(([language, entries]) => ({ language, sources: [...entries].sort((left, right) => left.name.localeCompare(right.name)) }));
}
