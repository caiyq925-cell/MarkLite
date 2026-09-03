# 需求实施计划

- [x] 1. 初始化 Tauri 2 + Svelte 5 工程骨架
  - 在仓库根创建 Vite + Svelte 5 前端与 `src-tauri` 宿主，产品名 MarkLite，identifier `com.marklite.app`
  - 配置 Windows 目标、`PerMonitorV2` DPI、简体中文窗口标题
  - 按 design.md 配置 CSP、关闭默认 `fs` 权限、启用 asset protocol
  - 配置 release：`lto`、`opt-level = "z"`、`strip`、`codegen-units = 1`
  - 对应 R1.1、R14.1、R14.3、R15.5、体积预算

- [x] 2. 实现路径安全与编解码
  - [x] 2.1 实现 `src-tauri/src/fs_safe.rs`
    - canonicalize、越界检测、允许扩展名 `{md, markdown, mdown}` 与图片扩展名白名单
    - 对应 R15.3、R15.4、R11.2
  - [x] 2.2 实现 `src-tauri/src/encoding.rs`
    - UTF-8 BOM 检测、严格 UTF-8、GBK 回退、换行 `lf`/`crlf` 探测与按原风格写回
    - 对应 R6.3、R6.4
  - [x] 2.3 为路径越界与编码往返编写单元测试
    - 覆盖 `..\`、不同盘符、BOM/无 BOM UTF-8、GBK、CRLF 往返
    - 对应 Correctness 1、3

- [x] 3. 实现 IPC 命令与能力白名单
  - [x] 3.1 实现 `read_file` / `write_file`
    - `read_file` 返回 text/encoding/bom/newline/size；`>10 MiB` 返回 `FileTooLarge`
    - `write_file` 写临时文件再 rename；失败保持调用方可感知错误
    - 对应 R3.4、R6.1、R6.5、R6.6、R16.3
  - [x] 3.2 实现 `pick_open` / `pick_save` / `set_asset_root` / `get_config` / `set_config`
    - 对话框过滤 Markdown 扩展名；asset_root 限制在文档父目录
    - 对应 R4.1、R6.2、R11.1、R14.4
  - [x] 3.3 编写 `capabilities/default.json`，仅授予上表命令
    - 对应 R15.3
  - [x] 3.4 为 read/write 错误路径编写单元测试
    - 只读、不存在、非法扩展名
    - 对应 R6.5、R3.4

- [x] 4. 实现启动参数、单实例与窗口标题
  - 注册 `tauri-plugin-single-instance` 与 `tauri-plugin-dialog`
  - 解析 argv 路径；已有实例转发路径后退出；同一规范化路径只开一标签
  - Dirty 时标题 `*文件名`，格式 `MarkLite — 文件名`
  - 对应 R3.1–R3.5、R17.1、R17.2

- [x] 5. 检查点 - 确保 Rust 命令可编译
  - 所有测试通过（14/14），系统依赖已安装，编译成功

- [x] 6. 实现前端窗口壳与标签
  - [x] 6.1 实现 `App.svelte`：菜单、标签栏、分栏、状态栏、空工作区
    - 空工作区仅「打开文件」，无新建；分隔条 20%–80%
    - 简体中文菜单与错误文案；可见焦点环
    - 对应 R3.3、R5.1、R5.2、R14.1、R14.6、R17
  - [x] 6.2 实现打开/拖放/关闭标签与 Dirty 询问
    - 拖放多个文件、Ctrl+O/S/Shift+S/W/Tab/F、Alt+F4
    - Dirty 关闭：保存 / 不保存 / 取消；关窗口逐个询问
    - 对应 R4.1–R4.5、R14.5
  - [x] 6.3 实现窗口几何与配置恢复
    - 退出写入 `%APPDATA%\com.marklite.app\config.json`；位置非法则主屏居中
    - 对应 R14.2、R14.4

- [x] 7. 实现源码栏 CodeMirror 6
  - Markdown 语法着色、行号、等宽字体链、300ms 防抖触发预览
  - `>2 MiB` 虚拟滚动；`>10 MiB` 经确认后只读纯文本、关闭预览增强
  - Ctrl+F 查找与大小写开关、无匹配提示
  - 源码为保存权威，预览不回写
  - 对应 R5.3、R5.5、R5.6、R12.3、R12.4、R16.1–R16.3

- [x] 8. 实现离线预览管线
  - [x] 8.1 接入 markdown-it + GFM 表格/任务列表/删除线/自动链接/脚注/标题锚点
    - `typographer: false`；HTML 随后净化
    - 对应 R7.1–R7.5
  - [x] 8.2 接入 highlight.js 语言子集与浅色/深色主题
    - 注册 bash/js/ts/json/python/go/rust/html/css/yaml/sql/markdown 及别名
    - 未注册语言等宽纯文本
    - 对应 R8.1–R8.4
  - [x] 8.3 接入离线 KaTeX 行内 `$` 与块级 `$$`
    - 解析失败显示原 TeX 与错误，其余继续
    - 对应 R9.1–R9.4
  - [x] 8.4 接入 mermaid.min.js 延迟加载
    - 首次出现 `mermaid` 围栏才 boot；`securityLevel: 'strict'`；3 秒超时降级
    - 渲染期间源码栏可滚动、可切标签
    - 对应 R10.1–R10.4、R16.4
  - [x] 8.5 接入 DOMPurify 与预览 CSS
    - 去掉 script/事件属性/`javascript:`；跟随系统浅色/深色
    - 对应 R14.2、R15.1、R15.2
  - [x] 8.6 为预览管线编写快照与净化测试
    - GFM 子集快照；净化后无 script/on\*；无 mermaid 围栏时不加载引擎
    - 对应 Correctness 4、5、7

- [x] 9. 实现大纲、同步滚动与图片
  - [x] 9.1 实现 TOC 与标题锚点双向同步滚动
    - 防回声；点击大纲同时滚两侧
    - 对应 R5.4、R12.1、R12.2
  - [x] 9.2 实现本地 asset 图片与远程图开关
    - 相对路径改写 asset；越界占位；默认加载 http(s)；失败占位；「阻止远程图片」默认关
    - 对应 R11.1–R11.5

- [x] 10. 实现打印
  - 菜单/命令打开系统打印对话框，内容为当前 Preview Pane
  - 对应 R13.1、R13.2

- [ ] 11. 检查点 - 确保前端与 IPC 联调通过
  - 前端测试(7/7)与构建已通过；GUI 联调需 `tauri dev` 图形环境，Linux headless 环境无法验证

- [ ] 12. 配置 NSIS 安装包与文件关联
  - `bundle.targets: nsis`，`installMode: currentUser`，`webviewInstallMode: embedBootstrapper`
  - `fileAssociations`：md / markdown / mdown，默认打开
  - `windows/hooks.nsh`：缺失 WebView2 时中文提示并打开官方入口；卸载清除本程序写入的关联
  - 对应 R2.1–R2.6
  - 注：NSIS 安装包需 Windows 环境执行 `npm run tauri build`，当前 Linux 环境无法产出
  - 编写 `samples/kitchen-sink.md` 及相对路径配图，覆盖 GFM/高亮/公式/mermaid/本地图/远程图/恶意 HTML
  - 编写 README：实测体积占位、安装后大小、依赖系统 WebView2、Win10 21H2+、未签名 SmartScreen、无自动更新
  - 对应 R18.1–R18.3、Test Strategy 样例文档
