import { execFile } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

/** 插件名（loader 条目用）。 */
const name = "dsh-host-files";
/** 依赖服务。 */
const inject = ["webServer"];
/** 单文件读取上限（超出则截断并标记）。 */
const MAX_READ_BYTES = 2 * 1024 * 1024;
/** 单文件写入上限。 */
const MAX_WRITE_BYTES = 10 * 1024 * 1024;
/** 服务端高亮处理上限。 */
const MAX_HIGHLIGHT_BYTES = 1024 * 1024;
/** 搜索递归深度/条目/结果上限。 */
const SEARCH_DEPTH_LIMIT = 8;
const SEARCH_ENTRY_LIMIT = 20000;
const SEARCH_RESULT_LIMIT = 200;
/** 默认折叠的目录名。 */
const COLLAPSED_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "dist", ".next", ".dsh"]);
/** 全局人设文件（~/.dsh/global-persona.md，注入所有会话的 systemPrompt）。 */
const PERSONA_FILE = join(homedir(), ".dsh", "global-persona.md");
const MAX_PERSONA_BYTES = 128 * 1024;
/** 全局人设的 prompt 段名与排序（紧随官方 persona order 0 之后）。 */
const PERSONA_SECTION = "user:global-persona";
const PERSONA_ORDER = 1;
/** 知识库设置文件（~/.dsh/settings/knowledge-base.json）。 */
const KB_SETTINGS_FILE = join(homedir(), ".dsh", "settings", "knowledge-base.json");
/** 知识库 vault 路径的 prompt 段名与排序。 */
const KB_SECTION = "system:knowledge-base";
const KB_ORDER = 5;
/** MCP server 运行时管理（~/.dsh/mcp-servers.json，动态挂载 dsh-mcp-client）。 */
const MCP_STATE_FILE = join(homedir(), ".dsh", "mcp-servers.json");
/** 全局 skill 目录（~/.dsh/skills）。 */
const SKILLS_ROOT = join(homedir(), ".dsh", "skills");
// ── 空闲自动关闭：所有页面心跳停止后关闭服务器 ──
/** 心跳 TTL（毫秒）：超过该时长无心跳视为页面已关闭。需大于浏览器后台标签节流上限（约 60s）。 */
const HEARTBEAT_TTL_MS = 120000;
/** 检查间隔（毫秒）。 */
const HEARTBEAT_CHECK_MS = 10000;
/** 全部页面离线后的确认延迟（毫秒），期间有新心跳则取消关闭。 */
const SHUTDOWN_CONFIRM_MS = 5000;
const heartbeats = new Map(); // sid -> 最近心跳时间戳
let heartbeatSeen = false; // 是否收到过心跳（从未收到则永不自动关闭，避免误杀无插件页面）
let shutdownTimer = null;
let shuttingDown = false;
/** 关闭服务器：先卸载我们挂载的 MCP（杀 stdio 子进程），再退出进程。 */
async function shutdownServer() {
	if (shuttingDown) return;
	shuttingDown = true;
	try {
		for (const id of [...mcpDisposers.keys()]) {
			const dispose = mcpDisposers.get(id);
			mcpDisposers.delete(id);
			try {
				await dispose();
			} catch {}
		}
	} catch {}
	// 兜底：稍等（让 MCP 卸载完成/其他子进程收到 stdin EOF）后退出
	setTimeout(() => process.exit(0), 1500);
}

function sendJson(res, code, value) {
	const body = JSON.stringify(value);
	res.writeHead(code, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(body);
}

function isHiddenName(name) {
	return name.startsWith(".") || COLLAPSED_DIRS.has(name);
}

/** 判断内容是否像二进制（NUL 字节比例过高）。 */
function looksBinary(text) {
	const n = text.length;
	if (n === 0) return false;
	let nul = 0;
	for (let i = 0; i < Math.min(n, 8192); i++) if (text.charCodeAt(i) === 0) nul++;
	return nul / Math.min(n, 8192) > 0.01;
}

/** 读取 JSON 请求体（带大小上限）。 */
function readJsonBody(req, cap) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > cap) {
				reject(new Error("request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(new Error("invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

/** 跑 git status --porcelain，返回 相对路径 → 状态码 映射。 */
function gitStatusOf(root) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=normal"], {
			timeout: 8000,
			maxBuffer: 8 * 1024 * 1024,
			windowsHide: true
		}, (error, stdout) => {
			if (error) {
				resolve({ ok: false, notRepo: true, error: "not a git repository" });
				return;
			}
			const statuses = {};
			for (const line of stdout.split(/\r?\n/)) {
				if (line.length < 4) continue;
				const code = line.slice(0, 2).trim();
				let path = line.slice(3).trim();
				if (code === "R") {
					const arrow = path.indexOf(" -> ");
					if (arrow !== -1) path = path.slice(arrow + 4).trim();
				}
				if (path.length === 0) continue;
				if (!(path in statuses)) statuses[path] = code === "R" ? "R" : code;
			}
			resolve({ ok: true, statuses });
		});
	});
}

/** 获取文件 diff（支持 staged/unstaged）。 */
function gitDiffOf(root, file, staged) {
	return new Promise((resolve) => {
		const args = ["-C", root, "diff"];
		if (staged) args.push("--cached");
		args.push("--", file);
		execFile("git", args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, diff: stdout });
		});
	});
}

/** 获取提交历史。 */
function gitLogOf(root, maxCount) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "log", "--max-count=" + (maxCount || 50), "--format=%H|%ai|%an|%s", "--no-color"], {
			timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
		}, (error, stdout) => {
			if (error) return resolve({ ok: false, notRepo: true, error: error.message });
			const commits = [];
			for (const line of stdout.split(/\r?\n/)) {
				if (line.length === 0) continue;
				const parts = line.split("|");
				commits.push({ hash: parts[0] || "", date: parts[1] || "", author: parts[2] || "", message: parts.slice(3).join("|") || "" });
			}
			resolve({ ok: true, commits });
		});
	});
}

/** 提交图谱数据：带 parent 哈希和 refs（分支/标签）。 */
function gitGraphData(root, maxCount) {
	return new Promise((resolve) => {
		Promise.all([
			new Promise((r) => execFile("git", ["-C", root, "log", "--max-count=" + (maxCount || 50), "--format=%H||%P||%ai||%an||%s||%D", "--no-color", "--topo-order"], {
				timeout: 10000, maxBuffer: 16 * 1024 * 1024, windowsHide: true
			}, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "branch", "--format=%(HEAD)%00%(refname:short)%00%(objectname)"], {
				timeout: 5000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
			}, (e, o) => r(e ? "" : o))),
		]).then(([logOut, branchOut]) => {
			if (!logOut) return resolve({ ok: false, error: "not a git repository" });
			// 解析分支
			const branchMap = {}; // sha -> [{kind, name, head}]
			for (const line of branchOut.split(/\r?\n/)) {
				if (!line) continue;
				const parts = line.split("\0");
				if (parts.length < 3) continue;
				const isHead = parts[0] === "*";
				const name = parts[1] || "";
				const sha = parts[2] || "";
				if (!sha) continue;
				if (!branchMap[sha]) branchMap[sha] = [];
				branchMap[sha].push({ kind: "branch", name, head: isHead });
			}
			// 解析提交
			const commits = [];
			for (const line of logOut.split(/\r?\n/)) {
				if (!line) continue;
				const parts = line.split("||");
				const hash = parts[0] || "";
				const parents = parts[1] ? parts[1].trim().split(/\s+/) : [];
				const date = parts[2] || "";
				const author = parts[3] || "";
				const subject = parts[4] || "";
				const refStr = parts[5] || "";
				// 解析 refs
				const refs = [];
				if (refStr) {
					for (const ref of refStr.split(", ")) {
						const t = ref.trim();
						if (!t) continue;
						if (t.startsWith("tag: ")) refs.push({ kind: "tag", name: t.slice(5) });
						else refs.push({ kind: "branch", name: t });
					}
				}
				// 合并分支映射中的 refs
				if (branchMap[hash]) {
					for (const b of branchMap[hash]) {
						if (!refs.some((r) => r.name === b.name)) refs.push(b);
					}
				}
				commits.push({ hash, parents: parents.filter(Boolean), date, author, subject, refs });
			}
			resolve({ ok: true, commits });
		});
	});
}

/** 暂存文件。 */
function gitStageFiles(root, files) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "add", "--", ...files], { timeout: 15000, windowsHide: true }, (error) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true });
		});
	});
}

/** 取消暂存。 */
function gitUnstageFiles(root, files) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "restore", "--staged", "--", ...files], { timeout: 15000, windowsHide: true }, (error) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true });
		});
	});
}

/** 提交暂存区。 */
function gitCommit(root, message) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "commit", "-m", message], { timeout: 15000, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, output: stdout });
		});
	});
}

/** 还原文件（工作区）。 */
function gitRestoreFile(root, files) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "restore", "--", ...files], { timeout: 15000, windowsHide: true }, (error) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true });
		});
	});
}

/** 发现子仓库：扫描目录树找 .git。 */
function gitDiscoverRepos(root) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "rev-parse", "--show-toplevel"], { timeout: 5000, windowsHide: true }, (error, stdout) => {
			if (error) {
				discoverReposIn(root, 0, (repos) => resolve(repos));
				return;
			}
			const top = stdout.trim().replace(/\\/g, "/");
			discoverReposIn(root, 0, (repos) => {
				const set = new Set([top, ...repos]);
				resolve([...set]);
			});
		});
	});
}
async function discoverReposIn(dir, depth, callback) {
	const repos = [];
	if (depth > 5) return callback(repos);
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return callback(repos);
	}
	let pending = 0;
	function checkDone() {
		if (pending === 0) callback(repos);
	}
	for (const entry of entries) {
		if (entry.name === ".git" && entry.isDirectory()) {
			repos.push(dir.replace(/\\/g, "/"));
			continue;
		}
		if (entry.isDirectory() && !isHiddenName(entry.name)) {
			pending++;
			const full = join(dir, entry.name);
			discoverReposIn(full, depth + 1, (sub) => {
				repos.push(...sub);
				pending--;
				checkDone();
			});
		}
	}
	checkDone();
}

/** 列出 worktrees。 */
function gitWorktrees(root) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "worktree", "list", "--porcelain"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			const worktrees = [];
			let current = {};
			for (const line of stdout.split(/\r?\n/)) {
				if (line.startsWith("worktree ")) {
					if (current.path) worktrees.push(current);
					current = { path: line.slice(9).trim().replace(/\\/g, "/") };
				} else if (line.startsWith("HEAD ")) {
					current.head = line.slice(5).trim();
				} else if (line.startsWith("branch ")) {
					current.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
				} else if (line.startsWith("bare")) {
					current.bare = true;
				} else if (line.length === 0 && current.path) {
					worktrees.push(current);
					current = {};
				}
			}
			if (current.path) worktrees.push(current);
			resolve({ ok: true, worktrees });
		});
	});
}

/** 列出分支。 */
function gitBranches(root) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "branch", "--all", "--format=%(refname:short)||%(upstream:short)||%(HEAD)"], {
			timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
		}, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			const branches = [];
			for (const line of stdout.split(/\r?\n/)) {
				if (line.length === 0) continue;
				const parts = line.split("||");
				branches.push({ name: parts[0] || "", upstream: parts[1] || "", isHead: parts[2] === "*" });
			}
			resolve({ ok: true, branches });
		});
	});
}

/** 获取 Git 版本。 */
function gitVersion() {
	return new Promise((resolve) => {
		execFile("git", ["--version"], { timeout: 5000, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, version: stdout.trim() });
		});
	});
}

/** 解析 `git status --porcelain=v1 -z` 输出。 */
function parsePorcelainZ(buf) {
	const records = [];
	const parts = buf.split("\0");
	for (let i = 0; i < parts.length; i++) {
		const rec = parts[i];
		if (!rec || rec.length < 3) continue;
		const x = rec[0];
		const y = rec[1];
		const path = rec.slice(3);
		if ((x === "R" || x === "C") && i + 1 < parts.length && parts[i + 1]) {
			records.push({ x, y, path, oldPath: parts[i + 1] });
			i++;
			continue;
		}
		records.push({ x, y, path });
	}
	return records;
}

/** 解析 `git diff --numstat -z` 输出。 */
function parseNumstatZ(buf) {
	const map = {};
	const parts = buf.split("\0");
	for (let i = 0; i < parts.length; i++) {
		const rec = parts[i];
		if (!rec) continue;
		const fields = rec.split("\t");
		if (fields.length < 2) continue;
		const added = fields[0];
		const deleted = fields[1];
		let key;
		if (fields.length >= 3) {
			key = fields[2];
		} else {
			const old = i + 1 < parts.length ? parts[i + 1] : "";
			const next = i + 2 < parts.length ? parts[i + 2] : "";
			key = next || old;
			i += 2;
		}
		if (key) map[key] = { added, deleted };
	}
	return map;
}

/** VSCode 式工作区状态：已暂存/未暂存/未跟踪，每文件 +/- 行数。 */
function gitWorkStatus(root) {
	return new Promise((resolve) => {
		Promise.all([
			new Promise((r) => execFile("git", ["-C", root, "status", "--porcelain=v1", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "diff", "--cached", "--numstat", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "diff", "--numstat", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 5000, windowsHide: true }, (e, o) => r(e ? "" : o.trim())))
		]).then(([statusOut, stagedNum, unstagedNum, branch]) => {
			if (!statusOut) return resolve({ ok: false, notRepo: true, error: "not a git repository" });
			const stagedCounts = parseNumstatZ(stagedNum);
			const unstagedCounts = parseNumstatZ(unstagedNum);
			const staged = [];
			const unstaged = [];
			const untracked = [];
			const num = (m, path) => {
				const n = m[path];
				return n ? { added: n.added === "-" ? null : parseInt(n.added, 10) || 0, deleted: n.deleted === "-" ? null : parseInt(n.deleted, 10) || 0, binary: n.added === "-" } : { added: 0, deleted: 0, binary: false };
			};
			for (const r of parsePorcelainZ(statusOut)) {
				if (r.x === "?" && r.y === "?") { untracked.push({ path: r.path, code: "??" }); continue; }
				if (r.x !== " " && r.x !== "?") staged.push({ path: r.path, oldPath: r.oldPath || "", code: r.x, ...num(stagedCounts, r.path) });
				if (r.y !== " " && r.y !== "?") unstaged.push({ path: r.path, oldPath: r.oldPath || "", code: r.y, ...num(unstagedCounts, r.path) });
			}
			resolve({ ok: true, branch, staged, unstaged, untracked, counts: { staged: staged.length, unstaged: unstaged.length, untracked: untracked.length } });
		});
	});
}

/** 获取工作区文件 diff（或未跟踪文件内容）。 */
function gitWorkFile(root, file, mode) {
	return new Promise((resolve) => {
		if (mode === "untracked") {
			const full = join(root, file);
			stat(full).then((st) => {
				if (!st.isFile()) return resolve({ ok: true, isDir: true });
				readFile(full, "utf8").then((content) => {
					if (content.includes("\0")) return resolve({ ok: true, binary: true });
					resolve({ ok: true, content: content.slice(0, 240000), truncated: content.length > 240000 });
				}).catch((e) => resolve({ ok: false, error: e.message }));
			}).catch(() => resolve({ ok: false, error: "file not found" }));
			return;
		}
		const args = mode === "staged" ? ["-C", root, "diff", "--cached", "--no-color", "--", file] : ["-C", root, "diff", "--no-color", "--", file];
		execFile("git", args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, diff: stdout, truncated: stdout.length > 240000 });
		});
	});
}

/** 获取提交详情。 */
function gitShowCommit(root, hash) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "log", "-1", "--format=%H||%P||%an||%ae||%aI||%s||%b", hash], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			const parts = stdout.trim().split("||");
			const sha = parts[0] || hash;
			const parents = (parts[1] || "").trim();
			resolve({ ok: true, hash: sha, parents: parents ? parents.split(" ") : [], author: parts[2] || "", email: parts[3] || "", date: parts[4] || "", subject: parts[5] || "", body: parts.slice(6).join("||").trim() });
		});
	});
}

/** 获取提交 diff（完整 patch）。 */
function gitCommitDiff(root, hash) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "show", "--no-color", "--format=", hash], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, diff: stdout, truncated: stdout.length > 240000 });
		});
	});
}

/** 获取文件历史。 */
function gitFileLog(root, file) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "log", "--follow", "--topo-order", "--date=iso-strict", "--format=%H|%ai|%an|%s", "--", file], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			const commits = [];
			for (const line of stdout.split(/\r?\n/)) {
				if (line.length === 0) continue;
				const parts = line.split("|");
				commits.push({ hash: parts[0] || "", date: parts[1] || "", author: parts[2] || "", message: parts.slice(3).join("|") || "" });
			}
			resolve({ ok: true, commits });
		});
	});
}

/** 智能提交信息建议（基于 diff 自动生成）。 */
function gitSuggestMsg(root) {
	return new Promise((resolve) => {
		Promise.all([
			new Promise((r) => execFile("git", ["-C", root, "diff", "--cached", "--numstat", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "diff", "--numstat", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o))),
			new Promise((r) => execFile("git", ["-C", root, "status", "--porcelain=v1", "-z"], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (e, o) => r(e ? "" : o)))
		]).then(([stagedNum, unstagedNum, statusOut]) => {
			if (!statusOut) return resolve({ ok: false, error: "not a git repository" });
			const stagedCounts = parseNumstatZ(stagedNum);
			const unstagedCounts = parseNumstatZ(unstagedNum);
			const untracked = [];
			const staged = [];
			const unstaged = [];
			for (const r of parsePorcelainZ(statusOut)) {
				if (r.x === "?" && r.y === "?") { untracked.push(r.path); continue; }
				if (r.x !== " " && r.x !== "?") staged.push(r.path);
				if (r.y !== " " && r.y !== "?") unstaged.push(r.path);
			}
			const files = [...staged, ...unstaged, ...untracked];
			let ins = 0, del = 0;
			for (const m of [stagedCounts, unstagedCounts]) {
				for (const path of Object.keys(m)) {
					const v = m[path];
					ins += v.added === "-" ? 0 : parseInt(v.added, 10) || 0;
					del += v.deleted === "-" ? 0 : parseInt(v.deleted, 10) || 0;
				}
			}
			const name = (p) => p.split("/").pop();
			const uniq = [...new Set(files)];
			const candidates = [];
			if (untracked.length && !staged.length && !unstaged.length) {
				candidates.push("feat: 新增 " + uniq.map(name).slice(0, 3).join("、") + (uniq.length > 3 ? " 等" : ""));
			} else if (del >= ins && del > 0) {
				candidates.push("fix: 移除/精简 " + uniq.map(name).slice(0, 3).join("、") + (uniq.length > 3 ? " 等" : ""));
			} else if (uniq.length) {
				candidates.push("feat: 更新 " + uniq.map(name).slice(0, 3).join("、") + (uniq.length > 3 ? " 等" : ""));
			}
			if (uniq.length) {
				candidates.push("chore: 调整 " + uniq.map(name).slice(0, 5).join("、") + (uniq.length > 5 ? " 等 " + uniq.length + " 个文件" : "") + "（+" + ins + " -" + del + "）");
			}
			if (!uniq.length) candidates.push("chore: 清理/整理");
			resolve({ ok: true, candidates: candidates.slice(0, 3), summary: { staged: staged.length, unstaged: unstaged.length, untracked: untracked.length, insertions: ins, deletions: del }, files: uniq });
		});
	});
}

/** 拉取远程变更。 */
function gitFetch(root) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "fetch", "--all", "--prune"], { timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, output: stdout.trim() });
		});
	});
}

/** 推送到远程。 */
function gitPush(root, branch) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "push", "origin", branch || "HEAD"], { timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, output: stdout.trim() });
		});
	});
}

/** 切换分支。 */
function gitCheckout(root, branch) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, "checkout", branch], { timeout: 30000, windowsHide: true }, (error) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true });
		});
	});
}

function gitExec(root, args) {
	return new Promise((resolve) => {
		execFile("git", ["-C", root, ...args], { timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
			if (error) return resolve({ ok: false, error: error.message });
			resolve({ ok: true, output: stdout.trim() });
		});
	});
}

/** 递归搜索文件名（跳过隐藏目录，带深度/条目/结果上限）。 */
async function searchDir(root, q) {
	const needle = q.toLowerCase();
	const out = [];
	const budget = { used: 0 };
	async function walk(dir, depth) {
		if (depth > SEARCH_DEPTH_LIMIT || budget.used >= SEARCH_ENTRY_LIMIT || out.length >= SEARCH_RESULT_LIMIT) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (out.length >= SEARCH_RESULT_LIMIT || budget.used >= SEARCH_ENTRY_LIMIT) return;
			if (isHiddenName(entry.name)) continue;
			budget.used += 1;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) await walk(full, depth + 1);
			else if (entry.name.toLowerCase().includes(needle)) {
				out.push({ name: entry.name, path: full, rel: full.slice(root.length + 1).replace(/\\/g, "/") });
			}
		}
	}
	await walk(root, 0);
	return out;
}

/** 送回收站删除（可恢复；目录递归）。 */
function recycleBinDelete(target, isDir) {
	return new Promise((resolve, reject) => {
		const script = isDir
			? 'Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:DSH_DELETE_PATH, "OnlyErrorDialogs", "SendToRecycleBin")'
			: 'Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:DSH_DELETE_PATH, "OnlyErrorDialogs", "SendToRecycleBin")';
		execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
			env: { ...process.env, DSH_DELETE_PATH: target },
			timeout: 60000,
			windowsHide: true
		}, (error) => {
			if (error) reject(new Error(`recycle-bin delete failed: ${error.message}`));
			else resolve();
		});
	});
}

/** 名称合法性：单段、非空、不含路径分隔符。 */
function validSegment(s) {
	return typeof s === "string" && s.length > 0 && s.length <= 120 && !/[\\/]/.test(s) && s !== "." && s !== "..";
}

// ── 服务端 shiki 高亮（通用解析：先按插件自身依赖链，退回全局 dsh 安装）──
let shikiPromise = null;
function resolveShikiEntry() {
	try {
		return createRequire(import.meta.url).resolve("shiki");
	} catch {}
	// 退回：全局 npm 安装（Windows 默认 %APPDATA%\npm\node_modules）
	const globalRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules") : null;
	if (globalRoot) {
		const dshBin = join(globalRoot, "@deepseek-ai", "dsh", "lib", "bin.js");
		if (existsSync(dshBin)) {
			try {
				return createRequire(dshBin).resolve("shiki");
			} catch {}
		}
	}
	throw new Error("无法定位 shiki：请确认全局安装了 @deepseek-ai/dsh");
}
function loadShiki() {
	if (shikiPromise === null) {
		shikiPromise = (async () => {
			const entry = resolveShikiEntry();
			return import(pathToFileURL(entry).href);
		})();
	}
	return shikiPromise;
}
/** 从全局 dsh 安装解析任意包入口（同 shiki 的通用回退，兼容 ESM）。 */
function resolveDshModule(name) {
	try {
		return createRequire(import.meta.url).resolve(name);
	} catch {}
	const globalRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules") : null;
	if (globalRoot) {
		const dshBin = join(globalRoot, "@deepseek-ai", "dsh", "lib", "bin.js");
		if (existsSync(dshBin)) {
			try {
				return createRequire(dshBin).resolve(name);
			} catch {}
		}
	}
	throw new Error(`无法定位 ${name}：请确认全局安装了 @deepseek-ai/dsh`);
}

// ── MCP server 运行时管理（动态挂载/卸载 dsh-mcp-client 实例，即时生效）──
let rootCtx = null;
let mcpClientModulePromise = null;
let mcpServers = [];
let mcpDisposers = new Map(); // id → disposer
function loadMCPClientModule() {
	if (mcpClientModulePromise === null) {
		mcpClientModulePromise = (async () => {
			const entry = resolveDshModule("@deepseek-ai/dsh-mcp-client");
			return import(pathToFileURL(entry).href);
		})();
	}
	return mcpClientModulePromise;
}
async function loadMCPState() {
	try {
		const raw = JSON.parse(await readFile(MCP_STATE_FILE, "utf8"));
		mcpServers = Array.isArray(raw?.servers) ? raw.servers : [];
	} catch {
		mcpServers = [];
	}
}
async function saveMCPState() {
	await mkdir(dirname(MCP_STATE_FILE), { recursive: true });
	await writeFile(MCP_STATE_FILE, JSON.stringify({ version: 1, servers: mcpServers }, null, 2), "utf8");
}
function mcpConfigOf(server) {
	const base = {
		serverName: server.serverName,
		toolCallTimeoutMs: server.toolCallTimeoutMs ?? 30000,
		failOnStartupError: false,
		reconnect: { enabled: false }
	};
	if (server.transport === "streamable-http") {
		return { ...base, transport: "streamable-http", url: server.url, headers: server.headers ?? {} };
	}
	return { ...base, transport: "stdio", command: server.command, args: server.args ?? [], env: server.env ?? {}, cwd: server.cwd ?? "" };
}
async function mountMCPServer(server) {
	try {
		const mod = await loadMCPClientModule();
		if (rootCtx === null) throw new Error("host plugin 尚未初始化");
		const dispose = await rootCtx.plugin(mod, mcpConfigOf(server));
		mcpDisposers.set(server.id, dispose);
	} catch (error) {
		console.error(`[dsh-host-files] MCP 挂载失败 ${server.serverName}:`, error instanceof Error ? error.message : String(error));
	}
}
async function unmountMCP(id) {
	const dispose = mcpDisposers.get(id);
	if (dispose !== void 0) {
		mcpDisposers.delete(id);
		try {
			await dispose();
		} catch {}
	}
}
function mcpPublicView(server) {
	return {
		id: server.id,
		serverName: server.serverName,
		transport: server.transport,
		command: server.command,
		args: server.args,
		url: server.url,
		enabled: server.enabled !== false,
		hasEnv: !!(server.env && Object.keys(server.env).length > 0),
		desc: server.desc ?? ""
	};
}

// ── Skill 管理（~/.dsh/skills；开关 = SKILL.md ↔ SKILL.md.disabled 改名，删除走回收站）──
async function listSkills() {
	const out = [];
	let entries = [];
	try {
		entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(SKILLS_ROOT, entry.name);
		if (entry.isDirectory()) {
			if (existsSync(join(full, "SKILL.md"))) out.push({ name: entry.name, path: full, enabled: true, kind: "dir" });
			else if (existsSync(join(full, "SKILL.md.disabled"))) out.push({ name: entry.name, path: full, enabled: false, kind: "dir" });
		} else if (entry.isFile()) {
			if (entry.name.endsWith(".md")) out.push({ name: entry.name, path: full, enabled: true, kind: "file" });
			else if (entry.name.endsWith(".md.disabled")) out.push({ name: entry.name.slice(0, -".disabled".length), path: full, enabled: false, kind: "file" });
		}
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}
async function toggleSkill(target) {
	const info = await stat(target);
	if (info.isDirectory()) {
		const on = join(target, "SKILL.md");
		const off = join(target, "SKILL.md.disabled");
		if (existsSync(on)) await rename(on, off);
		else if (existsSync(off)) await rename(off, on);
	} else {
		if (target.endsWith(".disabled")) await rename(target, target.slice(0, -".disabled".length));
		else await rename(target, target + ".disabled");
	}
}
const LANG_BY_EXT = {
	js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript", cjs: "javascript",
	html: "html", htm: "html", xml: "xml", svg: "xml", vue: "vue",
	css: "css", scss: "scss", less: "less", json: "json", jsonc: "jsonc",
	yml: "yaml", yaml: "yaml", md: "markdown", py: "python",
	sh: "shellscript", bash: "shellscript", zsh: "shellscript", go: "go", rs: "rust",
	java: "java", c: "c", h: "c", cpp: "cpp", hpp: "cpp", sql: "sql", toml: "toml", ini: "ini"
};
function shikiLangOf(path) {
	return LANG_BY_EXT[extname(path).slice(1).toLowerCase()] ?? "text";
}

/**
 * 浏览器端文件树/查看器的宿主接口。
 * GET  /vscode-files/list?path=<绝对路径> → { ok, path, dirs, files }
 * GET  /vscode-files/read?path=<绝对路径> → { ok, kind, content, size }
 * GET  /vscode-files/git?path=<仓库根>  → { ok, statuses } 或 { ok:false, notRepo:true }
 * GET  /vscode-files/search?path=<根>&q=<关键词> → { ok, results: [{name, path, rel}] }
 * GET  /vscode-files/highlight?path=<绝对路径>&theme=<dark|light> → { ok, html }（服务端 shiki，默认 github-dark）
 * POST /vscode-files/write?path=<绝对路径> body { path, content } → { ok, size }
 * POST /vscode-files/mkdir  body { path: 父目录, name } → { ok, path }
 * POST /vscode-files/mkfile body { path: 父目录, name } → { ok, path }
 * POST /vscode-files/rename body { path, newName } → { ok, path }
 * POST /vscode-files/delete body { path } → { ok }（送回收站，可恢复）
 * GET  /vscode-files/persona → { ok, content }（全局人设，~/.dsh/global-persona.md）
 * POST /vscode-files/persona body { content } → { ok }（保存全局人设）
 */
function apply(ctx) {
	// 全局人设：注入所有会话的 systemPrompt（text 为函数，每次组装时读文件，改后即时生效）
	ctx.inject(["systemPrompt"], (promptCtx) => {
		promptCtx.systemPrompt.section({
			name: PERSONA_SECTION,
			order: PERSONA_ORDER,
			text: () => {
				try {
					return readFileSync(PERSONA_FILE, "utf8").slice(0, MAX_PERSONA_BYTES);
				} catch {
					return "";
				}
			}
		});
	});
	// 知识库 vault 路径：注入系统提示（text 为函数，每次组装时读设置文件，改后即时生效）
	ctx.inject(["systemPrompt"], (promptCtx) => {
		promptCtx.systemPrompt.section({
			name: KB_SECTION,
			order: KB_ORDER,
			text: () => {
				try {
					const raw = readFileSync(KB_SETTINGS_FILE, "utf8");
					const settings = JSON.parse(raw);
					const vaultPath = settings.vaultPath;
					if (typeof vaultPath !== "string" || vaultPath.length === 0) return "";
					return `## 知识库\n\n你的知识库位于 \`${vaultPath}\`。你可以使用 \`grep\` 工具搜索该目录下的文件，使用 \`read\` 工具读取文件内容。\n`;
				} catch {
					return "";
				}
			}
		});
	});
	rootCtx = ctx;
	// 空闲自动关闭监控：心跳全部过期 → 确认后关闭服务器
	ctx.effect(() => {
		const timer = setInterval(() => {
			const now = Date.now();
			for (const [sid, ts] of heartbeats) {
				if (now - ts > HEARTBEAT_TTL_MS) heartbeats.delete(sid);
			}
			if (!heartbeatSeen) return; // 从未有心跳：不干预
			if (heartbeats.size > 0) {
				if (shutdownTimer !== null) {
					clearTimeout(shutdownTimer);
					shutdownTimer = null;
				}
				return;
			}
			if (shutdownTimer === null) {
				shutdownTimer = setTimeout(() => {
					shutdownTimer = null;
					if (heartbeats.size === 0) shutdownServer();
				}, SHUTDOWN_CONFIRM_MS);
			}
		}, HEARTBEAT_CHECK_MS);
		return () => {
			clearInterval(timer);
			if (shutdownTimer !== null) {
				clearTimeout(shutdownTimer);
				shutdownTimer = null;
			}
		};
	}, "dsh-host-files: idle shutdown monitor");
	// MCP 运行时管理：启动时挂载 enabled 的 server，卸载时全部释放
	ctx.effect(() => {
		(async () => {
			await loadMCPState();
			for (const server of mcpServers) {
				if (server.enabled !== false) await mountMCPServer(server);
			}
		})();
		return () => {
			for (const id of [...mcpDisposers.keys()]) {
				const dispose = mcpDisposers.get(id);
				mcpDisposers.delete(id);
				try {
					dispose?.();
				} catch {}
			}
		};
	}, "dsh-host-files: mcp runtime");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/vscode-files",
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", "http://x");
			// 全局人设（无 path 参数，需在 path 校验之前处理）
			if (url.pathname === "/vscode-files/persona") {
				if (req.method === "POST") {
					try {
						const body = await readJsonBody(req, MAX_PERSONA_BYTES + 4096);
						const content = body?.content;
						if (typeof content !== "string") return sendJson(res, 400, { ok: false, error: "body needs { content: string }" });
						if (Buffer.byteLength(content, "utf8") > MAX_PERSONA_BYTES) return sendJson(res, 400, { ok: false, error: "persona too large" });
						await writeFile(PERSONA_FILE, content, "utf8");
						return sendJson(res, 200, { ok: true });
					} catch (error) {
						return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
					}
				}
				let content = "";
				try {
					content = await readFile(PERSONA_FILE, "utf8");
				} catch {}
				return sendJson(res, 200, { ok: true, content });
			}
			// 页面心跳：记录存活页面（最后一个页面关闭后自动关闭服务器）
			if (url.pathname === "/vscode-files/heartbeat" && req.method === "GET") {
				const sid = url.searchParams.get("sid") ?? "";
				if (sid.length > 0 && sid.length <= 64) {
					heartbeats.set(sid, Date.now());
					heartbeatSeen = true;
				}
				return sendJson(res, 200, { ok: true });
			}
			// Skill / MCP 管理（无 path 参数）
			if (url.pathname === "/vscode-files/skills" && req.method === "GET") {
				return sendJson(res, 200, { ok: true, skills: await listSkills() });
			}
			if (url.pathname === "/vscode-files/mcp" && req.method === "GET") {
				return sendJson(res, 200, { ok: true, servers: mcpServers.map(mcpPublicView) });
			}
			if (url.pathname === "/vscode-files/skills/toggle" || url.pathname === "/vscode-files/skills/delete"
				|| url.pathname === "/vscode-files/mcp/toggle" || url.pathname === "/vscode-files/mcp/delete"
				|| url.pathname === "/vscode-files/mcp/add" || url.pathname === "/vscode-files/mcp/edit") {
				if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method not allowed" });
				try {
					const body = await readJsonBody(req, 64 * 1024);
					if (url.pathname === "/vscode-files/skills/toggle") {
						const target = body?.path;
						if (typeof target !== "string" || target.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { path }" });
						await toggleSkill(target);
						return sendJson(res, 200, { ok: true });
					}
					if (url.pathname === "/vscode-files/skills/delete") {
						const target = body?.path;
						if (typeof target !== "string" || target.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { path }" });
						const info = await stat(target);
						await recycleBinDelete(target, info.isDirectory());
						return sendJson(res, 200, { ok: true });
					}
					if (url.pathname === "/vscode-files/mcp/toggle") {
						const server = mcpServers.find((s) => s.id === body?.id);
						if (server === void 0) return sendJson(res, 404, { ok: false, error: "server not found" });
						server.enabled = !(server.enabled !== false);
						if (server.enabled) await mountMCPServer(server);
						else await unmountMCP(server.id);
						await saveMCPState();
						return sendJson(res, 200, { ok: true, enabled: server.enabled });
					}
					if (url.pathname === "/vscode-files/mcp/delete") {
						await unmountMCP(body?.id);
						mcpServers = mcpServers.filter((s) => s.id !== body?.id);
						await saveMCPState();
						return sendJson(res, 200, { ok: true });
					}
					if (url.pathname === "/vscode-files/mcp/add") {
						const serverName = body?.serverName;
						const transport = body?.transport === "streamable-http" ? "streamable-http" : "stdio";
						if (typeof serverName !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
							return sendJson(res, 400, { ok: false, error: "serverName 需为 1-32 位字母/数字/_-" });
						}
						if (mcpServers.some((s) => s.id === serverName)) return sendJson(res, 400, { ok: false, error: "serverName 已存在" });
						if (transport === "stdio") {
							if (typeof body?.command !== "string" || body.command.length === 0) return sendJson(res, 400, { ok: false, error: "stdio 类型需要 command" });
						} else if (typeof body?.url !== "string" || body.url.length === 0) {
							return sendJson(res, 400, { ok: false, error: "streamable-http 类型需要 url" });
						}
						const server = {
							id: serverName,
							serverName,
							transport,
							command: body?.command ?? "",
							args: Array.isArray(body?.args) ? body.args.map(String) : [],
							env: body?.env && typeof body.env === "object" ? Object.fromEntries(Object.entries(body.env).map(([k, v]) => [k, String(v)])) : {},
							url: body?.url ?? "",
							headers: body?.headers && typeof body.headers === "object" ? Object.fromEntries(Object.entries(body.headers).map(([k, v]) => [k, String(v)])) : {},
							enabled: true,
							desc: body?.desc ?? "",
						};
						mcpServers.push(server);
						await mountMCPServer(server);
						await saveMCPState();
						return sendJson(res, 200, { ok: true, id: serverName });
					}
				} catch (error) {
					return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
				}
			}
			const target = url.searchParams.get("path");
			if (typeof target !== "string" || target.length === 0) {
				return sendJson(res, 400, { ok: false, error: "missing path" });
			}
			try {
				if (url.pathname === "/vscode-files/list") {
					const entries = await readdir(target, { withFileTypes: true });
					const dirs = [];
					const files = [];
					for (const entry of entries) {
						const full = join(target, entry.name);
						const hidden = isHiddenName(entry.name);
						if (entry.isDirectory()) dirs.push({ name: entry.name, path: full, hidden });
						else if (entry.isFile()) {
							let size = 0;
							let mtimeMs = 0;
							try {
								const info = await stat(full);
								size = info.size;
								mtimeMs = info.mtimeMs;
							} catch {}
							files.push({ name: entry.name, path: full, size, mtimeMs, hidden });
						}
					}
					dirs.sort((a, b) => a.name.localeCompare(b.name));
					files.sort((a, b) => a.name.localeCompare(b.name));
					return sendJson(res, 200, { ok: true, path: target, dirs, files });
				}
				if (url.pathname === "/vscode-files/read") {
					const info = await stat(target);
					if (info.isDirectory()) return sendJson(res, 400, { ok: false, error: "path is a directory" });
					if (info.size > MAX_READ_BYTES) {
						const text = await readFile(target, "utf8");
						return sendJson(res, 200, { ok: true, kind: "too-large", content: text.slice(0, MAX_READ_BYTES), size: info.size });
					}
					const text = await readFile(target, "utf8");
					if (looksBinary(text)) return sendJson(res, 200, { ok: true, kind: "binary", content: "", size: info.size });
					return sendJson(res, 200, { ok: true, kind: "text", content: text, size: info.size });
				}
				if (url.pathname === "/vscode-files/git/version") {
				return sendJson(res, 200, await gitVersion());
			}
			if (url.pathname === "/vscode-files/git") {
					if (req.method === "POST") {
						let body;
						try {
							body = await readJsonBody(req, 64 * 1024);
						} catch (error) {
							return sendJson(res, 400, { ok: false, error: error.message });
						}
						const sub = body?.action;
						if (sub === "diff") {
							const file = body?.file;
							if (typeof file !== "string" || file.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { action:'diff', file }" });
							return sendJson(res, 200, await gitDiffOf(target, file, body?.staged === true));
						}
						if (sub === "log") {
							return sendJson(res, 200, await gitLogOf(target, body?.max || 50));
						}
						if (sub === "graph") {
							return sendJson(res, 200, await gitGraphData(target, body?.max || 50));
						}
						if (sub === "add" || sub === "stage") {
							const files = Array.isArray(body?.files) ? body.files : (typeof body?.file === "string" ? [body.file] : []);
							if (files.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { files: string[] }" });
							return sendJson(res, 200, await gitStageFiles(target, files));
						}
						if (sub === "unstage") {
							const files = Array.isArray(body?.files) ? body.files : (typeof body?.file === "string" ? [body.file] : []);
							if (files.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { files: string[] }" });
							return sendJson(res, 200, await gitUnstageFiles(target, files));
						}
						if (sub === "commit") {
							const msg = body?.message;
							if (typeof msg !== "string" || msg.trim().length === 0) return sendJson(res, 400, { ok: false, error: "body needs { message: string }" });
							return sendJson(res, 200, await gitCommit(target, msg.trim()));
						}
						if (sub === "restore") {
							const files = Array.isArray(body?.files) ? body.files : (typeof body?.file === "string" ? [body.file] : []);
							if (files.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { files: string[] }" });
							return sendJson(res, 200, await gitRestoreFile(target, files));
						}
						if (sub === "repos") {
							const repos = await gitDiscoverRepos(target);
							return sendJson(res, 200, { ok: true, repos });
						}
						if (sub === "worktrees") {
							return sendJson(res, 200, await gitWorktrees(target));
						}
						if (sub === "branches") {
							return sendJson(res, 200, await gitBranches(target));
						}
						if (sub === "workstatus") {
							return sendJson(res, 200, await gitWorkStatus(target));
						}
						if (sub === "workfile") {
							const file = body?.file;
							if (typeof file !== "string" || file.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { file }" });
							return sendJson(res, 200, await gitWorkFile(target, file, body?.mode || "unstaged"));
						}
						if (sub === "show") {
							const hash = body?.hash;
							if (typeof hash !== "string" || hash.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { hash }" });
							return sendJson(res, 200, await gitShowCommit(target, hash));
						}
						if (sub === "commit-diff") {
							const hash = body?.hash;
							if (typeof hash !== "string" || hash.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { hash }" });
							return sendJson(res, 200, await gitCommitDiff(target, hash));
						}
						if (sub === "filelog") {
							const file = body?.file;
							if (typeof file !== "string" || file.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { file }" });
							return sendJson(res, 200, await gitFileLog(target, file));
						}
						if (sub === "suggestmsg") {
							return sendJson(res, 200, await gitSuggestMsg(target));
						}
						if (sub === "fetch") {
							return sendJson(res, 200, await gitFetch(target));
						}
						if (sub === "push") {
							return sendJson(res, 200, await gitPush(target, body?.branch));
						}
						if (sub === "stage-all") {
							return sendJson(res, 200, await gitExec(target, ["add", "-A"]));
						}
						if (sub === "checkout") {
							const branch = body?.branch;
							if (typeof branch !== "string" || branch.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { branch }" });
							return sendJson(res, 200, await gitCheckout(target, branch));
						}
						return sendJson(res, 400, { ok: false, error: "unknown git action: " + sub });
					}
					return sendJson(res, 200, await gitStatusOf(target));
				}
				if (url.pathname === "/vscode-files/search") {
					const q = url.searchParams.get("q");
					if (typeof q !== "string" || q.trim().length === 0) return sendJson(res, 400, { ok: false, error: "missing q" });
					return sendJson(res, 200, { ok: true, results: await searchDir(target, q.trim()) });
				}
				if (url.pathname === "/vscode-files/highlight") {
					const info = await stat(target);
					if (info.isDirectory()) return sendJson(res, 400, { ok: false, error: "path is a directory" });
					if (info.size > MAX_HIGHLIGHT_BYTES) return sendJson(res, 200, { ok: false, error: "too large to highlight" });
					const text = await readFile(target, "utf8");
					if (looksBinary(text)) return sendJson(res, 200, { ok: false, error: "binary" });
					try {
						const shiki = await loadShiki();
						const theme = url.searchParams.get("theme") === "light" ? "github-light" : "github-dark";
						const html = await shiki.codeToHtml(text, { lang: shikiLangOf(target), theme });
						return sendJson(res, 200, { ok: true, html });
					} catch (error) {
						return sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
					}
				}
				if (req.method === "POST") {
					let body;
					try {
						body = await readJsonBody(req, 12 * 1024 * 1024);
					} catch (error) {
						return sendJson(res, 400, { ok: false, error: error.message });
					}
					if (url.pathname === "/vscode-files/write") {
						const writePath = body?.path;
						const content = body?.content;
						if (typeof writePath !== "string" || writePath.length === 0 || typeof content !== "string") {
							return sendJson(res, 400, { ok: false, error: "body needs { path: string, content: string }" });
						}
						if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
							return sendJson(res, 400, { ok: false, error: "content too large" });
						}
						const info = await stat(writePath).catch(() => void 0);
						if (info !== void 0 && info.isDirectory()) return sendJson(res, 400, { ok: false, error: "path is a directory" });
						await writeFile(writePath, content, "utf8");
						return sendJson(res, 200, { ok: true, size: Buffer.byteLength(content, "utf8") });
					}
					if (url.pathname === "/vscode-files/mkdir") {
						const parent = body?.path;
						if (typeof parent !== "string" || !validSegment(body?.name)) return sendJson(res, 400, { ok: false, error: "body needs { path: string, name: string }" });
						const full = join(parent, body.name);
						try {
							await mkdir(full);
						} catch (error) {
							return sendJson(res, 409, { ok: false, error: "已存在或无法创建：" + (error?.code ?? "unknown") });
						}
						return sendJson(res, 200, { ok: true, path: full });
					}
					if (url.pathname === "/vscode-files/mkfile") {
						const parent = body?.path;
						if (typeof parent !== "string" || !validSegment(body?.name)) return sendJson(res, 400, { ok: false, error: "body needs { path: string, name: string }" });
						const full = join(parent, body.name);
						try {
							await writeFile(full, "", { flag: "wx" });
						} catch (error) {
							return sendJson(res, 409, { ok: false, error: "已存在或无法创建：" + (error?.code ?? "unknown") });
						}
						return sendJson(res, 200, { ok: true, path: full });
					}
					if (url.pathname === "/vscode-files/rename") {
						const oldPath = body?.path;
						if (typeof oldPath !== "string" || !validSegment(body?.newName)) return sendJson(res, 400, { ok: false, error: "body needs { path: string, newName: string }" });
						const newPath = join(dirname(oldPath), body.newName);
						await rename(oldPath, newPath);
						return sendJson(res, 200, { ok: true, path: newPath });
					}
					if (url.pathname === "/vscode-files/delete") {
						const delPath = body?.path;
						if (typeof delPath !== "string" || delPath.length === 0) return sendJson(res, 400, { ok: false, error: "body needs { path: string }" });
						const info = await stat(delPath).catch(() => void 0);
						if (info === void 0) return sendJson(res, 404, { ok: false, error: "not found" });
						await recycleBinDelete(delPath, info.isDirectory());
						return sendJson(res, 200, { ok: true });
					}
				}
				return sendJson(res, 404, { ok: false, error: "unknown vscode-files endpoint" });
			} catch (error) {
				return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}), "dsh-host-files: /vscode-files routes");
}

export { name, inject, apply };
