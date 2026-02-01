# codeagent-wrapper (Rust)

[English](README.md) | [简体中文](README.zh-CN.md)

高性能的 AI CLI 后端封装工具（支持 Claude、Codex、Gemini、Opencode）。

## 特性

- 🚀 **极速启动**：冷启动 ~6ms（Node.js 版本 ~80ms）- **快 13 倍**
- 📦 **零依赖**：单个二进制文件（~2.1MB），无需运行时
- 💾 **低内存占用**：~3MB（Node.js 版本 ~35MB）- **降低 12 倍**
- 🔌 **多后端支持**：Claude、Codex、Gemini、Opencode
- ⚡ **并行执行**：基于 DAG 的任务编排
- 🔄 **会话恢复**：继续之前的对话
- 🌍 **跨平台**：macOS、Linux、Windows

## 安装

### 预编译二进制文件（推荐）

下载适合您平台的最新版本：

```bash
# macOS (Apple Silicon)
curl -L https://github.com/localSummer/codeagent-wrapper-node/releases/latest/download/codeagent-aarch64-apple-darwin -o codeagent-wrapper
chmod +x codeagent-wrapper
sudo mv codeagent-wrapper /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/localSummer/codeagent-wrapper-node/releases/latest/download/codeagent-x86_64-apple-darwin -o codeagent-wrapper
chmod +x codeagent-wrapper
sudo mv codeagent-wrapper /usr/local/bin/

# Linux (x86_64)
curl -L https://github.com/localSummer/codeagent-wrapper-node/releases/latest/download/codeagent-x86_64-unknown-linux-gnu -o codeagent-wrapper
chmod +x codeagent-wrapper
sudo mv codeagent-wrapper /usr/local/bin/

# Linux (ARM64)
curl -L https://github.com/localSummer/codeagent-wrapper-node/releases/latest/download/codeagent-aarch64-unknown-linux-gnu -o codeagent-wrapper
chmod +x codeagent-wrapper
sudo mv codeagent-wrapper /usr/local/bin/
```

### Homebrew (macOS/Linux)

```bash
brew tap localSummer/codeagent
brew install codeagent-wrapper
```

### Cargo（从源码安装）

```bash
cd codeagent-wrapper-rs
cargo install --path .
```

### 从 crates.io 安装

```bash
cargo install codeagent-wrapper
```

## 使用方法

### 基本用法

```bash
# 使用自动检测的后端运行任务
codeagent-wrapper "修复 main.rs 中的 bug"

# 指定后端
codeagent-wrapper --backend claude "实现功能 X"

# 指定模型
codeagent-wrapper --backend codex --model gpt-4 "优化这个函数"
```

### 恢复会话

```bash
codeagent-wrapper resume abc123 "继续实现"
```

### 并行执行

```bash
cat tasks.txt | codeagent-wrapper --parallel
```

### 安装 skill

```bash
codeagent-wrapper init
```

### 清理旧日志

```bash
codeagent-wrapper --cleanup
```

## 配置

### 环境变量

| 变量                         | 描述               |
| ---------------------------- | ------------------ |
| `CODEAGENT_BACKEND`          | 默认后端           |
| `CODEAGENT_MODEL`            | 默认模型           |
| `CODEX_TIMEOUT`              | 任务超时时间（秒） |
| `CODEAGENT_SKIP_PERMISSIONS` | 跳过权限检查       |
| `CODEAGENT_QUIET`            | 抑制进度输出       |
| `CODEAGENT_DEBUG`            | 启用调试日志       |

### 配置文件

- `~/.codeagent/agents.yaml` - Agent 预设
- `~/.codeagent/models.yaml` - 模型配置

## 性能

测试环境：Apple M1 Pro, macOS 14.0

| 指标                | Node.js   | Rust          | 提升           |
| ------------------- | --------- | ------------- | -------------- |
| 冷启动              | ~80ms     | **6ms**       | **快 13 倍**   |
| JSON 解析 (1K 事件) | ~23ms     | **1.03ms**    | **快 22 倍**   |
| JSON 吞吐量         | ~10 MiB/s | **100 MiB/s** | **快 10 倍**   |
| 内存占用            | ~35MB     | **~3MB**      | **降低 12 倍** |
| 二进制大小          | N/A       | **2.1MB**     | 单文件         |

### 基准测试详情

```
JSON 解析性能:
- parse_1000_events: 1.0260ms (974.66 Kelem/s)
- parse_10k_events:  9.7982ms (100.14 MiB/s)
```

## 从 Node.js 版本迁移

### 直接替换

Rust 版本可以直接替换 Node.js 版本：

```bash
# 之前 (Node.js)
npx codeagent-wrapper "你的任务"

# 之后 (Rust)
codeagent-wrapper "你的任务"
```

### 兼容性

- ✅ 所有 CLI 标志和选项
- ✅ 配置文件格式（agents.yaml, models.yaml）
- ✅ 环境变量
- ✅ 会话恢复功能
- ✅ 并行执行
- ✅ 所有后端（Claude、Codex、Gemini、Opencode）

### 破坏性变更

无。Rust 版本保持完全的 API 兼容性。

## 开发

### 构建

```bash
cargo build --release
```

### 运行测试

```bash
cargo test
```

### 运行基准测试

```bash
cargo bench
```

### 格式化代码

```bash
cargo fmt
```

### 代码检查

```bash
cargo clippy -- -D warnings
```

## 代码质量

本项目保持严格的代码质量标准：

- ✅ 零 Clippy 警告（`-D warnings` 标志）
- ✅ 使用 `rustfmt` 保持一致的格式
- ✅ 全面的测试覆盖（33 个测试）
- ✅ 预留 API 使用 `#![allow(dead_code)]` 注释文档化

## 贡献

1. Fork 本仓库
2. 创建您的特性分支（`git checkout -b feature/amazing-feature`）
3. 确保代码质量：
   ```bash
   cargo fmt
   cargo clippy -- -D warnings
   cargo test
   ```
4. 提交您的更改（`git commit -m 'feat: add amazing feature'`）
5. 推送到分支（`git push origin feature/amazing-feature`）
6. 开启 Pull Request

## 许可证

MIT
