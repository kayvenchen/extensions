/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2025 Inkdex */
/* Copyright © 2026 manko Extension Contributors */

import rawCommunityCatalog from "../../../../../dist/community/v1/stable/catalog.json";
import rawDefaultCatalog from "../../../../../dist/official/v1/stable/catalog.json";

export interface Developer {
  name: string;
  website?: string;
  github?: string;
}

export interface Repository {
  url: string;
  catalogURL: string;
  label: string;
  isDefault: boolean;
}

export interface CatalogSource {
  id: string;
  name: string;
  description: string;
  version: string;
  iconURL: string | null;
  languages: string[];
  contentRating: string;
  kind: "content" | "tracker";
  availability: string;
  capabilities: string[];
  developers: Developer[];
  universalLink?: string;
  rightsURL?: string;
  reportURL?: string;
  sourceURL?: string;
  sourceRevision?: string;
  license?: string;
  compatibility: {
    adapter?: string;
    status?: string;
    scope?: string;
    note?: string | null;
    limitations: string[];
  } | null;
  upstream: {
    repository?: string;
    branch?: string;
    commit?: string;
    sourcePath?: string;
    relationship?: string;
    registryCommit?: string;
  } | null;
  repository: Repository;
  sourceKey: string;
  extension: {
    apiVersion?: string;
    moduleURL?: string;
    size?: number;
  } | null;
}

export interface NormalizedCatalog {
  repository: Repository;
  sources: CatalogSource[];
}

interface RawCatalog {
  repositoryURL?: unknown;
  repository?: {
    name?: unknown;
  };
  sources?: unknown;
}

const MANKO_REPOSITORY_URL = "manko://repository/";

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function httpURL(value: unknown, base?: string): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeRepositoryURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError("Enter an absolute HTTP(S) catalog URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Catalog URLs must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new TypeError("Catalog URLs cannot contain credentials.");
  }

  url.search = "";
  url.hash = "";
  if (/\/catalog\.json\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/catalog\.json\/?$/i, "");
  } else if (/\.json\/?$/i.test(url.pathname)) {
    throw new TypeError("Use a catalog.json URL or its containing directory.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

export function catalogURLForRepository(repositoryURL: string): string {
  return new URL("catalog.json", normalizeRepositoryURL(repositoryURL)).href;
}

export function sourceKey(repositoryURL: string, sourceID: string): string {
  return `${encodeURIComponent(normalizeRepositoryURL(repositoryURL))}::${encodeURIComponent(sourceID)}`;
}

function repositoryLabel(catalog: RawCatalog, repositoryURL: string, isDefault: boolean): string {
  const configured = stringValue(catalog.repository?.name);
  if (configured) return configured;
  if (isDefault) return "manko Extensions";
  const url = new URL(repositoryURL);
  const path = url.pathname.split("/").filter(Boolean).slice(-2).join("/");
  return path ? `${url.hostname}/${path}` : url.hostname;
}

export function normalizeCatalog(
  input: unknown,
  options: { repositoryURL?: string; isDefault?: boolean } = {},
): NormalizedCatalog {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Catalog must be a JSON object.");
  }

  const catalog = input as RawCatalog;
  if (!Array.isArray(catalog.sources)) {
    throw new TypeError("Catalog must contain a sources array.");
  }

  const suppliedURL = options.repositoryURL || stringValue(catalog.repositoryURL);
  const repositoryURL = normalizeRepositoryURL(suppliedURL);
  const repository: Repository = {
    url: repositoryURL,
    catalogURL: catalogURLForRepository(repositoryURL),
    label: repositoryLabel(catalog, repositoryURL, Boolean(options.isDefault)),
    isDefault: Boolean(options.isDefault),
  };

  const ids = new Set<string>();
  const sources = catalog.sources.map((entry, index): CatalogSource => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Source ${index + 1} must be an object.`);
    }

    const raw = entry as Record<string, unknown>;
    const id = stringValue(raw.id);
    if (!id) throw new TypeError(`Source ${index + 1} is missing an ID.`);
    if (ids.has(id)) throw new TypeError(`Catalog contains duplicate source ID ${id}.`);
    ids.add(id);
    const kind = stringValue(raw.kind, "content").toLowerCase();
    if (kind !== "content" && kind !== "tracker") {
      throw new TypeError(`Source ${id} uses unsupported extension kind ${kind}.`);
    }

    const extensionRaw =
      raw.extension && typeof raw.extension === "object"
        ? (raw.extension as Record<string, unknown>)
        : null;
    const compatibilityRaw =
      raw.compatibility && typeof raw.compatibility === "object"
        ? (raw.compatibility as Record<string, unknown>)
        : null;
    const upstreamRaw =
      raw.upstream && typeof raw.upstream === "object"
        ? (raw.upstream as Record<string, unknown>)
        : null;
    const developers = Array.isArray(raw.developers)
      ? raw.developers
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((developer) => ({
            name: stringValue(developer.name, "Unknown contributor"),
            ...(httpURL(developer.website) ? { website: httpURL(developer.website)! } : {}),
            ...(httpURL(developer.github) ? { github: httpURL(developer.github)! } : {}),
          }))
      : [];

    return {
      id,
      name: stringValue(raw.name, id),
      description: stringValue(raw.description),
      version: stringValue(raw.version, "unknown"),
      iconURL: httpURL(raw.icon, repositoryURL),
      languages: stringList(raw.languages ?? raw.language).map((language) => language.toLowerCase()),
      contentRating: stringValue(raw.contentRating, "UNKNOWN").toUpperCase(),
      kind,
      availability: stringValue(raw.availability, "unknown"),
      capabilities: stringList(raw.capabilities),
      developers,
      ...(httpURL(raw.universalLink) ? { universalLink: httpURL(raw.universalLink)! } : {}),
      ...(httpURL(raw.rightsURL) ? { rightsURL: httpURL(raw.rightsURL)! } : {}),
      ...(httpURL(raw.reportURL) ? { reportURL: httpURL(raw.reportURL)! } : {}),
      ...(httpURL(raw.sourceURL) ? { sourceURL: httpURL(raw.sourceURL)! } : {}),
      ...(stringValue(raw.sourceRevision) ? { sourceRevision: stringValue(raw.sourceRevision) } : {}),
      ...(stringValue(raw.license) ? { license: stringValue(raw.license) } : {}),
      compatibility: compatibilityRaw
        ? {
            adapter: stringValue(compatibilityRaw.adapter) || undefined,
            status: stringValue(compatibilityRaw.status) || undefined,
            scope: stringValue(compatibilityRaw.scope) || undefined,
            note: stringValue(compatibilityRaw.note) || null,
            limitations: stringList(compatibilityRaw.limitations),
          }
        : null,
      upstream: upstreamRaw
        ? {
            repository: httpURL(upstreamRaw.repository) || undefined,
            branch: stringValue(upstreamRaw.branch) || undefined,
            commit: stringValue(upstreamRaw.commit) || undefined,
            sourcePath: stringValue(upstreamRaw.sourcePath) || undefined,
            relationship: stringValue(upstreamRaw.relationship) || undefined,
            registryCommit: stringValue(upstreamRaw.registryCommit) || undefined,
          }
        : null,
      repository,
      sourceKey: sourceKey(repositoryURL, id),
      extension: extensionRaw
        ? {
            apiVersion: stringValue(extensionRaw.apiVersion) || undefined,
            moduleURL: httpURL(extensionRaw.moduleURL, repositoryURL) || undefined,
            size: typeof extensionRaw.size === "number" ? extensionRaw.size : undefined,
          }
        : null,
    };
  });

  return {
    repository,
    sources: sources.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function buildAddRepositoryLink(repositoryURL: string): string {
  const link = new URL("add", MANKO_REPOSITORY_URL);
  link.searchParams.set("url", normalizeRepositoryURL(repositoryURL));
  return link.href;
}

export function buildInstallLink(repositoryURL: string, sourceIDs: Iterable<string>): string {
  const ids = [...new Set(sourceIDs)].filter(Boolean);
  if (ids.length === 0) throw new RangeError("Choose at least one extension.");
  if (ids.length > 100) throw new RangeError("Choose at most 100 extensions.");
  const link = new URL("install", MANKO_REPOSITORY_URL);
  link.searchParams.set("url", normalizeRepositoryURL(repositoryURL));
  ids.forEach((id) => link.searchParams.append("source", id));
  if (new TextEncoder().encode(link.href).length > 8192) {
    throw new RangeError("This selection exceeds Manko's 8 KiB link limit.");
  }
  return link.href;
}

export function formatLabel(value: string): string {
  if (value === "multi") return "Multiple languages";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function formatBytes(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export const DEFAULT_CATALOG = normalizeCatalog(rawDefaultCatalog, { isDefault: true });

export const COMMUNITY_CATALOG = normalizeCatalog(rawCommunityCatalog);
