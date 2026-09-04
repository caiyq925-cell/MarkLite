# MarkLite

Windows 10/11 上的离线 Markdown 阅读与轻编辑器。安装后可双击打开 `.md` / `.markdown` / `.mdown`，左侧源码、右侧预览。

## 系统要求

- Windows 10 21H2 或 Windows 11（x64）
- 系统 WebView2 Runtime（通常随 Microsoft Edge 提供）
- 安装包不内嵌浏览器内核。若安装时检测不到 WebView2，安装程序会打开 Microsoft 官方说明页

## 能力

- GFM：表格、任务列表、删除线、自动链接、脚注
- 代码高亮（常用语言子集，完全离线）
- KaTeX 公式、Mermaid 图表（图表脚本按需加载）
- 源码/预览分栏、大纲、查找、打印
- 默认加载远程图片，可在「视图」中阻止
- 单实例：再双击文件时在已有窗口打开新标签
- 本版本不提供新建空文档、不检查自动更新

## 安装与卸载

使用 NSIS 安装包，安装到**当前用户**（无需管理员）。卸载通过系统「应用和功能」，会清除本安装程序写入的文件关联。

未做代码签名时，Windows SmartScreen 可能显示未知发布者提示。

## 主题系统

MarkLite 支持从 `src/theme/` 目录动态加载主题，无需手动修改应用代码。

### 添加新主题

1. 在 `src/theme/` 目录下新建一个 `.theme.css` 文件，使用 [Monaco Editor theme](https://code.visualstudio.com/api/references/theme-color) 变量格式（至少包含 `--editorBgColor`、`--editorColor`、`--themeColor`）
2. 运行生成脚本：

```bash
npm run themes
```

脚本会自动：
- 解析新主题的 Monaco 变量，推断明暗与关键颜色
- 生成对应的 MarkLite 应用层 CSS 规则（追加到 `src/themes.css`）
- 更新 `src/lib/theme.ts` 中的主题列表

3. 重新构建或启动开发服务器即可生效。应用菜单「主题」下拉会显示全部已注册主题，选择后样式实时切换。

### 现有主题（33 个）

| 类型 | 主题 |
| --- | --- |
| 内置 | Default、Dark、One Dark、Graphite、Ulysses、Material Dark |
| Ayu | Ayu Dark、Ayu Light、Ayu Mirage |
| Catppuccin | Catppuccin Latte、Catppuccin Mocha |
| Dracula / Nord / Solarized | Dracula、Nord、Solarized Dark、Solarized Light |
| Tokyo Night | Tokyo Night、Tokyo Night Storm、Tokyo Night Light |
| Rose Pine | Rose Pine、Rose Pine Dawn、Rose Pine Moon |
| Gruvbox | Gruvbox Dark、Gruvbox Light |
| Everforest | Everforest Dark、Everforest Light |
| 其他 | Cyberdream、Horizon Dark、Kanagawa、Monokai Pro、Nightfox、Oxocarbon Dark、Palenight、Synthwave 84 |

### 自定义强调色

在「主题」菜单下方可选择 7 种预设强调色（陶土橙、蓝、青、绿、紫、玫红、石墨），也可在开发者模式下通过 `root.style.setProperty('--accent', ...)` 自定义。

---

| 项 | 值 |
| --- | --- |
| 压缩安装包 | 待发布实测（设计目标 8–18 MB） |
| 安装后目录 | 待发布实测 |
| WebView2 | 依赖系统组件 |
| 自动更新 | 无 |

## 开发

需要 Node.js 22+ 与 Rust 稳定版。

```bash
npm install
npm test
```

```bash
# 前端单测
npm test

# Rust 单测（在 src-tauri 目录）
cargo test
```

```bash
# 开发窗口（需 WebView2 / WebKit）
npm run tauri dev
```

```bash
# Windows 安装包
npm run tauri build
```

验收样例：`samples/kitchen-sink.md`。

## CI/CD

每次推送 `main` 分支会自动触发 GitHub Actions 构建 Windows 安装包（NSIS）。

- **构建产物**：上传为 GitHub Actions Artifact，名称 `marklite-windows-setup`
- **Release 发布**：创建 GitHub Release 时自动打包 `.exe` / `.msi` 作为 Draft Release 附件

构建流程：`.github/workflows/build-windows.yml`

```
push main → npm ci → cargo test → tauri build → upload artifact
tag v*      → create release (draft) with artifacts
```
