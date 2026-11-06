// Story launch prompt builders (dead-code island từ kiến trúc cũ — giữ nguyên
// theo Principle 2, KHÔNG xoá; có thể xoá theo quyết định epic owner sau).
// Layer L0: chỉ directives.json.
import { resolve } from 'node:path'
import directives from '../directives.json' with { type: 'json' }

const SKILL = 'orca-superpowers-workflow'
const {
  LOAD_CONTEXT,
  STORY_DIRECTIVE,
  POLISH_DIRECTIVE,
  SIMPLIFY_DIRECTIVE,
  PLAN_ONLY_DIRECTIVE,
  QUICK_FIX_DIRECTIVE,
  SUBAGENT_DIRECTIVE,
  AUDIT_OFF_TOKEN,
  AUTONOMOUS_TOKEN,
  EXECUTE_INLINE_TOKEN,
  EXECUTE_DELEGATE_TOKEN,
  EXECUTE_SUPERPOWERS_TOKEN
} = directives

function executeToken(mode) {
  if (mode === 'inline') return EXECUTE_INLINE_TOKEN
  if (mode === 'superpowers') return EXECUTE_SUPERPOWERS_TOKEN
  if (mode === 'delegate') return EXECUTE_DELEGATE_TOKEN  // default select value; still emits to reinforce skill-default Orca preference
  return ''  // unknown/undefined mode → no override, skill uses its default
}

function buildStartPrompt(idea, autonomous, polish, subagents, simplify, auditOn, executeMode, story, mindsetBrowser) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE)
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (subagents && subagents > 1) out += SUBAGENT_DIRECTIVE.replace(/<n>/g, String(subagents))
  if (autonomous) out += AUTONOMOUS_TOKEN
  if (auditOn === false) out += AUDIT_OFF_TOKEN  // default ON in skill; only flag when off
  if (mindsetBrowser !== false) out += '\nMindset 0: BROWSER LÀM VIỆC — TRƯỚC khi nói "xong": TÔI mở browser (orca tab create), TÔI đi trọn flow, TÔI chụp screenshot. CLI chỉ cho git/tests/servers. DOM query KHÔNG thay thế screenshot. Screenshot fail → nói thật + nhờ user.'
  if (story) out += STORY_DIRECTIVE
  out += executeToken(executeMode)
  return out
}

function buildPlanPrompt(idea, autonomous, polish, simplify, auditOn, executeMode, story) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE) + PLAN_ONLY_DIRECTIVE
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (autonomous) out += AUTONOMOUS_TOKEN
  if (auditOn === false) out += AUDIT_OFF_TOKEN
  if (story) out += STORY_DIRECTIVE
  out += executeToken(executeMode)
  return out
}

function buildQuickFixPrompt(idea, autonomous, polish, subagents, simplify, executeMode) {
  const trimmed = typeof idea === 'string' ? idea.trim() : ''
  const base = trimmed ? `Use the ${SKILL} skill to build: ${trimmed}` : `Use the ${SKILL} skill`
  // Quick fix skips Linear (no issue) → audit-log N/A (skill Principle 7 already exempts it).
  let out = base + (polish === false ? '' : POLISH_DIRECTIVE) + QUICK_FIX_DIRECTIVE
  if (simplify !== false) out += SIMPLIFY_DIRECTIVE
  if (subagents && subagents > 1) out += SUBAGENT_DIRECTIVE.replace(/<n>/g, String(subagents))
  if (autonomous) out += AUTONOMOUS_TOKEN
  // Quick-fix tasks are trivial (≤1 file, ≤10 lines) → worker-start overhead rarely worth it; default to inline regardless of executeMode, but honor explicit delegate.
  if (executeMode === 'delegate') out += EXECUTE_DELEGATE_TOKEN
  return out
}

function buildContinuePlanPrompt(planPath, autonomous, executeMode) {
  let out = `${LOAD_CONTEXT}Then: read the plan at ${planPath} and continue the ${SKILL} workflow from there — Phase 3 plan-writing was done, proceed to Phase 4 (execute) and beyond. If the plan file does not exist or is incomplete, tell me before doing anything.`
  if (autonomous) out += AUTONOMOUS_TOKEN
  out += executeToken(executeMode)
  return out
}

function buildContinueOrNewPrompt(autonomous, executeMode) {
  let out = `${LOAD_CONTEXT}Then: AUTO-LOAD the plan for the active run if one exists — find the plan matching the current Linear issue (in docs/superpowers/plans/<date>-<feature>-plan.md, or read from the Linear issue body), continue the ${SKILL} workflow from Phase 4 (execute). If NO plan exists yet OR there is no active run, ask me to describe a new feature and wait — do NOT start any work.`
  if (autonomous) out += AUTONOMOUS_TOKEN
  out += executeToken(executeMode)
  return out
}

function buildResumePrompt(hint) {
  const t = typeof hint === 'string' ? hint.trim() : ''
  return `${LOAD_CONTEXT}Then: Continue the ${SKILL} workflow${t ? `: ${t}` : ''}`
}

function buildStatusPrompt() {
  return `${LOAD_CONTEXT}Then: summarize the current ${SKILL} workflow state — active phase, task progress, and any pending gates.`
}

function buildGatePrompt(gateId, resolution) {
  return `${LOAD_CONTEXT}Then: Resolve gate ${gateId} as ${resolution} via: orca orchestration gate-resolve --id ${gateId} --resolution ${resolution}. Confirm the gate still exists and is pending first; if already resolved or missing, tell me.`
}


// Linear GraphQL helper (fallback khi orca CLI keychain chết — 28/8):
// /api/linear.app + key ~/.claude/.linear-key. Trả children + state đầy đủ.

export { SKILL }
