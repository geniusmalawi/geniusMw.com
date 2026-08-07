from pathlib import Path
import re

BASE = Path(r'c:\Users\USER\Desktop\Genius Malawi')
VERSION = '2026.1.0'
HTML_FILES = list(BASE.rglob('*.html'))
JS_FILES = list(BASE.rglob('*.js'))

version_pattern = re.compile(r'\?v=2(?:\.\d+){0,2}')
assets_pattern = re.compile(r'\?v=2(?:\.\d+){0,2}')

for path in HTML_FILES + JS_FILES:
    text = path.read_text(encoding='utf-8')
    updated = text
    updated = version_pattern.sub(f'?v={VERSION}', updated)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        print(f'Updated version strings: {path}')

for path in HTML_FILES:
    text = path.read_text(encoding='utf-8')
    if 'version-check.js' in text:
        continue
    if '</body>' not in text:
        continue
    relative_path = 'js/version-check.js' if path.parent == BASE else '../js/version-check.js'
    script_tag = f'    <script type="module" src="{relative_path}?v={VERSION}"></script>\n'
    updated = text.replace('</body>', script_tag + '</body>')
    path.write_text(updated, encoding='utf-8')
    print(f'Injected version-check: {path}')
