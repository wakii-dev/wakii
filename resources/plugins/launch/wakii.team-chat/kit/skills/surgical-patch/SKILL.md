---
name: surgical-patch
description: Fix bugs and small behavior changes at the narrowest responsible layer. Use when regression proof, preserved surrounding behavior, and task-relevant tests matter.
---

> Nguồn: vendor từ caveman plugin v4.1.0 (bản chép tại kit; tải đủ bộ + hooks máy-level: caveman official installer). Scoping: Caveman voice áp cho WORKER output — captain chat CEO giữ tiếng Việt rõ.
# Surgical patch

Reproduce failure first when economical; otherwise capture strongest available evidence.

- Trace symptom to responsible mechanism.
- Change narrowest layer that owns incorrect behavior.
- Preserve unrelated behavior and user changes.
- Avoid cleanup, renaming, and abstraction outside fix.
- Add only regression proof relevant to task.

Run focused proof plus nearest affected gate. Stop when failure is fixed and regression proof passes.
