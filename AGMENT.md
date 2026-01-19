# AGMENT.md - codeagent-wrapper-node 项目指南

## 1. 项目概览

**项目名称**: codeagent-wrapper-node  
**项目目的**: Node.js 版 `codeagent-wrapper`，作为 AI CLI 后端的统一封装层（Codex/Claude/Gemini/Opencode），提供一致的命令行接口、会话恢复、并行任务和 Agent 配置能力。  
**核心功能**:
- **统一接口**: 使用相同的 CLI 参数调用不同 AI CLI 后端。  
- **Agent 配置**: 支持 `--agent` 读取 `~/.codeagent/models.json` 里的预设。  
- **并行执行**: `--parallel` 读取任务清单并并发调度。  
- **会话恢复**: `resume <session_id>` 延续上下文。  
- **初始化**: `init` 将 codeagent skill 安装到 `~/.claude/skills/`。  
**技术栈**:
- **运行环境**: Node.js >= 18.0.0  
- **模块规范**: ESM（`.mjs`）  
- **依赖管理**: 运行时零依赖（仅 Node.js 标准库）  

## 2. 目录结构说明

```
/
├── bin/
│   └── codeagent-wrapper.mjs    # CLI 入口
├── src/
│   ├── main.mjs                 # CLI 编排与分支入口（init/parallel/单任务）
│   ├── config.mjs               # CLI/环境变量解析、并行任务解析
│   ├── backend.mjs              # Codex/Claude/Gemini/Opencode 后端定义
│   ├── executor.mjs             # 任务执行与子进程管理
│   ├── agent-config.mjs         # 读取 ~/.codeagent/models.json
│   ├── parser.mjs               # 解析后端 JSON 流输出
│   ├── logger.mjs               # 异步日志与清理
│   ├── init.mjs                 # 安装 codeagent skill 到 ~/.claude/skills/
│   ├── filter.mjs               # 输出内容过滤
│   ├── signal.mjs               # SIGINT/SIGTERM 处理
│   ├── process-check.mjs        # 进程相关工具
│   ├── wrapper-name.mjs         # 包装器名称工具
│   └── utils.mjs                # 通用工具函数
├── templates/
│   └── skills/                  # codeagent skill 模板
└── test/                        # Node.js 原生测试
```

## 3. 关键流程

### 3.1 启动流程
1. **入口**: `bin/codeagent-wrapper.mjs` → `src/main.mjs`。  
2. **通用准备**: 读取版本、预加载 Agent 配置、解析 CLI + 环境变量。  
3. **分支**:
   - **init**: 复制模板到 `~/.claude/skills/codeagent`。  
   - **cleanup**: 清理旧日志。  
   - **parallel**: `parseParallelConfigStream()` 解析 stdin，`runParallel()` 并发执行。  
   - **single/resume**: 校验配置 → 选择后端 → `runTask()`。  
4. **执行细节**:
   - `runTask()` 启动后端子进程（codex/claude/gemini/opencode）。  
   - `parseJSONStream()` 解析后端流式 JSON 输出。  
   - `filterOutput()`/`sanitizeOutput()` 做输出清洗。  
5. **输出**: 生成最终结果与退出码。  

### 3.2 核心依赖
- **外部 CLI**: 运行依赖已安装的 AI CLI（`codex`/`claude`/`gemini`/`opencode`），本项目只做调度与封装。  

## 4. 开发与测试指引

### 4.1 环境准备
- Node.js >= 18  
- 本机已安装至少一个 AI CLI 后端  

### 4.2 安装与运行
```bash
# 安装（无运行时依赖）
npm install

# 链接到全局
npm link

# 运行
node bin/codeagent-wrapper.mjs --help
```

### 4.3 测试
项目使用 Node.js 原生测试运行器。
```bash
# 运行所有测试
npm test

# 运行单个测试文件
node --test test/config.test.mjs
```

## 5. 重要约定

- **运行时零依赖**: 仅使用 Node.js 标准库。  
- **ESM 规范**: 全部为 `.mjs` 模块。  
- **退出码**: 0 成功，1 通用错误，2 配置错误，124 超时，127 命令不存在，130 中断。  
- **并行任务格式**: 以 `---TASK---`/`---CONTENT---` 划分，支持 `dependencies`。  
- **环境变量**: `CODEX_TIMEOUT`、`CODEAGENT_SKIP_PERMISSIONS`、`CODEAGENT_MAX_PARALLEL_WORKERS`、`CODEAGENT_ASCII_MODE`、`CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS`。  
