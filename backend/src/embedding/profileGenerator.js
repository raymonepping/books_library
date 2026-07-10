import axios from 'axios'
import { config } from '../config/env.js'
import { logger } from '../config/logger.js'

const BASE_URL      = config.OLLAMA_BASE_URL
const PROFILE_MODEL = config.OLLAMA_PROFILE_MODEL
const IDLE_TIMEOUT  = 20_000   // ms without a new token before we accept what we have
const CONNECT_TIMEOUT = 60_000 // ms for initial connection
const NUM_PREDICT   = 500      // token cap — 13-field JSON needs ~300-400 tokens

const EXPECTED_FIELDS = [
  'nationality', 'originalLanguage', 'primarySetting', 'subgenre',
  'tone', 'protagonistType', 'protagonistName', 'themes',
  'pacing', 'violenceLevel', 'seriesType', 'dutchMarketLabel', 'comparableAuthors',
]

const NATIONALITY_LANGUAGE_MAP = {
  'Swedish':    'Swedish',
  'Norwegian':  'Norwegian',
  'Finnish':    'Finnish',
  'Danish':     'Danish',
  'Dutch':      'Dutch',
  'German':     'German',
  'Austrian':   'German',
  'British':    'English',
  'American':   'English',
  'Canadian':   'English',
  'Spanish':    'Spanish',
  'French':     'French',
  'Italian':    'Italian',
  'Portuguese': 'Portuguese',
  'Icelandic':  'Icelandic',
}

function validateProfile(authorName, profile) {
  const expected = NATIONALITY_LANGUAGE_MAP[profile.nationality]
  if (expected && profile.originalLanguage !== expected) {
    console.warn(
      `[profile] ⚠  ${authorName}: originalLanguage "${profile.originalLanguage}" ` +
      `looks wrong for ${profile.nationality} author (expected "${expected}"). ` +
      `Re-enrich with --force to regenerate.`
    )
  }
}

// Known LLM typo aliases → canonical field name
const FIELD_ALIASES = {
  'protonistType': 'protagonistType',
  'protonistName': 'protagonistName',
}

function normalizeProfile(raw) {
  const collected = {}
  for (const [key, val] of Object.entries(raw)) {
    const canonical = FIELD_ALIASES[key.trim()] ?? key.trim()
    if (!EXPECTED_FIELDS.includes(canonical)) continue
    if (!collected[canonical]) collected[canonical] = []
    collected[canonical].push(val)
  }
  const normalized = {}
  for (const field of EXPECTED_FIELDS) {
    const values = collected[field] ?? []
    normalized[field] = values.find(v => v != null) ?? null
  }
  return normalized
}

function buildPrompt(author, knownDutchTitles) {
  return `You are a literary expert familiar with crime and thriller fiction.
The author "${author.name}" (${author.nationality ?? 'unknown nationality'}) is known in Dutch bookstores by these titles: ${knownDutchTitles.join(', ')}.

Generate a structured profile as a JSON object with EXACTLY these 13 field names (copy them character-for-character):
- "nationality" (string — the author's actual nationality, e.g. "Swedish", "British")
- "originalLanguage" (string — the language the author writes in, e.g. "Swedish", "English")
- "primarySetting" (string — city and country of most books, e.g. "Stockholm, Sweden")
- "subgenre" (string — e.g. "Nordic noir", "British police procedural", "psychological thriller")
- "tone" (array of strings, 2-5 descriptors)
- "protagonistType" (string — e.g. "detective", "anti-hero", "amateur sleuth")
- "protagonistName" (string or null if no recurring protagonist)
- "themes" (array of strings, 3-6 themes)
- "pacing" (exactly one of: "slow-burn" | "moderate" | "fast-paced")
- "violenceLevel" (exactly one of: "graphic" | "moderate" | "mild")
- "seriesType" (exactly one of: "long-running series" | "trilogy" | "standalone" | "mixed")
- "dutchMarketLabel" (exactly one of: "bestseller" | "cult" | "niche" | "unknown")
- "comparableAuthors" (array of 3-5 internationally known author names)

Rules:
- All field values must be in English
- "nationality" is the author's own nationality — NOT the language of the Dutch edition
- "originalLanguage" is the language the author writes in — NOT Dutch unless the author actually writes in Dutch
- comparableAuthors must be based on writing style, tone, and subgenre — NOT on nationality or language
- Return only valid JSON. No preamble, no explanation, no markdown fences, no extra fields`
}

async function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const tokens = []
    let settled = false
    let idleTimer = null

    const settle = (text, err) => {
      if (settled) return
      settled = true
      clearTimeout(idleTimer)
      if (err) reject(err)
      else resolve(text)
    }

    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        const text = tokens.join('')
        logger.warn('[profileGenerator] idle timeout — accepting partial response', { tokens: tokens.length })
        settle(text)
      }, IDLE_TIMEOUT)
    }

    axios.post(
      `${BASE_URL}/api/generate`,
      { model: PROFILE_MODEL, prompt, stream: true, options: { num_predict: NUM_PREDICT } },
      { responseType: 'stream', timeout: CONNECT_TIMEOUT }
    ).then(res => {
      resetIdle()
      let buf = ''
      res.data.on('data', chunk => {
        resetIdle()
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.response) tokens.push(data.response)
            if (data.done) settle(tokens.join(''))
          } catch {}
        }
      })
      res.data.on('end', () => settle(tokens.join('')))
      res.data.on('error', err => settle('', err))
    }).catch(err => reject(err))
  })
}

function tryParse(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?|```$/g, '').trim()
  return JSON.parse(cleaned)
}

/**
 * Generate a structured author profile using Llama 3.2.
 * @param {{ id: string, name: string, nationality?: string, birthYear?: number }} author
 * @param {string[]} knownDutchTitles - Dutch-edition book titles from the library
 * @returns {Promise<object>} Structured profile with all EXPECTED_FIELDS
 */
export async function generateAuthorProfile(author, knownDutchTitles) {
  const prompt = buildPrompt(author, knownDutchTitles)

  let raw
  try {
    raw = await callOllama(prompt)
    const profile = normalizeProfile(tryParse(raw))
    validateProfile(author.name, profile)
    return profile
  } catch (firstErr) {
    logger.warn('[profileGenerator] first parse failed — retrying', {
      author: author.name,
      err: firstErr.message,
      raw: (raw ?? '').slice(0, 300),
    })

    // One retry: ask the model to correct its output
    const correctionPrompt = `Your previous response was not valid JSON. Here it was:

${raw ?? ''}

Please correct it and return only valid JSON with no preamble, explanation, or markdown fences. Include exactly these fields: ${EXPECTED_FIELDS.join(', ')}.`

    let retryRaw
    try {
      retryRaw = await callOllama(correctionPrompt)
      const profile = normalizeProfile(tryParse(retryRaw))
      validateProfile(author.name, profile)
      return profile
    } catch (secondErr) {
      const snippet = (retryRaw ?? raw ?? '').slice(0, 500)
      throw new Error(
        `[profileGenerator] JSON parse failed after retry for "${author.name}": ${secondErr.message}. Raw: ${snippet}`
      )
    }
  }
}
