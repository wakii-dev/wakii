import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

export type WakiiRulesConfig = { declaration: string }

const wakiiRulesSchema = z.object({
  rules: z.object({
    declaration: z.string().trim().min(1),
  }),
})

/**
 * Parse the `rules:` section of a `wakii.yaml` source.
 * Returns `{ declaration }` when a usable `rules.declaration` string is present,
 * null for missing section, wrong shape, or invalid YAML.
 */
export function parseWakiiRulesConfig(source: string): WakiiRulesConfig | null {
  let doc: unknown
  try {
    doc = parse(source)
  } catch {
    return null
  }
  const result = wakiiRulesSchema.safeParse(doc)
  return result.success ? { declaration: result.data.rules.declaration } : null
}

/**
 * Read `wakii.yaml` from a repo root and extract the rules declaration path.
 * Missing file or unusable config → null (callers fall back to the sample
 * sheets in `rules/projects/`).
 */
export function readWakiiRulesConfig(repoRoot: string): WakiiRulesConfig | null {
  const configFile = path.join(repoRoot, 'wakii.yaml')
  let source: string
  try {
    source = fs.readFileSync(configFile, 'utf8')
  } catch {
    return null
  }
  return parseWakiiRulesConfig(source)
}
