import { execFileSync } from 'node:child_process'
import { parseGitBlamePorcelain } from '../src/shared/git-blame-porcelain-parser.ts'

const out = execFileSync('git', ['blame', '--porcelain', '--', 'nx.json'], {
  cwd: 'C:/Users/hoivk/Documents/ict-rsa-web'
}).toString()

const rawLines = out.split('\n')
console.log('hasCR:', out.includes('\r'))
const headerRe = /^(\^?)([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: (\d+))?$/
let withCount = 0, sumCount = 0, short = 0
for (const l of rawLines) if (headerRe.test(l)) {
  const m = headerRe.exec(l)
  if (m[5]) { withCount++; sumCount += Number(m[5]) } else short++
}
console.log('headers with count:', withCount, 'sum(count):', sumCount, 'short headers:', short, '=> expect', sumCount + short)

const res = parseGitBlamePorcelain(out, 'nx.json')
console.log('parser lines:', res.lines.length)
const byN = new Map()
for (const l of res.lines) {
  const arr = byN.get(l.lineNumber) ?? []
  arr.push(l.hash.slice(0, 7))
  byN.set(l.lineNumber, arr)
}
const dups = [...byN.entries()].filter(([, v]) => v.length > 1)
console.log('dup lineNumbers:', JSON.stringify(dups.slice(0, 6)))
const nums = res.lines.map(l => l.lineNumber)
console.log('first 12 lineNumbers:', JSON.stringify(nums.slice(0, 12)))
