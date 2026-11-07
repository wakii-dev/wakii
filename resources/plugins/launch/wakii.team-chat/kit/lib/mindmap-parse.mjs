// mindmap-parse — (d) parse file mindmap .wakii cho panel chat.
//
// Format thật (docs/mindmap.wakii): dòng đầu `# wakii-mindmap v1`, thụt lề
// 2 space/mức; dòng không thụt lề = mức 0.
//
// parseMindmap(path) → cây {text, depth, children[]} của node mức 0 đầu tiên,
// hoặc null khi file thiếu/rỗng/chỉ còn header — KHÔNG throw.
import { readFileSync } from 'node:fs'

const HEADER_RE = /^#\s*wakii-mindmap\b/

export function parseMindmap(path, opts = {}) {
  let raw
  try {
    raw = (opts.readFileSync ?? defaultRead)(path)
  } catch {
    return null
  }
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const roots = []
  const stack = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || HEADER_RE.test(line)) continue
    const depth = Math.floor((line.length - line.trimStart().length) / 2)
    const node = { text: line.trim(), depth, children: [] }
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ depth, node })
  }
  if (!roots.length) return null
  return roots.length === 1 ? roots[0] : { text: '', depth: -1, children: roots }
}

function defaultRead(path) {
  return readFileSync(path, 'utf8')
}
