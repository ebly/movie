// Starts the local source tree. Does not install Go or download third-party binaries.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(process.env.PANSOU_DIR || path.join(root, "pansou-main"));
const mainFile = path.join(directory, "main.go");
if (!fs.existsSync(mainFile)) {
  console.error(`未找到 PanSou 源码：${mainFile}；请设置 PANSOU_DIR。`);
  process.exit(1);
}
const main = fs.readFileSync(mainFile, "utf8");
// Only active blank imports, not commented-out imports. Blank ENABLED_PLUGINS remains blank intentionally.
const imported = [...main.matchAll(/^\s*_\s+"pansou\/plugin\/([^"/]+)"/gm)].map((match) => match[1]);
const plugins = process.env.ENABLED_PLUGINS ?? imported.join(",");
const port = process.env.PANSOU_PORT || "8888";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("PANSOU_PORT 必须是 1–65535。"); process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ directory, port, compiledPlugins: imported.length, enabledPlugins: plugins.split(",").filter(Boolean), goRequired: "1.25.0+" }, null, 2));
  process.exit(0);
}
const executable = process.env.PANSOU_EXECUTABLE || process.env.GO_BIN || "go";
const args = process.env.PANSOU_EXECUTABLE ? [] : ["run", "."];
console.log(`启动 PanSou，端口 ${port}，配置 ${plugins.split(",").filter(Boolean).length} 个插件；不代表所有来源均可用。`);
console.log("PanSou 源码默认监听所有网卡；请用防火墙限制本机访问，公网部署必须启用认证和 HTTPS。");
const child = spawn(executable, args, { cwd: directory, stdio: "inherit", shell: false,
  env: { ...process.env, PORT: port, ENABLED_PLUGINS: plugins, ASYNC_PLUGIN_ENABLED: process.env.ASYNC_PLUGIN_ENABLED || "true" } });
child.on("error", (err) => {
  console.error(err.code === "ENOENT"
    ? "找不到 Go 或 PanSou 可执行程序。请安装 Go 1.25+，或设置 GO_BIN / PANSOU_EXECUTABLE 为其完整路径。"
    : `PanSou 启动失败：${err.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
