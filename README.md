# DSH IDE —— DeepSeek Harness IDE


## 目录结构

```
├── install.ps1              # Windows 一键安装脚本（全局安装用）
├── apply-patches.ps1        # 源码补丁重放脚本——Windows（git pull 后运行）
├── apply-patches.sh          # 源码补丁重放脚本——Linux/macOS
├── cordis.patch.yml         # dsh profile 补丁配置模板（密钥已脱敏）
├── patches/node_modules/    # 官方包构建产物补丁（npm 全局安装模式用）
├── source-patches/          # 源码文件补丁（git clone 源码模式用）
│   ├── .gitignore               # 修改：添加了 desktop 忽略规则
│   ├── pnpm-workspace.yaml      # 修改：添加了 bridge-plugin 工作区
│   ├── pnpm-lock.yaml           # 修改：lock 文件变更
│   ├── _test_regex.js           # 未跟踪：测试文件
│   ├── apps/cli/config/agent-presets/fable5pk/  # 未跟踪：自定义 agent preset
│   └── packages/.../src/        # 源码补丁（5 个文件）
├── plugins/                 # 自研插件源码
│   ├── dsh-host-files/          # 宿主接口 /vscode-files/*（文件系统 + shiki 高亮）
│   ├── dsh-client-idea/         # 客户端三栏 IDE 布局
│   └── dsh-meeting-recorder/    # 会议纪要录音插件（Web Speech API 语音转写 + 结构化纪要）
├── launcher/                # Windows 桌面启动器（vbs + ps1 + 应用图标）
└── tools/                   # github-mcp-server 官方二进制（MCP 用）
```

## 优化清单

### 1. Agent预设："极简Fable5PK版"
内置极简 Agent 预设，开箱即用，适合快速体验与测试。
预设文件位于 `source-patches/apps/cli/config/agent-presets/fable5pk/`。

### 2. 知识库设置（Obsidian 集成）
在设置面板中添加「知识库」标签页，可配置 Obsidian vault 路径。
Agent 通过 `grep` 和 `read` 工具搜索和读取该目录下的 Markdown 文件，
实现类似 Obsidian 的知识库检索能力。
涉及：`dsh-client-ui-settings-knowledge-base`（新插件包）。

### 3. 图片发送桥接（非多模态模型）
**取消非多模态模型的图片发送限制**：放行入站拦截 → 附件落盘（`~/.dsh/attachments/`）→
序列化为含本地路径的文本 → agent 调用视觉 MCP 识图。
涉及：`dsh-host-apiproxy`、`dsh-llm-deepseek`、`dsh-llm-pi-ai`、`dsh-tool-fs`。

### 4. VS Code 式布局（自研插件）
- **三栏 IDE 布局**：左「文件/会话」双 Tab + 中多标签文件查看器 + 右「对话/详情」Tab，可拖宽，窄屏自动收成 rail
- **文件树**：懒加载、隐藏目录折叠、Git 状态角标（M/U/A/D/R）、行内重命名、回收站删除、**右键菜单新建文件/文件夹**、递归搜索、系统原生选目录
- **多标签查看器**：服务端 shiki 语法高亮（根据文件语言自动识别高亮、跟随浅色/深色主题切换色板）、行号、只读查看 + 编辑模式（Ctrl+S 保存、脏标记）、拖拽排序、右键菜单、状态持久化
- **双模式**：全屏对话 / 分栏视图一键切换
- 替换官方 layout 插件（`dsh-web-app/cordis.patch.yml` 指向自研包）

### 5. 会议纪要录音插件（自研插件）
- **浏览器原生语音识别**：使用 Web Speech API（`SpeechRecognition` / `webkitSpeechRecognition`），无需 API Key 或服务器，完全在浏览器端完成语音转写
- **实时转录到输入框**：点击麦克风按钮开始录音，语音实时转写为文字显示在聊天输入框，支持中文/英文自动识别
- **结构化会议纪要面板**：浮动面板显示讨论要点、决定事项、待办事项、最近对话，支持按类型分类和计数
- **AI 纪要结构化**：注册 `add_meeting_content` 工具，AI 可自动识别讨论要点、决定、待办事项并写入结构化的会议纪要
- **会议模式系统提示词**：开启会议模式后，AI 自动进入会议纪要记录角色，主动识别和结构化对话内容
- **格式化导出**：一键生成 Markdown 格式的完整会议纪要，支持复制到剪贴板，可粘贴到输入框发送给 AI 整理
- 涉及：`dsh-meeting-recorder`（新插件包）

### 6. 对话体验补丁
- 工具详情 / 思考内容限高 480px 内部滚动（`dsh-client-ui-tool`、`dsh-client-ui-conversation`）
- 斜杠命令汉化：`/compact` `/goal` `/feedback` `/plan` `/permission` `/export`
- 原生文件夹对话框强制置顶（`dsh-host-directory-picker-native`）
- 计划模式退出弹窗选项与权限预设说明

### 7. 设置面板管理
- 全局人设（所有会话生效，类似 Claude Code 的 CLAUDE.md）
- Skill 开关/删除、MCP 开关/删除/添加（动态挂载，即时生效）
- 全局人设编辑（右栏「⚙ 人设」）

### 8. 桌面启动器 + 应用图标
Edge `--app` 独立窗口（自动探测端口、未运行则隐藏拉起 `dsh web`、首次自动建桌面快捷方式），
应用图标部署进 web 前端 dist（`dsh-web-frontend` 的 favicon + manifest）。

### 9. 社区插件市场（dsh-market）
集成 [dsh-market](https://github.com/dsh-market/dsh-market) 社区插件市场，
在 Settings → Plugin Market 中可浏览、搜索、一键安装 1550+ 社区插件。
支持主题管理、热禁用/启用、备份恢复、更新检查等。
安装方式：`dsh plugin --profile web add dshmarket`（或 `pnpm dsh plugin --profile web add dshmarket`）。
服务端 shiki 固定深色色板会导致浅色主题下代码/文档文字过淡。
`/vscode-files/highlight` 支持 `?theme=dark|light` 出对应色板，客户端监听主题切换自动重取。

## 部署方式

### 方式 A：npm 全局安装（`dsh` 命令）

前置：`npm i -g @deepseek-ai/dsh`。本方案在 **Windows** 上开发验证。

**一键安装（Windows，推荐）：**

下载 ZIP 解压后，右键 `install.ps1` → **使用 PowerShell 运行**
（或 `powershell -ExecutionPolicy Bypass -File install.ps1`）。
脚本自动完成：装插件 → 打补丁 → 装启动器 → 装工具 → 写配置 → 安装 dsh-market。

**手动安装：**

1. **安装插件**：把 `plugins/` 下三个包复制到对应位置：
   - `dsh-host-files`、`dsh-client-idea` → `~/.dsh/profiles/node_modules/@anoslide/`
   - `dsh-meeting-recorder` → `~/.dsh/profiles/web/node_modules/`
2. **打补丁**：把 `patches/node_modules/@deepseek-ai/` 覆盖到全局 dsh 安装的对应路径
   （路径：`$(npm config get prefix)\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`）
3. **装启动器**：把 `launcher/` 复制到 `~/.dsh/launcher/`（可选，桌面快捷方式指向 `启动 dsh IDE.vbs`）
4. **装工具**：把 `tools/` 复制到 `~/.dsh/tools/`（可选，github-mcp-server）
5. **配置**：复制 `cordis.patch.yml` 到 `~/.dsh/profiles/web/`，按「配置与数据位置」填入自己的密钥
6. **启动**：`dsh web` 后用浏览器打开；或双击桌面「启动 dsh IDE」
7. **安装 dsh-market**（可选）：`dsh plugin --profile web add dshmarket`，重启后 Settings → Plugin Market 可用

> Windows 提示：`~/.dsh/profiles/node_modules/@deepseek-ai/*` 是指向全局安装的 junction——
> 改官方包文件直接改全局路径即可，两处同时生效。
> 若已有 `cordis.patch.yml`，手动合并 `vscode-host-files` 和 `vscode-client-layout` 段即可；MCP 通过设置面板「MCP 管理」添加。

### 方式 B：git clone 源码模式（`pnpm dsh web`）

**前置条件：** Node.js ^22.19\|\|>=24、pnpm、Git、DeepSeek API Key

**首次部署：**

```bash
# 1. 克隆官方仓库并安装依赖
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install

# 2. 获取 dsh-idea（git clone 或 U盘复制）
# 假设放在同级目录

# 3. 应用源码补丁
cd ../dsh-idea
.\apply-patches.ps1 -HarnessPath ..\deepseek-harness   # Windows
# 或 bash apply-patches.sh ../deepseek-harness          # macOS/Linux

# 4. 安装自研插件
mkdir -p ~/.dsh/profiles/node_modules/@anoslide
cp -r plugins/dsh-host-files ~/.dsh/profiles/node_modules/@anoslide/
cp -r plugins/dsh-client-idea ~/.dsh/profiles/node_modules/@anoslide/
mkdir -p ~/.dsh/profiles/web/node_modules
cp -r plugins/dsh-meeting-recorder ~/.dsh/profiles/web/node_modules/

# 5. 配置 API 密钥（创建 ~/.dsh/profiles/web/cordis.patch.yml，模板见下方）
# 6. 安装 dsh-market（社区插件市场）
pnpm dsh plugin --profile web add dshmarket
# 7. 启动
cd ../deepseek-harness
pnpm dsh web
```

> 注意：`node_modules` 中的 `@deepseek-ai/dsh-*` 包是 workspace link，修改 `packages/` 下的源码即时生效，无需额外构建。

**配置模板（`~/.dsh/profiles/web/cordis.patch.yml`）：**

```yaml
- insert:
    - id: vscode-host-files
      name: '@anoslide/dsh-host-files'
- insert:
    - id: vscode-client-layout
      name: '@anoslide/dsh-client-idea'
      config:
        deepseekApiKey: "sk-你的API密钥"
        # 其他配置项...
- insert:
    - id: dsh-meeting-recorder
      name: dsh-meeting-recorder
      config: {}
```

## 配置与数据位置

| 内容 | 位置 | 说明 |
|---|---|---|
| profile 补丁配置 | ~/.dsh/profiles/web/cordis.patch.yml | 复制仓库模板，只挂载自研插件，无密钥 |
| MCP server | ~/.dsh/mcp-servers.json | 设置面板「MCP 管理」添加/开关/删除 |
| 全局人设 | ~/.dsh/global-persona.md | 设置面板「全局人设」编辑 |
| 全局 Skill | ~/.dsh/skills | 设置面板「Skill 管理」开关/删除 |

> 仓库内所有配置文件均为脱敏模板，真实密钥只存在于本机 `~/.dsh`。

## 维护：升级重放

### 方案 A：npm 全局安装

`npm update -g @deepseek-ai/dsh` 会覆盖全部官方包补丁，重放方法：

1. 把 `patches/node_modules/@deepseek-ai/` 覆盖回全局安装对应路径
2. **不要动** 本地 `~/.dsh/profiles/web/cordis.patch.yml`（含你的真实密钥；仓库模板已脱敏）
3. 重启 dsh

### 方案 B：git clone 源码模式

```bash
# 1. 拉取最新 dsh 源码
cd deepseek-harness
git checkout main
git pull

# 2. 重放补丁
cd ../dsh-idea
.\apply-patches.ps1                                       # Windows
# 或 bash apply-patches.sh ../deepseek-harness             # macOS/Linux

# 3. 启动
cd ../deepseek-harness
pnpm dsh web
```

**添加新补丁：**

1. 修改 `deepseek-harness` 中对应的源码文件（`.ts`）
2. 复制到 `dsh-idea/source-patches/` 的相同路径
3. 提交到 dsh-idea 仓库

**原理：**

- `dsh` 命令在根 `package.json` 中配置为 `node --import tsx/esm apps/cli/src/bin.ts`，即从 **源码** 通过 `tsx` 加载器运行
- `source-patches/` 存放的是完整的源码文件（不是 diff），`apply-patches.ps1` 直接覆盖到 `deepseek-harness` 对应路径
- 由于是完整文件覆盖，即使上游文件结构发生变化，也不会产生 git 冲突——补丁文件会强制覆盖
- 如果上游 API 或数据结构发生变化导致补丁失效，需要手动更新 `source-patches/` 中的对应文件

**避免误提交：**

```bash
# 在 deepseek-harness 目录下执行（只需一次），让 git 忽略这些文件的变更
git update-index --assume-unchanged packages/host/apiproxy/src/api-proxy.ts
git update-index --assume-unchanged packages/llm/llm-pi-ai/src/context.ts
git update-index --assume-unchanged packages/llm/llm-pi-ai/src/adapter.ts
git update-index --assume-unchanged packages/llm/llm-deepseek/src/serialize.ts
git update-index --assume-unchanged packages/fs/tool-fs/src/read-image.ts

# 日后想查看上游差异时
git update-index --no-assume-unchanged packages/host/apiproxy/src/api-proxy.ts
```

## 跨平台注意事项

| 组件 | Windows | macOS / Linux |
|------|---------|---------------|
| 补丁脚本 | `apply-patches.ps1` | `apply-patches.sh` |
| 桌面启动器 | `launcher/`（VBS + PS1） | 不支持（需要自己配） |
| 安装脚本 | `install.ps1`（全局安装用） | 不支持 |
| 路径分隔符 | `\` | `/` |

## 说明

- **密钥约定**：仓库内配置为脱敏模板，真实密钥只存在于本机 `~/.dsh`；请勿把密钥提交到任何仓库
- 本方案在 Windows 上开发验证；macOS/Linux 需调整路径与 junction 相关说明
- 基于 DeepSeek Harness 二次开发，仅供学习交流