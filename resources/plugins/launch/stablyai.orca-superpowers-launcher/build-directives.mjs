// Build validator: verify panel.html inline directive constants stay in sync
// with directives.json (single source of truth), AND that the token-coupling
// with orca-superpowers-workflow SKILL.md is intact.
//
// main.mjs imports directives.json directly (Node ESM), so it can't drift.
// panel.html must inline (CSP blocks fetch) → this script catches panel drift.
// SKILL.md Principles 3/7 consume tokens emitted by this plugin → this script
// catches token-rename drift (the silent-coupling class of bug).
//
// Usage: node build-directives.mjs
// Exit 0 = all match, exit 1 = drift detected (fix panel.html or SKILL.md).

import fs from 'node:fs'

const SRC = JSON.parse(fs.readFileSync(new URL('./directives.json', import.meta.url), 'utf8'))
const PANEL = fs.readFileSync(new URL('./panel.html', import.meta.url), 'utf8')

// Paired skill SKILL.md. The plugin emits tokens that activate Principles 3/7
// in this file. Kit install đặt ở ~/.claude/skills; fallback đường plugin
// marketplace (máy cài theo cách cũ).
const SKILL_MD_CANDIDATES = [
  process.env.HOME + '/.claude/skills/orca-superpowers-workflow/SKILL.md',
  process.env.HOME + '/.claude/plugins/marketplaces/orca-superpowers-bridges/plugins/orca-superpowers-workflow/skills/orca-superpowers-workflow/SKILL.md',
]
const SKILL_MD = SKILL_MD_CANDIDATES.find(p => fs.existsSync(p)) || SKILL_MD_CANDIDATES[0]
// Tokens (keys in directives.json) that activate skill-side Principles.
// Each must appear verbatim as a substring in SKILL.md for the coupling to work.
const TOKEN_COUPLING = {
  AUDIT_OFF_TOKEN: 'Principle 7 (audit log opt-out)',
  AUTONOMOUS_TOKEN: 'Principle 3 (autonomous self-review activation)',
  PHASE0_ANALYST_TOKEN: 'Phase 0 analyst force-on (phase0-impact-analyst MANDATORY)',
  SPEC_CRITIC_TOKEN: 'Spec critic force-on (spec-critic gate MANDATORY)',
  PLAN_CRITIC_TOKEN: 'Plan critic force-on (plan-critic gate MANDATORY)',
  CODE_REVIEWER_TOKEN: 'Code reviewer force-on (code-reviewer between every task MANDATORY)',
  VERIFIER_TOKEN: 'Verifier force-on (P5 explicit re-affirm)',
  SECURITY_AUDIT_TOKEN: 'Security audit force-on (run regardless of OWASP auto-detect)',
  ROLLBACK_FIXER_TOKEN: 'Rollback fixer force-on (prefer agent over inline for any rollback)'
}

const KEYS = Object.keys(SRC).filter((k) => !k.startsWith('_'))
let drift = 0

console.log('== panel.html ↔ directives.json (byte-equality) ==')
for (const key of KEYS) {
  const expected = SRC[key]
  // panel.html: var KEY = '...' (possibly multi-line concat for FIGMA).
  // Extract the assignment expression and eval it to get the assembled string.
  const panelRe = new RegExp(`var ${key} = ([\\s\\S]*?)\\n{2}`, 'm')
  const panelMatch = PANEL.match(panelRe)
  let panelVal = null
  if (panelMatch) {
    try {
      // eslint-disable-next-line no-eval
      panelVal = eval(panelMatch[1].trim().replace(/;\s*$/, ''))
    } catch (e) {
      console.error(`  ${key}: panel.html eval failed: ${e.message}`)
      drift++
      continue
    }
  }
  const ok = panelVal === expected
  console.log(`  ${ok ? 'OK' : 'DRIFT'}  ${key}  (panel: ${ok ? '✓' : '✗'})`)
  if (!ok) {
    drift++
    if (panelVal === null) console.log(`    panel.html: NOT FOUND`)
    else console.log(`    panel.html: ${JSON.stringify(panelVal).slice(0, 100)}`)
    console.log(`    expected:   ${JSON.stringify(expected).slice(0, 100)}`)
  }
}

console.log('\n== SKILL.md ↔ directives.json (token-coupling) ==')
let skillMd = null
try {
  skillMd = fs.readFileSync(SKILL_MD, 'utf8')
} catch (e) {
  console.error(`  SKILL.md NOT FOUND at ${SKILL_MD} — update SKILL_MD path in this validator.`)
  drift++
}
if (skillMd) {
  for (const [tokenKey, principleName] of Object.entries(TOKEN_COUPLING)) {
    // Agent-forcing tokens carry a parenthetical clarifier (e.g. "Phase 0 analyst: ON. (MANDATORY ...)").
    // SKILL.md only needs the short trigger phrase before the " (" — that's the literal the agent matches.
    // Legacy tokens (AUDIT_OFF, AUTONOMOUS) have no parenthetical → use the full trimmed text.
    const fullText = SRC[tokenKey].trim()  // strip leading \n
    const triggerPhrase = fullText.split(' (')[0]
    const present = skillMd.includes(triggerPhrase)
    console.log(`  ${present ? 'OK' : 'DRIFT'}  ${tokenKey}  → ${principleName}  (SKILL.md: ${present ? '✓' : '✗'})`)
    if (!present) {
      drift++
      console.log(`    SKILL.md missing literal substring: ${JSON.stringify(triggerPhrase)}`)
      console.log(`    If you renamed the Principle or its trigger phrase, either:`)
      console.log(`      (a) restore the phrase in SKILL.md, or`)
      console.log(`      (b) update directives.json ${tokenKey} to match the new phrase.`)
    }
  }
}

console.log(drift === 0 ? '\nAll in sync (panel.html + SKILL.md ↔ directives.json).' : `\n${drift} drift(s) detected. Fix needed.`)
process.exit(drift === 0 ? 0 : 1)
