import re, sys

txt = open('r1.md', encoding='utf-8', errors='replace').read()
blocks = re.split(r'\n### ', txt)
targets = ['groq', 'cerebras', 'cohere', 'silicon', 'modelscope', 'nebius',
           'zhipu', 'vercel', 'kilo', 'agnes', 'aion', 'ai21', 'mistral', 'deepseek']

for b in blocks:
    head = b.split('\n')[0][:60]
    low = head.lower()
    if not any(t in low for t in targets):
        continue
    lines = [l.strip() for l in b.split('\n')[1:] if l.strip()]
    desc = ''
    for l in lines[:5]:
        if any(k in l for k in ['free', 'Free', 'RPM', 'TPD', 'limit', 'credit']):
            desc = l[:200]
            break
    base = ''
    for l in lines[:10]:
        if 'Base URL' in l:
            base = l.split('Base URL:')[1].strip().strip('` ')
            break
    print('%-26s | %-40s | %s' % (head[:26], base[:40], desc))
