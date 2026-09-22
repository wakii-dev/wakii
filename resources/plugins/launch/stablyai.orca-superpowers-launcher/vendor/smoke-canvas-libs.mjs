#!/usr/bin/env node
// Smoke: 3 vendored canvas libs parse + đăng ký + dagre layout chạy được headless.
// panel.html INLINE nội dung 3 file này (CSP script-src unsafe-inline của host
// srcdoc shell chặn <script src> external) — smoke bảo đảm bytes vendor luôn
// load-able. Chạy: node vendor/smoke-canvas-libs.mjs
import Module from 'node:module'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require2 = createRequire(import.meta.url)
const dagre = require2('./dagre.min.js')
const cytoscape = require2('./cytoscape.min.js')
// UMD của cytoscape-dagre require('dagre'/'cytoscape') trong node — shim resolve
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request === 'dagre') return path.join(here, 'dagre.min.js')
  if (request === 'cytoscape') return path.join(here, 'cytoscape.min.js')
  return origResolve.apply(this, arguments)
}
const cytoscapeDagre = require2('./cytoscape-dagre.js')

if (typeof cytoscape !== 'function') throw new Error('cytoscape UMD không parse được')
if (!dagre || typeof dagre.layout !== 'function') throw new Error('dagre UMD không parse được')
if (typeof cytoscapeDagre !== 'function') throw new Error('cytoscape-dagre UMD không parse được')
cytoscapeDagre(cytoscape)

const cy = cytoscape({
  headless: true,
  elements: [
    { data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'c' } },
    { data: { id: 'ab', source: 'a', target: 'b' } },
    { data: { id: 'bc', source: 'b', target: 'c' } }
  ]
})
cy.layout({ name: 'dagre', rankDir: 'TB', nodeSep: 40, rankSep: 70 }).run()
const ok = cy.nodes().every(n => Number.isFinite(n.position().x) && Number.isFinite(n.position().y))
if (!ok) throw new Error('dagre layout không sinh positions hợp lệ')
console.log('SMOKE-OK cytoscape ' + cytoscape.version + ' + dagre ' + dagre.version + ' + cytoscape-dagre registered — dagre layout headless ran, ' + cy.nodes().length + ' nodes positioned')
