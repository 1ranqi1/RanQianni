#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 RanQianni 学习空间的模块化源码打包成一个可双击运行的单一 HTML 文件。
用法: python build_single.py
输出: 本目录下的 index.html（可直接双击打开，也可直接部署到 GitHub Pages）

注意：生成后会覆盖 index.html。原始跳转版仍保存在 git 历史里，
需要还原可执行：git checkout index.html
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "index.html"

README = """/* ==========================================================================
   本文件由 build_single.py 自动生成，请勿直接编辑。
   要修改内容，请编辑 main/ class/ DDL/ website/ 下的源文件，然后重新运行：
       python build_single.py
   ========================================================================== */"""


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def indent(text: str, spaces: int = 2) -> str:
    pad = ' ' * spaces
    return '\n'.join(pad + line if line.strip() else line for line in text.split('\n'))


def convert_module(js: str, name: str = ''):
    """去掉 import/export 语法，返回 (代码, 导出名列表)。

    处理规则：
      import { A, B } from "...";  →  const { A, B } = __RA;
      export function foo()         →  function foo()     并记录 foo
      export const x = 1            →  const x = 1        并记录 x
    """
    exported = re.findall(
        r'^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)',
        js, flags=re.M
    )

    # import { A, B as C } from "..." → const { A, B: C } = __RA;
    def repl_import(m):
        names = m.group(1)
        # 把 `as` 换成对象解构的 `:`
        names = re.sub(r'\s+as\s+', ': ', names)
        return f'const {{ {names} }} = __RA;'

    js = re.sub(
        r'^\s*import\s*\{([^}]*)\}\s*from\s*["\'][^"\']+["\']\s*;?[ \t]*$',
        repl_import, js, flags=re.M
    )
    # 副作用导入直接删掉
    js = re.sub(r'^\s*import\s*["\'][^"\']+["\']\s*;?[ \t]*$', '', js, flags=re.M)
    # 去掉 export 前缀
    js = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)', '', js, flags=re.M)
    js = re.sub(r'^\s*export\s*\{[^}]*\}\s*;?[ \t]*$', '', js, flags=re.M)

    # main.js 里的 loadSection 依赖 import.meta.url 动态抓取 HTML 片段，
    # 打包版已经把这些片段内联进 HTML，所以整个函数和它的调用都要移除。
    if name == 'main/main.js':
        js = re.sub(
            r'async\s+function\s+loadSection\s*\([^)]*\)\s*\{.*?\n\}\n',
            '', js, flags=re.S | re.M
        )
        js = re.sub(
            r'await\s+Promise\.all\(\s*\[\s*loadSection\([^\]]*?\]\s*\)\s*;',
            '', js, flags=re.S
        )

    return js.strip(), exported


def module_block(name: str, js: str, exported) -> str:
    """把一个模块包进 IIFE，导出项挂到 __RA 命名空间。"""
    body = indent(js, 2)
    lines = [f'// ===== {name} =====', '(function () {', body]
    if exported:
        lines.append('')
        lines.append('  // 暴露给其他模块使用')
        for symbol in exported:
            lines.append(f'  __RA.{symbol} = {symbol};')
    lines.append('})();')
    return '\n'.join(lines)


def main() -> int:
    # ---------- CSS（顺序与原 main.html 的 link 顺序一致）----------
    css_order = [
        'main/main.css',
        'class/class.css',
        'DDL/DDL.css',
        'website/website.css',
        'main/theme.css',
    ]
    css_chunks = []
    for rel in css_order:
        path = ROOT / rel
        if not path.exists():
            print(f'[错误] 缺少文件: {path}', file=sys.stderr)
            return 1
        css_chunks.append(f'/* ---------- {rel} ---------- */\n' + read(path))
    all_css = '\n\n'.join(css_chunks)

    # ---------- HTML 片段 ----------
    class_html = read(ROOT / 'class/class.html').strip()
    ddl_html = read(ROOT / 'DDL/DDL.html').strip()
    website_html = read(ROOT / 'website/website.html').strip()

    # ---------- JS 模块 ----------
    js_chunks = []
    specs = [
        ('main/utils.js', ROOT / 'main/utils.js'),
        ('class/data.js', ROOT / 'class/data.js'),
        ('class/class.js', ROOT / 'class/class.js'),
        ('DDL/data.js', ROOT / 'DDL/data.js'),
        ('DDL/DDL.js', ROOT / 'DDL/DDL.js'),
        ('website/data.js', ROOT / 'website/data.js'),
        ('website/website.js', ROOT / 'website/website.js'),
        ('main/main.js', ROOT / 'main/main.js'),
    ]
    for name, path in specs:
        if not path.exists():
            print(f'[错误] 缺少文件: {path}', file=sys.stderr)
            return 1
        code, exported = convert_module(read(path), name)
        js_chunks.append(module_block(name, code, exported))
    all_js = '\n\n'.join(js_chunks)

    # ---------- 组装 ----------
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>我的学习空间</title>
<style>
{README}

{all_css}
</style>
</head>
<body>
  <main id="login" class="login-screen">
    <button class="ghost login-theme-button" data-theme-toggle type="button">夜间模式</button>
    <form id="login-form" class="login-card" autocomplete="on">
      <div class="brand"><span class="brand-mark" aria-hidden="true">日</span><span>RANQI · 学习空间</span></div>
      <h1>欢迎回来</h1>
      <p class="login-lead">登录后查看课表与个人学习空间。</p>
      <div class="field"><label for="username">用户名</label><input id="username" name="username" type="text" autocomplete="username" required autofocus></div>
      <div id="password-field" class="field"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <button id="login-button" class="primary" type="submit">进入学习空间</button>
      <p id="login-error" class="error" role="alert" aria-live="polite"></p>
      <div class="login-foot">2026–2027 学年 · 第 1 学期</div>
    </form>
  </main>

  <main id="app" class="app hidden" aria-hidden="true">
    <header class="topbar">
      <div><p class="eyebrow">STUDY SPACE</p><h1 class="page-title">我的学习空间</h1><p class="subtitle" id="term"></p></div>
      <div class="top-actions">
        <button class="ghost" data-theme-toggle type="button">夜间模式</button>
        <div class="student-chip"><strong id="student"></strong></div>
        <button id="logout" class="ghost" type="button">退出登录</button>
      </div>
    </header>
    <nav class="main-nav" aria-label="主要版块">
      <button class="nav-button active" type="button" data-view="class" aria-current="page">课表</button>
      <button class="nav-button" type="button" data-view="ddl">DDL</button>
      <button class="nav-button" type="button" data-view="website">常用网站</button>
      <button class="nav-button" type="button" data-view="one">板块一</button>
      <button class="nav-button" type="button" data-view="two">板块二</button>
      <button class="nav-button" type="button" data-view="three">板块三</button>
    </nav>
    <div id="class-root">
{indent(class_html, 6)}
    </div>
    <div id="ddl-root" class="hidden">
{indent(ddl_html, 6)}
    </div>
    <div id="website-root" class="hidden">
{indent(website_html, 6)}
    </div>
    <section id="placeholder-view" class="content-card placeholder-card hidden" aria-labelledby="placeholder-title">
      <div id="placeholder-badge" class="placeholder-badge">01</div>
      <h2 id="placeholder-title">板块一</h2>
      <p>这个版块已经预留好，内容可以以后再添加。</p>
    </section>
  </main>

<script>
{README}

// 模块间共享的命名空间
const __RA = {{}};

{all_js}
</script>
</body>
</html>
"""
    OUT.write_text(html, encoding='utf-8')

    size_kb = OUT.stat().st_size / 1024
    print(f'生成成功: {OUT}')
    print(f'文件大小: {size_kb:.1f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
