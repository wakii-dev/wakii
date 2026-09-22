# Story: XX-000 — Tên story mẫu (mô tả ngắn gọn mục tiêu)
Destination: story/xx000-ten-story-mau

<!-- Format chuẩn story-validate (kit ≥2.14): header `# Story: <ID> — <title>` ·
     Destination ngay sau header · mỗi SF ĐỦ 6 trường: Tier / linear / Design /
     What / Depends on / Tasks. linear: RỖNG nếu CREATE, điền ID Linear sau approve.
     Depends on: `—` nếu tier 0, `SF-n` nếu có. Tasks: SLASH-SEPARATED 1 dòng
     (kebab-case, mỗi task 1 việc kiểm được) — KHÔNG dùng checkbox `- [ ]`
     (checkbox là format plan file, không phải bracket). What: behavior ĐẦU-CUỐI
     demo được, không liệt kê layer/kiến trúc. Validate: story-validate <file> -->

## SF-1 Foundation setup
Tier: 0
linear:
Design: none
What: nền tảng chung — contracts, types, config mà các SF sau phụ thuộc; demo được: <câu behavior đầu-cuối>
Depends on: —
Tasks: contracts-types / config-env-setup / foundation-tests

## SF-2 Core feature
Tier: 1
linear:
Design: none
What: tính năng chính theo spec — <câu behavior đầu-cuối demo được khi SF xong>
Depends on: SF-1
Tasks: core-implementation / edge-cases / integration-tests

## SF-3 Convergence + QA
Tier: 2
linear:
Design: none
What: ghép các SF trước — flow đầu-cuối chạy thật qua mọi thành phần + failure paths
Depends on: SF-1, SF-2
Tasks: e2e-happy-path / failure-paths / regression-suite
