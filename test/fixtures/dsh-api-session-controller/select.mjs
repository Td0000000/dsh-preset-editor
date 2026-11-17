// 测试夹具：目录名故意包含 dsh-api-session-controller，
// 让被测插件在调用栈里看到“这次预设选择来自宿主 sessionController.create()”，
// 用于模拟 New Session 复用 blank 会话时的重置行为。
export async function callAsSessionCreate(operation) {
  return await operation();
}
