# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[MarkLite Rust 编译前置系统依赖]
- Date: 2026-09-03
- Context: Discovered by Agent while setting up the MarkLite Tauri 2 build environment
- Category: Build Methods
- Instructions:
  - Rust `cargo test` / `cargo build` requires these system packages installed first:
    `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`
  - Verify with `pkg-config --modversion glib-2.0` and `pkg-config --modversion webkit2gtk-4.1`

[MarkLite 构建与测试命令]
- Date: 2026-09-03
- Context: Discovered by Agent while verifying the MarkLite project
- Category: Build Methods
- Instructions:
  - 前端测试: `npm test` (vitest, 在 /workspace 根目录)
  - 前端构建: `npm run build` (vite build, 输出到 dist/)
  - Rust 单测: 在 /workspace/src-tauri 目录运行 `cargo test --lib`，首次编译约 12 分钟
  - 前端开发窗口: `npm run tauri dev` (需 WebView2 / WebKit)

[本开发环境 apt 安装与内存约束]
- Date: 2026-09-03
- Context: Discovered by Agent while installing 346MB of system dependencies (598 packages)
- Category: Environment Configuration
- Instructions:
  - 环境总内存约 8GB，空闲常低于 200MB；编译类命令需通过 background_terminal_create 并用 memory_percent 限制
  - apt 大批量安装需在后台终端执行并将输出重定向到日志文件（避免 `| tail` 管道缓冲导致日志为空），timeout 设到 1800000ms（30 分钟）以上
  - 安装完成后用 `dpkg -l <pkg>` 确认 `ii` 状态