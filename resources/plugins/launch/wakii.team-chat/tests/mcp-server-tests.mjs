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
  constructor(cwd, env, serverPath = SERVER) {
    this.child = spawn(process.execPath, [serverPath], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env });
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

// stub orca hermetic (learned 2026-09-12): test KHÔNG được phụ thuộc orca
// daemon thật — story_task_list qua ORCA_BIN seam của server, JSON deterministic.
// 2.14.4: stub log argv vào ARGV_LOG để assert --run passthrough không cần daemon.
const argvLog = path.join(fixture, 'argv.log');
const stubOrca = path.join(fixture, 'orca-stub.sh');
fs.writeFileSync(
  stubOrca,
  '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ARGV_LOG"\nprintf \'{"result": {"items": [], "gates": []}}\'\n',
  'utf8'
);
fs.chmodSync(stubOrca, 0o755);
const SERVER_ENV = { ...process.env, ORCA_BIN: stubOrca, ARGV_LOG: argvLog };
const client = new McpClient(fixture, SERVER_ENV); // cwd = fixture repo → bracket quét mặc định trúng fixture
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

  // 6) story_watchdog_status — chạy thật story-resume --check (máy không có sf-* worktree → thông báo, không lỗi).
  // assert !isError: kết luận "trả text" với isError=true là paper-over spawn bug (bài 2.16.10).
  await checkAsync('story_watchdog_status: chạy story-resume --check, trả text', async () => {
    const res = await client.callTool('story_watchdog_status', {}, 7);
    if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
    assert.equal(typeof textOf(res), 'string');
    assert.ok(textOf(res).length > 0);
    if (res.result.isError) throw new Error(`isError từ server: ${textOf(res).slice(0, 300)}`);
  });

  // 7) story_gate_list — hoặc JSON hoặc lỗi orca lộ ra isError (không crash)
  await checkAsync('story_gate_list: trả response (JSON hoặc isError rõ nguyên nhân)', async () => {
    const res = await client.callTool('story_gate_list', {}, 8);
    if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
    const out = textOf(res);
    if (res.result.isError) assert.match(out, /orca/); // lỗi phải nêu rõ lệnh orca
    else JSON.parse(out);
  });

  // 7b) ORCA_BIN extensionless — kit bins đều không extension; trên win32 spawn
  // trực tiếp ra ENOENT (không phải EFTYPE) — bài 2.16.10: retry chỉ fire khi
  // set lỗi đủ và fixture PHẢI extensionless để bắt case production.
  await checkAsync('ORCA_BIN extensionless: story_task_list qua bash-retry', async () => {
    const extLog = path.join(fixture, 'argv-ext.log');
    const extStub = path.join(fixture, 'orca-stub'); // cố ý KHÔNG có extension
    fs.writeFileSync(
      extStub,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ARGV_LOG"\nprintf \'{"result": {"items": [], "gates": []}}\'\n',
      'utf8'
    );
    fs.chmodSync(extStub, 0o755);
    const c3 = new McpClient(fixture, { ...process.env, ORCA_BIN: extStub, ARGV_LOG: extLog });
    try {
      const res = await c3.callTool('story_task_list', {}, 30);
      if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
      if (res.result.isError) throw new Error(`isError từ server: ${textOf(res).slice(0, 300)}`);
      JSON.parse(textOf(res));
      const logged = fs.readFileSync(extLog, 'utf8').trim();
      assert.match(logged, /orchestration task-list --json$/);
    } finally {
      c3.kill();
      await c3.exit;
    }
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

  // 10) 2.14.4 — run param: passthrough --run cho task-list/gate-list qua argv log
  const argvLines = () => (fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8').split('\n').filter(Boolean) : []);
  await checkAsync('story_task_list không run → không có --run', async () => {
    const before = argvLines().length;
    await client.callTool('story_task_list', {}, 13);
    const last = argvLines().slice(before).join('|');
    assert.match(last, /orchestration task-list --json$/);
  });
  await checkAsync('story_task_list run → --run passthrough', async () => {
    const before = argvLines().length;
    await client.callTool('story_task_list', { run: 'run_test123' }, 14);
    const last = argvLines().slice(before).join('|');
    assert.match(last, /--run run_test123$/);
  });
  await checkAsync('story_gate_list run → --run passthrough', async () => {
    const before = argvLines().length;
    await client.callTool('story_gate_list', { run: 'run_abc-9' }, 15);
    const last = argvLines().slice(before).join('|');
    assert.match(last, /orchestration gate-list --json --run run_abc-9$/);
  });
  await checkAsync('run id lạ (charset ngoài whitelist) → isError, không spawn', async () => {
    const before = argvLines().length;
    const res = await client.callTool('story_task_list', { run: '../evil; rm' }, 16);
    assert.equal(res.result.isError, true);
    assert.match(textOf(res), /run id không hợp lệ/);
    assert.equal(argvLines().length, before, 'stub không được bị spawn với run id lạ');
  });

  // 10b) run_required fallback (phương án A): pane MCP không bind run → CLI trả run_required
  // exit 1 + payload "skills get" vô dụng. Server tự dò run-list (read-only) lấy run mới nhất
  // (updated_at desc, bỏ legacy) → retry ĐÚNG 1 lần với --run. runOrca thử dev-trước-prod-sau
  // nên 1 lần gọi thất bại = 2 dòng argv; retry thành công dừng ngay attempt đầu = 1 dòng.
  const writeStub = (name, body) => {
    const p = path.join(fixture, name);
    fs.writeFileSync(p, body, 'utf8');
    fs.chmodSync(p, 0o755);
    return p;
  };
  await checkAsync('run_required fallback: task-list dò run-list → retry --run run mới nhất (bỏ legacy)', async () => {
    const log = path.join(fixture, 'argv-fallback.log');
    const stub = writeStub(
      'orca-stub-fallback.sh',
      [
        '#!/bin/sh',
        'printf \'%s\\n\' "$*" >> "$ARGV_LOG"',
        'case "$*" in',
        '  *"run-list"*)',
        // legacy có updated_at mới nhất → nếu lọt filter thì retry sẽ nhầm nó
        '    printf \'%s\' \'{"ok":true,"result":{"runs":[{"id":"run_legacyzz","updated_at":"2026-10-01T00:00:00Z","legacy":1},{"id":"run_old_one","updated_at":"2026-09-28T00:00:00Z","legacy":0},{"id":"run_new_one","updated_at":"2026-09-30T00:00:00Z","legacy":0}]}}\'',
        '    ;;',
        '  *--run*)',
        '    printf \'%s\' \'{"result":{"items":["ok-with-run"]}}\'',
        '    ;;',
        '  *)',
        '    printf \'%s\' \'{"ok":false,"error":{"code":"run_required","message":"No Run is bound."}}\'',
        '    exit 1',
        '    ;;',
        'esac',
        ''
      ].join('\n')
    );
    const c = new McpClient(fixture, { ...process.env, ORCA_BIN: stub, ARGV_LOG: log });
    try {
      const res = await c.callTool('story_task_list', {}, 40);
      if (res.error) throw new Error(`JSON-RPC error: ${res.error.message}`);
      if (res.result.isError) throw new Error(`isError từ server: ${textOf(res).slice(0, 300)}`);
      const parsed = JSON.parse(textOf(res));
      assert.deepEqual(parsed.result.items, ['ok-with-run']);
      const lines = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      assert.equal(lines().filter((l) => l.includes('task-list') && !l.includes('--run')).length, 2, '2 attempt (dev+prod) task-list không --run');
      assert.equal(lines().filter((l) => l.includes('run-list')).length, 1, 'ĐÚNG 1 lần run-list');
      const retried = lines().filter((l) => l.includes('task-list') && l.includes('--run'));
      assert.equal(retried.length, 1, 'ĐÚNG 1 lần retry');
      assert.match(retried[0], /--run run_new_one$/, 'retry dùng run mới nhất theo updated_at, bỏ legacy');
      // gate-list cùng cơ chế
      const before = lines().length;
      const g = await c.callTool('story_gate_list', {}, 41);
      if (g.result.isError) throw new Error(`isError từ server: ${textOf(g).slice(0, 300)}`);
      assert.match(textOf(g), /ok-with-run/);
      const after = lines().slice(before);
      assert.equal(after.filter((l) => l.includes('gate-list') && !l.includes('--run')).length, 2, 'gate-list: 2 attempt không --run');
      assert.equal(after.filter((l) => l.includes('run-list')).length, 1, 'gate-list: ĐÚNG 1 lần run-list');
      assert.match(after.find((l) => l.includes('gate-list') && l.includes('--run')) || '', /--run run_new_one$/);
    } finally {
      c.kill();
      await c.exit;
    }
  });
  await checkAsync('run_required + run-list rỗng → lỗi giải thích rõ, KHÔNG retry mù', async () => {
    const log = path.join(fixture, 'argv-empty.log');
    const stub = writeStub(
      'orca-stub-empty.sh',
      [
        '#!/bin/sh',
        'printf \'%s\\n\' "$*" >> "$ARGV_LOG"',
        'case "$*" in',
        '  *"run-list"*) printf \'%s\' \'{"ok":true,"result":{"runs":[]}}\' ;;',
        '  *)',
        '    printf \'%s\' \'{"ok":false,"error":{"code":"run_required"}}\'',
        '    exit 1',
        '    ;;',
        'esac',
        ''
      ].join('\n')
    );
    const c = new McpClient(fixture, { ...process.env, ORCA_BIN: stub, ARGV_LOG: log });
    try {
      const res = await c.callTool('story_task_list', {}, 42);
      assert.equal(res.result.isError, true);
      const out = textOf(res);
      assert.match(out, /không có orchestration run nào trong workspace/);
      assert.match(out, /run-create\/run-use/);
      assert.match(out, /run:/);
      assert.match(out, /orca orchestration task-list/); // context lệnh gốc
      const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      assert.equal(lines.filter((l) => l.includes('task-list')).length, 2, 'chỉ 2 attempt dev+prod, không retry không id');
      assert.equal(lines.filter((l) => l.includes('run-list')).length, 1);
    } finally {
      c.kill();
      await c.exit;
    }
  });
  await checkAsync('caller truyền run rõ ràng + vẫn fail → KHÔNG fallback', async () => {
    const log = path.join(fixture, 'argv-explicit.log');
    const stub = writeStub(
      'orca-stub-explicit.sh',
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ARGV_LOG"\nprintf \'%s\' \'{"ok":false,"error":{"code":"run_required"}}\'\nexit 1\n'
    );
    const c = new McpClient(fixture, { ...process.env, ORCA_BIN: stub, ARGV_LOG: log });
    try {
      const res = await c.callTool('story_task_list', { run: 'run_explicit9' }, 43);
      assert.equal(res.result.isError, true);
      const out = textOf(res);
      assert.match(out, /exit 1/); // lỗi orca gốc lộ ra nguyên vẹn, không thay bằng fallback
      assert.match(out, /run_required/);
      const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      assert.ok(!lines.some((l) => l.includes('run-list')), 'không được gọi run-list khi caller đã truyền run');
      assert.equal(lines.filter((l) => l.includes('--run run_explicit9')).length, 2, '2 attempt dev+prod, không retry thêm');
    } finally {
      c.kill();
      await c.exit;
    }
  });
} finally {
  client.kill();
  const code = await client.exit;
  console.log(`\nserver exit code: ${code}`);
  fs.rmSync(fixture, { recursive: true, force: true });
}

// 11) 2.14.4 — installed layout (~/.claude/bin/, không kit.json ở trên): version
// fallback từ marker. 2.16.4 fix: marker THẬT nằm ở $HOME/.claude/ (installKit
// ghi join(claude,...)) — test fixture PHẢI khớp layout production, không được
// tự chế layout chỉ để test pass (meta-test: bug 2.16.3 green-lit nhờ fixture sai).
async function probeInstalledVersion(markerPath, label, id) {
  const fixture2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wakii-mcp-installed-'));
  try {
    const binDir = path.join(fixture2, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'wakii-mcp-server'), fs.readFileSync(SERVER, 'utf8'));
    fs.mkdirSync(path.dirname(markerPath(fixture2)), { recursive: true });
    fs.writeFileSync(markerPath(fixture2), '9.9.9:deadbeef0123');
    // os.homedir() trên Windows đọc USERPROFILE trước HOME — override cả hai để
    // server marker lookup rơi vào fixture thay vì profile thật của máy.
    const c2 = new McpClient(
      fixture2,
      { ...process.env, HOME: fixture2, USERPROFILE: fixture2 },
      path.join(binDir, 'wakii-mcp-server')
    );
    try {
      const init = await c2.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } }, id);
      assert.equal(init.result.serverInfo.version, '9.9.9', `${label}: got ${init.result.serverInfo.version}`);
    } finally {
      c2.kill();
      await c2.exit;
    }
  } finally {
    fs.rmSync(fixture2, { recursive: true, force: true });
  }
}
await checkAsync('installed layout: marker ở $HOME/.claude/ (layout production thật)', () =>
  probeInstalledVersion(f => path.join(f, '.claude', '.story-team-kit-version'), 'claude layout', 20));
await checkAsync('installed layout: legacy marker ở $HOME/ (fallback)', () =>
  probeInstalledVersion(f => path.join(f, '.story-team-kit-version'), 'legacy layout', 21));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
