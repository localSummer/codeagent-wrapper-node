# Change: 实时进度显示功能

## Why

当前用户在使用 codeagent-wrapper 执行任务时，整个执行过程是完全黑盒的：从命令启动到任务完成，终端没有任何输出反馈，用户无法知道任务是否在正常运行、当前处于哪个阶段、预计还需要多久完成。这导致用户在等待过程中产生焦虑，不知道是任务卡死还是正在正常执行，严重影响用户体验。

虽然系统内部已经实现了完整的进度跟踪机制（ProgressStage 枚举和 onProgress 回调），但这些信息从未暴露给用户，造成了"功能已实现但用户不可见"的问题。

## What Changes

- 在 CLI 层添加实时进度输出，显示任务执行的各个阶段
- 实现进度格式化输出函数，包含阶段emoji、描述和耗时
- 添加 `--quiet` 参数支持，允许用户关闭进度输出（向后兼容）
- 为进度输出添加单元测试覆盖
- 更新文档说明新功能和参数

核心改进：
- ⏳ Task started: 任务开始时显示
- 🔍 Analyzing...: 分析/思考阶段实时反馈
- ⚡ Executing tool: 工具调用时显示（含工具名称）
- ✓ Task completed: 任务完成时显示（含总耗时）

## Impact

**Affected specs:**
- **NEW**: progress-display（新增能力 - 进度显示系统）
- **MODIFIED**: cli-interface（修改现有能力 - 添加输出格式化）
- **MODIFIED**: configuration（修改现有能力 - 添加 --quiet 参数）

**Affected code:**
- `src/main.mjs` - 添加 onProgress 回调传递和进度格式化输出
- `src/config.mjs` - 添加 quiet 参数解析
- `src/executor.mjs` - 验证现有进度检测逻辑（无需修改）
- `test/progress-output.test.mjs` - 新建测试文件
- `README.md` - 添加使用示例
- `CLAUDE.md` - 更新开发文档

**向后兼容性:**
- 完全向后兼容
- 默认启用进度显示
- 使用 `--quiet` 可恢复旧行为（无进度输出）

**用户价值:**
- 消除等待焦虑，用户可见任务在执行
- 快速定位问题（如任务卡在某个阶段）
- 提升工具可信度和专业度
- 为未来增强功能奠定基础（如进度条、spinner等）

**技术风险:**
- 低风险 - 核心进度跟踪逻辑已完整实现（50%代码就绪）
- 只需连接层（CLI → Executor）和 UI 层（格式化输出）
- 预计工期：2-3天（7小时工作量）
