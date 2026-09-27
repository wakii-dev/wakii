import type { WakiiMindmapEdge, WakiiMindmapNode } from '../../../shared/wakii-mindmap-types'

/**
 * Raw data of the golden render graph — the prototype c.html payload (VU-14,
 * 35 nodes / 40 edges, all three layers), upgraded to schema v1 strictness
 * (file nodes carry `title`; sf-1/sf-2 carry knowledge arrays).
 * `t-3.3` carries a `<script>` title on purpose: it must render as plain text.
 */

export const WAKII_GOLDEN_NODES: WakiiMindmapNode[] = [
  {
    id: 'epic',
    kind: 'epic',
    title: 'VU-14 — mindmap.wakii viewer',
    state: 'in-progress',
    linear: 'VU-14'
  },
  {
    id: 'sf-1',
    kind: 'sf',
    title: 'Schema .wakii + bin story-mindmap',
    state: 'done',
    linear: 'VU-14-1',
    tier: 0,
    summary: 'Decoder schema v1 fail-open + bin sinh file 3 lớp từ bracket/pack/impact.',
    acceptance: [
      'File .wakii đủ 3 lớp tiến độ/logic/impact',
      'Chạy lại nguồn không đổi → byte-identical'
    ],
    tests: ['unit schema valid/invalid/dangling', 'idempotent ghi', 'golden fixture 3 lớp'],
    notes: [
      'story-verify giữ thuần-đọc',
      'Timeout 30s quanh story-impact',
      'Unknown enum → drop + warning',
      'Single-writer: chỉ nhánh đích ghi file'
    ]
  },
  {
    id: 'sf-2',
    kind: 'sf',
    title: 'Main open-file + association 3 OS',
    state: 'in-progress',
    linear: 'VU-14-2',
    tier: 1,
    notes: [
      'EDR posture: chỉ reg-write, không spawn mới',
      'KHÔNG đụng khối isUpdated daemon sweep',
      'AppImage không đăng ký MIME được',
      'claim default Windows là chủ đích'
    ]
  },
  {
    id: 'sf-3',
    kind: 'sf',
    title: 'Viewer renderer 2 chế độ + panel',
    state: 'in-progress',
    linear: 'VU-14-3',
    tier: 1
  },
  {
    id: 'sf-4',
    kind: 'sf',
    title: 'E2E round-trip + checklist 3 OS',
    state: 'pending',
    linear: 'VU-14-4',
    tier: 2
  },
  {
    id: 't-1.1',
    kind: 'task',
    title: 'Schema v1 + structural validation',
    state: 'done',
    parent: 'sf-1'
  },
  {
    id: 't-1.2',
    kind: 'task',
    title: 'Bin story-mindmap: bracket + pack + impact',
    state: 'done',
    parent: 'sf-1'
  },
  {
    id: 't-1.3',
    kind: 'task',
    title: '3 trigger wrapper + kit chore',
    state: 'done',
    parent: 'sf-1'
  },
  {
    id: 't-2.1',
    kind: 'task',
    title: 'OsOpenedWakiiFileState + IPC pull/push',
    state: 'done',
    parent: 'sf-2'
  },
  {
    id: 't-2.2',
    kind: 'task',
    title: 'File association mac / Windows / Linux',
    state: 'in-progress',
    parent: 'sf-2'
  },
  {
    id: 't-2.3',
    kind: 'task',
    title: 'Assert electron-builder-config.test.mjs',
    state: 'blocked',
    parent: 'sf-2'
  },
  {
    id: 't-3.1',
    kind: 'task',
    title: 'Canvas 2 chế độ + pan/zoom',
    state: 'in-progress',
    parent: 'sf-3'
  },
  {
    id: 't-3.2',
    kind: 'task',
    title: 'Side panel + hover hàng xóm bậc 1',
    state: 'pending',
    parent: 'sf-3'
  },
  {
    id: 't-3.3',
    kind: 'task',
    title: 'Escape node title (title chứa <script>alert(1)</script>)',
    state: 'pending',
    parent: 'sf-3'
  },
  {
    id: 't-4.1',
    kind: 'task',
    title: 'Golden E2E fixture 3 lớp',
    state: 'pending',
    parent: 'sf-4'
  },
  {
    id: 't-4.2',
    kind: 'task',
    title: 'Manual checklist dmg / NSIS / deb',
    state: 'pending',
    parent: 'sf-4'
  },
  {
    id: 's-1.1',
    kind: 'step',
    title: 'Đọc bracket + orchestration task-list',
    parent: 'sf-1',
    detail: 'Hợp nhất node epic/SF/task từ bracket và orca CLI.'
  },
  {
    id: 's-1.2',
    kind: 'step',
    title: 'Hợp nhất context pack → steps',
    parent: 'sf-1',
    detail: 'Mục spec slice thành node step + edge flows-to theo thứ tự.'
  },
  {
    id: 's-1.3',
    kind: 'step',
    title: 'story-impact --json → lớp impact',
    parent: 'sf-1',
    detail: 'Cap 30s, quá giờ bỏ lớp impact, giữ tiến độ + logic.'
  },
  {
    id: 's-1.4',
    kind: 'step',
    title: 'Ghi atomic + idempotent',
    parent: 'sf-1',
    detail: 'Temp cùng dir + rename; payload đổi mới bump generatedAt.'
  },
  {
    id: 's-3.1',
    kind: 'step',
    title: 'Consume payload IPC (đã decode)',
    parent: 'sf-3',
    detail: 'Renderer không đọc fs, không JSON.parse lại.'
  },
  {
    id: 's-3.2',
    kind: 'step',
    title: 'Layout graph theo kind + parent',
    parent: 'sf-3',
    detail: 'Cây tier cho tiến độ; dòng chảy cho logic.'
  },
  {
    id: 's-3.3',
    kind: 'step',
    title: 'Render 2 chế độ + toolbar',
    parent: 'sf-3',
    detail: 'Toggle Tiến độ / Logic & Impact + filter kind.'
  },
  {
    id: 's-3.4',
    kind: 'step',
    title: 'Panel chi tiết + hover highlight',
    parent: 'sf-3',
    detail: 'Click node → panel; hover → hàng xóm bậc 1.'
  },
  { id: 'area-kit', kind: 'area', title: 'Kit / CLI' },
  { id: 'area-main', kind: 'area', title: 'Main process' },
  { id: 'area-renderer', kind: 'area', title: 'Renderer' },
  { id: 'area-packaging', kind: 'area', title: 'Packaging' },
  {
    id: 'f-kit-bins',
    kind: 'file',
    title: 'story-mindmap',
    path: 'kit/bins/story-mindmap',
    computed: false
  },
  {
    id: 'f-bridge',
    kind: 'file',
    title: 'os-wakii-file-open-bridge.ts',
    path: 'src/main/os-wakii-file-open-bridge.ts',
    computed: true
  },
  {
    id: 'f-main-index',
    kind: 'file',
    title: 'index.ts',
    path: 'src/main/index.ts',
    computed: true
  },
  {
    id: 'f-editor-slice',
    kind: 'file',
    title: 'editor slice',
    path: 'src/renderer/src/store/slices/editor/',
    computed: false
  },
  {
    id: 'f-viewer',
    kind: 'file',
    title: 'wakii-viewer.tsx',
    path: 'src/renderer/src/viewer/wakii-viewer.tsx',
    computed: false
  },
  {
    id: 'f-builder',
    kind: 'file',
    title: 'electron-builder.config.cjs',
    path: 'config/electron-builder.config.cjs',
    computed: true
  },
  {
    id: 'f-nsis',
    kind: 'file',
    title: 'nsis-wakii.nsh',
    path: 'config/installer/nsis-wakii.nsh',
    computed: false
  }
]

export const WAKII_GOLDEN_EDGES: WakiiMindmapEdge[] = [
  { from: 'epic', to: 'sf-1', rel: 'contains' },
  { from: 'epic', to: 'sf-2', rel: 'contains' },
  { from: 'epic', to: 'sf-3', rel: 'contains' },
  { from: 'epic', to: 'sf-4', rel: 'contains' },
  { from: 'sf-1', to: 't-1.1', rel: 'contains' },
  { from: 'sf-1', to: 't-1.2', rel: 'contains' },
  { from: 'sf-1', to: 't-1.3', rel: 'contains' },
  { from: 'sf-2', to: 't-2.1', rel: 'contains' },
  { from: 'sf-2', to: 't-2.2', rel: 'contains' },
  { from: 'sf-2', to: 't-2.3', rel: 'contains' },
  { from: 'sf-3', to: 't-3.1', rel: 'contains' },
  { from: 'sf-3', to: 't-3.2', rel: 'contains' },
  { from: 'sf-3', to: 't-3.3', rel: 'contains' },
  { from: 'sf-4', to: 't-4.1', rel: 'contains' },
  { from: 'sf-4', to: 't-4.2', rel: 'contains' },
  { from: 'sf-2', to: 'sf-1', rel: 'depends-on' },
  { from: 'sf-3', to: 'sf-1', rel: 'depends-on' },
  { from: 'sf-4', to: 'sf-2', rel: 'depends-on' },
  { from: 'sf-4', to: 'sf-3', rel: 'depends-on' },
  { from: 's-1.1', to: 's-1.2', rel: 'flows-to' },
  { from: 's-1.2', to: 's-1.3', rel: 'flows-to' },
  { from: 's-1.3', to: 's-1.4', rel: 'flows-to' },
  { from: 's-3.1', to: 's-3.2', rel: 'flows-to' },
  { from: 's-3.2', to: 's-3.3', rel: 'flows-to' },
  { from: 's-3.3', to: 's-3.4', rel: 'flows-to' },
  { from: 'sf-1', to: 'area-kit', rel: 'impacts' },
  { from: 'sf-2', to: 'area-main', rel: 'impacts' },
  { from: 'sf-2', to: 'area-packaging', rel: 'impacts' },
  { from: 'sf-3', to: 'area-renderer', rel: 'impacts' },
  { from: 'sf-4', to: 'area-packaging', rel: 'impacts' },
  { from: 'sf-1', to: 'f-kit-bins', rel: 'writes' },
  { from: 'sf-2', to: 'f-bridge', rel: 'writes' },
  { from: 'sf-2', to: 'f-main-index', rel: 'writes' },
  { from: 'sf-2', to: 'f-builder', rel: 'writes' },
  { from: 'sf-2', to: 'f-nsis', rel: 'writes' },
  { from: 'sf-3', to: 'f-editor-slice', rel: 'writes' },
  { from: 'sf-3', to: 'f-viewer', rel: 'writes' }
]
