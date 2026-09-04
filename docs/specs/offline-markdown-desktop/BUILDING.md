# MarkLite Windows 构建手册

> 针对本机环境（Windows 10/11、Git Bash、scoop、GNU 工具链）整理的可复现构建流程。
> 最后验证通过时间：2026-09-04，产物 `src-tauri/target/release/bundle/nsis/MarkLite_0.1.0_x64-setup.exe`。

## 前置条件

| 项 | 状态 | 备注 |
|---|---|---|
| Node.js >= 18（推荐 22） | ⚠️ | 本机 v24.14.0，**Tauri CLI 的 NAPI 插件在 Node 24 下不兼容**，详见"坑 C" |
| Rust stable GNU 工具链 | ✅ | `stable-x86_64-pc-windows-gnu`，见"坑 A" |
| scoop | ✅ | 用于安装 MinGW 工具链（无需管理员） |
| 国内网络镜像 | ❌ 默认没有 | 见"坑 B" |

> **Node 版本警告**：本机 `node -e "cli.run(...)` 会抛
> `Error: Create threadsafe function in ThreadsafeFunction::create failed (InvalidArg)`。
> 如果将来需要换 Node 版本，用 [fnm](https://github.com/Schniz/fnm) 或 [nvm-windows](https://github.com/coreybutler/nvm-windows)。

## 坑 A：dlltool 缺失

### 症状

```
error: error calling dlltool 'dlltool.exe': program not found
error: could not compile `windows-sys` (lib) due to 1 previous error
```

### 原因

Rust 的 GNU 工具链（`stable-x86_64-pc-windows-gnu`）在编译 `windows-sys` 等 crate 时需要 `dlltool.exe`，
而 rustup 自带的"self-contained"子集缺少汇编器 `as.exe`，导致 `CreateProcess failed`。

### 解决

安装完整 MinGW：

```bash
# 关掉 scoop 的全局代理（本机默认开了 127.0.0.1:7890 但代理没开时会断）
scoop config proxy none
scoop config use_proxy false

# 安装 gcc（自带 dlltool / as / ld）
scoop install gcc

# 构建前加到 PATH（加到 ~/.bashrc 或 ~/.zshrc 里一劳永逸）
export PATH="/c/Users/baozi/scoop/apps/gcc/current/bin:$PATH"
```

> **验证方式**：运行 `dlltool --version` 应输出 `GNU ... 2.xx.x`。

## 坑 B：crates.io 下载慢 + GitHub 超时

### 症状 1：cargo 下载卡死几小时

首次构建或依赖缓存失效时，cargo 直连 crates.io（Fastly CDN 美国节点）在中国大陆非常慢，
半小时只能下 ~80 MB。

### 解决 1：rsproxy.cn 镜像（只影响本项目）

在项目根下创建 `src-tauri/.cargo/config.toml`：

```toml
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

> 恢复直连：删除本文件即可。

### 症状 2：NSIS 打包阶段从 GitHub 下载超时

```
Info Verifying NSIS package
 Downloading https://github.com/tauri-apps/binary-releases/.../nsis-3.11.zip
failed to bundle project: `timeout: global`
```

Tauri CLI 内置约 2 分钟全局超时，GitHub raw release 在中国大陆平均 < 5 KB/s，必定超时。

### 解决 2：预下载 NSIS + nsis_tauri_utils

手动放到 Tauri CLI 的本地缓存目录 `$LOCALAPPDATA/tauri/`，CLI 会直接读取。

```bash
CACHE="$LOCALAPPDATA/tauri"
GH_PROXY="https://ghfast.top/https://github.com"

# 1. 下载两个文件
curl -L "$GH_PROXY/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip" \
  -o "$CACHE/nsis-3.11.zip"
curl -L "$GH_PROXY/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll" \
  -o "$CACHE/nsis_tauri_utils.dll"

# 2. 解压 NSIS（⚠️ 必须用 Windows 自带的 tar，Git Bash 的 tar 不认 zip）
/c/Windows/System32/tar.exe -xf "$CACHE/nsis-3.11.zip"
mv nsis-3.11 "$CACHE/NSIS"

# 3. 放置 NSIS 插件
mkdir -p "$CACHE/NSIS/Plugins/x86-unicode"
cp "$CACHE/nsis_tauri_utils.dll" "$CACHE/NSIS/Plugins/x86-unicode/"

# 4. 验证
ls "$CACHE/NSIS/Bin/makensis.exe"
ls "$CACHE/NSIS/Plugins/x86-unicode/nsis_tauri_utils.dll"
```

> **目录结构**：
> ```
> %LOCALAPPDATA%/tauri/
>   NSIS/Bin/makensis.exe
>   NSIS/Stubs/lzma-x86-unicode
>   NSIS/Include/MUI2.nsh
>   NSIS/Plugins/x86-unicode/nsis_tauri_utils.dll   # 34 KB
>   nsis-3.11.zip                                    # 可删
>   nsis_tauri_utils.dll                             # 可删
> ```

### 常见问题：NSIS 报 "directory is missing some files. Recreating it"

说明上次只放了 `Plugins/` 子目录，顶层 `Bin/` `Stubs/` 没解压。
重新用上面的脚本解压即可。

## 坑 C：Tauri CLI 在 Node 24 下挂掉

### 症状

`npm run tauri build` 静默退出或抛：

```
Error: Create threadsafe function in ThreadsafeFunction::create failed
    at [eval]:1:92
{ code: 'InvalidArg' }
```

### 原因

`@tauri-apps/cli-win32-x64-msvc` 是 NAPI 原生插件，其内部的 Node 版本兼容性检查未覆盖 Node 24，
导致 `ThreadsafeFunction::create` 失败。

### 解决

- 方案 1：用 `fnm` 或 `nvm-windows` 切换回 Node 22。
- 方案 2（当前已采用）：**直接用 cargo 构建 exe，再单独跑 tauri build 只做打包**。
  cargo 编译 exe 的阶段不受 Node 版本影响，只有最后一步 NSIS 打包才调用 Node CLI。
  如果只想快速调试 exe，跳过打包：
  ```bash
  export PATH="/c/Users/baozi/scoop/apps/gcc/current/bin:$PATH"
  cd src-tauri && cargo build --release && cd ..
  # 产物：src-tauri/target/release/marklite.exe
  ```

## 完整构建命令

```bash
# 0. 设置环境变量（加到 ~/.bashrc 里，一劳永逸）
export PATH="/c/Users/baozi/scoop/apps/gcc/current/bin:$PATH"

# 1. 前端构建（很快）
npm run build

# 2. Rust 编译 exe（首次 ~10 分钟，后续增量 ~2 分钟）
cd src-tauri && cargo build --release && cd ..

# 3. NSIS 打包（依赖 nsis-3.11.zip 和 nsis_tauri_utils.dll 已放好缓存）
npm run tauri build
```

产物位置：`src-tauri/target/release/bundle/nsis/MarkLite_0.1.0_x64-setup.exe`

## 只构建 exe（跳过安装包）

如果只想快速调试，不做 NSIS 安装包：

```bash
export PATH="/c/Users/baozi/scoop/apps/gcc/current/bin:$PATH"
cd src-tauri && cargo build --release && cd ..
# 产物：src-tauri/target/release/marklite.exe
```

## 验证

```bash
# 启动并打开样例文件
start "" src-tauri/target/release/marklite.exe samples/kitchen-sink.md
# 或安装版
start "" src-tauri/target/release/bundle/nsis/MarkLite_0.1.0_x64-setup.exe
```

验收要点：
- 编辑区应渲染全文（含表格、任务列表、删除线、行内代码芯片 `OrderBillingService` 等）
- 右侧大纲胶囊（圆点列）悬停展开弹出面板
- 状态栏显示完整路径 / UTF-8 / 字符数

## 已知陷阱速查

| 现象 | 根因 | 修复 |
|---|---|---|
| `dlltool.exe: program not found` | GNU 工具链缺 binutils | `scoop install gcc` + PATH |
| `dlltool: CreateProcess failed` | self-contained dlltool 缺 as.exe | 同上 |
| `timeout: global` on NSIS download | GitHub 慢 + CLI 2 分钟硬限 | 预下载到 `%LOCALAPPDATA%/tauri/` |
| Tauri CLI `InvalidArg` / 静默退出 | Node 24 NAPI 不兼容 | 切回 Node 22（用 fnm/nvm） |
| `tar: This does not look like a tar archive` | Git Bash 的 tar 不认 zip | 改用 `C:\Windows\System32\tar.exe` |
| NSIS 报 "missing some files" | 只放了 Plugins 子目录，顶层 Bin 未解压 | 用 Windows tar 重新解压到正确位置 |
| 安装版报 `WebView2Loader.dll` 找不到 | NSIS 脚本不包含此 DLL（Tauri CLI 的生成脚本遗漏） | 手动修改 `target/release/nsis/<arch>/installer.nsi`，在主 exe 的 `File` 指令后加一行 `File "D:\\Users\\github\\MarkLite\\src-tauri\\target\\release\\WebView2Loader.dll"`，然后直接用 makensis 重跑：`$LOCALAPPDATA/tauri/NSIS/Bin/makensis.exe installer.nsi` |
