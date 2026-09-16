window.__ModuleLoader__.load({
	id: "@anoslide/dsh-client-idea",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		const h = react.createElement;

		// ──────────────────────────────────────────────────────────────
		// 常量与工具
		// ──────────────────────────────────────────────────────────────
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		const LS_KEY = "dsh-idea:v1";
		/** 工具详情轨迹的特殊标签路径（分栏模式下轨迹在中心区开标签）。 */
		const TRAJECTORY_TAB_PATH = "::vscode-trajectory::";

		function clampWidth(px, min, max) {
			return Math.min(max, Math.max(min, Math.round(px)));
		}
		/**
		 * 三栏宽度求解：左(264-420, 默认 280) | 中(弹性, 最小 360) | 右(340-640, 默认 440)。
		 * 右栏常驻不收起；窄视口先挤右栏，再挤左栏，最后保中间。
		 */
		function computeColumns(viewport, sidebar, right) {
			const s = sidebar === 0 ? 56 : clampWidth(sidebar, 264, 420);
			const r0 = right === 0 ? 0 : clampWidth(right, 340, 640);
			if (s + r0 + 360 <= viewport) return { sidebar: s, center: viewport - s - r0, right: r0 };
			const r1 = r0 === 0 ? 0 : Math.max(340, viewport - s - 360);
			if (s + r1 + 360 <= viewport) return { sidebar: s, center: viewport - s - r1, right: r1 };
			if (s + 360 <= viewport) return { sidebar: s, center: viewport - s, right: 0 };
			return { sidebar: 0, center: viewport, right: 0 };
		}

		function escapeHtml(text) {
			return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}
		function copyToClipboard(text) {
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				navigator.clipboard.writeText(text).catch(() => {});
			} else {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.style.position = "fixed";
				ta.style.left = "-9999px";
				document.body.appendChild(ta);
				ta.select();
				try { document.execCommand("copy"); } catch {}
				document.body.removeChild(ta);
			}
		}

		// ──────────────────────────────────────────────────────────────
		// 简易语法高亮（零依赖；shiki 留作 v2）
		// ──────────────────────────────────────────────────────────────
		const TOKEN_CLASS = {
			com: "vk_tokCom",
			str: "vk_tokStr",
			kw: "vk_tokKw",
			num: "vk_tokNum",
			anno: "vk_tokAnno",
			tag: "vk_tokTag",
			attr: "vk_tokAttr",
			md: "vk_tokMd"
		};
		function familyOf(path) {
			const ext = String(path).split(".").pop().toLowerCase();
			if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return "js";
			if (["html", "htm", "xml", "svg", "vue"].includes(ext)) return "html";
			if (["py", "sh", "bash", "zsh", "toml"].includes(ext)) return "py";
			if (["css", "scss", "less"].includes(ext)) return "css";
			if (["json", "jsonc"].includes(ext)) return "json";
			if (["yml", "yaml"].includes(ext)) return "yaml";
			if (["md", "markdown"].includes(ext)) return "md";
			if (["java", "class", "jar"].includes(ext)) return "java";
			return "plain";
		}
		function tokenize(code, family) {
			if (family === "plain") return [[null, code]];
			const RE = {
				js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(?:const|let|var|function|return|if|else|for|while|do|import|from|export|default|class|extends|super|new|this|typeof|instanceof|in|of|async|await|try|catch|finally|throw|switch|case|break|continue|delete|void|yield|null|undefined|true|false|static|get|set)\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/g,
				html: /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][a-zA-Z0-9-]*|\/?>)|([a-zA-Z-]+)(=)("[^"]*"|'[^']*')/g,
				py: /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(?:def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|lambda|pass|break|continue|and|or|not|in|is|None|True|False|async|await|yield|global|nonlocal)\b|\b\d+(?:\.\d+)?\b/g,
				css: /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/g,
				json: /("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/g,
				yaml: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|^\s*(- |[a-zA-Z0-9_.-]+:)|(true|false|null)|(-?\d+(?:\.\d+)?)/gm,
				md: /(^#{1,6}[^\n]*$)|(\*\*[^*\n]+\*\*|`[^`\n]+`)|(^[-*+]\s.*$)|(^>.*$)/gm,
				java: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|module|native|new|package|private|protected|public|record|return|requires|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield|null|true|false|sealed|permits|transitive|exports|opens|provides|uses|to|with|open|when)\b)|(@[A-Za-z_$][A-Za-z0-9_$.]*\b)|(\b\d+(?:\.\d+)?(?:[fLdD])?\b)/g
			}[family];
			const out = [];
			let last = 0;
			let m;
			RE.lastIndex = 0;
			while ((m = RE.exec(code)) !== null) {
				if (m.index > last) out.push([null, code.slice(last, m.index)]);
				const full = m[0];
				let cls = null;
				if (family === "js") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.kw : m[4] ? TOKEN_CLASS.num : null;
				else if (family === "html") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.tag : m[3] ? TOKEN_CLASS.attr : m[4] ? TOKEN_CLASS.str : null;
				else if (family === "py") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.kw : m[4] ? TOKEN_CLASS.num : null;
				else if (family === "css") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.num : m[4] ? TOKEN_CLASS.num : null;
				else if (family === "json") cls = m[1] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.kw : m[4] ? TOKEN_CLASS.num : null;
				else if (family === "yaml") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.attr : m[4] ? TOKEN_CLASS.kw : m[5] ? TOKEN_CLASS.num : null;
				else if (family === "java") cls = m[1] ? TOKEN_CLASS.com : m[2] ? TOKEN_CLASS.str : m[3] ? TOKEN_CLASS.kw : m[4] ? TOKEN_CLASS.anno : m[5] ? TOKEN_CLASS.num : null;
				else cls = TOKEN_CLASS.md;
				out.push([cls, full]);
				last = m.index + full.length;
				if (full.length === 0) RE.lastIndex++;
			}
			if (last < code.length) out.push([null, code.slice(last)]);
			return out;
		}

		// ──────────────────────────────────────────────────────────────
		// 文件图标（VS Code 式）：代码/数据类 = 按语言着色的字母徽章，
		// 媒体/压缩/二进制类 = emoji。徽章颜色在样式区按浅/深色双套定义
		// （body[data-ds-dark-theme] 覆盖），只改动 className，不改结构
		// ──────────────────────────────────────────────────────────────
		const FILE_ICONS = {
			js: ["JS", "Js"], mjs: ["JS", "Js"], cjs: ["JS", "Js"],
			ts: ["TS", "Ts"], mts: ["TS", "Ts"], cts: ["TS", "Ts"],
			jsx: ["⚛", "React"], tsx: ["⚛", "React"],
			vue: ["V", "Vue"], svelte: ["S", "Svelte"],
			py: ["Py", "Py"],
			json: ["{}", "Json"], jsonc: ["{}", "Json"],
			html: ["<>", "Html"], htm: ["<>", "Html"], xml: ["<>", "Xml"], svg: ["<>", "Svg"],
			css: ["#", "Css"], scss: ["#", "Scss"], sass: ["#", "Scss"], less: ["#", "Less"],
			md: ["M↓", "Md"], markdown: ["M↓", "Md"],
			yml: ["Y", "Yaml"], yaml: ["Y", "Yaml"],
			sh: ["❯", "Shell"], bash: ["❯", "Shell"], zsh: ["❯", "Shell"], ps1: ["❯", "Shell"], bat: ["❯", "Shell"], cmd: ["❯", "Shell"],
			toml: ["⚙", "Conf"], ini: ["⚙", "Conf"], cfg: ["⚙", "Conf"], conf: ["⚙", "Conf"], env: ["⚙", "Conf"], properties: ["⚙", "Conf"],
			txt: ["≡", "Txt"], log: ["≡", "Txt"],
			sql: ["DB", "Sql"], graphql: ["◈", "Gql"], gql: ["◈", "Gql"],
			rs: ["Rs", "Rs"], go: ["Go", "Go"], java: ["Ja", "Java"],
			c: ["C", "C"], h: ["C", "C"],
			cpp: ["C+", "Cpp"], cc: ["C+", "Cpp"], cxx: ["C+", "Cpp"], hpp: ["C+", "Cpp"], cs: ["C#", "Cs"],
			rb: ["Rb", "Rb"], php: ["Φ", "Php"], kt: ["K", "Kt"], kts: ["K", "Kt"], swift: ["Sw", "Swift"],
			lua: ["Lu", "Lua"], r: ["R", "R"], wasm: ["W", "Wasm"],
			woff: ["A", "Font"], woff2: ["A", "Font"], ttf: ["A", "Font"], otf: ["A", "Font"], eot: ["A", "Font"],
			exe: ["⬢", "Bin"], dll: ["⬢", "Bin"], bin: ["⬢", "Bin"], dat: ["⬢", "Bin"], msi: ["⬢", "Bin"],
			png: ["🖼", "Emoji"], jpg: ["🖼", "Emoji"], jpeg: ["🖼", "Emoji"], gif: ["🖼", "Emoji"], webp: ["🖼", "Emoji"],
			bmp: ["🖼", "Emoji"], ico: ["🖼", "Emoji"], icns: ["🖼", "Emoji"], avif: ["🖼", "Emoji"],
			mp4: ["🎬", "Emoji"], mov: ["🎬", "Emoji"], avi: ["🎬", "Emoji"], mkv: ["🎬", "Emoji"], webm: ["🎬", "Emoji"],
			mp3: ["🎵", "Emoji"], wav: ["🎵", "Emoji"], ogg: ["🎵", "Emoji"], flac: ["🎵", "Emoji"],
			zip: ["📦", "Emoji"], tar: ["📦", "Emoji"], gz: ["📦", "Emoji"], rar: ["📦", "Emoji"], "7z": ["📦", "Emoji"], bz2: ["📦", "Emoji"], xz: ["📦", "Emoji"],
			pdf: ["📕", "Emoji"], lock: ["🔒", "Emoji"]
		};
		const FILE_ICON_NAMES = {
			"package.json": ["⬢", "Npm"], ".npmrc": ["⬢", "Npm"], ".nvmrc": ["⬢", "Npm"],
			"package-lock.json": ["🔒", "Emoji"], "yarn.lock": ["🔒", "Emoji"], "pnpm-lock.yaml": ["🔒", "Emoji"],
			"tsconfig.json": ["TS", "Ts"],
			"dockerfile": ["🐳", "Emoji"], "docker-compose.yml": ["🐳", "Emoji"], "docker-compose.yaml": ["🐳", "Emoji"], ".dockerignore": ["🐳", "Emoji"],
			"makefile": ["🛠", "Emoji"], "cmakelists.txt": ["🛠", "Emoji"],
			"license": ["📜", "Emoji"], "license.md": ["📜", "Emoji"], "license.txt": ["📜", "Emoji"],
			".gitignore": ["◆", "Git"], ".gitattributes": ["◆", "Git"], ".gitmodules": ["◆", "Git"]
		};
		function iconOf(name, isDir, expanded) {
			if (isDir) {
				if (expanded) {
					return { g: h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", style: { verticalAlign: "middle" } }, h("path", { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z", fill: "currentColor" }), h("path", { opacity: "0.2", d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z", fill: "currentColor" })), c: "vk_iconSvg" };
				}
				return { g: h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", style: { verticalAlign: "middle" } }, h("path", { transform: "translate(1.5 2.429)", d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573Z", fill: "currentColor" })), c: "vk_iconSvg" };
			}
			const lower = String(name).toLowerCase();
			const hit = FILE_ICON_NAMES[lower] ?? FILE_ICONS[lower.includes(".") ? lower.split(".").pop() : ""];
			if (hit) return { g: hit[0], c: hit[1] === "Emoji" ? "vk_iconEmoji" : "vk_iconChip vk_i" + hit[1] };
			return { g: "📄", c: "vk_iconEmoji" };
		}

		// ──────────────────────────────────────────────────────────────
		// 样式
		// ──────────────────────────────────────────────────────────────
		const css = [
			// ── 骨架与三栏 ─────────────────────────────────────────────
			// --vk-accent：官方主题未提供 --dsw-alias-accent（此前引用全部落空），
			// 回退到 --dsw-alias-state-business-primary（DeepSeek 蓝，浅/深自适应）
			".vk_frame{background:var(--dsw-alias-bg-base);height:100%;display:grid;grid-template-rows:100%;position:relative;overflow:hidden;--vk-accent:var(--dsw-alias-accent,var(--dsw-alias-state-business-primary));--vk-accent-ring:color-mix(in srgb,var(--vk-accent) 22%,transparent);--vk-accent-soft:color-mix(in srgb,var(--vk-accent) 12%,transparent)}",
			".vk_frame[data-native] .vk_colRight{border-left:none}",
			".vk_frame[data-dragging]{user-select:none;cursor:col-resize}",
			".vk_colLeft{background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden;display:flex;flex-direction:column}",
			".vk_colCenter{flex-direction:column;min-width:0;display:flex;overflow:hidden}",
			".vk_colRight{border-left:1px solid var(--dsw-alias-border-l2);min-width:0;overflow:hidden;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}",
			// 窄视口/右栏收起（列宽 0）时彻底隐藏右栏，避免残留 1px 边框+背景形成黑色竖线
			".vk_frame[data-right-zero] .vk_colRight{display:none}",
			".vk_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.vk_overlayLayer>*{pointer-events:auto}",
			// 拖拽手柄：悬停/拖动时浮现 accent 亮条
			".vk_handle{cursor:col-resize;z-index:2;touch-action:none;width:8px;margin-left:-4px;position:absolute;top:0;bottom:0}",
			".vk_handle::after{content:'';position:absolute;top:0;bottom:0;left:3px;width:2px;border-radius:1px;background:transparent;transition:background-color .15s}",
			// 仅拖动时显示指示线；hover 不显示，避免鼠标停在分隔线区域时出现常驻竖线（误认为渲染 bug）
			".vk_handle[data-dragging]::after{background:var(--vk-accent)}",
			// ── 滚动条：细、半透明、贴主题；标签条隐藏但可滚 ─────────────
			".vk_tree,.vk_viewer,.vk_editorInput{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l1) transparent}",
			".vk_tree::-webkit-scrollbar,.vk_viewer::-webkit-scrollbar,.vk_editorInput::-webkit-scrollbar{width:10px;height:10px}",
			".vk_tree::-webkit-scrollbar-thumb,.vk_viewer::-webkit-scrollbar-thumb,.vk_editorInput::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1);border:3px solid transparent;border-radius:6px;background-clip:padding-box;min-height:40px}",
			".vk_tree::-webkit-scrollbar-thumb:hover,.vk_viewer::-webkit-scrollbar-thumb:hover,.vk_editorInput::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l1);border:3px solid transparent;background-clip:padding-box}",
			".vk_tree::-webkit-scrollbar-track,.vk_viewer::-webkit-scrollbar-track,.vk_editorInput::-webkit-scrollbar-track,.vk_tree::-webkit-scrollbar-corner,.vk_viewer::-webkit-scrollbar-corner,.vk_editorInput::-webkit-scrollbar-corner{background:transparent}",
			// ── 面板 Tab 栏（左：文件/会话；右：对话/详情） ──────────────
			".vk_tabBar{display:flex;align-items:stretch;flex:none;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill)}",
			".vk_tabBtn{appearance:none;border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-secondary);padding:7px 12px;font-size:12px;line-height:16px;font-family:inherit;border-bottom:2px solid transparent;transition:color .12s,background-color .12s,border-color .12s}",
			".vk_tabBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_tabBtnActive{color:var(--dsw-alias-label-primary);border-bottom-color:var(--vk-accent)}",
			".vk_tabBody{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}",
			".vk_tabBodyHidden{display:none}",
			".vk_tabBarSpacer{flex:1}",
			// ── rail 窄条（左栏收起态）：图标 + accent 指示条 ────────────
			".vk_rail{align-items:center;padding:10px 0;gap:4px}",
			".vk_railBtn{appearance:none;border:none;background:none;cursor:pointer;width:38px;height:38px;border-radius:9px;font-size:17px;line-height:1;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;position:relative;transition:background-color .12s,color .12s,transform .08s}",
			".vk_railBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".vk_railBtn:active{transform:scale(.93)}",
			".vk_railBtnActive{background:var(--vk-accent-soft);color:var(--vk-accent)}",
			".vk_railBtnActive::before{content:'';position:absolute;left:-9px;top:9px;bottom:9px;width:3px;border-radius:2px;background:var(--vk-accent)}",
			".vk_railSpacer{flex:1}",
			// ── 文件树头部与工具按钮 ───────────────────────────────────
			".vk_treeWrap{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}",
			".vk_treeHead{display:flex;align-items:center;gap:2px;flex:none;padding:6px 6px 6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:12px 12px 0 0;color:var(--dsw-alias-label-tertiary)}",
			".vk_treeTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}",
			".vk_treeBtn{appearance:none;border:none;background:none;cursor:pointer;width:28px;height:28px;padding:0;border-radius:50%;font-size:13px;line-height:1;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;flex:none;transition:background-color .12s,color .12s}",
			".vk_treeBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".vk_treeBtnActive{background:var(--vk-accent-soft);color:var(--vk-accent)}",
			// ── 搜索框（固定显示，图标在输入框内） ──────────────────────
			".vk_searchWrap{flex:none;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".vk_searchInputWrap{position:relative;display:flex;align-items:center}",
			".vk_searchInputWrap .vk_searchInput{padding-left:28px;height:28px;border-radius:6px}",
			".vk_searchInputWrap .vk_searchIcon{position:absolute;left:6px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-caption);display:flex;align-items:center;pointer-events:none;width:16px;height:16px}",
			// ── 表单（打开文件夹/新建/重命名/搜索） ─────────────────────
			".vk_pickForm{padding:8px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".vk_pickInput{box-sizing:border-box;width:100%;background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 9px;outline:none;font-family:inherit;transition:border-color .12s,box-shadow .12s}",
			".vk_pickInput:hover{border-color:var(--dsw-alias-border-l3)}",
			".vk_pickInput:focus{border-color:var(--vk-accent);box-shadow:0 0 0 2px var(--vk-accent-ring)}",
			".vk_pickInput::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".vk_row .vk_pickInput{padding:3px 8px}",
			".vk_pickRow{display:flex;gap:6px;justify-content:flex-end}",
			".vk_pickBtn{appearance:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:6px;font-size:12px;padding:4px 12px;font-family:inherit;transition:background-color .12s,border-color .12s,color .12s}",
			".vk_pickBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}",
			// 模式切换胶囊（accent 实心；右栏「全屏对话/分栏视图」与「新建文件/文件夹」切换复用。
			// 位置须在 .vk_pickBtn/.vk_tabBtn 之后：同级特异性下靠后者覆盖底色与圆角）
			".vk_modeBtn{align-self:center;background:var(--vk-accent);color:#fff;border-radius:999px;padding:4px 13px;margin:0 8px 0 4px;border-bottom:none;font-weight:600;line-height:16px;letter-spacing:.2px;box-shadow:0 1px 3px rgba(0,0,0,.18);transition:filter .12s,box-shadow .12s,color .12s,background-color .12s}",
			".vk_modeBtn:hover{color:#fff;background:var(--vk-accent);filter:brightness(1.1);box-shadow:0 2px 8px var(--vk-accent-ring)}",
			// ── 文件树行：缩进参考线 / 图标 / 悬停与选中层次 ─────────────
			".vk_tree{flex:1;min-height:0;overflow:auto;padding:4px 0}",
			".vk_row{position:relative;display:flex;align-items:center;gap:5px;padding:2px 8px 2px 4px;cursor:pointer;font-size:13px;line-height:22px;white-space:nowrap;user-select:none;transition:background-color .1s}",
			".vk_row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_rowActive{background:var(--vk-accent-soft)}",
			".vk_rowActive:hover{background:var(--vk-accent-ring)}",
			".vk_rowHidden{opacity:.55}",
			".vk_guide{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--dsw-alias-border-l2)}",
			".vk_row:hover .vk_guide{border-left-color:var(--dsw-alias-border-l3)}",
			".vk_caret{width:14px;flex:none;color:var(--dsw-alias-label-tertiary);text-align:center;font-size:10px}",
			".vk_name{overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}",
			".vk_dirName{font-weight:500}",
			".vk_relPath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".vk_nameFixed{flex:none}",
			".vk_rowActions{display:none;flex:none;margin-left:4px;align-items:center;gap:2px}",
			".vk_row:not(:has(.vk_gitBadge)) .vk_rowActions{margin-left:auto}",
			".vk_row:hover .vk_rowActions{display:flex}",
			".vk_rowBtn{appearance:none;border:none;background:none;cursor:pointer;font-size:11px;width:20px;height:20px;padding:0;border-radius:5px;line-height:1;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;transition:background-color .1s,color .1s}",
			".vk_rowBtn:hover{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}",
			".vk_hiddenHint{padding:3px 12px;font-size:11px;color:var(--dsw-alias-label-tertiary);cursor:default;white-space:nowrap;font-style:italic}",
			// ── 文件图标徽章（浅色基准；深色在文末覆盖） ─────────────────
			".vk_icon{flex:none;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1}",
			".vk_iconSvg{color:var(--dsw-alias-label-tertiary)}",
			".vk_rowActive .vk_iconSvg{color:var(--dsw-alias-state-business-primary)}",
			".vk_iconChip{width:16px;height:16px;border-radius:4px;font-size:8.5px;font-weight:700;font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;letter-spacing:.1px}",
			".vk_iJs{color:#9c8205;background:rgba(241,224,90,.28)}",
			".vk_iTs{color:#3178c6;background:rgba(49,120,198,.16)}",
			".vk_iReact{color:#0e9fc9;background:rgba(97,218,251,.2)}",
			".vk_iPy{color:#3572a5;background:rgba(53,114,165,.14)}",
			".vk_iJson{color:#a87b00;background:rgba(203,182,65,.18)}",
			".vk_iHtml{color:#e34c26;background:rgba(227,76,38,.12)}",
			".vk_iXml{color:#7d4b8f;background:rgba(125,75,143,.12)}",
			".vk_iSvg{color:#b8563e;background:rgba(184,86,62,.12)}",
			".vk_iCss{color:#2965f1;background:rgba(41,101,241,.12)}",
			".vk_iScss{color:#c6538c;background:rgba(198,83,140,.12)}",
			".vk_iLess{color:#2a4d8f;background:rgba(42,77,143,.12)}",
			".vk_iVue{color:#41b883;background:rgba(65,184,131,.16)}",
			".vk_iSvelte{color:#ff3e00;background:rgba(255,62,0,.1)}",
			".vk_iMd{color:#519aba;background:rgba(81,154,186,.14)}",
			".vk_iYaml{color:#c93c3c;background:rgba(203,60,60,.1)}",
			".vk_iShell{color:#4e9a06;background:rgba(137,224,81,.18)}",
			".vk_iConf{color:#6d8086;background:rgba(109,128,134,.14)}",
			".vk_iTxt{color:#7f8c8d;background:rgba(127,140,141,.14)}",
			".vk_iSql{color:#e38c00;background:rgba(227,140,0,.12)}",
			".vk_iGql{color:#e535ab;background:rgba(229,53,171,.12)}",
			".vk_iRs{color:#b4713d;background:rgba(222,165,132,.22)}",
			".vk_iGo{color:#00add8;background:rgba(0,173,216,.12)}",
			".vk_iJava{color:#b07219;background:rgba(176,114,25,.14)}",
			".vk_iC{color:#5c6bc0;background:rgba(92,107,192,.14)}",
			".vk_iCpp{color:#d1477b;background:rgba(243,75,125,.12)}",
			".vk_iCs{color:#2c8c1e;background:rgba(35,145,32,.12)}",
			".vk_iRb{color:#cc342d;background:rgba(204,52,45,.1)}",
			".vk_iPhp{color:#777bb4;background:rgba(119,123,180,.14)}",
			".vk_iKt{color:#7f52ff;background:rgba(127,82,255,.12)}",
			".vk_iSwift{color:#f05138;background:rgba(240,81,56,.12)}",
			".vk_iLua{color:#4a4ab8;background:rgba(74,74,184,.12)}",
			".vk_iR{color:#276dc3;background:rgba(39,109,195,.12)}",
			".vk_iWasm{color:#654ff0;background:rgba(101,79,240,.12)}",
			".vk_iFont{color:#a074c4;background:rgba(160,116,196,.14)}",
			".vk_iBin{color:#6e7681;background:rgba(110,118,129,.16)}",
			".vk_iGit{color:#e94e32;background:rgba(240,80,51,.12)}",
			".vk_iNpm{color:#cb3837;background:rgba(203,56,55,.12)}",
			// ── Git 角标：VS Code 式纯色字母（无底色胶囊） ────────────────
			".vk_gitBadge{flex:none;margin-left:auto;padding:0 2px;font-size:11px;font-weight:700;line-height:16px;letter-spacing:.2px}",
			".vk_gitM{color:#c09a52}",
			".vk_gitU,.vk_gitA{color:#4f9e68}",
			".vk_gitD{color:#d64545}",
			".vk_gitR{color:#a866c4}",
			// ── 中间编辑区：标签条 / 标签页（激活·脏标记·关闭键层次） ─────
			".vk_editor{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}",
			".vk_tabStrip{display:flex;flex:none;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill);overflow-x:auto;scrollbar-width:none}",
			".vk_tabStrip::-webkit-scrollbar{display:none}",
			".vk_fileTab{display:flex;align-items:center;gap:7px;flex:0 1 auto;min-width:112px;max-width:230px;cursor:pointer;padding:7px 10px 7px 12px;font-size:12.5px;color:var(--dsw-alias-label-secondary);border-right:1px solid var(--dsw-alias-border-l1);background:transparent;border-top:none;border-left:none;border-bottom:2px solid transparent;font-family:inherit;white-space:nowrap;transition:background-color .1s,color .1s,border-color .1s}",
			".vk_fileTab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_fileTabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border-bottom-color:var(--vk-accent)}",
			".vk_tabName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".vk_menu{position:fixed;z-index:60;min-width:160px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px;box-shadow:var(--dsw-shadow-lv3);display:flex;flex-direction:column}",
			".vk_menuItem{appearance:none;border:none;background:none;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font-size:12.5px;font-family:inherit;padding:6px 10px;border-radius:5px}",
			".vk_menuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_menuItemDanger{color:var(--dsw-alias-state-error-primary)}",
			".vk_menuSep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 6px}",
			".vk_fileTab[draggable=true]{cursor:grab}",
			".vk_fileTab[draggable=true]:active{cursor:grabbing}",
			".vk_tabClose{appearance:none;border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-tertiary);padding:0;width:18px;height:18px;font-size:13px;border-radius:5px;line-height:1;display:flex;align-items:center;justify-content:center;flex:none;opacity:0;pointer-events:none;transition:opacity .1s,background-color .1s,color .1s}",
			".vk_fileTab:hover .vk_tabClose,.vk_fileTabActive:not(.vk_fileTabDirty) .vk_tabClose{opacity:1;pointer-events:auto}",
			".vk_tabClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-accent)}",
			".vk_fileTabDirty:hover .vk_tabDot{display:none}",
			// ── 查看器：行号槽与代码区 ─────────────────────────────────
			".vk_viewer{flex:1;min-height:0;overflow:auto;display:flex;font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;font-size:12.5px;line-height:20px}",
			".vk_gutter{flex:none;white-space:pre;min-width:46px;text-align:right;padding:10px 12px 10px 0;color:var(--dsw-alias-label-tertiary);user-select:none;background:var(--dsw-alias-bg-base);border-right:1px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums;position:sticky;left:0;z-index:1}",
			".vk_code{flex:1;margin:0;padding:10px 14px;white-space:pre;tab-size:4;color:var(--dsw-alias-label-primary)}",
			".vk_viewer ::selection{background:var(--vk-accent-ring)}",
			".vk_codeHl{flex:1;overflow:visible;padding:0}",
			".vk_codeHl .shiki{background:transparent !important;color:var(--dsw-alias-label-primary);margin:0;padding:10px 14px;line-height:20px;font-size:12.5px;tab-size:4;overflow:visible !important;font-family:inherit}",
			".vk_codeHl .shiki code{font-family:inherit;font-size:inherit;line-height:20px}",
			// 兜底高亮（shiki 返回前的瞬态）：CSS 固定 dark 配色。
			// 正常路径已支持主题：后端 highlight 接口按 theme 参数返回
			// github-light/github-dark，Viewer 监听 body[data-ds-dark-theme]
			// 切换时重取。兜底仅在 shiki 失败时短暂出现，偏 dark 可接受
			".vk_tokCom{color:#8b949e;font-style:italic}",
			".vk_tokStr{color:#a5d6ff}",
			".vk_tokKw{color:#ff7b72}",
			".vk_tokNum{color:#79c0ff}",
			".vk_tokTag{color:#7ee787}",
			".vk_tokAttr{color:#d2a8ff}",
			".vk_tokMd{color:#ffa657}",
			".vk_tokAnno{color:#d2a8ff}",
			// ── 编辑模式：工具条 / 按钮 / 输入区 ────────────────────────
			".vk_editBar{display:flex;align-items:center;gap:8px;flex:none;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}",
			".vk_editBtn{appearance:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:6px;font-size:12px;padding:4px 12px;font-family:inherit;transition:background-color .12s,border-color .12s,filter .12s,opacity .12s}",
			".vk_editBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}",
			".vk_editBtn:disabled{opacity:.5;cursor:default}",
			".vk_editBtnPrimary{background:var(--vk-accent);border-color:transparent;color:#fff;font-weight:600}",
			".vk_editBtnPrimary:hover:not(:disabled){background:var(--vk-accent);border-color:transparent;filter:brightness(1.1)}",
			".vk_dirtyDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--vk-accent)}",
			".vk_tabDot{flex:none}",
			".vk_editorBody{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}",
			".vk_editorInput{flex:1;min-height:0;box-sizing:border-box;width:100%;resize:none;border:none;outline:none;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;font-size:12.5px;line-height:20px;padding:10px 14px;white-space:pre;overflow:auto;tab-size:4;caret-color:var(--vk-accent)}",
			".vk_editorInput::selection{background:var(--vk-accent-ring)}",
			".vk_editorEditMode{flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden;position:relative;font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;font-size:12.5px;line-height:20px}",
			".vk_editorCodeWrap{flex:1;min-height:0;position:relative;overflow:hidden}",
			".vk_editorHighlight{position:absolute;inset:0;margin:0;padding:10px 14px;white-space:pre;tab-size:4;font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;font-size:12.5px;line-height:20px;overflow:hidden;pointer-events:none;color:var(--dsw-alias-label-primary)}",
			".vk_editorHighlight .shiki{background:transparent !important;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:inherit;line-height:20px;margin:0;padding:0;overflow:visible !important}",
			".vk_saveMsg{font-size:12px;color:var(--dsw-alias-label-secondary);flex:none}",
			".vk_trajBody{overflow:auto}",
			// ── 空态 / 错误 / 通知排版 ─────────────────────────────────
			".vk_err{margin:8px;padding:8px 10px;font-size:12px;line-height:1.6;color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger);border-radius:6px}",
			".vk_empty{padding:32px 20px;font-size:12.5px;line-height:2;color:var(--dsw-alias-label-tertiary);text-align:center;white-space:pre-wrap}",
			".vk_notice{padding:32px 20px;font-size:13px;line-height:2;color:var(--dsw-alias-label-secondary);text-align:center;white-space:pre-wrap}",
			// ── 键盘聚焦可见态（统一 accent 光圈） ──────────────────────
			".vk_tabBtn:focus-visible,.vk_railBtn:focus-visible,.vk_treeBtn:focus-visible,.vk_rowBtn:focus-visible,.vk_pickBtn:focus-visible,.vk_editBtn:focus-visible,.vk_tabClose:focus-visible{outline:2px solid var(--vk-accent-ring);outline-offset:-2px}",
			// ── 深色主题覆盖：徽章/角标颜色提亮 ─────────────────────────
			"body[data-ds-dark-theme] .vk_iJs{color:#f1e05a;background:rgba(241,224,90,.14)}",
			"body[data-ds-dark-theme] .vk_iTs{color:#5496d8}",
			"body[data-ds-dark-theme] .vk_iReact{color:#61dafb;background:rgba(97,218,251,.12)}",
			"body[data-ds-dark-theme] .vk_iPy{color:#6aa5e0}",
			"body[data-ds-dark-theme] .vk_iJson{color:#cbcb41}",
			"body[data-ds-dark-theme] .vk_iHtml{color:#ff7a59}",
			"body[data-ds-dark-theme] .vk_iXml{color:#b47fd4}",
			"body[data-ds-dark-theme] .vk_iSvg{color:#e08a70}",
			"body[data-ds-dark-theme] .vk_iCss{color:#6ea8ff}",
			"body[data-ds-dark-theme] .vk_iLess{color:#7a9ee0}",
			"body[data-ds-dark-theme] .vk_iYaml{color:#ff7b72}",
			"body[data-ds-dark-theme] .vk_iShell{color:#89e051}",
			"body[data-ds-dark-theme] .vk_iConf{color:#9aa7b0}",
			"body[data-ds-dark-theme] .vk_iTxt{color:#9aa7b0}",
			"body[data-ds-dark-theme] .vk_iSql{color:#f0a63c}",
			"body[data-ds-dark-theme] .vk_iRs{color:#dea584}",
			"body[data-ds-dark-theme] .vk_iC{color:#8fa3e8}",
			"body[data-ds-dark-theme] .vk_iCs{color:#6fbf4a}",
			"body[data-ds-dark-theme] .vk_iRb{color:#ff7b72}",
			"body[data-ds-dark-theme] .vk_iLua{color:#8b8bff}",
			"body[data-ds-dark-theme] .vk_iR{color:#6aa5e0}",
			"body[data-ds-dark-theme] .vk_iBin{color:#9aa7b0}",
			"body[data-ds-dark-theme] .vk_iGit{color:#f05033}",
			"body[data-ds-dark-theme] .vk_iJava{color:#d4a859;background:rgba(212,168,89,.14)}",
			// 设置面板 · 全局人设分区
			".vk_personaSection{display:flex;flex-direction:column;gap:10px;padding:16px;width:100%;box-sizing:border-box}",
			".vk_personaDesc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7}",
			".vk_personaArea{min-height:280px;resize:vertical;background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:12.5px;line-height:1.75;tab-size:4}",
			".vk_personaArea:focus{outline:none;border-color:var(--vk-accent)}",
			".vk_personaFoot{display:flex;align-items:center;gap:8px}",
			".vk_personaMsg{font-size:12px}",
			".vk_personaMsgOk{color:#73c991}",
			".vk_personaMsgErr{color:#f14c4c}",
			".vk_personaSave{background:var(--vk-accent);color:#fff;border-radius:6px;padding:6px 16px;font-weight:600;border:none;cursor:pointer;font-size:12.5px}",
			".vk_personaSave:hover{filter:brightness(1.1)}",
			".vk_personaSave:disabled{opacity:.5;cursor:default}",
			// Skill / MCP 管理分区
			".vk_mgrList{display:flex;flex-direction:column;gap:8px}",
			".vk_mgrRow{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 12px;background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill))}",
			".vk_mgrInfo{flex:1;min-width:0}",
			".vk_mgrName{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".vk_mgrMeta{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.vk_mgrDesc{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}",
			".vk_mgrBadge{flex:none;font-size:11px;border-radius:999px;padding:2px 9px;font-weight:600}",
			".vk_mgrBadgeOn{color:#73c991;background:rgba(115,201,145,.14)}",
			".vk_mgrBadgeOff{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_mgrBtn{flex:none;appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;font-family:inherit}",
			".vk_mgrBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}",
			".vk_mgrBtn:disabled{opacity:.5;cursor:default}",
			".vk_mgrBtnDanger{color:#f14c4c;border-color:rgba(241,76,76,.35)}",
			".vk_mgrBtnDanger:hover{background:rgba(241,76,76,.1);color:#f14c4c}",
			".vk_mgrBtnPrimary{background:var(--vk-accent);color:#fff;border-color:transparent;font-weight:600}",
			".vk_mgrBtnPrimary:hover{filter:brightness(1.1);color:#fff}",
			".vk_mgrHead{display:flex;align-items:center;gap:8px;margin-bottom:10px}",
			".vk_mgrEmpty{font-size:12px;color:var(--dsw-alias-label-secondary);padding:18px 0;text-align:center}",
			".vk_mgrAddForm{display:flex;flex-direction:column;gap:8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:12px;margin-bottom:10px}",
			".vk_mgrInput{background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 10px;font-size:12.5px;font-family:inherit}",
			".vk_mgrInput:focus{outline:none;border-color:var(--vk-accent)}",
			".vk_mgrLabel{font-size:11.5px;color:var(--dsw-alias-label-secondary)}",
			// Git 面板样式（dsh-git-graph 风格）
			".vk_gitPanel{display:flex;flex-direction:column;height:100%;overflow:hidden}",
			".vk_gitToolbar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}",
			".vk_gitRepoSelect{flex:1;min-width:0;background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;cursor:pointer}",
			".vk_gitToolBtn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;font-family:inherit;transition:background-color .12s,color .12s}",
			".vk_gitToolBtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_gitToolBtn:disabled{opacity:.45;cursor:not-allowed}",
			".vk_gitToolBtnPrimary{background:var(--vk-accent);color:#fff;border-color:transparent;font-weight:600}",
			".vk_gitToolBtnPrimary:hover{filter:brightness(1.1);color:#fff}",
			// 变更区（VSCode 风格，dsh-git-graph 样式）
			".vk_gitSection{padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".vk_gitSectionTitle{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;color:var(--dsw-alias-label-secondary);padding:6px 10px 2px;margin:0}",
			".vk_gitChangeItem{display:flex;align-items:center;gap:8px;padding:3px 10px;font-size:12px;cursor:pointer;transition:background-color .1s;border-radius:6px;margin:0 4px}",
			".vk_gitChangeItem:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			// 状态徽标（dsh-git-graph wd-badge 风格）
			".vk_gitChangeStatus{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;font-family:Consolas,monospace;border-radius:5px}",
			".vk_gitM{background:rgba(240,136,62,.16);color:#f0883e}",
			".vk_gitA{background:rgba(63,185,80,.18);color:#3fb950}",
			".vk_gitD{background:rgba(248,81,73,.16);color:#f85149}",
			".vk_gitR{background:rgba(188,140,255,.16);color:#bc8cff}",
			".vk_gitU{background:rgba(210,153,34,.16);color:#d29922}",
			".vk_gitQ{background:rgba(154,167,180,.16);color:#9aa7b4}",
			".vk_gitChangeName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-family:Consolas,monospace;font-size:12px}",
			".vk_gitChangeAction{appearance:none;border:none;background:none;cursor:pointer;font-size:11px;padding:2px 5px;border-radius:4px;color:var(--dsw-alias-label-secondary)}",
			".vk_gitChangeAction:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_gitChangeActionDanger:hover{color:#f85149 !important;background:rgba(248,81,73,.1) !important}",
			".vk_gitCnt{flex:none;font-size:10px;font-family:Consolas,monospace;color:var(--dsw-alias-label-tertiary);margin-left:4px;white-space:nowrap}",
			".vk_gitInlineDiff{font-size:11px;font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;padding:4px 10px 4px 28px;border-bottom:1px solid var(--dsw-alias-border-l1);max-height:200px;overflow:auto;white-space:pre;line-height:16px;color:var(--dsw-alias-label-secondary)}",
			// 提交表单
			".vk_gitCommitForm{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:6px}",
			".vk_gitCommitInput{box-sizing:border-box;width:100%;background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;resize:none;min-height:52px}",
			".vk_gitCommitInput:focus{outline:none;border-color:var(--vk-accent)}",
			".vk_gitCommitRow{display:flex;align-items:center;gap:6px;justify-content:flex-end}",
			".vk_gitCommitBtn{background:var(--vk-accent);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}",
			".vk_gitCommitBtn:hover{filter:brightness(1.1)}",
			".vk_gitCommitBtn:disabled{opacity:.5;cursor:default}",
			".vk_gitEmpty{padding:20px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap}",
			// Diff 查看器（dsh-git-graph df-* 风格）
			".vk_gitDiffView{flex:1;min-height:0;overflow:auto;font-family:ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace;font-size:11.5px;line-height:1.6;padding:0}",
			".vk_gitDiffFile{font-size:12px;font-weight:700;padding:6px 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-sidebar-fill);border-bottom:1px solid var(--dsw-alias-border-l1);position:sticky;top:0;z-index:1}",
			".vk_gitDiffHunk{color:var(--dsw-alias-label-secondary);padding:2px 12px;font-size:11px;background:rgba(88,166,255,.08)}",
			".vk_gitDiffLine{display:flex;padding:0 12px;white-space:pre}",
			".vk_gitDiffSign{width:20px;flex:none;text-align:center;user-select:none}",
			".vk_gitDiffAdd{background:rgba(63,185,80,.14)}",
			".vk_gitDiffAdd .vk_gitDiffSign{color:#3fb950}",
			".vk_gitDiffDel{background:rgba(248,81,73,.14)}",
			".vk_gitDiffDel .vk_gitDiffSign{color:#f85149}",
			// 历史视图 + 图谱
			".vk_gitHistoryItem{padding:0;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;transition:background-color .1s}",
			".vk_gitHistoryItem:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".vk_gitGraphMsg{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".vk_gitGraphMeta{font-size:10.5px;color:var(--dsw-alias-label-tertiary);margin-top:1px}",
			// 分支/标签标签（dsh-git-graph cl-ref 风格）
			".vk_gitRefTag{font-size:9.5px;font-weight:700;padding:0 6px;border-radius:99px;white-space:nowrap;line-height:18px;flex:none}",
			".vk_gitRefTagBranch{color:#58a6ff;border:1px solid rgba(88,166,255,.35);background:rgba(88,166,255,.1)}",
			".vk_gitRefTagHead{color:#3fb950;border:1px solid rgba(63,185,80,.4);background:rgba(63,185,80,.12)}",
			".vk_gitRefTagTag{color:#d29922;border:1px solid rgba(210,153,34,.4);background:rgba(210,153,34,.1)}",
			// 管理面板改进：卡片式布局
			".vk_settingsCard{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-specific-input-fill,var(--dsw-specific-sidebar-fill))}",
			".vk_settingsCardRow{display:flex;align-items:center;gap:10px}",
			".vk_settingsCardLabel{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary)}",
			".vk_settingsCardDesc{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6}",
			".vk_settingsToggle{position:relative;width:36px;height:20px;flex:none;background:var(--dsw-alias-border-l2);border-radius:10px;cursor:pointer;transition:background-color .15s}",
			".vk_settingsToggleOn{background:var(--vk-accent)}",
			".vk_settingsToggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}",
			".vk_settingsToggleOn::after{transform:translateX(16px)}"
		].join("");
		{
			const tagId = "@anoslide/dsh-client-idea/vscode.module.css";
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@anoslide/dsh-client-idea";
				tag.dataset.pluginCss = tagId;
				tag.textContent = css;
				document.head.appendChild(tag);
			}
		}

		// ──────────────────────────────────────────────────────────────
		// 本地持久化：标签页与侧栏 Tab
		// ──────────────────────────────────────────────────────────────
		function loadTabs() {
			try {
				const raw = localStorage.getItem(LS_KEY);
				if (raw) {
					const d = JSON.parse(raw);
					if (d && Array.isArray(d.tabs)) {
						return {
							tabs: d.tabs.filter((t) => t && typeof t.path === "string" && typeof t.name === "string").slice(-20),
							active: typeof d.active === "string" ? d.active : null,
							sidebarTab: d.sidebarTab === "sessions" ? "sessions" : d.sidebarTab === "git" ? "git" : "files",
							root: typeof d.root === "string" && d.root.length > 0 ? d.root : null,
							roots: d.roots && typeof d.roots === "object" && !Array.isArray(d.roots) ? d.roots : {},
							mode: d.mode === "native" ? "native" : "ide"
						};
					}
				}
			} catch {}
			return { tabs: [], active: null, sidebarTab: "files", root: null, roots: {}, mode: "ide" };
		}
		function saveTabs(state) {
			try {
				localStorage.setItem(LS_KEY, JSON.stringify(state));
			} catch {}
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：行内重命名输入（模块级：稳定组件身份，避免每次渲染重挂载丢光标）
		// ──────────────────────────────────────────────────────────────
		function RenameRow({ pad, initialName, error, onCommit, onCancel }) {
			const [value, setValue] = react.useState(initialName);
			const commit = react.useCallback(() => {
				onCommit(value);
			}, [value, onCommit]);
			return h("div", { className: "vk_row", style: pad },
				h("input", {
					className: "vk_pickInput",
					value,
					autoFocus: true,
					onChange: (e) => setValue(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") onCancel();
					},
					onBlur: commit
				}),
				error !== null ? h("span", { className: "vk_saveMsg" }, error) : null
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：文件树
		// ──────────────────────────────────────────────────────────────
		function FileTree({ root, custom, onOpenFolder, onCloseFolder, onOpenFile, onPickNative, activePath, onDeleted, onRenamed }) {
			const [expanded, setExpanded] = react.useState(() => new Set());
			const [entries, setEntries] = react.useState(() => ({}));
			const [error, setError] = react.useState(null);
			const [picking, setPicking] = react.useState(false);
			const [draft, setDraft] = react.useState("");
			const [showHidden, setShowHidden] = react.useState(false);
			const [git, setGit] = react.useState(null);
			react.useEffect(() => {
				setGit(null);
				if (typeof root === "string" && root.length > 0) {
					fetch("/vscode-files/git?path=" + encodeURIComponent(root))
						.then((r) => r.json())
						.then((d) => { if (d && d.ok && d.statuses) setGit(d.statuses); })
						.catch(() => {});
				}
			}, [root]);
			const [creating, setCreating] = react.useState(null);
			const [createName, setCreateName] = react.useState("");
			const [createErr, setCreateErr] = react.useState(null);
			const [renaming, setRenaming] = react.useState(null);
			const [renameErr, setRenameErr] = react.useState(null);
			const [searchQ, setSearchQ] = react.useState("");
			const [searchResults, setSearchResults] = react.useState(null);
			const [ctxMenu, setCtxMenu] = react.useState(null);
			react.useEffect(() => {
				const q = searchQ.trim();
				if (q.length === 0) {
					setSearchResults(null);
					return;
				}
				if (typeof root !== "string" || root.length === 0) return;
				let dead = false;
				const timer = setTimeout(() => {
					fetch("/vscode-files/search?path=" + encodeURIComponent(root) + "&q=" + encodeURIComponent(q))
						.then((r) => r.json())
						.then((d) => { if (!dead) setSearchResults(d && d.ok ? d.results : []); })
						.catch(() => { if (!dead) setSearchResults([]); });
				}, 250);
				return () => { dead = true; clearTimeout(timer); };
			}, [searchQ, root]);
			react.useEffect(() => {
				setExpanded(new Set());
				setEntries({});
				setError(null);
				if (typeof root === "string" && root.length > 0) load(root);
			}, [root]);
			react.useEffect(() => {
				if (ctxMenu === null) return;
				const onDown = (e) => {
					if (e.target instanceof Element && e.target.closest("[data-vk-menu]")) return;
					setCtxMenu(null);
				};
				const onKey = (e) => { if (e.key === "Escape") setCtxMenu(null); };
				document.addEventListener("mousedown", onDown, true);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDown, true);
					document.removeEventListener("keydown", onKey);
				};
			}, [ctxMenu]);
			function load(path) {
				fetch("/vscode-files/list?path=" + encodeURIComponent(path))
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) setEntries((m) => ({ ...m, [path]: d }));
						else setError((d && d.error) || "加载失败");
					})
					.catch((e) => setError(String(e)));
			}
			function toggle(path) {
				const next = new Set(expanded);
				if (next.has(path)) next.delete(path);
				else {
					next.add(path);
					if (entries[path] === void 0) load(path);
				}
				setExpanded(next);
			}
			function rel(p) {
				if (typeof root !== "string") return null;
				if (p === root) return "";
				if (p.startsWith(root + "\\") || p.startsWith(root + "/")) return p.slice(root.length + 1).replace(/\\/g, "/");
				return null;
			}
			function badgeOf(code) {
				if (code === "??") return { text: "U", cls: " vk_gitU" };
				if (code.includes("M")) return { text: "M", cls: " vk_gitM" };
				if (code.includes("A")) return { text: "A", cls: " vk_gitA" };
				if (code.includes("D")) return { text: "D", cls: " vk_gitD" };
				if (code.includes("R")) return { text: "R", cls: " vk_gitR" };
				return null;
			}
			function dirBadge(dirPath) {
				if (git === null) return null;
				const base = rel(dirPath);
				if (base === null) return null;
				const prefix = base === "" ? "" : base + "/";
				let hasM = false;
				let hasOther = false;
				for (const k of Object.keys(git)) {
					const hit = prefix === "" ? !k.includes("/") : k.startsWith(prefix);
					if (!hit) continue;
					if (git[k].includes("M") || git[k].includes("D") || git[k].includes("R")) hasM = true;
					else hasOther = true;
				}
				if (hasM) return { text: "M", cls: " vk_gitM" };
				if (hasOther) return { text: "U", cls: " vk_gitU" };
				return null;
			}
			function parentOf(p) {
				const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
				return i > 0 ? p.slice(0, i) : p;
			}
			function refreshGit() {
				if (typeof root !== "string" || root.length === 0) return;
				fetch("/vscode-files/git?path=" + encodeURIComponent(root))
					.then((r) => r.json())
					.then((d) => { if (d && d.ok && d.statuses) setGit(d.statuses); })
					.catch(() => {});
			}
			function contextCreate(kind) {
				const n = prompt("请输入" + (kind === "dir" ? "文件夹" : "文件") + "名：");
				if (n === null || n.trim().length === 0) return;
				const parent = ctxMenu !== null ? (ctxMenu.isDir ? ctxMenu.path : parentOf(ctxMenu.path)) : (typeof root === "string" ? root : "");
				if (typeof parent !== "string" || parent.length === 0) return;
				const endpoint = kind === "dir" ? "/vscode-files/mkdir" : "/vscode-files/mkfile";
				fetch(endpoint + "?path=" + encodeURIComponent(parent), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path: parent, name: n.trim() })
				})
				.then((r) => r.json())
				.then((d) => {
					if (d && d.ok) {
						setCtxMenu(null);
						refreshAround(parent);
						if (kind === "file" && d.path) onOpenFile({ path: d.path, name: n.trim() });
					} else alert("创建失败：" + ((d && d.error) || "未知错误"));
				})
				.catch((e) => alert("创建失败：" + String(e)));
			}
			function refreshAround(dirPath) {
				load(dirPath);
				setEntries((m) => {
					const next = {};
					for (const k of Object.keys(m)) {
						if (k === dirPath) continue;
						if (k.startsWith(dirPath + "\\") || k.startsWith(dirPath + "/")) continue;
						next[k] = m[k];
					}
					return next;
				});
				refreshGit();
			}
			function commitCreate() {
				const n = createName.trim();
				const kind = creating;
				if (n.length === 0 || kind === null) return;
				const parent = typeof root === "string" ? root : "";
				if (parent.length === 0) return;
				const endpoint = kind === "dir" ? "/vscode-files/mkdir" : "/vscode-files/mkfile";
				fetch(endpoint + "?path=" + encodeURIComponent(parent), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path: parent, name: n })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) {
							setCreateErr(null);
							setCreating(null);
							setCreateName("");
							refreshAround(parent);
							if (kind === "file" && d.path) onOpenFile({ path: d.path, name: n });
						} else setCreateErr((d && d.error) || "创建失败");
					})
					.catch((e) => setCreateErr(String(e)));
			}
			function commitRename(nameOverride) {
				if (renaming === null) return;
				const n = (nameOverride ?? renaming.name).trim();
				if (n.length === 0 || n === renaming.oldName) {
					setRenaming(null);
					setRenameErr(null);
					return;
				}
				fetch("/vscode-files/rename?path=" + encodeURIComponent(renaming.path), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path: renaming.path, newName: n })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) {
							const newPath = d.path;
							setRenaming(null);
							setRenameErr(null);
							refreshAround(parentOf(renaming.path));
							onRenamed?.(renaming.path, newPath, n);
						} else setRenameErr((d && d.error) || "重命名失败");
					})
					.catch((e) => setRenameErr(String(e)));
			}
			function doDelete(path, name) {
				if (typeof confirm === "function" && !confirm(`删除「${name}」？\n（会送入回收站，可从回收站恢复）`)) return;
				fetch("/vscode-files/delete?path=" + encodeURIComponent(path), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) {
							refreshAround(parentOf(path));
							onDeleted?.(path);
						} else setError((d && d.error) || "删除失败");
					})
					.catch((e) => setError(String(e)));
			}
			function rows(dir, depth) {
				if (!dir) return [];
				const out = [];
				for (const d of dir.dirs) {
					if (d.hidden && !showHidden) continue;
					out.push(h(Row, { key: d.path, path: d.path, name: d.name, isDir: true, hidden: d.hidden, active: d.path === activePath, badge: dirBadge(d.path), depth, expanded: expanded.has(d.path), onToggle: () => toggle(d.path) }));
					if (expanded.has(d.path) && entries[d.path] && entries[d.path].ok) out.push(...rows(entries[d.path], depth + 1));
				}
				for (const f of dir.files) {
					if (f.hidden && !showHidden) continue;
					const code = git !== null ? git[rel(f.path) ?? ""] ?? null : null;
					out.push(h(Row, { key: f.path, path: f.path, name: f.name, isDir: false, hidden: f.hidden, active: f.path === activePath, badge: code !== null && rel(f.path) !== null ? badgeOf(code) : null, depth, onToggle: () => onOpenFile({ path: f.path, name: f.name }) }));
				}
				return out;
			}
			function Row(props) {
				const pad = { paddingLeft: 10 + props.depth * 16 + "px" };
				if (renaming !== null && renaming.path === props.path) {
					return h(RenameRow, {
						pad,
						initialName: renaming.name,
						error: renameErr,
						onCommit: (value) => commitRename(value),
						onCancel: () => { setRenaming(null); setRenameErr(null); }
					});
				}
				const caret = props.isDir ? h("span", { className: "vk_caret" }, props.expanded ? "▾" : "▸") : h("span", { className: "vk_caret" }, "\u00A0");
				// 缩进参考线（纯装饰）：对齐各级祖先目录的 caret 中心
				const guides = [];
				for (let i = 0; i < props.depth; i++) guides.push(h("span", { key: "g" + i, className: "vk_guide", style: { left: 17 + i * 16 + "px" } }));
				const ic = iconOf(props.name, props.isDir, props.isDir && props.expanded === true);
				const icon = h("span", { className: "vk_icon " + ic.c }, ic.g);
				const name = props.isDir
					? h("span", { className: "vk_name vk_dirName" }, props.name)
					: h("span", { className: "vk_name" }, props.name);
				const badge = props.badge ? h("span", { className: "vk_gitBadge" + props.badge.cls }, props.badge.text) : null;
				const actions = h("span", { className: "vk_rowActions" },
					h("button", { className: "vk_rowBtn", title: "重命名", onClick: (e) => { e.stopPropagation(); setRenaming({ path: props.path, name: props.name, oldName: props.name }); setRenameErr(null); } }, "🖊"),
					h("button", { className: "vk_rowBtn", title: "删除（送入回收站）", onClick: (e) => { e.stopPropagation(); doDelete(props.path, props.name); } }, "🗑")
				);
				return h("div", { className: "vk_row" + (props.hidden ? " vk_rowHidden" : "") + (props.active ? " vk_rowActive" : ""), style: pad, onClick: props.onToggle, onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, path: props.path, name: props.name, isDir: props.isDir }); } }, guides, caret, icon, name, badge, actions);
			}
			function commitFolder() {
				const p = draft.trim();
				setPicking(false);
				setDraft("");
				if (p.length > 0) onOpenFolder(p);
			}
			const title = typeof root === "string" && root.length > 0 ? (root.split(/[\\/]/).pop() || root) : "文件";
			const head = h("div", { className: "vk_treeHead" },
				h("span", { className: "vk_treeTitle", title: typeof root === "string" ? root : "" }, title),
				h("button", {
					className: "vk_treeBtn",
					title: "打开文件夹（系统对话框）",
					onClick: async () => {
						try {
							const p = await onPickNative();
							if (typeof p === "string" && p.length > 0) onOpenFolder(p);
						} catch {
							setPicking(true);
							setDraft("");
						}
					}
				}, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629Z", fill: "currentColor" }))),
				h("button", { className: "vk_treeBtn" + (showHidden ? " vk_treeBtnActive" : ""), title: showHidden ? "隐藏系统/配置文件" : "显示系统/配置文件（node_modules、.git 等）", onClick: () => setShowHidden((v) => !v) }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M8 3.5C5.5 3.5 3.2 5.2 1.5 8C3.2 10.8 5.5 12.5 8 12.5C10.5 12.5 12.8 10.8 14.5 8C12.8 5.2 10.5 3.5 8 3.5ZM8 11C6.3 11 5 9.7 5 8C5 6.3 6.3 5 8 5C9.7 5 11 6.3 11 8C11 9.7 9.7 11 8 11ZM8 6.5C7.2 6.5 6.5 7.2 6.5 8C6.5 8.8 7.2 9.5 8 9.5C8.8 9.5 9.5 8.8 9.5 8C9.5 7.2 8.8 6.5 8 6.5Z", fill: "currentColor" }))),
				h("button", { className: "vk_treeBtn", title: "手动输入路径", onClick: () => { setPicking(true); setDraft(""); } }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M2.5 13.5L6.5 9.5M6.5 9.5L5 8L6.5 6.5L8 5L9.5 6.5L11 8L9.5 9.5L6.5 12.5L13.5 13.5L13.5 2.5L2.5 2.5L2.5 13.5Z", fill: "currentColor" }))),
				h("button", { className: "vk_treeBtn" + (creating !== null ? " vk_treeBtnActive" : ""), title: "新建文件/文件夹", onClick: () => { setCreating(creating === null ? "file" : null); setCreateName(""); setCreateErr(null); } }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z", fill: "currentColor" }))),
				custom ? h("button", { className: "vk_treeBtn", title: "关闭当前文件夹（回到会话工作区）", onClick: onCloseFolder }, "×") : null
			);
			const picker = picking ? h("div", { className: "vk_pickForm" },
				h("input", {
					className: "vk_pickInput",
					placeholder: "输入文件夹绝对路径，如 D:\\csgo.text",
					value: draft,
					autoFocus: true,
					onChange: (e) => setDraft(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") commitFolder();
						if (e.key === "Escape") { setPicking(false); setDraft(""); }
					}
				}),
				h("div", { className: "vk_pickRow" },
					h("button", { className: "vk_pickBtn", onClick: commitFolder }, "打开"),
					h("button", { className: "vk_pickBtn", onClick: () => { setPicking(false); setDraft(""); } }, "取消")
				)
			) : null;
			const createForm = creating !== null ? h("div", { className: "vk_pickForm" },
				h("div", { className: "vk_pickRow" },
					h("button", { className: "vk_pickBtn" + (creating === "file" ? " vk_modeBtn" : ""), onClick: () => setCreating("file") }, "新建文件"),
					h("button", { className: "vk_pickBtn" + (creating === "dir" ? " vk_modeBtn" : ""), onClick: () => setCreating("dir") }, "新建文件夹")
				),
				h("input", {
					className: "vk_pickInput",
					placeholder: creating === "dir" ? "文件夹名" : "文件名",
					value: createName,
					autoFocus: true,
					onChange: (e) => setCreateName(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") commitCreate();
						if (e.key === "Escape") { setCreating(null); setCreateName(""); setCreateErr(null); }
					}
				}),
				createErr !== null ? h("span", { className: "vk_saveMsg" }, createErr) : null,
				h("div", { className: "vk_pickRow" },
					h("button", { className: "vk_pickBtn", onClick: commitCreate }, "创建"),
					h("button", { className: "vk_pickBtn", onClick: () => { setCreating(null); setCreateName(""); setCreateErr(null); } }, "取消")
				)
			) : null;
			const searchForm = h("div", { className: "vk_searchWrap" },
				h("div", { className: "vk_searchInputWrap" },
					h("span", { className: "vk_searchIcon" }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z", fill: "currentColor" }), h("path", { d: "M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z", fill: "currentColor" }))),
					h("input", {
						className: "vk_pickInput vk_searchInput",
						placeholder: "输入文件名",
						value: searchQ,
						onChange: (e) => setSearchQ(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Escape") { setSearchQ(""); }
							if (e.key === "Enter" && searchResults !== null && searchResults.length > 0) {
								const first = searchResults[0];
								onOpenFile({ path: first.path, name: first.name });
								setSearchQ("");
							}
						}
					})
				)
			);
			const dir = typeof root === "string" && root.length > 0 ? entries[root] : void 0;
			const body = (() => {
				if (searchQ.trim().length > 0) {
					if (searchResults === null) return h("div", { className: "vk_empty" }, "搜索中…");
					if (searchResults.length === 0) return h("div", { className: "vk_empty" }, "没有匹配的文件");
					return searchResults.map((r) => h("div", { key: r.path, className: "vk_row", style: { paddingLeft: 10 + "px" }, onClick: () => { onOpenFile({ path: r.path, name: r.name }); setSearchQ(""); } },
						h("span", { className: "vk_caret" }, "\u00A0"),
						h("span", { className: "vk_icon " + iconOf(r.name, false, false).c }, iconOf(r.name, false, false).g),
						h("span", { className: "vk_name vk_nameFixed" }, r.name),
						h("span", { className: "vk_relPath" }, r.rel)
					));
				}
				if (typeof root !== "string" || root.length === 0) return h("div", { className: "vk_empty" }, "暂无工作区\n打开一个会话后，这里会显示其文件树");
				if (error !== null) return h("div", { className: "vk_err" }, error);
				if (dir === void 0) return h("div", { className: "vk_empty" }, "加载中…");
				if (dir.ok) {
					const hiddenCount = showHidden ? 0 : dir.dirs.filter((d) => d.hidden).length + dir.files.filter((f) => f.hidden).length;
					return [...rows(dir, 0), hiddenCount > 0 ? h("div", { key: "__hiddenHint", className: "vk_hiddenHint" }, "⋯ 已折叠 " + hiddenCount + " 个隐藏项（点 👁 显示）") : null];
				}
				return h("div", { className: "vk_err" }, dir.error || "无法读取目录");
			})();
			return h("div", { className: "vk_treeWrap" }, head, picker, createForm, searchForm, h("div", { className: "vk_tree" }, body),
				ctxMenu !== null ? h("div", { className: "vk_menu", "data-vk-menu": true, style: { left: Math.min(ctxMenu.x, window.innerWidth - 200) + "px", top: Math.min(ctxMenu.y, window.innerHeight - 160) + "px" } },
					h("button", { className: "vk_menuItem", onClick: () => contextCreate("file") }, "新建文件"),
					h("button", { className: "vk_menuItem", onClick: () => contextCreate("dir") }, "新建文件夹"),
					h("div", { className: "vk_menuSep" }),
					h("button", { className: "vk_menuItem", onClick: () => { copyToClipboard(ctxMenu.path); setCtxMenu(null); } }, "复制绝对路径"),
					h("button", { className: "vk_menuItem", onClick: () => { const r = ctxMenu.path !== null && typeof root === "string" ? (ctxMenu.path.startsWith(root + "\\") || ctxMenu.path.startsWith(root + "/") ? ctxMenu.path.slice(root.length + 1).replace(/\\/g, "/") : ctxMenu.path) : ctxMenu.path; copyToClipboard(r); setCtxMenu(null); } }, "复制相对路径"),
					// Git 操作（仅对非目录显示）
					ctxMenu !== null && !ctxMenu.isDir ? (() => {
						const relPath = ctxMenu.path !== null && typeof root === "string" ? (ctxMenu.path.startsWith(root + "\\") || ctxMenu.path.startsWith(root + "/") ? ctxMenu.path.slice(root.length + 1).replace(/\\/g, "/") : null) : null;
						const code = relPath !== null && git !== null ? git[relPath] : null;
						const isStaged = code !== null && code !== "??" && code[0] !== " ";
						const isUnstaged = code !== null && ((code.length > 1 && code[1] !== " ") || code === "??");
						return h("div", { style: { display: "contents" } },
							h("div", { className: "vk_menuSep" }),
							isStaged ? h("button", { className: "vk_menuItem", onClick: () => { const p = ctxMenu.path; const rp = rel(p); fetch("/vscode-files/git?path=" + encodeURIComponent(root), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unstage", files: [rp] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refreshGit(); }); setCtxMenu(null); } }, "取消暂存") : null,
							isUnstaged ? h("button", { className: "vk_menuItem", onClick: () => { const p = ctxMenu.path; const rp = rel(p); fetch("/vscode-files/git?path=" + encodeURIComponent(root), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", files: [rp] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refreshGit(); }); setCtxMenu(null); } }, "暂存到暂存区") : null,
							isUnstaged ? h("button", { className: "vk_menuItem vk_menuItemDanger", onClick: () => { const p = ctxMenu.path; const rp = rel(p); if (typeof confirm === "function" && !confirm("确定还原「" + ctxMenu.name + "」？")) return; fetch("/vscode-files/git?path=" + encodeURIComponent(root), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore", files: [rp] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refreshGit(); }); setCtxMenu(null); } }, "还原文件") : null
						);
					})() : null
				) : null
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：查看器
		// ──────────────────────────────────────────────────────────────
		function Viewer({ file, rev, onStartEdit }) {
			const [state, setState] = react.useState({ loading: true });
			const [hl, setHl] = react.useState(null);
			// 浅色/深色主题切换时重取高亮（服务端按 theme 出 github-light/github-dark 色板）
			const [themeTick, setThemeTick] = react.useState(0);
			react.useEffect(() => {
				const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
				mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
				return () => mo.disconnect();
			}, []);
			react.useEffect(() => {
				let dead = false;
				setState({ loading: true });
				fetch("/vscode-files/read?path=" + encodeURIComponent(file.path))
					.then((r) => r.json())
					.then((d) => {
						if (!dead) {
							setState(d && d.ok ? d : { error: (d && d.error) || "读取失败" });
							// 文本文件加载完成后直接进入编辑模式
							if (d && d.ok && d.kind === "text") {
								onStartEdit(d.content);
							}
						}
					})
					.catch((e) => { if (!dead) setState({ error: String(e) }); });
				return () => { dead = true; };
			}, [file.path, rev, onStartEdit]);
			react.useEffect(() => {
				if (state.kind !== "text") return;
				let dead = false;
				const theme = document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
				fetch("/vscode-files/highlight?path=" + encodeURIComponent(file.path) + "&theme=" + theme)
					.then((r) => r.json())
					.then((d) => { if (!dead) setHl(d && d.ok ? d.html : null); })
					.catch(() => { if (!dead) setHl(null); });
				return () => { dead = true; };
			}, [file.path, rev, state.kind, themeTick]);
			const editable = state.kind === "text";
			const bar = h("div", { className: "vk_editBar" },
				editable ? h("button", { className: "vk_editBtn", title: "编辑此文件（Ctrl+S 保存）", onClick: () => onStartEdit(state.content) }, "✏️ 编辑") : null,
				h("div", { style: { flex: 1 } })
			);
			if (state.loading) return h("div", { className: "vk_editorBody" }, bar, h("div", { className: "vk_notice" }, "加载中…"));
			if (state.error !== void 0) return h("div", { className: "vk_editorBody" }, bar, h("div", { className: "vk_notice" }, "读取失败：\n" + state.error));
			if (state.kind === "binary") return h("div", { className: "vk_editorBody" }, bar, h("div", { className: "vk_notice" }, "二进制文件，无法预览\n（" + state.size + " 字节）"));
			if (state.kind === "too-large") {
				const head = "文件过大，仅显示前 2 MB（超大文件暂不支持编辑）\n\n";
				const lines = (head + state.content).split("\n");
				const tokens = tokenize(head + state.content, familyOf(file.path));
				const gutter = lines.map((_, i) => String(i + 1)).join("\n");
				const codeChildren = tokens.map((tok, i) => tok[0] === null ? escapeHtml(tok[1]) : h("span", { key: i, className: tok[0] }, escapeHtml(tok[1])));
				return h("div", { className: "vk_editorBody" },
					bar,
					h("div", { className: "vk_viewer" },
						h("div", { className: "vk_gutter" }, gutter),
						h("pre", { className: "vk_code" }, codeChildren)
					)
				);
			}
			const lines = state.content.split("\n");
			const gutter = lines.map((_, i) => String(i + 1)).join("\n");
			if (hl !== null) {
				return h("div", { className: "vk_editorBody" },
					bar,
					h("div", { className: "vk_viewer" },
						h("div", { className: "vk_gutter" }, gutter),
						h("div", { className: "vk_code vk_codeHl", dangerouslySetInnerHTML: { __html: hl } })
					)
				);
			}
			const tokens = tokenize(state.content, familyOf(file.path));
			const codeChildren = tokens.map((tok, i) => tok[0] === null ? escapeHtml(tok[1]) : h("span", { key: i, className: tok[0] }, escapeHtml(tok[1])));
			return h("div", { className: "vk_editorBody" },
				bar,
				h("div", { className: "vk_viewer" },
					h("div", { className: "vk_gutter" }, gutter),
					h("pre", { className: "vk_code" }, codeChildren)
				)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：编辑区（多标签 + 查看器）
		// ──────────────────────────────────────────────────────────────
		function EditorArea({ tabs, activePath, onSelect, onClose, onMoveTab, trajectory }) {
			const hasTabs = tabs.length > 0;
			const active = hasTabs ? (tabs.find((t) => t.path === activePath) ?? tabs[tabs.length - 1]) : null;
			const currentPath = active !== null ? active.path : null;
			const [edits, setEdits] = react.useState({});
			const [revisions, setRevisions] = react.useState({});
			const [busy, setBusy] = react.useState(false);
			const [saveMsg, setSaveMsg] = react.useState(null);
			const [dragged, setDragged] = react.useState(null);
			const [ctxMenu, setCtxMenu] = react.useState(null);
			const editorRef = react.useRef(null);
			const gutterRef = react.useRef(null);
			react.useEffect(() => {
				if (ctxMenu === null) return;
				const onDown = (e) => {
					if (e.target instanceof Element && e.target.closest("[data-vk-menu]")) return;
					setCtxMenu(null);
				};
				const onKey = (e) => { if (e.key === "Escape") setCtxMenu(null); };
				document.addEventListener("mousedown", onDown, true);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDown, true);
					document.removeEventListener("keydown", onKey);
				};
			}, [ctxMenu]);
			react.useEffect(() => {
				if (typeof document === "undefined" || currentPath === null) return;
				const el = document.querySelector(`[data-vk-path="${CSS.escape(currentPath)}"]`);
				el?.scrollIntoView({ inline: "nearest", block: "nearest" });
			}, [currentPath]);
			const editing = currentPath !== null && edits[currentPath] !== void 0;
			const dirty = editing && edits[currentPath].dirty === true;
			const editText = editing ? edits[currentPath].text : "";
			const editLines = editText ? editText.split("\n") : [""];
			const gutterText = editLines.map((_, i) => String(i + 1)).join("\n");
			const editTokens = editing && currentPath !== null ? tokenize(editText, familyOf(currentPath)) : [];
			const codeChildren = editTokens.map((tok, i) => tok[0] === null ? escapeHtml(tok[1]) : h("span", { key: i, className: tok[0] }, escapeHtml(tok[1])));
			const save = react.useCallback(async () => {
				const edit = edits[currentPath];
				if (edit === void 0 || busy) return;
				setBusy(true);
				setSaveMsg("保存中…");
				try {
					const r = await fetch("/vscode-files/write?path=" + encodeURIComponent(currentPath), {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ path: currentPath, content: edit.text })
					});
					const d = await r.json();
					if (d && d.ok) {
						setEdits((prev) => {
							const next = { ...prev };
							delete next[currentPath];
							return next;
						});
						setRevisions((prev) => ({ ...prev, [currentPath]: (prev[currentPath] ?? 0) + 1 }));
						setSaveMsg("已保存");
						setTimeout(() => setSaveMsg(null), 2000);
					} else {
						setSaveMsg("保存失败：" + ((d && d.error) || "unknown"));
					}
				} catch (e) {
					setSaveMsg("保存失败：" + String(e));
				} finally {
					setBusy(false);
				}
			}, [currentPath, edits, busy]);
			const cancel = react.useCallback(() => {
				const edit = edits[currentPath];
				if (edit !== void 0 && edit.dirty && typeof confirm === "function" && !confirm("放弃未保存的修改？")) return;
				setEdits((prev) => {
					const next = { ...prev };
					delete next[currentPath];
					return next;
				});
				setSaveMsg(null);
			}, [currentPath, edits]);
			const startEdit = react.useCallback((content) => {
				setEdits((prev) => ({ ...prev, [currentPath]: { text: content, dirty: false } }));
				setSaveMsg(null);
			}, [currentPath]);
			const onEditText = react.useCallback((text) => {
				setEdits((prev) => ({ ...prev, [currentPath]: { text, dirty: true } }));
			}, [currentPath]);
			const closeTab = react.useCallback((path) => {
				const edit = edits[path];
				if (edit !== void 0 && edit.dirty && typeof confirm === "function" && !confirm("该标签有未保存的修改，关闭将丢失。确定关闭？")) return;
				onClose(path);
				setEdits((prev) => {
					if (!(path in prev)) return prev;
					const next = { ...prev };
					delete next[path];
					return next;
				});
			}, [edits, onClose]);
			const closePaths = react.useCallback((paths) => {
				if (paths.length === 0) return;
				const dirtyAny = paths.some((p) => edits[p]?.dirty === true);
				if (dirtyAny && typeof confirm === "function" && !confirm("有未保存的标签，关闭将丢失修改。确定关闭？")) return;
				for (const p of paths) onClose(p);
				setEdits((prev) => {
					const next = { ...prev };
					for (const p of paths) delete next[p];
					return next;
				});
			}, [edits, onClose]);
			const menuItem = (label, action, danger) => h("button", {
				className: "vk_menuItem" + (danger ? " vk_menuItemDanger" : ""),
				onClick: () => { setCtxMenu(null); action(); }
			}, label);
			if (!hasTabs) {
				return h("div", { className: "vk_editor" }, h("div", { className: "vk_empty" }, "从左侧文件树打开一个文件\n（点击文件名即可在标签页中查看）"));
			}
			return h("div", { className: "vk_editor" },
				h("div", {
					className: "vk_tabStrip",
					onWheel: (e) => {
						if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
					},
					onContextMenu: (e) => {
						if (e.target instanceof Element && e.target.closest(".vk_fileTab")) return;
						e.preventDefault();
						setCtxMenu({ x: e.clientX, y: e.clientY, path: null });
					}
				}, tabs.map((t) => {
					const ic = iconOf(t.name, false, false);
					const isDirty = edits[t.path]?.dirty === true;
					return h("div", {
						key: t.path,
						"data-vk-path": t.path,
						className: "vk_fileTab" + (t.path === active.path ? " vk_fileTabActive" : "") + (isDirty ? " vk_fileTabDirty" : ""),
						title: t.path,
						draggable: true,
						onDragStart: (e) => {
							setDragged(t.path);
							e.dataTransfer.effectAllowed = "move";
							try { e.dataTransfer.setData("text/plain", t.path); } catch {}
						},
						onDragOver: (e) => {
							e.preventDefault();
							if (dragged !== null && dragged !== t.path) onMoveTab(dragged, t.path);
						},
						onDragEnd: () => setDragged(null),
						onDrop: (e) => e.preventDefault(),
						onClick: () => onSelect(t.path),
						onContextMenu: (e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, path: t.path }); }
					},
						h("span", { className: "vk_icon " + ic.c }, ic.g),
						h("span", { className: "vk_tabName" }, t.name),
						isDirty ? h("span", { className: "vk_dirtyDot vk_tabDot", title: "未保存" }) : null,
						h("button", {
							className: "vk_tabClose",
							title: "关闭",
							onClick: (e) => { e.stopPropagation(); closeTab(t.path); }
						}, "×")
					);
				})),
				editing
					? h("div", { className: "vk_editorEditMode" },
						h("div", { className: "vk_gutter", ref: gutterRef, style: { overflow: "hidden", position: "relative", paddingTop: 0, paddingBottom: 0, display: "flex", flexDirection: "column" } },
							h("div", { style: { whiteSpace: "pre", textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "10px 12px 10px 0", flex: "none" } }, gutterText)
						),
						h("div", { className: "vk_editorCodeWrap" },
							h("pre", { className: "vk_editorHighlight", "aria-hidden": true }, codeChildren),
							h("textarea", {
								className: "vk_editorInput",
								value: edits[currentPath].text,
								spellCheck: false,
								autoFocus: true,
								style: { background: "transparent", color: "transparent", position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 },
								onChange: (e) => onEditText(e.target.value),
								onScroll: (e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; },
								onKeyDown: (e) => {
									if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
										e.preventDefault();
										save();
									}
									if (e.key === "Escape") cancel();
								}
							})
						)
					)
					: (active !== null && active.path === TRAJECTORY_TAB_PATH)
						? h("div", { className: "vk_editorBody vk_trajBody" }, trajectory ?? h("div", { className: "vk_notice" }, "轨迹视图不可用"))
						: h(Viewer, { file: active, rev: revisions[active.path] ?? 0, onStartEdit: startEdit }),
				ctxMenu !== null ? h("div", {
					className: "vk_menu",
					"data-vk-menu": true,
					style: { left: Math.min(ctxMenu.x, window.innerWidth - 180) + "px", top: Math.min(ctxMenu.y, window.innerHeight - 200) + "px" }
				},
					ctxMenu.path !== null ? menuItem("关闭", () => closeTab(ctxMenu.path)) : null,
					ctxMenu.path !== null ? menuItem("关闭其他", () => closePaths(tabs.map((t) => t.path).filter((p) => p !== ctxMenu.path))) : null,
					ctxMenu.path !== null ? menuItem("关闭左侧", () => {
						const i = tabs.findIndex((t) => t.path === ctxMenu.path);
						closePaths(tabs.slice(0, i).map((t) => t.path));
					}) : null,
					ctxMenu.path !== null ? menuItem("关闭右侧", () => {
						const i = tabs.findIndex((t) => t.path === ctxMenu.path);
						closePaths(tabs.slice(i + 1).map((t) => t.path));
					}) : null,
					menuItem("关闭全部", () => closePaths(tabs.map((t) => t.path)), true)
				) : null
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：全局人设设置分区（settings.section，类似 CC 的全局 CLAUDE.md）
		// ──────────────────────────────────────────────────────────────
		function PersonaSection() {
			const [content, setContent] = react.useState(null); // null = 加载中
			const [saving, setSaving] = react.useState(false);
			const [msg, setMsg] = react.useState(null); // {ok, text}
			react.useEffect(() => {
				let dead = false;
				fetch("/vscode-files/persona")
					.then((r) => r.json())
					.then((d) => { if (!dead) setContent(d && d.ok ? (d.content || "") : ""); })
					.catch(() => { if (!dead) setContent(""); });
				return () => { dead = true; };
			}, []);
			const save = () => {
				setSaving(true);
				setMsg(null);
				fetch("/vscode-files/persona", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) })
					.then((r) => r.json())
					.then((d) => { setSaving(false); setMsg(d && d.ok ? { ok: true, text: "已保存 ✓ 新消息立即生效" } : { ok: false, text: (d && d.error) || "保存失败" }); })
					.catch((e) => { setSaving(false); setMsg({ ok: false, text: String(e) }); });
			};
			return h("div", { className: "vk_personaSection" },
				h("div", { className: "vk_personaDesc" }, "类似 Claude Code 的全局 CLAUDE.md：内容会注入到所有会话的系统提示中，新消息立即生效（无需重启）。支持 Markdown。"),
				content === null
					? h("div", { className: "vk_personaDesc" }, "加载中…")
					: h("textarea", { className: "vk_personaArea", value: content, onChange: (e) => setContent(e.target.value), placeholder: "例如：\n- 你叫小鲸，说话简洁直接\n- 一律用简体中文回答\n- …" }),
				h("div", { className: "vk_personaFoot" },
					msg !== null ? h("div", { className: "vk_personaMsg" + (msg.ok ? " vk_personaMsgOk" : " vk_personaMsgErr") }, msg.text) : null,
					h("div", { style: { flex: 1 } }),
					h("button", { className: "vk_personaSave", disabled: saving || content === null, onClick: save }, saving ? "保存中…" : "保存")
				)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：Skill 管理分区（~/.dsh/skills，开关/删除）
		// ──────────────────────────────────────────────────────────────
		function SkillSection() {
			const [skills, setSkills] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [err, setErr] = react.useState(null);
			const refresh = react.useCallback(() => {
				let dead = false;
				setBusy(true);
				fetch("/vscode-files/skills")
					.then((r) => r.json())
					.then((d) => { if (!dead) { setSkills(d && d.ok ? d.skills : []); setErr(null); } })
					.catch((e) => { if (!dead) setErr(String(e)); })
					.finally(() => { if (!dead) setBusy(false); });
				return () => { dead = true; };
			}, []);
			react.useEffect(refresh, [refresh]);
			const act = (path, kind) => {
				setBusy(true);
				setErr(null);
				fetch("/vscode-files/skills/" + kind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) })
					.then((r) => r.json())
					.then((d) => { if (!d || !d.ok) setErr((d && d.error) || "操作失败"); refresh(); })
					.catch((e) => { setErr(String(e)); setBusy(false); });
			};
			return h("div", { className: "vk_personaSection" },
				h("div", { className: "vk_mgrHead" },
					h("div", { className: "vk_personaDesc", style: { flex: 1 } }, "管理 ~/.dsh/skills 下的全局 Skill（目录含 SKILL.md，或单文件 .md）。关闭 = 标记 .disabled，不删除内容。"),
					h("button", { className: "vk_mgrBtn", onClick: refresh, disabled: busy }, "刷新")
				),
				err !== null ? h("div", { className: "vk_personaMsg vk_personaMsgErr" }, String(err)) : null,
				skills === null ? h("div", { className: "vk_mgrEmpty" }, "加载中…")
					: skills.length === 0 ? h("div", { className: "vk_mgrEmpty" }, "暂无全局 Skill（~/.dsh/skills 为空）")
					: h("div", { className: "vk_mgrList" },
						skills.map((s) => h("div", { key: s.path, className: "vk_mgrRow" },
							h("div", { className: "vk_mgrInfo" },
								h("div", { className: "vk_mgrName" }, s.name),
								h("div", { className: "vk_mgrMeta" }, (s.kind === "dir" ? "目录" : "单文件") + " · " + s.path)
							),
							h("span", { className: "vk_mgrBadge " + (s.enabled ? "vk_mgrBadgeOn" : "vk_mgrBadgeOff") }, s.enabled ? "开启" : "关闭"),
							h("button", { className: "vk_mgrBtn", disabled: busy, onClick: () => act(s.path, "toggle") }, s.enabled ? "关闭" : "开启"),
							h("button", { className: "vk_mgrBtn vk_mgrBtnDanger", disabled: busy, onClick: () => { if (window.confirm("确定删除 Skill「" + s.name + "」？（送回收站，可恢复）")) act(s.path, "delete"); } }, "删除")
						))
					)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：MCP 管理分区（~/.dsh/mcp-servers.json，开关/删除/添加）
		// ──────────────────────────────────────────────────────────────
		function MCPSection() {
				const [servers, setServers] = react.useState(null);
				const [busy, setBusy] = react.useState(false);
				const [err, setErr] = react.useState(null);
				const [showAdd, setShowAdd] = react.useState(false);
				const [form, setForm] = react.useState({ serverName: "", transport: "stdio", command: "", args: "", url: "", env: "{}", desc: "" });
				const [editingId, setEditingId] = react.useState(null);
				const [editForm, setEditForm] = react.useState({ serverName: "", desc: "", command: "", args: "", url: "", env: "{}" });
				const refresh = react.useCallback(() => {
					let dead = false;
					setBusy(true);
					fetch("/vscode-files/mcp")
						.then((r) => r.json())
						.then((d) => { if (!dead) { setServers(d && d.ok ? d.servers : []); setErr(null); } })
						.catch((e) => { if (!dead) setErr(String(e)); })
						.finally(() => { if (!dead) setBusy(false); });
					return () => { dead = true; };
				}, []);
				react.useEffect(refresh, [refresh]);
				const act = (id, kind) => {
					setBusy(true);
					setErr(null);
					fetch("/vscode-files/mcp/" + kind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
						.then((r) => r.json())
						.then((d) => { if (!d || !d.ok) setErr((d && d.error) || "操作失败"); refresh(); })
						.catch((e) => { setErr(String(e)); setBusy(false); });
				};
				const submitAdd = () => {
					let env = {};
					try {
						env = JSON.parse(form.env || "{}");
						if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("not object");
					} catch {
						setErr("环境变量需为 JSON 对象，如 {\"KEY\":\"value\"}");
						return;
					}
					setBusy(true);
					setErr(null);
					fetch("/vscode-files/mcp/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
						serverName: form.serverName.trim(),
						transport: form.transport,
						command: form.command.trim(),
						args: form.args.split(/[\s,]+/).filter(Boolean),
						url: form.url.trim(),
						env,
						desc: form.desc.trim()
					}) })
						.then((r) => r.json())
						.then((d) => {
							setBusy(false);
							if (!d || !d.ok) setErr((d && d.error) || "添加失败");
							else {
								setShowAdd(false);
								setForm({ serverName: "", transport: "stdio", command: "", args: "", url: "", env: "{}", desc: "" });
								refresh();
							}
						})
						.catch((e) => { setBusy(false); setErr(String(e)); });
				};
				const startEdit = (s) => {
					setEditingId(s.id);
					setEditForm({
						serverName: s.serverName || "",
						desc: s.desc || "",
						command: s.command || "",
						args: Array.isArray(s.args) ? s.args.join(" ") : "",
						url: s.url || "",
						env: '{"SEE_EDIT": "已保存的密钥不会显示，重新提交会覆盖"}'
					});
				};
				const submitEdit = () => {
					setBusy(true);
					setErr(null);
					fetch("/vscode-files/mcp/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
						id: editingId,
						serverName: editForm.serverName.trim(),
						desc: editForm.desc.trim(),
						command: editForm.command.trim(),
						args: editForm.args.split(/[\s,]+/).filter(Boolean),
						url: editForm.url.trim()
					}) })
						.then((r) => r.json())
						.then((d) => {
							setBusy(false);
							if (!d || !d.ok) setErr((d && d.error) || "编辑失败");
							else {
								setEditingId(null);
								refresh();
							}
						})
						.catch((e) => { setBusy(false); setErr(String(e)); });
				};
				return h("div", { className: "vk_personaSection" },
					h("div", { className: "vk_mgrHead" },
						h("div", { className: "vk_personaDesc", style: { flex: 1 } }, "管理 MCP server（~/.dsh/mcp-servers.json，含密钥，请勿外传）。开关即时生效，无需重启。"),
						h("button", { className: "vk_mgrBtn", onClick: () => setShowAdd(!showAdd) }, showAdd ? "取消添加" : "＋ 添加 MCP"),
						h("button", { className: "vk_mgrBtn", onClick: refresh, disabled: busy }, "刷新")
					),
					err !== null ? h("div", { className: "vk_personaMsg vk_personaMsgErr" }, String(err)) : null,
					showAdd ? h("div", { className: "vk_mgrAddForm" },
						h("div", { className: "vk_mgrLabel" }, "serverName（唯一标识，1-32 位字母/数字/_-）"),
						h("input", { className: "vk_mgrInput", value: form.serverName, onChange: (e) => setForm({ ...form, serverName: e.target.value }), placeholder: "my-server" }),
						h("div", { className: "vk_mgrLabel" }, "描述（用途说明，帮助 AI 判断何时调用此服务）"),
						h("input", { className: "vk_mgrInput", value: form.desc, onChange: (e) => setForm({ ...form, desc: e.target.value }), placeholder: "例如：连接 BOSS 项目 MySQL 数据库，可查询物业表、合同表等" }),
						h("div", { className: "vk_mgrLabel" }, "传输类型"),
						h("select", { className: "vk_mgrInput", value: form.transport, onChange: (e) => setForm({ ...form, transport: e.target.value }) },
							h("option", { value: "stdio" }, "stdio（本地进程）"),
							h("option", { value: "streamable-http" }, "streamable-http（远程 URL）")
						),
						form.transport === "stdio"
							? h("div", { className: "vk_mgrLabel" }, "命令（参数用空格/逗号分隔）")
							: h("div", { className: "vk_mgrLabel" }, "URL"),
						form.transport === "stdio"
							? h("input", { className: "vk_mgrInput", value: form.command, onChange: (e) => setForm({ ...form, command: e.target.value }), placeholder: "npx @playwright/mcp@latest --browser msedge" })
							: h("input", { className: "vk_mgrInput", value: form.url, onChange: (e) => setForm({ ...form, url: e.target.value }), placeholder: "https://example.com/mcp" }),
						form.transport === "stdio"
							? h("div", { className: "vk_mgrLabel" }, "环境变量（JSON 对象，可含密钥）")
							: h("div", { className: "vk_mgrLabel" }, "请求头（JSON 对象，可含密钥）"),
						h("input", { className: "vk_mgrInput", value: form.env, onChange: (e) => setForm({ ...form, env: e.target.value }), placeholder: '{"KEY":"value"}' }),
						h("div", { className: "vk_personaFoot" },
							h("button", { className: "vk_mgrBtn", onClick: () => setShowAdd(false) }, "取消"),
							h("div", { style: { flex: 1 } }),
							h("button", { className: "vk_mgrBtn vk_mgrBtnPrimary", disabled: busy, onClick: submitAdd }, "添加并启用")
						)
					) : null,
					editingId !== null ? h("div", { className: "vk_mgrAddForm" },
						h("div", { className: "vk_mgrLabel" }, "serverName"),
						h("input", { className: "vk_mgrInput", value: editForm.serverName, onChange: (e) => setEditForm({ ...editForm, serverName: e.target.value }), placeholder: "my-server" }),
						h("div", { className: "vk_mgrLabel" }, "描述（用途说明，帮助 AI 判断何时调用此服务）"),
						h("input", { className: "vk_mgrInput", value: editForm.desc, onChange: (e) => setEditForm({ ...editForm, desc: e.target.value }), placeholder: "例如：连接 BOSS 项目 MySQL 数据库" }),
						h("div", { className: "vk_mgrLabel" }, "命令/URL"),
						h("input", { className: "vk_mgrInput", value: editForm.command || editForm.url, onChange: (e) => {
							const s = servers.find(x => x.id === editingId);
							if (s && s.transport === "stdio") setEditForm({ ...editForm, command: e.target.value });
							else setEditForm({ ...editForm, url: e.target.value });
						}, placeholder: "命令或 URL" }),
						h("div", { className: "vk_mgrLabel" }, "环境变量 / 请求头（已保存的密钥不回显，留空不修改）"),
						h("input", { className: "vk_mgrInput", value: editForm.env, onChange: (e) => setEditForm({ ...editForm, env: e.target.value }), placeholder: '{"KEY":"value"}' }),
						h("div", { className: "vk_personaFoot" },
							h("button", { className: "vk_mgrBtn", onClick: () => setEditingId(null) }, "取消"),
							h("div", { style: { flex: 1 } }),
							h("button", { className: "vk_mgrBtn vk_mgrBtnPrimary", disabled: busy, onClick: submitEdit }, "保存修改")
						)
					) : null,
					servers === null ? h("div", { className: "vk_mgrEmpty" }, "加载中…")
						: servers.length === 0 ? h("div", { className: "vk_mgrEmpty" }, "暂无 MCP server，点「＋ 添加 MCP」添加")
						: h("div", { className: "vk_mgrList" },
							servers.map((s) => h("div", { key: s.id, className: "vk_mgrRow" },
								h("div", { className: "vk_mgrInfo" },
									h("div", { className: "vk_mgrName" }, s.serverName),
									h("div", { className: "vk_mgrMeta" }, (s.transport === "stdio" ? (s.command || "stdio") : (s.url || "http")) + (s.hasEnv ? " · 含环境变量" : "")),
									s.desc ? h("div", { className: "vk_mgrDesc", title: s.desc }, s.desc.length > 60 ? s.desc.slice(0, 60) + "…" : s.desc) : null
								),
								h("span", { className: "vk_mgrBadge " + (s.enabled ? "vk_mgrBadgeOn" : "vk_mgrBadgeOff") }, s.enabled ? "开启" : "关闭"),
								h("button", { className: "vk_mgrBtn", disabled: busy, onClick: () => act(s.id, "toggle") }, s.enabled ? "关闭" : "开启"),
								h("button", { className: "vk_mgrBtn", disabled: busy, onClick: () => startEdit(s) }, "编辑"),
								h("button", { className: "vk_mgrBtn vk_mgrBtnDanger", disabled: busy, onClick: () => { if (window.confirm("确定删除 MCP「" + s.serverName + "」？")) act(s.id, "delete"); } }, "删除")
							))
						)
				);
			}

			// 组件：Git 配置分区（设置面板）
		// ──────────────────────────────────────────────────────────────
		function GitConfigSection() {
			const [version, setVersion] = react.useState(null);
			react.useEffect(() => {
				let dead = false;
				fetch("/vscode-files/git/version")
					.then((r) => r.json())
					.then((d) => { if (!dead && d && d.ok) setVersion(d.version); })
					.catch(() => { if (!dead) setVersion(null); });
				return () => { dead = true; };
			}, []);
			return h("div", { className: "vk_personaSection" },
				h("div", { className: "vk_settingsCard" },
					h("div", { className: "vk_settingsCardLabel", style: { fontWeight: 600 } }, "Git 配置"),
					h("div", { className: "vk_settingsCardDesc" }, "Git 面板提供暂存、提交、Diff 查看、历史浏览等功能。"),
					version !== null ? h("div", { className: "vk_settingsCardDesc" }, "Git 版本：" + version) : null,
					version === null ? h("div", { className: "vk_settingsCardDesc" }, "正在检测 Git 版本…") : null
				)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：Git 面板（仓库选择器、变更列表、Diff、历史、提交详情）
		// ──────────────────────────────────────────────────────────────
		function GitPanel({ root }) {
			const [repos, setRepos] = react.useState([]);
			const [selectedRepo, setSelectedRepo] = react.useState(null);
			const [ws, setWs] = react.useState(null); // workstatus
			const [diff, setDiff] = react.useState(null);
			const [history, setHistory] = react.useState(null);
			const [commitMsg, setCommitMsg] = react.useState("");
			const [committing, setCommitting] = react.useState(false);
			const [msg, setMsg] = react.useState(null);
			const [activeTab, setActiveTab] = react.useState("changes");
			const [currentBranch, setCurrentBranch] = react.useState("");
			const [branchList, setBranchList] = react.useState([]);
			const [worktrees, setWorktrees] = react.useState([]);
			const [expandedFile, setExpandedFile] = react.useState(null); // 展开的 inline diff
			const [inlineDiff, setInlineDiff] = react.useState(null);
			const [suggestions, setSuggestions] = react.useState([]);
			const [commitDetail, setCommitDetail] = react.useState(null); // 提交详情
			// 发现仓库
			react.useEffect(() => {
				if (typeof root !== "string" || root.length === 0) return;
				let dead = false;
				fetch("/vscode-files/git?path=" + encodeURIComponent(root), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "repos" }) })
					.then((r) => r.json())
					.then((d) => { if (!dead && d && d.ok && Array.isArray(d.repos)) { setRepos(d.repos); if (d.repos.length > 0 && selectedRepo === null) setSelectedRepo(d.repos[0]); else if (d.repos.length === 0) setSelectedRepo(null); } })
					.catch(() => {});
				return () => { dead = true; };
			}, [root]);
			// 刷新工作区状态
			const refresh = react.useCallback(() => {
				if (selectedRepo === null) return;
				setExpandedFile(null);
				setInlineDiff(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workstatus" }) })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { setWs(d); setCurrentBranch(d.branch || ""); } else setWs(null);
					})
					.catch(() => { setWs(null); });
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "branches" }) })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setBranchList(d.branches || []); })
					.catch(() => {});
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "worktrees" }) })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setWorktrees(d.worktrees || []); })
					.catch(() => {});
			}, [selectedRepo]);
			react.useEffect(() => { if (selectedRepo) refresh(); }, [selectedRepo, refresh]);
			// 暂存/取消暂存/还原/全部暂存
			const stage = react.useCallback((file) => { if (selectedRepo === null) return; setMsg(null); fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", files: [file] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refresh(); }); }, [selectedRepo, refresh]);
			const unstage = react.useCallback((file) => { if (selectedRepo === null) return; setMsg(null); fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unstage", files: [file] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refresh(); }); }, [selectedRepo, refresh]);
			const doRestore = react.useCallback((file) => { if (selectedRepo === null) return; if (typeof confirm === "function" && !confirm("确定还原「" + file + "」？未暂存的更改将丢失。")) return; fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore", files: [file] }) }).then((r) => r.json()).then((d) => { if (d && d.ok) refresh(); }); }, [selectedRepo, refresh]);
			const stageAll = react.useCallback(() => { if (selectedRepo === null) return; setMsg(null); fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stage-all" }) }).then((r) => r.json()).then((d) => { if (d && d.ok) { setMsg({ ok: true, text: "已全部暂存 ✓" }); refresh(); } else setMsg({ ok: false, text: (d && d.error) || "暂存失败" }); }); }, [selectedRepo, refresh]);
			// 内联 diff 展开/收起
			const toggleInlineDiff = react.useCallback((file, mode) => {
				if (expandedFile === file) { setExpandedFile(null); setInlineDiff(null); return; }
				setExpandedFile(file);
				setInlineDiff(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "workfile", file, mode }) })
					.then((r) => r.json())
					.then((d) => { setInlineDiff(d && d.ok ? d : null); });
			}, [selectedRepo, expandedFile]);
			// 提交
			const doCommit = react.useCallback(() => {
				if (selectedRepo === null || commitMsg.trim().length === 0) return;
				setCommitting(true); setMsg(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", message: commitMsg.trim() }) })
					.then((r) => r.json())
					.then((d) => { setCommitting(false); if (d && d.ok) { setCommitMsg(""); setMsg({ ok: true, text: "提交成功 ✓" }); refresh(); } else setMsg({ ok: false, text: (d && d.error) || "提交失败" }); })
					.catch((e) => { setCommitting(false); setMsg({ ok: false, text: String(e) }); });
			}, [selectedRepo, commitMsg, refresh]);
			// AI 提交信息建议
			const loadSuggestions = react.useCallback(() => {
				if (selectedRepo === null) return;
				setSuggestions([]);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "suggestmsg" }) })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok && Array.isArray(d.candidates)) setSuggestions(d.candidates); });
			}, [selectedRepo]);
			// 查看历史（提交图谱）
			const loadHistory = react.useCallback(() => {
				if (selectedRepo === null) return;
				setActiveTab("history"); setHistory(null); setCommitDetail(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "graph", max: 50 }) })
					.then((r) => r.json())
					.then((d) => { setHistory(d && d.ok ? d.commits : null); });
			}, [selectedRepo]);
			// 查看提交详情
			const showCommit = react.useCallback((hash) => {
				if (selectedRepo === null) return;
				setActiveTab("commit-detail");
				setCommitDetail(null);
				Promise.all([
					fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "show", hash }) }).then((r) => r.json()),
					fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit-diff", hash }) }).then((r) => r.json())
				]).then(([info, d]) => {
					if (info && info.ok) setCommitDetail({ ...info, diff: d && d.ok ? d.diff : "", truncated: d && d.truncated });
				});
			}, [selectedRepo]);
			// Fetch / Push / 切换分支
			const doFetch = react.useCallback(() => {
				if (selectedRepo === null) return; setMsg(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "fetch" }) })
					.then((r) => r.json()).then((d) => { setMsg({ ok: d && d.ok, text: d && d.ok ? "拉取完成 ✓" : ((d && d.error) || "拉取失败") }); refresh(); });
			}, [selectedRepo, refresh]);
			const doPush = react.useCallback(() => {
				if (selectedRepo === null) return; setMsg(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "push" }) })
					.then((r) => r.json()).then((d) => { setMsg({ ok: d && d.ok, text: d && d.ok ? "推送完成 ✓" : ((d && d.error) || "推送失败") }); refresh(); });
			}, [selectedRepo, refresh]);
			const doCheckout = react.useCallback((branch) => {
				if (selectedRepo === null) return; setMsg(null);
				fetch("/vscode-files/git?path=" + encodeURIComponent(selectedRepo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkout", branch }) })
					.then((r) => r.json()).then((d) => { setMsg({ ok: d && d.ok, text: d && d.ok ? "已切换到 " + branch : ((d && d.error) || "切换失败") }); refresh(); });
			}, [selectedRepo, refresh]);
			const repoChanged = react.useCallback((e) => { setSelectedRepo(e.target.value); setWs(null); setDiff(null); setHistory(null); setCurrentBranch(""); setBranchList([]); setWorktrees([]); setCommitDetail(null); setActiveTab("changes"); }, []);

			if (typeof root !== "string" || root.length === 0) return h("div", { className: "vk_gitPanel" }, h("div", { className: "vk_gitEmpty" }, "请先打开一个工作区文件夹"));
			if (repos.length === 0) return h("div", { className: "vk_gitPanel" }, h("div", { className: "vk_gitEmpty" }, "扫描 Git 仓库中…\n（如果当前目录已是 Git 仓库，稍后会自动出现）"));

			// 状态徽标
			const statusLabel = (code) => {
				if (code === "M" || code === " M") return { text: "M", cls: "vk_gitM" };
				if (code === "A" || code === " A") return { text: "A", cls: "vk_gitA" };
				if (code === "D" || code === " D") return { text: "D", cls: "vk_gitD" };
				if (code === "R" || code === " R") return { text: "R", cls: "vk_gitR" };
				if (code === "??") return { text: "U", cls: "vk_gitU" };
				return { text: "M", cls: "vk_gitM" };
			};
			// 单个变更条目（含 +/- 计数和内联 diff）
			const changeItem = (item, isStaged) => {
				const label = statusLabel(item.code);
				const cnt = (item.added || 0) + (item.deleted || 0) > 0 ? h("span", { className: "vk_gitCnt" }, "+" + (item.added || 0) + " -" + (item.deleted || 0)) : null;
				const isExpanded = expandedFile === item.path;
				const mode = isStaged ? "staged" : (item.code === "??" ? "untracked" : "unstaged");
				return h("div", { key: item.path },
					h("div", { className: "vk_gitChangeItem", onClick: () => toggleInlineDiff(item.path, mode) },
						h("span", { className: "vk_gitChangeStatus " + label.cls }, label.text),
						h("span", { className: "vk_gitChangeName", title: item.path }, item.path.split("/").pop()),
						cnt,
						h("div", { style: { flex: 1 } }),
						isStaged
							? h("button", { className: "vk_gitChangeAction", title: "取消暂存", onClick: (e) => { e.stopPropagation(); unstage(item.path); } }, "取消暂存")
							: h("button", { className: "vk_gitChangeAction", title: "暂存", onClick: (e) => { e.stopPropagation(); stage(item.path); } }, "暂存"),
						!isStaged && item.code !== "??"
							? h("button", { className: "vk_gitChangeAction vk_gitChangeActionDanger", title: "还原", onClick: (e) => { e.stopPropagation(); doRestore(item.path); } }, "还原")
							: null
					),
					isExpanded ? h("div", { className: "vk_gitInlineDiff" },
						inlineDiff === null ? "加载中…" : (inlineDiff && inlineDiff.diff ? inlineDiff.diff : (inlineDiff && inlineDiff.content ? inlineDiff.content : "无内容"))
					) : null
				);
			};
			// Tab 栏
			const tabBar = h("div", { className: "vk_tabBar" },
				h("button", { className: "vk_tabBtn" + (activeTab === "changes" ? " vk_tabBtnActive" : ""), onClick: () => setActiveTab("changes") }, "变更"),
				h("button", { className: "vk_tabBtn" + (activeTab === "history" ? " vk_tabBtnActive" : ""), onClick: loadHistory }, "历史"),
				commitDetail !== null ? h("button", { className: "vk_tabBtn" + (activeTab === "commit-detail" ? " vk_tabBtnActive" : ""), onClick: () => setActiveTab("commit-detail") }, "提交详情") : null,
				h("div", { className: "vk_tabBarSpacer" }),
				repos.length > 1 ? h("select", { className: "vk_gitRepoSelect", value: selectedRepo || "", onChange: repoChanged }, repos.map((r) => h("option", { key: r, value: r }, r.split(/[\\/]/).pop() || r))) : null
			);
			// 历史标签页
			if (activeTab === "history") {
				return h("div", { className: "vk_gitPanel" },
					tabBar,
					h(HistoryView, { history, onClose: () => setActiveTab("changes"), onShowCommit: showCommit })
				);
			}
			// 提交详情标签页
			if (activeTab === "commit-detail" && commitDetail !== null) {
				return h("div", { className: "vk_gitPanel" },
					tabBar,
					h(CommitDetailView, { detail: commitDetail, onClose: () => { setCommitDetail(null); setActiveTab("changes"); } })
				);
			}
			// 变更标签页
			const totalChanges = ws ? (ws.staged || []).length + (ws.unstaged || []).length + (ws.untracked || []).length : 0;
			const hasUnstaged = ws && ((ws.unstaged || []).length + (ws.untracked || []).length > 0);
			return h("div", { className: "vk_gitPanel" },
				tabBar,
				h("div", { className: "vk_gitToolbar" },
					h("button", { className: "vk_gitToolBtn", onClick: refresh }, "⟳"),
					currentBranch ? h("select", { className: "vk_gitRepoSelect", style: { flex: "none", maxWidth: 140 }, value: currentBranch, onChange: (e) => { if (e.target.value !== currentBranch) doCheckout(e.target.value); } },
						branchList.filter((b) => !b.isRemote).map((b) => h("option", { key: b.name, value: b.name }, (b.isHead ? "✓ " : "") + b.name)),
						currentBranch ? h("option", { key: "__sep", disabled: true, style: { display: "none" } }) : null
					) : currentBranch ? h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "🌿 " + currentBranch + (worktrees.length > 1 ? " (+" + (worktrees.length - 1) + " wt)" : "")) : null,
					h("button", { className: "vk_gitToolBtn", title: "拉取", onClick: doFetch, style: { fontSize: 14 } }, "⬇"),
					h("button", { className: "vk_gitToolBtn", title: "推送", onClick: doPush, style: { fontSize: 14 } }, "⬆"),
					h("div", { style: { flex: 1 } }),
					hasUnstaged ? h("button", { className: "vk_gitToolBtn", title: "暂存所有未暂存/未跟踪的更改", onClick: stageAll, style: { fontSize: 11 } }, "全部暂存") : null,
					ws && ws.staged && ws.staged.length > 0 ? h("button", { className: "vk_gitToolBtnPrimary", title: "提交更改", onClick: () => { const ta = document.querySelector(".vk_gitCommitInput"); if (ta) ta.focus(); } }, "提交") : null,
					msg !== null ? h("span", { style: { fontSize: 11, color: msg.ok ? "#73c991" : "#f14c4c" } }, msg.text) : null
				),
				ws && ws.staged && ws.staged.length > 0 ? h("div", { className: "vk_gitSection" },
					h("div", { className: "vk_gitSectionTitle" }, "已暂存 (" + ws.staged.length + ")"),
					...ws.staged.map((item) => changeItem(item, true))
				) : null,
				ws && ws.unstaged && ws.unstaged.length > 0 ? h("div", { className: "vk_gitSection" },
					h("div", { className: "vk_gitSectionTitle" }, "未暂存 (" + ws.unstaged.length + ")"),
					...ws.unstaged.map((item) => changeItem(item, false))
				) : null,
				ws && ws.untracked && ws.untracked.length > 0 ? h("div", { className: "vk_gitSection" },
					h("div", { className: "vk_gitSectionTitle" }, "未跟踪 (" + ws.untracked.length + ")"),
					...ws.untracked.map((item) => changeItem(item, false))
				) : null,
				(!ws || (ws.staged || []).length + (ws.unstaged || []).length + (ws.untracked || []).length === 0)
					? h("div", { className: "vk_gitEmpty" }, "工作区干净，没有变更")
					: null,
				totalChanges > 0 ? h("div", { className: "vk_gitCommitForm" },
					h("div", { style: { display: "flex", gap: 4 } },
						h("textarea", { className: "vk_gitCommitInput", style: { flex: 1, minHeight: 40 }, placeholder: "提交说明（Ctrl+Enter 提交）", value: commitMsg, onChange: (e) => setCommitMsg(e.target.value),
							onKeyDown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") doCommit(); }
						}),
						h("button", { className: "vk_gitToolBtn", title: "AI 生成提交信息", style: { alignSelf: "flex-start", fontSize: 11 }, onClick: loadSuggestions }, "✨ AI")
					),
					suggestions.length > 0 ? h("div", { style: { display: "flex", flexDirection: "column", gap: 2, marginTop: 4 } },
						suggestions.map((s, i) => h("button", { key: i, className: "vk_gitToolBtn", style: { textAlign: "left", fontSize: 11, padding: "3px 6px" }, onClick: () => { setCommitMsg(s); setSuggestions([]); } }, s))
					) : null,
					h("div", { className: "vk_gitCommitRow" },
						h("button", { className: "vk_gitCommitBtn", disabled: committing || commitMsg.trim().length === 0, onClick: doCommit }, committing ? "提交中…" : "提交 ✓")
					)
				) : null
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：Diff 查看器（VSCode 式红绿行级对比）
		// ──────────────────────────────────────────────────────────────
		function DiffViewer({ diff, onClose }) {
			if (diff === null) return h("div", { className: "vk_gitDiffView" }, h("div", { className: "vk_gitEmpty" }, "加载中…"));
			if (diff.error) return h("div", { className: "vk_gitDiffView" }, h("div", { className: "vk_gitEmpty" }, diff.error));
			if (!diff.diff || diff.diff.length === 0) return h("div", { className: "vk_gitDiffView" }, h("div", { className: "vk_gitEmpty" }, "没有差异"));
			const lines = diff.diff.split("\n");
			const out = [];
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.startsWith("diff --git")) {
					const filePath = line.split(" b/").pop() || "";
					out.push(h("div", { key: "file-" + i, className: "vk_gitDiffFile" }, "📄 " + filePath + (diff.staged ? " (已暂存)" : "")));
				} else if (line.startsWith("@@")) {
					out.push(h("div", { key: "hunk-" + i, className: "vk_gitDiffHunk" }, line));
				} else if (line.startsWith("+") && !line.startsWith("+++")) {
					out.push(h("div", { key: i, className: "vk_gitDiffLine vk_gitDiffAdd" },
						h("span", { className: "vk_gitDiffSign" }, "+"), h("span", null, line.slice(1))
					));
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					out.push(h("div", { key: i, className: "vk_gitDiffLine vk_gitDiffDel" },
						h("span", { className: "vk_gitDiffSign" }, "-"), h("span", null, line.slice(1))
					));
				} else if (!line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index ") && !line.startsWith("new file") && !line.startsWith("deleted file")) {
					out.push(h("div", { key: i, className: "vk_gitDiffLine" },
						h("span", { className: "vk_gitDiffSign" }, " "), h("span", null, line)
					));
				}
			}
			return h("div", { className: "vk_gitDiffView" },
				h("div", { className: "vk_gitToolbar" },
					h("button", { className: "vk_gitToolBtn", onClick: onClose }, "← 返回变更"),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginLeft: 8 } }, diff.file || "")
				),
				out
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：提交详情（提交信息 + 文件变更 diff）
		// ──────────────────────────────────────────────────────────────
		function CommitDetailView({ detail, onClose }) {
			if (detail === null) return h("div", { className: "vk_gitDiffView" }, h("div", { className: "vk_gitEmpty" }, "加载中…"));
			const diffLines = detail.diff ? detail.diff.split("\n") : [];
			const diffOut = [];
			for (let i = 0; i < diffLines.length; i++) {
				const line = diffLines[i];
				if (line.startsWith("diff --git")) {
					const filePath = line.split(" b/").pop() || "";
					diffOut.push(h("div", { key: "file-" + i, className: "vk_gitDiffFile" }, "📄 " + filePath));
				} else if (line.startsWith("@@")) {
					diffOut.push(h("div", { key: "hunk-" + i, className: "vk_gitDiffHunk" }, line));
				} else if (line.startsWith("+") && !line.startsWith("+++")) {
					diffOut.push(h("div", { key: i, className: "vk_gitDiffLine vk_gitDiffAdd" }, h("span", { className: "vk_gitDiffSign" }, "+"), h("span", null, line.slice(1))));
				} else if (line.startsWith("-") && !line.startsWith("---")) {
					diffOut.push(h("div", { key: i, className: "vk_gitDiffLine vk_gitDiffDel" }, h("span", { className: "vk_gitDiffSign" }, "-"), h("span", null, line.slice(1))));
				} else if (!line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index ") && !line.startsWith("new file") && !line.startsWith("deleted file")) {
					diffOut.push(h("div", { key: i, className: "vk_gitDiffLine" }, h("span", { className: "vk_gitDiffSign" }, " "), h("span", null, line)));
				}
			}
			return h("div", { className: "vk_gitDiffView" },
				h("div", { className: "vk_gitToolbar" },
					h("button", { className: "vk_gitToolBtn", onClick: onClose }, "← 返回"),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginLeft: 8 } }, detail.hash ? detail.hash.slice(0, 7) : "")
				),
				h("div", { style: { padding: "8px 12px", borderBottom: "1px solid var(--dsw-alias-border-l1)" } },
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, detail.subject || ""),
					detail.body ? h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", marginBottom: 6 } }, detail.body) : null,
					h("div", { style: { fontSize: 10, color: "var(--dsw-alias-label-tertiary)", display: "flex", gap: 12 } },
						h("span", null, "👤 " + (detail.author || "")),
						h("span", null, "📅 " + (detail.date ? detail.date.slice(0, 10) : "")),
						detail.parents ? h("span", null, "👨‍👦 " + detail.parents.length + " parent" + (detail.parents.length > 1 ? "s" : "")) : null
					)
				),
				h("div", { style: { flex: 1, minHeight: 0, overflow: "auto" } }, diffOut)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：历史视图（提交历史列表，点击可查看详情）
		// ──────────────────────────────────────────────────────────────
		function HistoryView({ history, onClose, onShowCommit }) {
			// 计算图谱布局
			const graphData = react.useMemo(() => {
				if (!Array.isArray(history) || history.length === 0) return [];
				const COLORS = ["#ff7b72", "#79c0ff", "#d2a8ff", "#7ee787", "#ffa657", "#e3b341", "#f778ba", "#8b949e"];
				const hashSet = new Set(history.map((c) => c.hash));
				const lanes = [];
				const laneColors = [];
				const result = [];
				for (const c of history) {
					const parents = Array.isArray(c.parents) ? c.parents.filter((p) => hashSet.has(p)) : [];
					let lane = -1;
					if (parents.length > 0) {
						for (let i = 0; i < lanes.length; i++) {
							if (lanes[i] === parents[0]) { lane = i; break; }
						}
					}
					if (lane === -1) {
						lane = lanes.length;
						lanes.push(c.hash);
						laneColors.push(COLORS[lane % COLORS.length]);
					} else {
						lanes[lane] = c.hash;
					}
					const parentLanes = parents.map((p) => {
						const idx = result.findIndex((r) => r.hash === p);
						return idx >= 0 ? result[idx].lane : -1;
					}).filter((l) => l >= 0);
					result.push({ ...c, lane, color: laneColors[lane], parentLanes: [...new Set(parentLanes)] });
				}
				return result;
			}, [history]);

			if (graphData.length === 0) {
				return h("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" } },
					h("div", { className: "vk_gitToolbar" },
						h("button", { className: "vk_gitToolBtn", onClick: onClose }, "← 返回变更"),
						h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginLeft: 8 } }, "提交历史")
					),
					h("div", { className: "vk_gitEmpty" }, history === null ? "加载中…" : "暂无提交记录")
				);
			}

			const ROW_H = 48;
			const GRAPH_W = 48;
			const DOT_R = 5;
			const LANE_W = 14;
			const maxLane = graphData.reduce((max, g) => Math.max(max, g.lane), 0);
			const graphCenter = GRAPH_W / 2;

			return h("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" } },
				h("div", { className: "vk_gitToolbar" },
					h("button", { className: "vk_gitToolBtn", onClick: onClose }, "← 返回变更"),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", marginLeft: 8 } }, "提交历史 (" + graphData.length + ")")
				),
				h("div", { style: { flex: 1, minHeight: 0, overflow: "auto" } },
					graphData.map((c, i) => {
						const y = i * ROW_H + ROW_H / 2;
						const x = graphCenter + (c.lane - maxLane / 2) * LANE_W;
						// 分支/标签标签
						const refs = Array.isArray(c.refs) ? c.refs : [];
						const refTags = refs.map((r, ri) => {
							let cls = "vk_gitRefTag";
							if (r.kind === "tag") cls += " vk_gitRefTagTag";
							else if (r.head) cls += " vk_gitRefTagHead";
							else cls += " vk_gitRefTagBranch";
							return h("span", { key: ri, className: cls }, r.name);
						});
						// 连线（使用 SVG）
						const lines = [];
						// 垂直延续线（上方）
						const hasChild = i > 0 && graphData.slice(0, i).some((g) => g.parentLanes.includes(c.lane));
						// 连接父提交的曲线
						for (const pl of c.parentLanes) {
							const pIdx = graphData.findIndex((g) => g.lane === pl && g.hash !== c.hash);
							if (pIdx < 0 || pIdx <= i) continue;
							const py = pIdx * ROW_H + ROW_H / 2;
							const px = graphCenter + (pl - maxLane / 2) * LANE_W;
							const midY = (y + py) / 2;
							lines.push(h("svg", { key: "pl" + i + "-" + pl, style: { position: "absolute", left: 0, top: 0, width: GRAPH_W, height: ROW_H * (i + 1), overflow: "visible", pointerEvents: "none" } },
								h("path", { d: "M" + x + " " + y + " C" + x + " " + midY + "," + px + " " + midY + "," + px + " " + py, stroke: c.color, strokeWidth: 2, fill: "none", opacity: 0.5 })
							));
						}
						return h("div", { key: c.hash, className: "vk_gitHistoryItem", onClick: typeof onShowCommit === "function" ? () => onShowCommit(c.hash) : undefined, title: c.hash, style: { display: "flex", alignItems: "stretch", gap: 0, padding: 0, minHeight: ROW_H } },
							// 图谱列
							h("div", { style: { width: GRAPH_W, flex: "none", position: "relative" } },
								// 垂直延续线
								h("div", { style: { position: "absolute", left: x - 1, top: 0, width: 2, height: y, background: c.color, opacity: 0.25 } }),
								// 圆点
								h("div", { style: { position: "absolute", left: x - DOT_R, top: y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: "50%", background: c.color, border: "2px solid var(--dsw-alias-bg-base)", boxShadow: "0 0 0 1px " + c.color, zIndex: 1 } }),
								// 连接线
								lines
							),
							// 提交信息列
							h("div", { style: { flex: 1, minWidth: 0, padding: "7px 10px 7px 4px" } },
								h("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
									h("span", { className: "vk_gitGraphMsg" }, c.subject || c.message || ""),
									refTags
								),
								h("div", { className: "vk_gitGraphMeta" },
									(c.author || "") + " · " + (c.date ? c.date.slice(0, 10) : "")
								)
							)
						);
					})
				)
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：左栏（文件/会话/Git 三 Tab）与 右栏（对话/详情 双 Tab）
		// ──────────────────────────────────────────────────────────────
		function LeftPanel({ tab, onTab, tree, sessionSlot, gitSlot, collapsed, onExpand, onCollapse }) {
			if (collapsed) {
				return h("div", { className: "vk_colLeft vk_rail" },
					h("button", { className: "vk_railBtn" + (tab === "files" ? " vk_railBtnActive" : ""), title: "文件", onClick: () => { onTab("files"); onExpand(); } }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M1.333 2.5A1.167 1.167 0 0 1 2.5 1.333h3.84a1.167 1.167 0 0 1 .825.342l1.86 1.86a.5.5 0 0 0 .353.146H14.5a1.167 1.167 0 0 1 1.167 1.167v8.5a1.167 1.167 0 0 1-1.167 1.167H2.5A1.167 1.167 0 0 1 1.333 12.5V2.5z", fill: "currentColor" }), h("path", { d: "M1.333 2.5A1.167 1.167 0 0 1 2.5 1.333h3.84a1.167 1.167 0 0 1 .825.342l1.86 1.86a.5.5 0 0 0 .353.146H14.5a1.167 1.167 0 0 1 1.167 1.167v8.5a1.167 1.167 0 0 1-1.167 1.167H2.5A1.167 1.167 0 0 1 1.333 12.5V2.5z", fill: "currentColor", opacity: "0.2" }))),
					h("button", { className: "vk_railBtn" + (tab === "git" ? " vk_railBtnActive" : ""), title: "Git", onClick: () => { onTab("git"); onExpand(); } }, "🌿"),
					h("button", { className: "vk_railBtn" + (tab === "sessions" ? " vk_railBtnActive" : ""), title: "会话", onClick: () => { onTab("sessions"); onExpand(); } }, "☰"),
					h("div", { className: "vk_railSpacer" }),
					h("button", { className: "vk_railBtn", title: "展开侧边栏", onClick: onExpand }, "»"),
					h("div", { style: { display: "none" } }, sessionSlot)
				);
			}
			return h("div", { className: "vk_colLeft" },
				h("div", { className: "vk_tabBar" },
					h("button", { className: "vk_tabBtn" + (tab === "files" ? " vk_tabBtnActive" : ""), onClick: () => onTab("files") }, "文件"),
					h("button", { className: "vk_tabBtn" + (tab === "git" ? " vk_tabBtnActive" : ""), onClick: () => onTab("git") }, "🌿 Git"),
					h("button", { className: "vk_tabBtn" + (tab === "sessions" ? " vk_tabBtnActive" : ""), onClick: () => onTab("sessions") }, "会话"),
					h("div", { className: "vk_tabBarSpacer" }),
					h("button", { className: "vk_tabBtn", title: "收起侧边栏", onClick: onCollapse }, "«")
				),
				h("div", { className: "vk_tabBody" + (tab === "files" ? "" : " vk_tabBodyHidden") }, tree),
				h("div", { className: "vk_tabBody" + (tab === "git" ? "" : " vk_tabBodyHidden") }, gitSlot),
				h("div", { className: "vk_tabBody" + (tab === "sessions" ? "" : " vk_tabBodyHidden") }, sessionSlot)
			);
		}
		function RightPanel({ tab, onTab, conversation, details, mode, onToggleMode, showDetails }) {
			return h("div", { className: "vk_colRight" },
				h("div", { className: "vk_tabBar" },
					h("button", { className: "vk_tabBtn" + (tab === "conversation" ? " vk_tabBtnActive" : ""), onClick: () => onTab("conversation") }, "对话"),
					showDetails ? h("button", { className: "vk_tabBtn" + (tab === "details" ? " vk_tabBtnActive" : ""), onClick: () => onTab("details") }, "详情") : null,
					h("div", { className: "vk_tabBarSpacer" }),
					h("button", { className: "vk_tabBtn vk_modeBtn", title: mode === "native" ? "切回分栏模式（文件查看器 + 侧栏对话）" : "切换为全屏对话模式（隐藏文件查看器）", onClick: onToggleMode }, mode === "native" ? "◫ 分栏视图" : "⛶ 全屏对话")
				),
				h("div", { className: "vk_tabBody" + (tab === "conversation" ? "" : " vk_tabBodyHidden") }, conversation),
				showDetails ? h("div", { className: "vk_tabBody" + (tab === "details" ? "" : " vk_tabBodyHidden") }, details) : null
			);
		}

		// ──────────────────────────────────────────────────────────────
		// 组件：拖拽手柄（沿用官方实现）
		// ──────────────────────────────────────────────────────────────
		function DragHandle(props) {
			const [dragging, setDragging] = react.useState(false);
			const origin = react.useRef(0);
			const latest = react.useRef(0);
			const frame = react.useRef(null);
			const callbacks = react.useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd });
			callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd };
			const onPointerDown = react.useCallback((e) => {
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				origin.current = e.clientX;
				latest.current = e.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = react.useCallback((e) => {
				if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
				latest.current = e.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const resetDrag = react.useCallback(() => {
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			const onPointerUp = react.useCallback((e) => {
				// capture 可能已丢失（元素重渲染/窗口失焦），此时也必须复位，否则指示线常驻
				if (e.currentTarget.hasPointerCapture(e.pointerId)) {
					e.currentTarget.releasePointerCapture(e.pointerId);
					callbacks.current.onDrag(latest.current - origin.current);
				}
				resetDrag();
			}, [resetDrag]);
			return h("div", {
				className: "vk_handle",
				style: { left: props.left },
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel: resetDrag,
				onLostPointerCapture: resetDrag
			});
		}

		// ──────────────────────────────────────────────────────────────
		// 三栏骨架 AppFrame（注册进内置 'root' 槽）
		// ──────────────────────────────────────────────────────────────
		function AppFrame({ useStore, useSessions, actions, renderSlot, pickFolder }) {
			const panels = useStore((s) => s);
			const currentSessionId = useSessions((s) => s.current);
			const sessionCwd = useSessions((s) => {
				const current = s.current;
				if (current === void 0) return void 0;
				const row = s.byId[current];
				return row !== void 0 && row.blank !== true ? row.cwd : void 0;
			});
			const frameRef = react.useRef(null);
			const [viewport, setViewport] = react.useState(() => window.innerWidth);
			const lastCwd = react.useRef(sessionCwd);
			react.useEffect(() => {
				if (lastCwd.current !== void 0 && lastCwd.current !== sessionCwd) actions.setRightTab("conversation");
				lastCwd.current = sessionCwd;
			}, [actions, sessionCwd]);
			react.useEffect(() => {
				const el = frameRef.current;
				if (el === null) return;
				let raf = null;
				const observer = new ResizeObserver(() => {
					raf ??= requestAnimationFrame(() => {
						raf = null;
						const width = el.getBoundingClientRect().width;
						if (width > 0) setViewport(width);
					});
				});
				observer.observe(el);
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, []);
			const [tabsState, setTabsState] = react.useState(loadTabs);
			react.useEffect(() => { saveTabs(tabsState); }, [tabsState]);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			react.useEffect(() => { actions.setNarrow(narrow); }, [actions, narrow]);
			const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const cols = computeColumns(viewport, sidebarCollapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, panels.right === 0 ? 440 : panels.right);
			const colsRef = react.useRef(cols);
			colsRef.current = cols;
			const sidebarBase = react.useRef(0);
			const rightBase = react.useRef(0);
			const [dragging, setDragging] = react.useState(false);
			const onDragEnd = react.useCallback(() => setDragging(false), []);
			const onSidebarStart = react.useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true); }, []);
			const onRightStart = react.useCallback(() => { rightBase.current = colsRef.current.right; setDragging(true); }, []);
			const onSidebarDrag = react.useCallback((dx) => { actions.setSidebar(sidebarBase.current + dx); }, [actions]);
			const onRightDrag = react.useCallback((dx) => { actions.setRight(rightBase.current - dx); }, [actions]);
			const openFile = react.useCallback((f) => {
				setTabsState((prev) => {
					const exists = prev.tabs.some((t) => t.path === f.path);
					const tabs = exists ? prev.tabs : [...prev.tabs.slice(-19), { path: f.path, name: f.name }];
					return { ...prev, tabs, active: f.path, mode: "ide" };
				});
			}, []);
			const onDeleted = react.useCallback((path) => {
				setTabsState((prev) => {
					const tabs = prev.tabs.filter((t) => t.path !== path);
					const active = prev.active === path ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null) : prev.active;
					return { ...prev, tabs, active, mode: tabs.length === 0 ? "native" : prev.mode };
				});
			}, []);
			const onRenamed = react.useCallback((oldPath, newPath, newName) => {
				setTabsState((prev) => {
					const tabs = prev.tabs.map((t) => (t.path === oldPath ? { path: newPath, name: newName } : t));
					const active = prev.active === oldPath ? newPath : prev.active;
					return { ...prev, tabs, active };
				});
			}, []);
			const closeFile = react.useCallback((path) => {
				setTabsState((prev) => {
					const tabs = prev.tabs.filter((t) => t.path !== path);
					const active = prev.active === path ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null) : prev.active;
					// 关闭最后一个标签后自动转回全屏对话模式
					return { ...prev, tabs, active, mode: tabs.length === 0 ? "native" : prev.mode };
				});
			}, []);
			const selectTab = react.useCallback((path) => {
				setTabsState((prev) => (prev.active === path ? prev : { ...prev, active: path }));
			}, []);
			const setSidebarTab = react.useCallback((tab) => {
				setTabsState((prev) => (prev.sidebarTab === tab ? prev : { ...prev, sidebarTab: tab }));
			}, []);
			const openFolder = react.useCallback((p) => {
				setTabsState((prev) => {
					const sid = currentSessionId;
					if (sid === void 0) return { ...prev, root: p };
					return { ...prev, roots: { ...(prev.roots ?? {}), [sid]: p } };
				});
			}, [currentSessionId]);
			const closeFolder = react.useCallback(() => {
				setTabsState((prev) => {
					const sid = currentSessionId;
					if (sid === void 0) return { ...prev, root: null };
					const roots = { ...(prev.roots ?? {}) };
					delete roots[sid];
					return { ...prev, roots };
				});
			}, [currentSessionId]);
			const toggleMode = react.useCallback(() => {
				setTabsState((prev) => {
					const goingNative = prev.mode !== "native";
					if (!goingNative) return { ...prev, mode: "ide" };
					// 切全屏时收起工具详情标签（全屏下详情回右侧详情 Tab）
					const tabs = prev.tabs.filter((t) => t.path !== TRAJECTORY_TAB_PATH);
					const active = prev.active === TRAJECTORY_TAB_PATH ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null) : prev.active;
					return { ...prev, mode: "native", tabs, active };
				});
			}, []);
			const moveTab = react.useCallback((fromPath, toPath) => {
				setTabsState((prev) => {
					const tabs = [...prev.tabs];
					const from = tabs.findIndex((t) => t.path === fromPath);
					const to = tabs.findIndex((t) => t.path === toPath);
					if (from === -1 || to === -1 || from === to) return prev;
					const [moved] = tabs.splice(from, 1);
					tabs.splice(to, 0, moved);
					return { ...prev, tabs };
				});
			}, []);
			const native = tabsState.mode === "native";
			const detailsSeq = panels.detailsSeq ?? 0;
			const lastDetailsSeq = react.useRef(0);
			react.useEffect(() => {
				if (detailsSeq === 0 || detailsSeq === lastDetailsSeq.current) return;
				lastDetailsSeq.current = detailsSeq;
				if (native) {
					// 全屏模式不自动切右栏 Tab：切到「详情」会隐藏对话面板/输入框，
					// 导致思考期间无法插队输入新消息（朋友实测反馈的 bug）
					return;
				}
				// 分栏模式：轨迹在中心区开标签
				setTabsState((prev) => {
					const exists = prev.tabs.some((t) => t.path === TRAJECTORY_TAB_PATH);
					const tabs = exists ? prev.tabs : [...prev.tabs, { path: TRAJECTORY_TAB_PATH, name: "工具详情" }];
					return { ...prev, tabs, active: TRAJECTORY_TAB_PATH };
				});
			}, [detailsSeq, native, actions]);
			react.useEffect(() => {
				if (!native && panels.rightTab === "details") actions.setRightTab("conversation");
			}, [native, panels.rightTab, actions]);
			// 文件树按会话隔离：roots[sessionId] ?? （首次迁移沿用旧 root）?? 会话工作区
			const roots = tabsState.roots ?? {};
			const sessionRoot = currentSessionId !== void 0 ? (roots[currentSessionId] ?? null) : null;
			const migrated = Object.keys(roots).length === 0 && tabsState.root != null;
			const fileRoot = sessionRoot != null ? sessionRoot : (migrated ? tabsState.root : sessionCwd);
			const left = h(LeftPanel, {
				tab: tabsState.sidebarTab,
				onTab: setSidebarTab,
				collapsed: sidebarCollapsed,
				onExpand: () => actions.toggleSidebar(),
				onCollapse: () => actions.toggleSidebar(),
				tree: h(FileTree, { root: fileRoot, custom: sessionRoot != null, onOpenFolder: openFolder, onCloseFolder: closeFolder, onOpenFile: openFile, onPickNative: pickFolder, activePath: tabsState.active, onDeleted, onRenamed }),
				gitSlot: h(GitPanel, { root: fileRoot }),
				sessionSlot: renderSlot("sidebar", { collapsed: sidebarCollapsed, width: cols.sidebar })
			});
			const detailsSlot = renderSlot("details", {});
			const center = h(EditorArea, { tabs: tabsState.tabs, activePath: tabsState.active, onSelect: selectTab, onClose: closeFile, onMoveTab: moveTab, trajectory: native ? null : detailsSlot });
			const right = h(RightPanel, {
				tab: panels.rightTab,
				onTab: (t) => actions.setRightTab(t),
				mode: tabsState.mode,
				onToggleMode: toggleMode,
				showDetails: native,
				conversation: renderSlot("conversation", {}),
				details: detailsSlot
			});
			const gridCols = native
				? `${cols.sidebar}px 0px minmax(0, 1fr)`
				: `${cols.sidebar}px minmax(0, 1fr) ${cols.right}px`;
			return h("div", {
				ref: frameRef,
				className: "vk_frame",
				style: { gridTemplateColumns: gridCols },
				"data-native": native || void 0,
				"data-sidebar-collapsed": sidebarCollapsed || void 0,
				"data-right-zero": (!native && cols.right === 0) || void 0,
				"data-dragging": dragging || void 0,
				children: [
					left,
					center,
					right,
					h("div", { className: "vk_overlayLayer", "data-shell-overlay": true }, renderSlot("shell.overlay", {})),
					!sidebarCollapsed ? h(DragHandle, { side: "sidebar", left: cols.sidebar, onStart: onSidebarStart, onDrag: onSidebarDrag, onEnd: onDragEnd }) : null,
					!native && cols.right > 0 ? h(DragHandle, { side: "right", left: viewport - cols.right, onStart: onRightStart, onDrag: onRightDrag, onEnd: onDragEnd }) : null
				]
			});
		}

		// ──────────────────────────────────────────────────────────────
		// 布局 store（框架 store：面板宽度 + 右栏 Tab）
		// ──────────────────────────────────────────────────────────────
		function createLayoutStore() {
			return _deepseek_ai_dsh_client_runtime_client.defineStore({
				init: () => ({
					sidebar: 280,
					right: 440,
					narrow: false,
					narrowExpanded: false,
					rightTab: "conversation",
					detailsSeq: 0
				}),
				actions: {
					setSidebar: (d, px) => { d.sidebar = clampWidth(px, 264, 420); },
					setRight: (d, px) => { d.right = clampWidth(px, 340, 640); },
					toggleSidebar: (d) => {
						if (d.narrow) d.narrowExpanded = !d.narrowExpanded;
						else d.sidebar = d.sidebar === 0 ? 280 : 0;
					},
					setNarrow: (d, narrow) => {
						if (d.narrow === narrow) return;
						d.narrow = narrow;
						d.narrowExpanded = false;
					},
					setRightTab: (d, tab) => { d.rightTab = tab === "details" ? "details" : "conversation"; },
					openDetails: (d) => { d.detailsSeq += 1; },
					closeDetails: (d) => { d.rightTab = "conversation"; }
				}
			});
		}

		// ──────────────────────────────────────────────────────────────
		// ctx.layout 服务面（与官方同名兼容：openDetails/closeDetails/toggleSidebar）
		// ──────────────────────────────────────────────────────────────
		var LayoutController = class {
			#panels;
			attachPanels(actions) { this.#panels = actions; }
			toggleSidebar() { this.#require().toggleSidebar(); }
			openDetails() { this.#require().openDetails(); }
			closeDetails() { this.#require().closeDetails(); }
			#require() {
				if (this.#panels === void 0) throw new Error("layout: panel actions not wired (root entry not mounted)");
				return this.#panels;
			}
		};

		// ──────────────────────────────────────────────────────────────
		// 主题呈现器（照搬官方）
		// ──────────────────────────────────────────────────────────────
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		var ThemePresenter = class {
			appliedTokens = [];
			themeColorMeta;
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				const body = document.body;
				if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
				else body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				const body = document.body;
				body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};

		// ──────────────────────────────────────────────────────────────
		// 插件主体
		// ──────────────────────────────────────────────────────────────
		const inject = ["slots", "theme"];
		function apply(ctx) {
			// 心跳：告知 host 页面存活（host 据此在最后一个页面关闭后自动关闭服务器）。
			// sid 存 sessionStorage：同一标签页刷新后保持同一身份，避免误判为多个页面。
			{
				let sid = "";
				try { sid = sessionStorage.getItem("vk-layout:sid") || ""; } catch { /* ignore */ }
				if (sid === "") {
					sid = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
					try { sessionStorage.setItem("vk-layout:sid", sid); } catch { /* ignore */ }
				}
				const beat = () => {
					try {
						fetch("/vscode-files/heartbeat?sid=" + encodeURIComponent(sid), { keepalive: true, cache: "no-store" }).catch(() => {});
					} catch { /* ignore */ }
				};
				beat();
				setInterval(beat, 10000);
				try {
					document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") beat(); });
				} catch { /* ignore */ }
				try {
					window.addEventListener("pagehide", beat);
				} catch { /* ignore */ }
			}
			// 自愈：插件已激活但 root 槽未生效（页面回退原生布局）时自动重载，最多 2 次。
			// 覆盖 dsh boot 偶发竞态：插件激活成功但 AppFrame 未渲染，用户会看到原生界面+渲染伪影。
			// 轮询等待 10s（正常渲染远快于此，避免冷启动误判），超时仍无 vk_frame 才重载。
			{
				const KEY = "vk-layout:selfheal";
				let attempts = 0;
				try { attempts = parseInt(sessionStorage.getItem(KEY) || "0", 10) || 0; } catch { /* ignore */ }
				if (attempts < 2) {
					const start = Date.now();
					const timer = setInterval(() => {
						try {
							if (document.querySelector(".vk_frame") !== null) {
								clearInterval(timer);
								return;
							}
							if (Date.now() - start > 10000) {
								clearInterval(timer);
								sessionStorage.setItem(KEY, String(attempts + 1));
								location.reload();
							}
						} catch { /* ignore */ }
					}, 1000);
				}
			}
			const layout = new LayoutController();
			const pickFolder = async () => {
				const ws = ctx.get("workspaces");
				if (ws === void 0 || typeof ws.pickDirectory !== "function") throw new Error("native directory picker unavailable");
				return ws.pickDirectory();
			};
			ctx.effect(() => {
				const disposeService = ctx.reflect.provide("layout", layout);
				const disposeRegistration = ctx.slots.register({
					name: "root",
					children: {
						"sidebar": { kind: "single", scope: "root" },
						"conversation": { kind: "single", scope: "session-maybe" },
						"details": { kind: "single", scope: "session" },
						"shell.overlay": { kind: "list", scope: "root" }
					},
					store: createLayoutStore,
					inject: (actions) => {
						layout.attachPanels(actions);
						return { pickFolder };
					}
				}, AppFrame);
				return () => {
					disposeRegistration();
					disposeService();
				};
			}, "vscode-layout: service + root registration");
			// 注册「全局人设」设置分区（官方设置面板左侧导航 + 右侧内容）
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "persona",
				order: 1,
				label: () => "全局人设"
			}, PersonaSection)), "vscode-layout: settings persona section");
			// 注册「Skill 管理」设置分区
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skills",
				order: 2,
				label: () => "Skill 管理"
			}, SkillSection)), "vscode-layout: settings skills section");
			// 注册「MCP 管理」设置分区
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mcp",
				order: 3,
				label: () => "MCP 管理"
			}, MCPSection)), "vscode-layout: settings mcp section");
			// 注册「Git 配置」设置分区
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "gitConfig",
				order: 4,
				label: () => "Git 配置"
			}, GitConfigSection)), "vscode-layout: settings git config section");
			ctx.effect(() => {
				const presenter = new ThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "vscode-layout: theme presenter");
		}

		exports.LayoutController = LayoutController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
