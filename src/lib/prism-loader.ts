import Prism from 'prismjs'
import { languages } from 'prismjs/components.js'

// ── 常用语言静态注册 ──────────────────────────────────────────────────────
// 动态模板字符串 import() 对 CJS 依赖在 Vite 生产构建下不会打包语言文件
// （产物里缺失语法定义），因此高频语言必须静态导入；声明顺序需满足依赖：
// c 在 cpp 前，typescript 在 tsx 前，java 在 scala 前，markup-templating 在 php 前。
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-scala'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'

// markup / css / clike / javascript 由 prismjs 核心自动注册
export const loadedLanguages = new Set([
  'markup', 'css', 'clike', 'javascript',
  'c', 'cpp', 'typescript', 'jsx', 'tsx', 'java', 'scala',
  'markup-templating', 'php', 'python', 'csharp', 'go', 'rust',
  'ruby', 'swift', 'kotlin', 'sql', 'bash', 'json', 'yaml',
  'toml', 'markdown', 'diff',
])

// ── 别名归一化 ──────────────────────────────────────────────────────────
// 将短别名（js、ts、py、sh 等）转为 Prism 官方语言 ID
export function transformAliasToOrigin(langs: string[]): string[] {
  return langs.map(lang => {
    const lower = lang.toLowerCase()
    // 直接匹配
    if (languages[lower]) return lower
    // 查找别名
    const origin = Object.keys(languages).find(name => {
      const langDef = languages[name]
      return (
        langDef.alias === lower ||
        (Array.isArray(langDef.alias) && langDef.alias.includes(lower)) ||
        langDef.aliasTitles?.[lower] !== undefined
      )
    })
    return origin ?? lower
  })
}

// ── 依赖顺序加载 ──────────────────────────────────────────────────────────
// cpp 依赖 c，必须先加载 c 再加载 cpp
async function loadWithDependencies(
  lang: string,
  loaded: Set<string>,
  importFn: (id: string) => Promise<unknown>
): Promise<void> {
  if (loaded.has(lang)) return

  const langDef = languages[lang]
  if (!langDef) return

  // 先加载依赖
  const require = Array.isArray(langDef.require)
    ? langDef.require
    : langDef.require
      ? [langDef.require]
      : []

  for (const dep of require) {
    await loadWithDependencies(dep, loaded, importFn)
  }

  if (loaded.has(lang)) return

  await importFn(lang)
  loaded.add(lang)
}

// ── 主入口：加载语言 ────────────────────────────────────────────────────────
export async function loadLanguage(
  lang: string
): Promise<{ lang: string; status: 'loaded' | 'cached' | 'noexist' }> {
  const fullLang = transformAliasToOrigin([lang])[0]

  // 语言不存在
  if (!(fullLang in languages)) {
    return { lang: fullLang, status: 'noexist' }
  }

  // 已加载
  if (loadedLanguages.has(fullLang)) {
    return { lang: fullLang, status: 'cached' }
  }

  // 动态加载（含依赖顺序）
  await loadWithDependencies(fullLang, loadedLanguages, async (id) => {
    delete Prism.languages[id]
    await import(`prismjs/components/prism-${id}.js`)
  })

  return { lang: fullLang, status: 'loaded' }
}

// ── 便捷方法：批量加载 ────────────────────────────────────────────────────
export async function loadLanguages(langs: string[]) {
  return Promise.all(langs.map(loadLanguage))
}

// ── cpp 别名补丁 ──────────────────────────────────────────────────────────
// Prism 官方没有 c++ / h++ 别名，手动补上
export function patchCppAlias() {
  const cpp = Prism.languages.cpp
  if (!cpp) return

  const existing = cpp.alias || []
  const alias = Array.isArray(existing) ? [...existing] : existing ? [existing] : []
  for (const name of ['c++', 'h++']) {
    if (!alias.includes(name)) alias.push(name)
  }
  cpp.alias = alias
}

// ── LaTeX 转义百分号修复 ──────────────────────────────────────────────────
// 默认 latex 文法会把 % 当注释起始符，导致 % 后的代码丢失
export function patchLatexEscapedPercent() {
  const latex = Prism.languages.latex
  if (latex?.comment) {
    latex.comment = { pattern: /(^|[^\\])%.*/, lookbehind: true }
  }
}

// ── 一次性应用所有补丁 ────────────────────────────────────────────────
export function applyPrismPatches() {
  patchCppAlias()
  patchLatexEscapedPercent()
}

// ── 语言列表搜索 ────────────────────────────────────────────────────────
// 搜索语言定义（含别名匹配）
export function searchLanguage(query: string) {
  const lower = query.toLowerCase()
  return Object.keys(Prism.languages).find(name => {
    const lang = Prism.languages[name]
    return (
      name === lower ||
      lang.alias === lower ||
      (Array.isArray(lang.alias) && lang.alias.includes(lower)) ||
      lang.aliasTitles?.[lower] !== undefined
    )
  })
}

export { Prism }
