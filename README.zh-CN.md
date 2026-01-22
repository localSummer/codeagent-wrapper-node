# codeagent-wrapper

[[English](README.md) | 中文]

一个统一的 CLI 包装器，实现跨 AI 编码后端（Codex、Claude、Gemini、Opencode）的**多模型协作**。

> **核心价值**：让不同的 AI 模型协同工作 - Claude 负责推理，Codex 负责实现，Gemini 负责 UI。一个命令，多个后端，无缝协作。

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/anthropics/codeagent-wrapper-node.git
cd codeagent-wrapper-node && npm link

# 2. 确保至少安装了一个后端（例如 codex）
npm install -g @openai/codex

# 3. 运行你的第一个任务
codeagent-wrapper --backend codex "列出当前目录下的文件"

# 4. 尝试多模型协作
codeagent-wrapper --agent oracle "分析这个代码库"      # 使用 Claude
codeagent-wrapper --agent develop "实现这个功能"       # 使用 Codex
```

## 为什么选择 codeagent-wrapper？

| 挑战 | 解决方案 |
|------|---------|
| 每个 AI 工具的 CLI 语法不同 | **统一的命令接口** |
| 无法轻松切换模型 | **`--backend` 标志或 `--agent` 预设** |
| 无法跨模型并行执行 | **基于 DAG 的并行任务执行** |
| 会话间上下文丢失 | **使用 `resume <session_id>` 恢复会话** |

**多模型协作示例**：

```bash
# Claude 分析，Codex 实现，Claude 审查
codeagent-wrapper --backend claude "分析认证模块设计"
codeagent-wrapper --backend codex "基于分析结果实现 OAuth"
codeagent-wrapper --backend claude "审查实现代码"
```

## 安装

```bash
# 克隆并链接
git clone https://github.com/anthropics/codeagent-wrapper-node.git
cd codeagent-wrapper-node
npm link

# 或直接运行而不安装
node bin/codeagent-wrapper.mjs <task>

# 安装 Claude Code skill（可选）
codeagent-wrapper init
```

## 系统要求

- Node.js >= 18.0.0
- 至少安装一个 AI CLI 后端：

| 后端 | 安装命令 | 文档 |
|------|---------|------|
| `codex` | `npm install -g @openai/codex` | [OpenAI Codex CLI](https://github.com/openai/codex) |
| `claude` | `npm install -g @anthropic-ai/claude-code` | [Anthropic Claude Code](https://github.com/anthropics/claude-code) |
| `gemini` | `npm install -g @google/gemini-cli` | [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) |
| `opencode` | `npm install -g opencode` | [Opencode CLI](https://github.com/sst/opencode) |

## 使用方法

### 基本用法

```bash
# 使用默认后端（opencode）运行任务
codeagent-wrapper "修复 auth.js 中的 bug"

# 指定工作目录
codeagent-wrapper "添加测试" ./src

# 使用特定后端
codeagent-wrapper --backend claude "审查这段代码"

# 使用特定模型
codeagent-wrapper --backend claude --model claude-3-opus "复杂任务"
```

### Agent 配置

针对常见用例的预配置 agent：

```bash
# 使用预定义的 agent 配置
codeagent-wrapper --agent oracle "分析这个代码库"
codeagent-wrapper --agent develop "实现新功能"
```

| Agent | 后端 | 模型 | 最适用于 |
|-------|------|------|---------|
| `oracle` | Claude | claude-opus-4-5 | 复杂分析、架构设计 |
| `librarian` | Claude | claude-sonnet-4-5 | 文档编写、代码解释 |
| `explore` | Opencode | grok-code | 代码库探索 |
| `develop` | Codex | (默认) | 代码实现、重构 |
| `frontend-ui-ux-engineer` | Gemini | (默认) | UI/UX 设计、原型设计 |
| `document-writer` | Gemini | (默认) | 技术文档编写 |

### 会话恢复

每次执行都会输出一个 `SESSION_ID`。使用它来继续对话：

```bash
# 首次运行 - 记下输出中的 SESSION_ID
codeagent-wrapper --backend codex "开始实现认证功能"
# 输出：SESSION_ID: 019a7247-ac9d-71f3-89e2-a823dbd8fd14

# 稍后恢复会话
codeagent-wrapper resume 019a7247-ac9d-71f3-89e2-a823dbd8fd14 "从上次中断的地方继续"
```

### 标准输入

```bash
# 从标准输入读取任务（使用 `-` 作为任务占位符）
echo "构建项目" | codeagent-wrapper -

# 指定工作目录（- 表示标准输入，./workdir 是工作目录）
echo "运行测试" | codeagent-wrapper - ./workdir

# 通过 heredoc 输入多行任务
codeagent-wrapper - <<'EOF'
重构认证模块：
1. 提取公共逻辑
2. 添加错误处理
3. 编写单元测试
EOF
```

### 并行执行

使用依赖管理并发运行多个任务：

```bash
# 从文件并行运行任务
codeagent-wrapper --parallel < tasks.txt

# 或直接通过管道
codeagent-wrapper --parallel <<'EOF'
---TASK---
id: analyze
backend: claude
---CONTENT---
分析代码库结构

---TASK---
id: implement
backend: codex
dependencies: analyze
---CONTENT---
基于分析结果实现
EOF

# 完整输出模式（用于调试）
codeagent-wrapper --parallel --full-output < tasks.txt
```

#### 并行任务格式

```
---TASK---
id: <unique_id>           # 必需：唯一任务标识符
workdir: /path/to/dir     # 可选：工作目录（默认：cwd）
backend: codex            # 可选：覆盖后端
model: gpt-4              # 可选：覆盖模型
agent: oracle             # 可选：使用 agent 配置
dependencies: id1, id2    # 可选：逗号分隔的依赖任务 ID
skip_permissions: true    # 可选：跳过权限检查（true/false）
session_id: abc123        # 可选：从现有会话恢复
---CONTENT---
<任务内容>
```

#### 任务字段参考

| 字段 | 必需 | 默认值 | 描述 |
|------|------|-------|------|
| `id` | 是 | - | 唯一任务标识符 |
| `workdir` | 否 | cwd | 任务的工作目录 |
| `backend` | 否 | (全局) | 后端：codex、claude、gemini、opencode |
| `model` | 否 | (全局) | 使用的模型 |
| `agent` | 否 | - | Agent 配置名称 |
| `dependencies` | 否 | - | 逗号分隔的等待任务 ID |
| `skip_permissions` | 否 | false | 跳过权限检查（true/false）|
| `session_id` | 否 | - | 从现有会话恢复 |

### 进度显示

默认情况下，`codeagent-wrapper` 会实时显示任务执行进度，展示不同的阶段：

```bash
# 正常执行会在 stderr 显示进度
codeagent-wrapper "分析代码库"
# 输出（在 stderr）：
# ⏳ Task main started
# 🔍 Analyzing...
# ⚡ Executing tool: read_file
# ⚡ Executing tool: grep_search
# ✓ Task completed (15.2s)
```

**进度阶段**：
- ⏳ **开始**：任务开始
- 🔍 **分析**：AI 正在思考/推理
- ⚡ **执行**：运行工具（显示工具名称）
- ✓ **完成**：任务完成（显示耗时）

**隐藏进度**：

```bash
# 使用 --quiet 参数
codeagent-wrapper --quiet "分析代码"

# 或设置环境变量
CODEAGENT_QUIET=1 codeagent-wrapper "分析代码"

# 在脚本中过滤 stderr
codeagent-wrapper "分析代码" 2>/dev/null
```

**ASCII 模式**（适用于不支持 emoji 的终端）：

```bash
CODEAGENT_ASCII_MODE=1 codeagent-wrapper "分析代码"
# 输出：
# [START] Task main started
# [THINK] Analyzing...
# [EXEC] Executing tool: read_file
# [DONE] Task completed (15.2s)
```

**注意**：进度消息输出到 `stderr`，而最终结果输出到 `stdout`。这允许管道传输结果而不包含进度信息：

```bash
# 进度在终端可见，但不会被管道捕获
codeagent-wrapper "获取统计信息" | jq .
```

### 其他命令

```bash
# 显示帮助
codeagent-wrapper --help

# 显示版本
codeagent-wrapper --version

# 清理旧日志文件（>7 天）
codeagent-wrapper --cleanup

# 安装 codeagent skill 到 ~/.claude/skills/
codeagent-wrapper init
codeagent-wrapper init --force  # 无需确认直接覆盖
```

## 选项

| 选项 | 描述 |
|------|------|
| `--backend <name>` | 使用的后端：`codex`、`claude`、`gemini`、`opencode` |
| `--model <model>` | 使用的模型（特定于后端）|
| `--agent <name>` | Agent 配置名称（见 Agent 配置）|
| `--prompt-file <path>` | 自定义提示文件路径 |
| `--reasoning-effort <level>` | 推理努力级别（特定于模型）|
| `--skip-permissions` | 跳过权限检查（YOLO 模式）|
| `--yolo` | `--skip-permissions` 的别名 |
| `--parallel` | 并行任务模式 |
| `--full-output` | 并行模式下显示完整输出 |
| `--quiet` | 隐藏进度输出（无实时进度消息）|
| `--timeout <seconds>` | 超时时间（秒）（默认：7200 = 2 小时）|
| `--cleanup` | 清理旧日志文件 |
| `--force` | 强制覆盖无需确认（用于 `init`）|
| `--help`, `-h` | 显示帮助 |
| `--version`, `-v` | 显示版本 |

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `CODEX_TIMEOUT` | 超时值。**如果 >10000，视为毫秒；否则为秒** | 7200（秒）|
| `CODEAGENT_SKIP_PERMISSIONS` | 设置为**任何非空值**时跳过权限 | (未设置) |
| `CODEAGENT_MAX_PARALLEL_WORKERS` | 最大并行 worker 数。0 = 无限制 | min(100, cpuCount*4) |
| `CODEAGENT_QUIET` | 设置为 `1` 时隐藏进度输出 | (未设置) |
| `CODEAGENT_ASCII_MODE` | 设置后使用 ASCII 符号而非 Unicode | (未设置) |
| `CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS` | 日志关闭超时（毫秒）| 5000 |

## 自定义 Agent 配置

运行 `codeagent-wrapper init` 在 `~/.codeagent/models.json` 创建默认配置。

或手动创建：

```json
{
  "defaultBackend": "opencode",
  "defaultModel": "opencode/grok-code",
  "agents": {
    "my-agent": {
      "backend": "claude",
      "model": "claude-3-opus",
      "promptFile": "~/.claude/prompts/my-agent.md",
      "reasoningEffort": "high"
    }
  }
}
```

### Agent 配置字段

| 字段 | 描述 |
|------|------|
| `backend` | 使用的后端 |
| `model` | 模型名称 |
| `promptFile` | 提示文件路径（支持 `~` 展开）|
| `reasoningEffort` | 推理级别 |

### 提示文件格式

提示文件是包含系统指令的纯文本或 Markdown 文件：

```markdown
# ~/.claude/prompts/my-agent.md

你是一位专精 TypeScript 的高级软件工程师。

## 指导原则
- 遵循 SOLID 原则
- 编写全面的测试
- 使用有意义的变量名
```

## 日志和调试

### 日志位置

所有执行日志存储在：

```
~/.codeagent/logs/
```

### 查看日志

```bash
# 列出最近的日志
ls -lt ~/.codeagent/logs/ | head -10

# 查看特定日志
cat ~/.codeagent/logs/codeagent-<timestamp>.log

# 实时跟踪日志（执行期间）
tail -f ~/.codeagent/logs/codeagent-*.log
```

### 后端输出调试

如果需要查看后端的原始 stderr 输出以进行调试：

```bash
# 显示后端 stderr 输出（带 [BACKEND] 前缀）
codeagent-wrapper --backend-output "你的任务"

# 启用调试模式（自动启用后端输出）
codeagent-wrapper --debug "你的任务"

# 使用环境变量
export CODEAGENT_BACKEND_OUTPUT=1
export CODEAGENT_DEBUG=1
codeagent-wrapper "你的任务"
```

**注意**：
- `--backend-output` 会转发后端进程的 stderr 到你的终端
- `--debug` 模式会自动启用 `--backend-output`
- 输出会添加 `[BACKEND]` 前缀以区分
- 如果终端支持 TTY，会保留 ANSI 颜色代码
- 这在排查后端问题时非常有用

### 清理

```bash
# 删除 7 天前的日志
codeagent-wrapper --cleanup
```

### 故障排查

| 问题 | 解决方案 |
|------|---------|
| "Command not found: codex" | 安装后端：`npm install -g @openai/codex` |
| "Unknown agent: xyz" | 检查 `~/.codeagent/models.json` 中的可用 agent |
| 任务挂起 | 检查 `CODEX_TIMEOUT` 环境变量；默认为 2 小时 |
| 权限错误 | 使用 `--skip-permissions` 或设置 `CODEAGENT_SKIP_PERMISSIONS=1` |

## 退出码

| 代码 | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 配置错误 |
| 124 | 超时 |
| 127 | 命令未找到（后端未安装）|
| 130 | 中断（SIGINT/SIGTERM）|

## 性能

codeagent-wrapper 经过优化，执行速度快：

- **JSON 解析**：吞吐量 >60,000 events/sec
- **智能缓冲**：优先级刷新，减少内存占用
- **启动跟踪**：提供详细的性能指标

**启用性能指标**：

```bash
# 输出结构化性能数据
CODEAGENT_PERFORMANCE_METRICS=1 codeagent-wrapper "task" 2>&1 | grep metric

# 示例输出：
# {"metric":"task_execution","startup_ms":45.23,"total_ms":2345.67,"backend":"claude"}
```

**性能调优选项**：

```bash
# 调整日志刷新间隔（默认：200ms）
export CODEAGENT_LOGGER_FLUSH_INTERVAL_MS=100

# 调整日志队列大小（默认：100 条）
export CODEAGENT_LOGGER_QUEUE_SIZE=50
```

详细的性能指南和基准测试请参阅 [docs/PERFORMANCE.md](docs/PERFORMANCE.md)。

## 架构

```
bin/
  codeagent-wrapper.mjs  # CLI 入口点
src/
  main.mjs               # 主编排逻辑
  config.mjs             # 配置解析
  executor.mjs           # 任务执行引擎
  backend.mjs            # 后端实现（Codex、Claude、Gemini、Opencode）
  parser.mjs             # 自动检测的 JSON 流解析
  logger.mjs             # 带缓冲写入的异步日志
  utils.mjs              # 工具函数
  filter.mjs             # 输出过滤
  agent-config.mjs       # Agent 配置管理
  signal.mjs             # 信号处理
  process-check.mjs      # 进程工具
  init.mjs               # Skill 安装
templates/
  skills/codeagent/      # Claude Code skill 模板
```

## 开发

```bash
# 运行测试
npm test

# 运行特定测试文件
node --test test/config.test.mjs

# 直接运行 CLI
node bin/codeagent-wrapper.mjs "测试任务"
```

## 从 Go 版本迁移

这是 Go `codeagent-wrapper` 到 Node.js 的完整移植，具有：

- 相同的 CLI 接口
- 相同的退出码
- 相同的环境变量
- 相同的配置文件格式
- 相同的并行任务格式

主要区别：
- 使用 ESM 模块（`.mjs`）
- 无外部依赖（仅使用 Node.js 内置模块）
- 使用 async/await 而非 goroutines
- 功能增加 & bug 修复
- Skill 优化

## 许可证

MIT
