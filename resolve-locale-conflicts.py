import json, re, subprocess, sys

# Resolver conflict locale (fork Wakii-branding vs upstream Orca + key mới):
# mỗi block = HEAD side (giữ nguyên) + entry upstream-only (Orca→Wakii).
# Validate: file cuối parse được + chứa đủ key của CẢ HAI bên.

ENTRY_RE = re.compile(r'^(\s*)"([^"]+)":')

def split_entries(side_lines):
    """Tách side thành các entry top-level (indent = min indent của side)."""
    indents = [len(m.group(1)) for l in side_lines if (m := ENTRY_RE.match(l))]
    if not indents:
        return [], set()
    top = min(indents)
    entries, keys, cur = [], set(), None
    for line in side_lines:
        m = ENTRY_RE.match(line)
        if m and len(m.group(1)) == top:
            if cur is not None:
                entries.append(cur)
            cur = [line]
            keys.add(m.group(2))
        elif cur is not None:
            cur.append(line)
    if cur is not None:
        entries.append(cur)
    return entries, keys

def resolve(path):
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    out, i, blocks = [], 0, 0
    while i < len(lines):
        if lines[i].startswith('<<<<<<<'):
            head, upstream, i = [], [], i + 1
            while not lines[i].startswith('======='):
                head.append(lines[i]); i += 1
            i += 1
            while not lines[i].startswith('>>>>>>>'):
                upstream.append(lines[i]); i += 1
            i += 1
            blocks += 1
            head_entries, head_keys = split_entries(head)
            up_entries, up_keys = split_entries(upstream)
            up_by_key = {}
            for e in up_entries:
                m = ENTRY_RE.match(e[0])
                if m: up_by_key[m.group(2)] = e
            new_keys = [k for k in up_keys if k not in head_keys]
            merged = list(head)
            if new_keys:
                # thêm entry upstream mới (Orca→Wakii); bảo đảm comma giữa các member
                merged_text = '\n'.join(merged).rstrip()
                if merged_text and not merged_text.endswith(','):
                    merged_text += ','
                appends = []
                for k in new_keys:
                    text = '\n'.join(up_by_key[k]).rstrip().rstrip(',')
                    appends.append(text)
                joined = ',\n'.join(appends)
                merged = (merged_text + '\n' + joined).split('\n')
                merged = [l.replace('Orca', 'Wakii') for l in merged]
            out.extend(merged)
        else:
            out.append(lines[i]); i += 1
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    return blocks

def flatten_keys(obj, prefix=''):
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f'{prefix}.{k}'
            keys.add(p)
            keys |= flatten_keys(v, p)
    elif isinstance(obj, list):
        for idx, v in enumerate(obj):
            keys |= flatten_keys(v, f'{prefix}[{idx}]')
    return keys

def head_or_upstream(path, ref):
    raw = subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, text=True, check=True).stdout
    return json.loads(raw)

for path in sys.argv[1:]:
    blocks = resolve(path)
    final = json.load(open(path, encoding='utf-8'))
    fk = flatten_keys(final)
    missing = []
    for ref in ('HEAD', 'origin/main'):
        ref_keys = flatten_keys(head_or_upstream(path, ref))
        gap = ref_keys - fk
        if gap:
            missing.append((ref, sorted(gap)[:5], len(gap)))
    status = 'OK' if not missing else f'MISSING {missing}'
    print(f'{path}: {blocks} blocks resolved, JSON valid, key-coverage {status}')
    if missing:
        sys.exit(1)
