/**
 * Build the text strings passed to embed() for books and authors.
 * Skip null/undefined fields gracefully.
 */

import { buildEmbeddingInput } from '../services/enrichService.js'

function str(v) { return v != null && v !== '' ? String(v) : null }
function arr(v) { return Array.isArray(v) && v.length ? v.join(', ') : null }

const MAX_EMBED_CHARS = 6000

function truncate(text) {
  if (!text) return ''
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS).trimEnd() + '…' : text
}

/**
 * Build embed text for a single book, combining book metadata with
 * the author's structured profile for richer semantic representation.
 *
 * Description appears twice: once near the top (high model attention) and
 * once at the bottom. This weights per-book content more heavily than shared
 * author-profile fields, preventing same-author books from collapsing to
 * near-identical vectors.
 *
 * @param {{ seriesName?: string|null }} options
 *   seriesName — human-readable series name resolved from the series collection.
 *   Pass null to omit the Series line (raw series:: IDs are never emitted).
 */
export function buildBookEmbedText(book, author, profile, { seriesName = null } = {}) {
  const enrichedText = buildEmbeddingInput(book)
  if (enrichedText) return truncate(enrichedText)

  const desc = str(book.descriptionNL ?? book.description)

  const lines = [
    `Title: ${str(book.title)}`,
    book.language              ? `Language: ${book.language}`                         : null,
    arr(book.genres)           ? `Genres: ${arr(book.genres)}`                        : null,
    arr(book.tags)             ? `Tags: ${arr(book.tags)}`                            : null,
    desc                       ? `About: ${desc}`                                     : null,
    author?.name               ? `Author: ${author.name}`                             : null,
    profile?.nationality       ? `Author nationality: ${profile.nationality}`          : null,
    profile?.originalLanguage  ? `Original language: ${profile.originalLanguage}`     : null,
    seriesName                 ? `Series: ${seriesName}`
      : book.seriesId          ? null
      : 'Series: standalone',
    profile?.primarySetting    ? `Setting: ${profile.primarySetting}`                 : null,
    profile?.subgenre          ? `Subgenre: ${profile.subgenre}`                      : null,
    arr(profile?.tone)         ? `Tone: ${arr(profile.tone)}`                         : null,
    arr(profile?.themes)       ? `Themes: ${arr(profile.themes)}`                     : null,
    profile?.protagonistType   ? `Protagonist: ${profile.protagonistType}`            : null,
    profile?.pacing            ? `Pacing: ${profile.pacing}`                          : null,
    profile?.violenceLevel     ? `Violence level: ${profile.violenceLevel}`           : null,
    desc                       ? `Description: ${desc}`                               : null,
  ]
  return truncate(lines.filter(Boolean).join('\n'))
}

/**
 * Build embed text for an author using their structured profile.
 */
export function buildAuthorEmbedText(author, profile) {
  const lines = [
    `Author: ${str(author.name)}`,
    profile?.nationality        ? `Nationality: ${profile.nationality}`              : null,
    profile?.originalLanguage   ? `Original language: ${profile.originalLanguage}`  : null,
    profile?.primarySetting     ? `Primary setting: ${profile.primarySetting}`      : null,
    profile?.subgenre           ? `Subgenre: ${profile.subgenre}`                   : null,
    arr(profile?.tone)          ? `Tone: ${arr(profile.tone)}`                      : null,
    profile?.protagonistType    ? `Protagonist type: ${profile.protagonistType}`    : null,
    arr(profile?.themes)        ? `Themes: ${arr(profile.themes)}`                  : null,
    profile?.pacing             ? `Pacing: ${profile.pacing}`                       : null,
    profile?.violenceLevel      ? `Violence level: ${profile.violenceLevel}`        : null,
    profile?.seriesType         ? `Series type: ${profile.seriesType}`              : null,
    arr(profile?.comparableAuthors) ? `Comparable authors: ${arr(profile.comparableAuthors)}` : null,
  ]
  return truncate(lines.filter(Boolean).join('\n'))
}
