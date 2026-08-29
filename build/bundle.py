#!/usr/bin/env python3
"""
Bundles the whole site into one self-contained file: dist/index.html

Everything (CSS, JS, fonts, the certificate template, the logo) is inlined
as base64, so the result has zero external requests and can be dropped
anywhere — netlify.com/drop, a college server, even opened from a USB stick.

    python build/bundle.py
"""

import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'index.html')

MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
}


def data_uri(rel_path):
    path = os.path.join(ROOT, rel_path)
    ext = os.path.splitext(path)[1].lower()
    if ext not in MIME:
        sys.exit('No MIME type registered for ' + rel_path)
    with open(path, 'rb') as f:
        return 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(f.read()).decode())


def read(rel_path):
    with open(os.path.join(ROOT, rel_path), encoding='utf-8') as f:
        return f.read()


def main():
    css = read('css/styles.css')
    # css urls are relative to css/, e.g. ../assets/fonts/tinos-700.woff2
    css = re.sub(r'url\(\.\./([^)]+)\)', lambda m: 'url(%s)' % data_uri(m.group(1)), css)

    js = '\n'.join(read(p) for p in ('js/data.js', 'js/certificate.js', 'js/app.js'))
    js = js.replace("'assets/certificate-template.jpg'", "'%s'" % data_uri('assets/certificate-template.jpg'))

    html = read('index.html')
    html = html.replace(
        '<link rel="stylesheet" href="css/styles.css">',
        '<style>\n%s\n</style>' % css)
    html = re.sub(
        r'\s*<script src="js/(data|certificate|app)\.js"></script>', '', html)
    html = html.replace('</body>', '<script>\n%s\n</script>\n</body>' % js)
    html = html.replace('assets/origin-logo.png', data_uri('assets/origin-logo.png'))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    print('Wrote %s — %d KB' % (os.path.relpath(OUT, ROOT), round(os.path.getsize(OUT) / 1024)))
    leftovers = [t for t in ('css/styles.css', 'js/app.js', 'assets/fonts/') if t in html]
    if leftovers:
        sys.exit('Bundle still references: ' + ', '.join(leftovers))


if __name__ == '__main__':
    main()
