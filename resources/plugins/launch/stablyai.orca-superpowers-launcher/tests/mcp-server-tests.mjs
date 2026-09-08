#!/usr/bin/env node
// Zero-dep test cho kit/bin/wakii-mcp-server (wakii-dev/wakii#5) — không MCP sdk.
// Chạy từ thư mục plugin: node tests/mcp-server-tests.mjs  (exit 0 = pass)
// Spawn server thật qua stdio → initialize → tools/list (đúng 4 tool READ-ONLY)
// → tools/call từng tool → error-tolerance → kill.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(PLUGIN_DIR, 'kit', 'bin', 'wakii-mcp-server');

const READ_ONLY_TOOLS = ['story_bracket_read', 'story_gate_list', 'story_watchdog_status', 'story_task_list'];
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

// ── newline-delimited JSON-RPC client ─────────────────────────────────────────
class McpClient {
  constructor(cwd) {
    this.child = spawn(process.execPath, [SERVER], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.buffer = '';
    this.queue = [];
    this.waiters = [];
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (!line.trim()) continue;
        const waiter = this.waiters.shift();
        if (waiter) waiter(JSON.parse(line));
        else this.queue.push(JSON.parse(line));
      }
    });
    this.child.stderr.on('data', () => {});
    this.exit = new Promise((resolve) => this.child.on('exit', (code) => resolve(code)));
  }
  send(msg) {
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }
  recv(timeoutMs = 15000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout (${timeoutMs}ms) waiting for server response`)), timeoutMs);
      this.waiters.push((msg) => {
        clearTimeout(t);
        resolve(msg);
      });
    });
  }
  async request(method, params, id) {
    this.send({ jsonrpc: '2.0', id, method, params });
    return this.recv();
  }
  async callTool(name, args, id) {
    return this.request('tools/call', { name, arguments: args ?? {} }, id);
  }
  kill() {
    this.child.kill('SIGKILL');
  }
}

const textOf = (res) => res.result.content.map((c) => c.text).join('\n');

// ── fixture: repo giả có bracket ──────────────────────────────────────────────
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wakii-mcp-test-'));
const bracketDir = path.join(fixture, 'docs', 'superpowers', 'brackets');
fs.mkdirSync(bracketDir, { recursive: true });
fs.writeFileSync(path.join(bracketDir, '5-mcp-server.md'), '# Bracket 5\n\nSF-1 expose MCP tools\nDestination: issues/5-mcp-server\n');
fs.writeFileSync(path.join(bracketDir, '6-skills.md'), '# Bracket 6\nlinear: WAK-6\n');

const client = new McpClient(fixture); // cwd = fixture repo → bracket quét mặc định trúng fixture
try {
  // 1) initialize handshake
  const initRes = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-server-tests', version: '0.0.0' } }, 1);
  check('initialize: serverInfo.name = wakii-story-mcp', () => assert.equal(initRes.result.serverInfo.name, 'wakii-story-mcp'));
  check('initialize: version từ kit.json', () => {
    const kit = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'kit', 'kit.json'), 'utf8'));
    assert.equal(initRes.result.serverInfo.version, kit.version);
  });
  check('initialize: echo protocolVersion của client', () => assert.equal(initRes.result.protocolVersion, '2025-06-18'));
  check('initialize: capabilities.tools', () => assert.ok(initRes.result.capabilities.tools));

  // 2) notifications/initialized — không được có response, server phải sống tiếp
  client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const afterInit = await client.request('ping', {}, 2);
  check('notifications/ignored: ping sau initialized vẫn trả lời', () => assert.equal(afterInit.id, 2));

  // 3) tools/list — đúng 4 tool, không tool nào khác (mutation không được lọt)
  const listRes = await client.request('tools/list', {}, 3);
  const names = listRes.result.tools.map((t) => t.name).sort();
  check('tools/list: đúng 4 tool READ-ONLY', () => assert.deepEqual(names, [...READ_ONLY_TOOLS].sort()));
  check('tools/list: mọi tool có description + inputSchema', () => {
    for (const t of listRes.result.tools) {
      assert.equal(typeof t.description, 'string');
      assert.equal(t.inputSchema.type, 'object');
    }
  });

  // 4) tools/call story_task_list — JSON của orca phải đi qua nguyên vẹn
  await checkAsync('tools/call story_task_list: trả JSON parse được', async () => {
    const res = await client.callTool('story_task_list', {}, 4);
    if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
    const out = textOf(res);
    if (res.result.isError) throw new Error(`isError từ server: ${out.slice(0, 300)}`);
    const parsed = JSON.parse(out); // phải là JSON — hoặc throw
    assert.ok(typeof parsed === 'object' && parsed !== null);
  });

  // 5) story_bracket_read — quét mặc định nhiều file + path tường minh
  await checkAsync('story_bracket_read: mặc định quét brackets/*.md (nhiều file)', async () => {
    const res = await client.callTool('story_bracket_read', {}, 5);
    const out = textOf(res);
    assert.ok(!res.result.isError, `isError: ${out.slice(0, 200)}`);
    assert.match(out, /# Bracket 5/);
    assert.match(out, /# Bracket 6/);
    assert.match(out, /===== .*5-mcp-server\.md =====/);
  });
  await checkAsync('story_bracket_read: path tường minh → 1 file', async () => {
    const res = await client.callTool('story_bracket_read', { path: 'docs/superpowers/brackets/6-skills.md' }, 6);
    const out = textOf(res);
    assert.ok(!res.result.isError, `isError: ${out.slice(0, 200)}`);
    assert.match(out, /# Bracket 6/);
    assert.ok(!out.includes('# Bracket 5'));
  });

  // 6) story_watchdog_status — chạy thật story-resume --check (máy không có sf-* worktree → thông báo, không lỗi)
  await checkAsync('story_watchdog_status: chạy story-resume --check, trả text', async () => {
    const res = await client.callTool('story_watchdog_status', {}, 7);
    if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
    assert.equal(typeof textOf(res), 'string');
    assert.ok(textOf(res).length > 0);
  });

  // 7) story_gate_list — hoặc JSON hoặc lỗi orca lộ ra isError (không crash)
  await checkAsync('story_gate_list: trả response (JSON hoặc isError rõ nguyên nhân)', async () => {
    const res = await client.callTool('story_gate_list', {}, 8);
    if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
    const out = textOf(res);
    if (res.result.isError) assert.match(out, /orca/); // lỗi phải nêu rõ lệnh orca
    else JSON.parse(out);
  });

  // 8) lỗi tool không được crash server
  await checkAsync('tool error → isError:true, server sống tiếp', async () => {
    const res = await client.callTool('story_bracket_read', { path: 'khong-ton-tai.md' }, 9);
    assert.equal(res.result.isError, true);
    assert.match(textOf(res), /Not found/);
    const alive = await client.request('ping', {}, 10);
    assert.equal(alive.id, 10);
  });

  // 9) unknown tool → JSON-RPC -32602 (protocol error, không phải tool result)
  await checkAsync('unknown tool → JSON-RPC error -32602', async () => {
    const res = await client.callTool('gate_resolve', {}, 11); // tool mutation KHÔNG tồn tại
    assert.equal(res.error.code, -32602);
  });
  await checkAsync('ping → result rỗng', async () => {
    const res = await client.request('ping', {}, 12);
    assert.deepEqual(res.result, {});
  });
} finally {
  client.kill();
  const code = await client.exit;
  console.log(`\nserver exit code: ${code}`);
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
