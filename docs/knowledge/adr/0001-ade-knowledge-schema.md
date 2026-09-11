---
id: 0001
title: ADE knowledge schema
status: accepted
date: 2026-09-10
grading: ADOPT(layer1) DIRECTION(layer2) WATCH(layer3)
---

# 0001 — ADE knowledge schema

## Context

Kiến thức của dự án giàu nhưng phân tán: decisions nằm rải rác trong GitHub
issues/discussions, lessons trong Linear, landscape và định nghĩa thuật ngữ nằm
ở repo `wakii-site` (remote — không có clone local trên máy dev hiện tại, probe
2026-09-10). Mỗi agent bắt đầu phiên phải tái thiết lập context từ đầu: query
GitHub lặp lại, tốn token, và dễ sai phiên bản sự thật khi issue đã đổi.

Issue gốc: [#38 — ADE knowledge infra](https://github.com/wakii-dev/wakii/issues/38).
Story: GH-45 (Layer 1). Epic Linear: FI-23.

## Decision

Chia knowledge infra thành 3 layers, grading theo mức độ cam kết:

| Layer | Phạm vi | Grading |
|-------|---------|---------|
| 1 | ADR schema + Project KB (adr/repos/glossary/MOC) + query bin read-only | **ADOPT** |
| 2 | Agent Memory retrieval (checkpoint/lessons tích hợp truy vấn) | **DIRECTION** |
| 3 | GraphRAG / ecosystem-wide knowledge graph | **WATCH** |

Layer 1 (ADR này) là phạm vi duy nhất ADOPT. Layer 2/3 chỉ ghi hướng — KHÔNG
implement trong scope này.

### KB layout contract

Một KB dir (mặc định `docs/knowledge/`) chứa:

```
docs/knowledge/
├── adr/NNNN-slug.md        # ADR — decision record, track-in-git
├── repos/<org>--<repo>.md  # 1 file per repo liên quan (double-dash phân tách org/repo)
├── glossary.md             # thuật ngữ — heading per term
└── MOC.md                  # Map of Content — heading per section
```

Frontmatter mỗi file là YAML-ish đơn giản:

```
---
id: 0001
title: <tên hiển thị>
status: accepted | proposed | superseded
date: YYYY-MM-DD
grading: ADOPT(layerN) | DIRECTION(layerN) | WATCH(layerN)
---
```

Parser là zero-dep regex (tolerant markdown frontmatter — KHÔNG YAML lib):
đọc dòng `key: value` giữa cặp `---`, đủ cho id/title/status/date/grading.
Schema engine là over-engineering cho Layer 1.

Phân định track: `adr/` track-in-git (negate `.gitignore`, pattern proven từ
migrations GH-37). Data KB thực (`repos/`, `glossary.md`, `MOC.md`) KHÔNG track
ở repo này — chúng thuộc `wakii-site` (sync việc sau, out-of-scope).

### Bin usage — story-kb

Agents truy vấn KB qua bin read-only (không MCP client setup):

```
story-kb query-adr <keyword...>   # AND-match filename+title+body, top-5
story-kb query-repo <keyword...>  # scan repos/ theo org--repo + title, top-5
story-kb glossary [term]          # entry block, không term → TOC
story-kb moc [section]            # section, không term → TOC
story-kb stats                    # counts + dir đang dùng
```

KB dir resolve: `--dir <path>` > env `WAKII_KB_DIR` > candidates
`<git-root>/docs/knowledge`, `<git-root>/../wakii-site/docs/knowledge`.
KB vắng → exit 0 in `KB not configured — probed: <dirs>` (fail-open — agents
không chết trên máy chưa có KB).

## Consequences

- ADR là ADR đầu tiên của ADE — các ADR sau theo đúng layout + frontmatter này.
- Agents có câu trả lời tốt hơn khi đề xuất pattern/decision (query KB thay vì
  tái đọc GitHub); máy có clone `wakii-site` dùng được ngay qua env/candidates.
- MCP wrapper (expose KB qua MCP server) là việc issue
  [#5](https://github.com/wakii-dev/wakii/issues/5) — bin trực tiếp trước vì
  executor agents chạy Bash dễ hơn MCP client.
- Layer 2 (Agent Memory retrieval) và Layer 3 (GraphRAG) là DIRECTION/WATCH —
  thiết kế sau khi Layer 1 chứng minh giá trị qua usage.
