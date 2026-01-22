# Implementation Tasks

## 1. CLI层集成进度回调
- [x] 1.1 在 `src/main.mjs` 中实现 `formatProgress(stage, taskId, elapsed)` 函数
- [x] 1.2 创建阶段emoji映射对象（started→⏳, analyzing→🔍, executing→⚡, completed→✓）
- [x] 1.3 实现耗时格式化函数（显示秒数，保留1位小数）
- [x] 1.4 在 `runTask()` 调用时传递 `onProgress` 回调函数
- [x] 1.5 确保在 `--quiet` 模式下不输出进度信息

## 2. 配置参数支持
- [x] 2.1 在 `src/config.mjs` 中添加 `quiet` 参数定义
- [x] 2.2 添加命令行参数解析：`--quiet` 或 `-q`
- [x] 2.3 添加环境变量支持：`CODEAGENT_QUIET`
- [x] 2.4 在配置对象中传递 quiet 标志

## 3. 进度输出UI增强
- [x] 3.1 实现 ANSI 彩色输出（绿色表示成功，黄色表示进行中）
- [x] 3.2 添加任务ID显示（支持多任务场景识别）
- [x] 3.3 实现执行阶段的具体信息显示（如工具名称）
- [x] 3.4 确保输出格式在不同终端环境下的兼容性

## 4. 单元测试
- [x] 4.1 创建 `test/progress-output.test.mjs` 测试文件
- [x] 4.2 测试 `formatProgress()` 函数各个阶段的输出格式
- [x] 4.3 测试 `--quiet` 模式下无进度输出
- [x] 4.4 测试多任务模式下的进度显示（任务ID区分）
- [x] 4.5 测试 onProgress 回调的正确调用
- [x] 4.6 测试耗时统计的准确性

## 5. 集成验证
- [x] 5.1 使用 codex backend 测试实时进度显示
- [x] 5.2 使用 claude backend 测试实时进度显示
- [x] 5.3 使用 gemini backend 测试实时进度显示
- [x] 5.4 使用 opencode backend 测试实时进度显示
- [x] 5.5 测试不同复杂度任务的进度显示
- [x] 5.6 验证向后兼容性（不传 onProgress 时不报错）

## 6. 文档更新
- [x] 6.1 更新 `README.md` 添加实时进度显示示例
- [x] 6.2 更新 `README.md` 说明 `--quiet` 参数用法
- [x] 6.3 更新 `CLAUDE.md` 记录新增功能和代码位置
- [x] 6.4 创建或更新 `CHANGELOG.md` 记录此功能变更
- [x] 6.5 更新帮助文档（`--help` 输出）说明 --quiet 参数

## 7. 性能验证
- [x] 7.1 测量进度输出对执行性能的影响（应该 < 5ms 每次）
- [x] 7.2 验证 quiet 模式下无性能开销
- [x] 7.3 确认 console.log 不阻塞主流程

## Estimated Time
- 总工时：约7小时
- 预计工期：2-3天（业余时间）

## Definition of Done
- ✅ 所有测试用例通过
- ✅ 四个后端（codex/claude/gemini/opencode）均验证成功
- ✅ 文档更新完整
- ✅ 向后兼容性验证通过
- ✅ 用户执行任务时可以看到清晰的实时进度
