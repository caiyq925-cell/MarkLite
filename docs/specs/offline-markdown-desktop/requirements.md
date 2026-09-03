# Requirements Document

## Introduction

本文档定义 Windows 10/11 桌面应用 **MarkLite** 的需求。MarkLite 用于打开、预览并简单编辑本地 Markdown 文档；安装后通过文件关联以双击方式打开 `.md` 类文件；渲染能力覆盖 GitHub Flavored Markdown（GFM）、代码高亮、数学公式与图表；GFM / 高亮 / 公式 / 图表引擎随安装包离线可用。渲染窗口使用系统已安装的 Web 视图组件；缺失时由安装包引导安装系统组件，安装包不内嵌浏览器内核。有网络时默认加载 Remote Image。本版本不检查、不安装应用更新。

本轮只固化需求。技术方案见后续 `design.md`。

**已由用户确认的范围**

| 项 | 结论 |
|---|---|
| 平台 | 仅 Windows 10 与 Windows 11 |
| 产品名 | MarkLite |
| 核心能力 | 预览为主；源码栏与预览栏分栏编辑；可保存 |
| 打开方式 | 安装后双击关联打开 |
| 进程模型 | 单实例；后续双击的文档在已有窗口中以新标签打开 |
| 关联扩展名 | `.md`、`.markdown`、`.mdown` |
| 渲染范围 | GFM + 代码高亮 + 数学公式 + 图表（引擎离线内置） |
| 图片 | 相对路径按文档所在目录解析；Remote Image 默认加载 |
| 自动更新 | 本版本不检查、不安装更新 |
| 空文档 | 不提供「新建」；只打开磁盘上已有的 Document |
| 安装权限 | 安装到当前用户，无需管理员 |
| 界面 | 简体中文；浅色/深色跟随操作系统 |
| Web 视图 | 使用系统 Web 视图组件；缺失时引导安装系统组件；安装包不内嵌浏览器内核 |
| 交付形态 | 正规安装包（NSIS，currentUser） |
| 体积 | 功能完整前提下尽量压缩；预期压缩安装包约 8–18 MB |
| 本轮交付 | 需求文档；确认后再做设计与实现 |

## Glossary

- **System / MarkLite**：本需求所描述的 Windows 桌面应用程序。
- **User**：在 Windows 10/11 上安装并使用 MarkLite 的人。
- **Document**：磁盘上的一份 Markdown 文本文件。
- **Source Pane**：展示并允许编辑 Document 原始文本的区域。
- **Preview Pane**：将当前 Source Pane 文本渲染为排版结果的区域。
- **Active Document**：当前标签中正在查看或编辑的 Document。
- **Dirty**：Active Document 的 Source Pane 内容与上次成功写入磁盘的内容不一致。
- **GFM**：GitHub Flavored Markdown，在 CommonMark 基础上包含表格、任务列表、删除线、自动链接与删除线等扩展。
- **Math Block**：独立成段的数学公式标记（约定为 `$$` 包围）。
- **Math Inline**：行内数学公式标记（约定为 `$` 包围）。
- **Diagram Block**：以信息图语言书写的围栏代码块（约定语言标记为 `mermaid`）。
- **Installer**：用户用于安装、修复、卸载 MarkLite 的 Windows 安装程序。
- **File Association**：操作系统将指定扩展名的打开动作交给 MarkLite 处理的注册。
- **Web View Runtime**：操作系统提供的 HTML/CSS/JS 渲染组件（Windows 上通常随 Microsoft Edge / WebView2 提供）。
- **Sample Document**：用于验收的、同时包含 GFM 表格、任务列表、代码块、Math Block、Diagram Block 与本地相对路径图片的 Markdown 文件。
- **Remote Image**：`http://` 或 `https://` 的图片地址。
- **Local Image**：相对路径或 `file` 语义下、位于 Active Document 所在目录或其子目录内的图片文件。

## Requirements

### Requirement 1: 产品定位与运行环境

**User Story:** AS 一名 Windows 用户, I want 在 Windows 10/11 上安装一个轻量桌面程序来打开本地 Markdown, so that 我可以离线阅读并做少量修改。

#### Acceptance Criteria

1. The System SHALL 以独立桌面应用程序的形式在 Windows 10（21H2 及更新）与 Windows 11 上运行。
2. The System SHALL 在安装完成且 Web View Runtime 可用后，不依赖任何远程网络服务即可打开、预览、编辑并保存仅含本地资源的 Document。
3. WHEN User 在未连接网络的环境中打开仅含本地资源的 Sample Document, the System SHALL 渲染 GFM、代码高亮、数学公式、图表与 Local Image。
4. The System SHALL 将安装包压缩后体积作为发布说明中的实测值记录；体积目标为在功能完整前提下尽量压缩，预期约 8–18 MB，不将「小于 5 MB」作为拒绝发布的条件。

### Requirement 2: 安装、文件关联与卸载

**User Story:** AS 一名 Windows 用户, I want 用正规安装包安装并把 Markdown 文件关联到本应用, so that 我可以双击文件直接打开。

#### Acceptance Criteria

1. The Installer SHALL 提供图形安装向导，并写入开始菜单快捷方式、卸载信息与 File Association。
2. WHEN 安装成功完成, the Installer SHALL 将 `.md`、`.markdown`、`.mdown` 的打开动作关联到 MarkLite。
3. WHEN User 双击已关联的 Document, the operating system SHALL 启动 MarkLite 并传入该 Document 的完整路径。
4. WHEN 安装时检测到 Web View Runtime 缺失, the Installer SHALL 提示 User 安装系统 Web View Runtime，并提供跳转至官方安装程序的入口。
5. WHEN User 通过系统「应用和功能」卸载 MarkLite, the Installer SHALL 移除开始菜单项、卸载注册项，并清除由本 Installer 写入的 File Association。
6. The Installer SHALL 提供将 MarkLite 设为上述扩展名默认打开程序的选项（默认勾选）。

### Requirement 3: 启动、命令行与单实例

**User Story:** AS 一名用户, I want 双击多个 Markdown 时在同一个窗口用标签打开, so that 桌面上不会堆满重复进程。

#### Acceptance Criteria

1. WHEN User 以 `MarkLite.exe "<绝对路径>"` 启动且该路径指向可读的 Document, the System SHALL 打开该 Document。
2. WHEN User 在已有 MarkLite 进程运行时再次双击或命令行打开另一个 Document, the System SHALL 将新 Document 作为已有窗口中的新标签打开，并复用同一进程。
3. WHEN 启动参数缺失或为空, the System SHALL 显示空工作区，并提供「打开文件」入口；空工作区不创建未命名 Document 标签。
4. IF 启动路径不存在或当前用户无权读取, the System SHALL 显示错误说明（含文件名），并保持窗口可用。
5. WHEN 同一 Document 路径已在某个标签中打开, the System SHALL 激活已有标签，避免为同一路径再创建标签。

### Requirement 4: 打开、拖放与多文档标签

**User Story:** AS 一名用户, I want 用双击、打开对话框或拖放来打开文档, so that 我不必只依赖一种入口。

#### Acceptance Criteria

1. WHEN User 选择「打开」并在系统文件对话框中选中一个 Document, the System SHALL 在新标签或当前空标签中载入该 Document。
2. WHEN User 将一个或多个 Document 拖放到 MarkLite 窗口客户区, the System SHALL 为每个成功读取的文件创建或激活对应标签。
3. The System SHALL 在标签上显示 Document 的文件名；当该标签 Dirty 时，在文件名旁显示未保存标记。
4. WHEN User 关闭一个 Dirty 标签, the System SHALL 在丢弃更改前询问：保存、不保存、取消。
5. WHEN User 关闭窗口且存在任意 Dirty 标签, the System SHALL 逐个或汇总询问保存，直到 User 确认或取消关闭。

### Requirement 5: 源码/预览分栏编辑

**User Story:** AS 一名用户, I want 左边看源码、右边看渲染结果, so that 我改几行就能立刻看到排版效果。

#### Acceptance Criteria

1. WHILE 一个 Document 标签处于打开状态, the System SHALL 同时显示 Source Pane 与 Preview Pane。
2. The System SHALL 允许 User 拖动分隔条，将 Source Pane 与 Preview Pane 的宽度比调整到 20%–80% 范围内。
3. WHEN Source Pane 中的文本发生变化, the System SHALL 在 300 毫秒无后续输入后更新 Preview Pane（防抖）；连续输入时以最后一次停顿为准。
4. WHEN User 滚动 Source Pane 或 Preview Pane, the System SHALL 按标题或块级锚点将另一侧滚动到对应位置。
5. The System SHALL 在 Source Pane 提供等宽字体、行号与 Markdown 语法着色。
6. The System SHALL 将 User 在 Source Pane 中的编辑内容作为将要保存的唯一权威文本；Preview Pane 的渲染结果不回写、不重排 Source Pane 文本。

### Requirement 6: 保存与编码

**User Story:** AS 一名用户, I want 用快捷键保存修改, so that 我改完的 Markdown 能写回原文件或另存。

#### Acceptance Criteria

1. WHEN User 发出保存命令（菜单或 Ctrl+S）且 Active Document 已有磁盘路径, the System SHALL 将 Source Pane 的完整文本写入该路径。
2. WHEN User 发出另存为命令（菜单或 Ctrl+Shift+S）, the System SHALL 弹出系统保存对话框，并在 User 确认后将 Source Pane 文本写入所选路径，随后将该标签的路径更新为新路径。
3. WHEN 打开 Document 时文件以 UTF-8 解码成功, the System SHALL 以 UTF-8 读入；保存时以 UTF-8（无 BOM）写回，除非打开时检测到 UTF-8 BOM，此时保存保留 BOM。
4. IF 以 UTF-8 解码失败, the System SHALL 尝试按系统 ANSI 代码页（中文 Windows 上为 GBK）解码；成功则在状态栏提示实际使用的编码，保存时仍写 UTF-8。
5. IF 写入磁盘失败（只读、磁盘满、权限不足、文件被占用）, the System SHALL 显示失败原因，并保持 Source Pane 内容与 Dirty 状态不变。
6. WHEN 保存成功, the System SHALL 清除该标签的 Dirty 标记。

### Requirement 7: GFM 预览

**User Story:** AS 一名用户, I want 预览符合 GitHub 风格的 Markdown, so that 我在仓库里写的表格和任务列表能原样看懂。

#### Acceptance Criteria

1. The Preview Pane SHALL 渲染 ATX 与 Setext 标题、段落、强调、加粗、行内代码、链接、图片占位、引用、有序/无序列表、水平线与围栏代码块。
2. The Preview Pane SHALL 渲染 GFM 表格、任务列表、删除线与自动链接。
3. The Preview Pane SHALL 渲染 GFM 风格脚注（`[^id]` 定义与引用）。
4. WHEN 围栏代码块未指定语言或指定语言不在高亮语言集合中, the Preview Pane SHALL 仍以等宽纯文本展示该代码块内容。
5. The Preview Pane SHALL 将 Markdown 中的原始换行按 GFM 规则处理（列表内换行与表格单元格内换行保持可读）。

### Requirement 8: 代码高亮（离线）

**User Story:** AS 一名用户, I want 代码块按语言着色, so that 阅读技术文档时结构更清楚。

#### Acceptance Criteria

1. WHEN 围栏代码块的语言标记属于内置集合, the Preview Pane SHALL 对该代码块进行语法高亮。
2. 内置高亮语言集合 SHALL 至少包含：`bash`、`javascript`/`js`、`typescript`/`ts`、`json`、`python`、`go`、`rust`、`html`、`css`、`yaml`、`sql`、`markdown`。
3. The System SHALL 在离线环境下完成上述高亮，不请求网络下载语法定义。
4. The Preview Pane SHALL 使代码高亮配色与当前浅色/深色外观一致。

### Requirement 9: 数学公式（离线）

**User Story:** AS 一名用户, I want 离线看到公式而不是 TeX 源码, so that 我能阅读含公式的技术文档。

#### Acceptance Criteria

1. WHEN Source Pane 中出现 Math Inline, the Preview Pane SHALL 将该公式渲染为数学排版，并保留所在段落的其它文本。
2. WHEN Source Pane 中出现 Math Block, the Preview Pane SHALL 将该公式渲染为独立块级数学排版。
3. The System SHALL 使用随安装包分发的公式字体与样式，在离线环境下完成渲染。
4. IF 某条公式源码无法解析, the Preview Pane SHALL 在该位置显示原始 TeX 文本与简短错误说明，并继续渲染文档其余部分。

### Requirement 10: 图表（离线）

**User Story:** AS 一名用户, I want 离线看到 mermaid 图, so that 架构图和流程图不必再外挂浏览器。

#### Acceptance Criteria

1. WHEN 围栏代码块的语言标记为 `mermaid`, the Preview Pane SHALL 将该块渲染为图表。
2. The System SHALL 使用随安装包分发的图表引擎，在离线环境下完成渲染。
3. IF 某张图表源码无法解析或渲染超时（超过 3 秒）, the Preview Pane SHALL 显示该块的原始文本与错误说明，并继续渲染文档其余部分。
4. WHILE 当前打开的所有标签的 Source Pane 中均不存在 `mermaid` 代码块, the System SHALL 延迟加载图表引擎，直到首次出现此类代码块。

### Requirement 11: 本地图片与远程图片

**User Story:** AS 一名用户, I want 文档旁边的配图和外网图都能显示, so that 我打开带插图的文档时预览是完整的。

#### Acceptance Criteria

1. WHEN Markdown 图片地址为相对路径，且目标文件位于 Active Document 所在目录或其子目录内、且为常见栅格格式（png、jpg、jpeg、gif、webp、svg）, the Preview Pane SHALL 显示该 Local Image。
2. IF 相对路径指向 Active Document 所在目录之外（经规范化后越界）, the Preview Pane SHALL 显示损坏图片占位与路径说明，并拒绝读取该路径。
3. WHEN Markdown 图片地址为 Remote Image 且当前环境可访问该地址, the Preview Pane SHALL 加载并显示该图片。
4. IF Remote Image 加载失败（无网络、超时或 HTTP 错误）, the Preview Pane SHALL 显示损坏图片占位，并继续渲染文档其余部分。
5. The System SHALL 为 User 提供「阻止远程图片」开关；默认关闭（即默认允许加载 Remote Image）。

### Requirement 12: 目录大纲与查找

**User Story:** AS 一名用户, I want 按标题跳转并在文中搜索, so that 长文档也能快速定位。

#### Acceptance Criteria

1. WHEN Active Document 含有至少一个标题, the System SHALL 提供可折叠的标题大纲，节点顺序与文档中标题出现顺序一致。
2. WHEN User 选中大纲中的某一标题, the System SHALL 将 Source Pane 与 Preview Pane 滚动到对应标题。
3. WHEN User 发出查找命令（Ctrl+F）, the System SHALL 在 Source Pane 内查找并高亮匹配；支持区分大小写开关。
4. WHEN 查找无匹配, the System SHALL 提示无结果，保持当前光标位置不变。

### Requirement 13: 打印

**User Story:** AS 一名用户, I want 把当前预览打印或存成 PDF, so that 我可以分享排版后的版本。

#### Acceptance Criteria

1. WHEN User 发出打印命令, the System SHALL 打开系统打印对话框，打印内容以 Preview Pane 的当前渲染结果为准。
2. The System SHALL 允许 User 通过系统打印对话框选择「Microsoft Print to PDF」等系统打印机以导出 PDF。

### Requirement 14: 窗口、外观与快捷键

**User Story:** AS 一名用户, I want 中文界面、跟随系统深浅色、高 DPI 下清晰, so that 这个工具看起来像原生 Windows 应用。

#### Acceptance Criteria

1. The System SHALL 以简体中文显示菜单、对话框、状态栏与错误文案。
2. WHEN 操作系统处于浅色模式, the System SHALL 使用浅色窗口与浅色预览主题；WHEN 操作系统处于深色模式, the System SHALL 使用深色窗口与深色预览主题。
3. The System SHALL 在 Per-Monitor DPI 感知模式下绘制窗口与文字，在 100%、150%、200% 缩放下保持清晰。
4. The System SHALL 在退出时将窗口位置、最大化状态、分栏比例写入用户配置，并在下次启动时恢复；若保存的位置不在当前任一显示器工作区内，则改用主显示器居中。
5. The System SHALL 支持以下快捷键：Ctrl+O 打开、Ctrl+S 保存、Ctrl+Shift+S 另存为、Ctrl+F 查找、Ctrl+W 关闭当前标签、Ctrl+Tab 下一标签、Alt+F4 关闭窗口。
6. The System SHALL 为可键盘操作的控件提供可见焦点环。

### Requirement 15: 安全边界

**User Story:** AS 一名用户, I want 打开别人给的 Markdown 时不被脚本执行, so that 预览文档是安全的。

#### Acceptance Criteria

1. WHEN Document 含有 HTML `<script>`、事件属性（如 `onclick`）或 `javascript:` 链接, the Preview Pane SHALL 以净化后的静态内容展示，脚本与脚本化 URL 均不执行。
2. WHEN 渲染 Diagram Block, the System SHALL 在受限上下文中执行图表引擎，图表源码中的 HTML 按文本处理。
3. The System SHALL 仅允许针对 User 已通过打开/拖放/关联明确指定的路径进行读取，以及针对 User 已确认的保存路径进行写入。
4. IF 保存或打开请求的路径在规范化后包含指向预期根目录之外的 `..` 片段, the System SHALL 拒绝该次文件操作并提示路径非法。
5. The System SHALL 在默认配置下阻止远程脚本与远程样式的加载；Remote Image 按 Requirement 11 处理。

### Requirement 16: 性能与大文件

**User Story:** AS 一名用户, I want 打开较大的 Markdown 时窗口仍能滚动, so that 偶发的大日志文档也不会把应用卡死。

#### Acceptance Criteria

1. WHEN Document 大小不超过 2 MiB, the System SHALL 在 2 秒内完成首次 Source Pane 可见（在已安装于 SSD、Web View Runtime 已就绪的参考机上测量）。
2. WHEN Document 大小超过 2 MiB 且不超过 10 MiB, the System SHALL 使用虚拟化或分片方式展示 Source Pane，使主界面在载入期间仍响应关闭与滚动。
3. IF Document 大小超过 10 MiB, the System SHALL 提示文件过大，并询问 User 是否仍以纯文本只读方式打开；User 取消则关闭该标签。
4. WHILE Preview Pane 正在渲染单个 Diagram Block, the System SHALL 允许 User 滚动 Source Pane 与切换标签。

### Requirement 17: 状态反馈与错误

**User Story:** AS 一名用户, I want 看清楚当前文件、是否未保存、以及失败原因, so that 我不会误关丢失修改。

#### Acceptance Criteria

1. The System SHALL 在状态栏或标题栏显示 Active Document 的完整路径（路径过长时中间省略，悬停显示全文）。
2. The System SHALL 在 Dirty 时于标签与标题栏同时给出未保存指示。
3. IF 打开、保存、渲染公式或渲染图表失败, the System SHALL 用简体中文说明失败类型与对象（文件名或代码块起始行号）。
4. WHEN 发生可恢复错误, the System SHALL 保持已打开的其它标签可用。

### Requirement 18: 发布说明中的体积与依赖

**User Story:** AS 一名用户, I want 安装前知道体积和系统依赖, so that 我不会在精简环境里装完才发现缺组件。

#### Acceptance Criteria

1. The 发布说明 SHALL 列出：压缩安装包实测大小、安装后目录大小、依赖系统 Web View Runtime、最低操作系统版本。
2. The 发布说明 SHALL 写明：未做代码签名时，Windows SmartScreen 可能显示未知发布者提示。
3. The 发布说明 SHALL 写明本版本不包含自动更新。

## Out of Scope（本版本明确不做）

- macOS、Linux 发行版
- 自动更新检查与安装
- 「新建」空白 Markdown / 未命名标签
- 云同步、账号、多用户权限
- 实时协作
- 将 Preview Pane 的所见即所得编辑回写为 Markdown（Typora 式点击段落编辑）
- 自定义 Markdown 扩展插件市场
- 内嵌完整浏览器内核或私有 Web View Runtime
- 对 Windows 7 / Windows 8 的支持
- 为所有用户安装（per-machine）

## Traceability Notes

- 解析器：Source Pane 文本 → GFM AST/HTML；另有公式解析与图表解析。权威数据永远是 Source Pane 字符串。
- 序列化：保存路径只写 Source Pane 原始字符串，避免「解析再打印」导致空白与标记被改写。
- 往返：打开 → 不编辑 → 保存，文件字节级允许仅发生换行符规范化（若实现选择统一 `\n` 或保留原 `\r\n`，须在设计文档中选定并测试）；用户未编辑的正文标记保持不变。
