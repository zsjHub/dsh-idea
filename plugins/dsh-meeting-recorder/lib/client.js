/*!
 * dsh-meeting-recorder — client half (browser).
 * Microphone voice input + meeting minutes recorder for the DSH Web UI.
 * Uses the browser's built-in Web Speech API for real-time speech-to-text.
 *
 * Combines:
 *   1. Web Speech API for audio capture and transcription
 *   2. Meeting minutes accumulation and structured display (fetched from host)
 *   3. Toggle, reset, generate via HTTP endpoints to the host
 */
window.__ModuleLoader__.load({
  id: "dsh-meeting-recorder",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const h = React.createElement;

    // ---- CSS injection ----
    function insertStyles(css) {
      if (typeof document === "undefined") return function () {};
      var el = document.createElement("style");
      el.setAttribute("data-dsh-meeting-recorder", "");
      el.textContent = css;
      document.head.appendChild(el);
      return function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      };
    }

    // ---- Helper: detect Chinese locale ----
    function isZh() {
      return typeof navigator !== "undefined" && navigator.language &&
        String(navigator.language).toLowerCase().indexOf("zh") === 0;
    }

    // ---- HTTP API helpers ----
    function apiBase() {
      // Same origin as the DSH web server
      return "";
    }

    function apiGet(path) {
      return fetch(apiBase() + path, { method: "GET" }).then(function (r) { return r.json(); }).catch(function () { return null; });
    }

    function apiPost(path) {
      return fetch(apiBase() + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }).then(function (r) { return r.json(); }).catch(function () { return null; });
    }

    // ---- Meeting state (shared via pub/sub) ----
    var meetingState = {
      active: false,
      data: {
        title: "会议纪要",
        date: "",
        content: [],
        topics: [],
        decisions: [],
        actionItems: [],
        summary: ""
      }
    };

    var stateListeners = new Set();
    function subscribeState(fn) {
      stateListeners.add(fn);
      return function () { stateListeners.delete(fn); };
    }
    function notifyState() {
      stateListeners.forEach(function (fn) { fn(); });
    }
    function getStateSnapshot() {
      return meetingState;
    }
    function updateState(patch) {
      meetingState = Object.assign({}, meetingState, patch);
      notifyState();
    }

    // ---- Transcription state ----
    var transcribeState = {
      base: '',
      finalText: '',
      interim: '',
      manualStop: true,
      destroyed: false,
      silentEnds: 0
    };

    // ---- Web Speech API helpers ----
    function getSpeechRecognition() {
      if (typeof window === "undefined") return null;
      return window.SpeechRecognition || window.webkitSpeechRecognition;
    }

    function resolveLang() {
      return isZh() ? "zh-CN" : "en-US";
    }

    function applyPunct(text) {
      var t = (text || "").trim();
      if (!t) return t;
      t = t.replace(/[，,]+\s*$/, "").trim();
      if (/[\u4e00-\u9fff]/.test(t)) {
        if (/[。！？…]$/.test(t)) return t;
        if (/[吗呢]$/.test(t)) return t + "？";
        if (/[吧啊呀哦嘛啦哇哈]$/.test(t)) return t + "！";
        return t + "。";
      }
      if (/[.!?]$/.test(t)) return t;
      return t + ".";
    }

    function formatTimestamp() {
      var d = new Date();
      return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0") + " " +
        String(d.getHours()).padStart(2, "0") + ":" +
        String(d.getMinutes()).padStart(2, "0");
    }

    // =============================================================
    //  CSS Styles
    // =============================================================
    var styles = [
      ".mmr-mic-btn {",
      "  display: inline-flex; align-items: center; justify-content: center;",
      "  width: 30px; height: 30px; padding: 0;",
      "  border: 1px solid transparent; border-radius: 8px;",
      "  background: transparent;",
      "  color: var(--dsw-alias-label-secondary, #666);",
      "  cursor: pointer; transition: all .15s ease;",
      "}",
      ".mmr-mic-btn:hover {",
      "  background: var(--dsw-alias-bg-layer-2, #f0f0f0);",
      "  color: var(--dsw-alias-label-primary, #333);",
      "}",
      ".mmr-mic-btn[data-recording='true'] {",
      "  color: #e74c3c;",
      "  border-color: #e74c3c;",
      "  animation: mmr-pulse 1.2s ease-in-out infinite;",
      "}",
      "@keyframes mmr-pulse {",
      "  0%, 100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.35); }",
      "  50% { box-shadow: 0 0 0 6px transparent; }",
      "}",
      ".mmr-overlay {",
      "  position: fixed;",
      "  bottom: 80px;",
      "  right: 20px;",
      "  width: 380px;",
      "  max-height: 520px;",
      "  background: var(--dsw-bg, #ffffff);",
      "  border: 1px solid var(--dsw-border, #e0e0e0);",
      "  border-radius: 10px;",
      "  box-shadow: 0 8px 24px rgba(0,0,0,0.12);",
      "  display: flex;",
      "  flex-direction: column;",
      "  z-index: 9999;",
      "  font-size: 13px;",
      "  line-height: 1.5;",
      "  overflow: hidden;",
      "}",
      ".mmr-header {",
      "  display: flex; align-items: center; gap: 8px;",
      "  padding: 10px 14px;",
      "  border-bottom: 1px solid var(--dsw-border, #e0e0e0);",
      "  background: var(--dsw-bg-secondary, #f8f9fa);",
      "  flex-shrink: 0;",
      "}",
      ".mmr-header-title {",
      "  font-weight: 600; font-size: 14px; flex: 1;",
      "}",
      ".mmr-status {",
      "  font-size: 11px; padding: 2px 8px; border-radius: 10px;",
      "  background: #e74c3c; color: white;",
      "  animation: mmr-pulse 1.2s ease-in-out infinite;",
      "}",
      ".mmr-status.idle {",
      "  background: #95a5a6; animation: none;",
      "}",
      ".mmr-close-btn {",
      "  background: none; border: none; cursor: pointer;",
      "  font-size: 16px; padding: 2px 6px; border-radius: 4px;",
      "  color: var(--dsw-label-secondary, #666);",
      "}",
      ".mmr-close-btn:hover { background: var(--dsw-bg-hover, #f0f0f0); }",
      ".mmr-body {",
      "  flex: 1; overflow-y: auto; padding: 10px 14px;",
      "}",
      ".mmr-section { margin-bottom: 12px; }",
      ".mmr-section-title {",
      "  font-weight: 600; font-size: 12px;",
      "  color: var(--dsw-label-secondary, #666);",
      "  text-transform: uppercase; letter-spacing: 0.5px;",
      "  margin-bottom: 6px; padding-bottom: 4px;",
      "  border-bottom: 1px solid var(--dsw-border, #eee);",
      "}",
      ".mmr-item { padding: 4px 0; font-size: 12px; }",
      ".mmr-item .speaker { color: #3498db; font-weight: 500; }",
      ".mmr-item .meta { font-size: 11px; color: #999; }",
      ".mmr-item.topic {",
      "  padding-left: 12px; border-left: 3px solid #3498db; margin: 6px 0;",
      "}",
      ".mmr-item.decision {",
      "  padding-left: 12px; border-left: 3px solid #27ae60; margin: 6px 0;",
      "}",
      ".mmr-item.action {",
      "  padding-left: 12px; border-left: 3px solid #f39c12; margin: 6px 0;",
      "}",
      ".mmr-empty {",
      "  color: var(--dsw-label-secondary, #999); font-style: italic; padding: 8px 0;",
      "}",
      ".mmr-actions {",
      "  display: flex; gap: 6px; padding: 8px 14px;",
      "  border-top: 1px solid var(--dsw-border, #e0e0e0); flex-shrink: 0;",
      "}",
      ".mmr-action-btn {",
      "  flex: 1; padding: 6px 10px; border-radius: 6px;",
      "  border: 1px solid var(--dsw-border, #d0d0d0);",
      "  background: transparent; cursor: pointer; font-size: 12px;",
      "  transition: all .15s; text-align: center;",
      "}",
      ".mmr-action-btn:hover { background: var(--dsw-bg-hover, #f0f0f0); }",
      ".mmr-action-btn.primary {",
      "  background: #3498db; color: white; border-color: #3498db;",
      "}",
      ".mmr-action-btn.primary:hover { opacity: 0.9; }",
      ".mmr-action-btn.danger {",
      "  background: #e74c3c; color: white; border-color: #e74c3c;",
      "}",
      ".mmr-action-btn.danger:hover { opacity: 0.9; }",
      ".mmr-count { font-size: 11px; color: var(--dsw-label-secondary, #999); margin-left: 4px; }",
      ".mmr-minutes {",
      "  white-space: pre-wrap; font-size: 12px; line-height: 1.6;",
      "  max-height: 300px; overflow-y: auto; padding: 8px;",
      "  background: var(--dsw-bg-secondary, #f8f9fa);",
      "  border-radius: 6px; margin-top: 8px;",
      "  font-family: monospace;",
      "}",
      ".mmr-transcribe {",
      "  font-size: 12px; color: #e74c3c; padding: 4px 0;",
      "  font-style: italic;",
      "}",
      ".mmr-record-icon {",
      "  display: inline-block; width: 8px; height: 8px;",
      "  border-radius: 50%; background: #e74c3c; margin-right: 4px;",
      "  animation: mmr-pulse 1.2s ease-in-out infinite;",
      "}",
    ].join("\n");

    // =============================================================
    //  Components
    // =============================================================

    // ---- Mic Button Component ----
    function MicButton(props) {
      var recordingState = React.useState(false);
      var isRecording = recordingState[0];
      var setRecording = recordingState[1];
      var recRef = React.useRef(null);
      var stRef = React.useRef(Object.assign({}, transcribeState));

      React.useEffect(function () {
        var snap = getStateSnapshot();
        setRecording(snap.data ? snap.data.recording : false);
      }, []);

      React.useEffect(function () {
        return function () {
          var s = stRef.current;
          s.destroyed = true;
          s.manualStop = true;
          var rec = recRef.current;
          recRef.current = null;
          if (rec) { try { rec.abort(); } catch (e) {} }
        };
      }, []);

      var startRecognition = React.useCallback(function () {
        var s = stRef.current;
        if (s.destroyed || s.manualStop) return;
        var SR = getSpeechRecognition();
        if (!SR) { setRecording(false); return; }
        var rec;
        try { rec = new SR(); } catch (e) { setRecording(false); return; }
        recRef.current = rec;
        rec.lang = resolveLang();
        rec.continuous = true;
        rec.interimResults = true;

        rec.onstart = function () { setRecording(true); };

        rec.onresult = function (event) {
          var st = stRef.current;
          st.silentEnds = 0;
          st.interim = "";
          for (var i = event.resultIndex; i < event.results.length; i++) {
            var r = event.results[i];
            if (r.isFinal) st.finalText += r[0].transcript;
            else st.interim += r[0].transcript;
          }
          var interim = st.interim;
          if (st.finalText && interim.indexOf(st.finalText) === 0) {
            interim = interim.slice(st.finalText.length);
          }
          var full = (st.finalText + interim).trim();
          var text = st.base.trim() ? st.base.trim() + " " + full : full;
          if (props.inputActions && typeof props.inputActions.setDraft === "function") {
            props.inputActions.setDraft(text);
          }
        };

        rec.onerror = function (event) {
          var st = stRef.current;
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            st.manualStop = true;
            setRecording(false);
            alert(isZh() ? "麦克风权限被拒绝" : "Microphone permission denied");
          } else if (event.error === "network") {
            st.manualStop = true;
            setRecording(false);
            alert(isZh() ? "语音识别网络错误" : "Speech recognition network error");
          } else if (event.error !== "aborted" && event.error !== "no-speech") {
            st.manualStop = true;
            setRecording(false);
          }
        };

        rec.onend = function () {
          recRef.current = null;
          var st = stRef.current;
          if (st.destroyed || st.manualStop) return;
          st.silentEnds++;
          if (st.silentEnds >= 6) {
            commitRecording();
            return;
          }
          startRecognition();
        };

        try { rec.start(); } catch (e) { setRecording(false); }
      }, []);

      var commitRecording = React.useCallback(function () {
        var s = stRef.current;
        var text = applyPunct(s.finalText).trim();
        s.finalText = "";
        s.interim = "";
        s.silentEnds = 0;
        setRecording(false);
      }, []);

      var toggleMic = React.useCallback(function () {
        var s = stRef.current;
        if (recRef.current) {
          s.manualStop = true;
          var rec = recRef.current;
          recRef.current = null;
          try { rec.stop(); } catch (e) {}
          commitRecording();
          return;
        }
        s.base = (props.input && props.input.draft) || "";
        s.finalText = "";
        s.interim = "";
        s.manualStop = false;
        s.destroyed = false;
        s.silentEnds = 0;
        startRecognition();
      }, [startRecognition, commitRecording, props.input]);

      var zh = isZh();
      var title = isRecording
        ? (zh ? "点击停止录音" : "Click to stop recording")
        : (zh ? "点击开始录音" : "Click to start recording");

      return h("button", {
        type: "button",
        className: "mmr-mic-btn",
        "data-recording": isRecording ? "true" : "false",
        title: title,
        "aria-label": title,
        onClick: toggleMic
      }, h("svg", {
        viewBox: "0 0 24 24", width: "17", height: "17",
        fill: "none", stroke: "currentColor",
        strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round"
      },
        h("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }),
        h("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
        h("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
      ));
    }

    // ---- Toggle Button Component (for session header) ----
    function ToggleButton() {
      var state = React.useSyncExternalStore(subscribeState, getStateSnapshot);
      var zh = isZh();

      var toggle = function () {
        apiPost("/api/meeting/toggle").then(function (result) {
          if (result) updateState(result);
        }).catch(function () {});
      };

      var active = state.active;
      var title = active
        ? (zh ? "关闭会议模式" : "Close meeting mode")
        : (zh ? "开启会议模式" : "Open meeting mode");

      return h("button", {
        type: "button",
        className: "mmr-mic-btn",
        "data-recording": active ? "true" : "false",
        title: title,
        "aria-label": title,
        onClick: toggle,
        style: { fontSize: "14px", width: "auto", padding: "0 6px" }
      }, active ? "📝" : "🎤");
    }

    // ---- Meeting Panel Component ----
    function MeetingPanel() {
      var state = React.useSyncExternalStore(subscribeState, getStateSnapshot);
      var zh = isZh();

      var [viewMode, setViewMode] = React.useState("content");
      var [minutesText, setMinutesText] = React.useState("");
      var [generating, setGenerating] = React.useState(false);

      // Poll the host for meeting state every 2 seconds
      React.useEffect(function () {
        var poll = function () {
          apiGet("/api/meeting/state").then(function (result) {
            if (result) updateState(result);
          }).catch(function () {});
        };
        poll();
        var intervalId = setInterval(poll, 2000);
        return function () { clearInterval(intervalId); };
      }, []);

      if (!state.active) return null;

      var data = state.data || {
        title: "会议纪要",
        date: "",
        content: [],
        topics: [],
        decisions: [],
        actionItems: [],
        summary: ""
      };

      var handleGenerate = function () {
        setGenerating(true);
        apiPost("/api/meeting/generate").then(function (result) {
          setGenerating(false);
          if (result && result.success) {
            setMinutesText(result.minutes);
            setViewMode("minutes");
          } else {
            alert(zh ? "生成失败" : "Generate failed");
          }
        }).catch(function (err) {
          setGenerating(false);
          alert(zh ? "生成出错: " + String(err) : "Generate error: " + String(err));
        });
      };

      var handleCopy = function () {
        if (minutesText && typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(minutesText).then(function () {
            alert(zh ? "已复制到剪贴板" : "Copied to clipboard");
          }).catch(function () {});
        }
      };

      var handleReset = function () {
        apiPost("/api/meeting/reset").then(function (result) {
          if (result) updateState(result);
          setMinutesText("");
          setViewMode("content");
        }).catch(function () {});
      };

      var statusClass = "mmr-status" + (state.active ? "" : " idle");
      var statusText = state.active
        ? (zh ? "⏺ 录音中" : "⏺ Recording")
        : (zh ? "⏹ 已暂停" : "⏹ Paused");

      var contentSections = [];

      // Topics
      var topicItems = [];
      if (data.topics && data.topics.length > 0) {
        data.topics.forEach(function (t, i) {
          topicItems.push(
            h("div", { key: "t-" + i, className: "mmr-item topic" },
              h("div", null,
                h("span", null, (i + 1) + ". " + t.text),
                t.speaker ? h("span", { className: "speaker" }, " (" + t.speaker + ")") : null
              )
            )
          );
        });
      } else {
        topicItems.push(
          h("div", { key: "t-empty", className: "mmr-empty" },
            zh ? "暂无讨论要点" : "No discussion points"
          )
        );
      }
      contentSections.push(
        h("div", { key: "topics", className: "mmr-section" },
          h("div", { className: "mmr-section-title" },
            (zh ? "讨论要点" : "Topics"),
            h("span", { className: "mmr-count" }, "(" + (data.topics ? data.topics.length : 0) + ")")
          ),
          topicItems
        )
      );

      // Decisions
      var decisionItems = [];
      if (data.decisions && data.decisions.length > 0) {
        data.decisions.forEach(function (d, i) {
          decisionItems.push(
            h("div", { key: "d-" + i, className: "mmr-item decision" },
              h("div", null,
                h("span", null, (i + 1) + ". " + d.text),
                d.speaker ? h("span", { className: "speaker" }, " (" + d.speaker + ")") : null
              )
            )
          );
        });
      } else {
        decisionItems.push(
          h("div", { key: "d-empty", className: "mmr-empty" },
            zh ? "暂无决定事项" : "No decisions"
          )
        );
      }
      contentSections.push(
        h("div", { key: "decisions", className: "mmr-section" },
          h("div", { className: "mmr-section-title" },
            (zh ? "决定事项" : "Decisions"),
            h("span", { className: "mmr-count" }, "(" + (data.decisions ? data.decisions.length : 0) + ")")
          ),
          decisionItems
        )
      );

      // Action Items
      var actionItems = [];
      if (data.actionItems && data.actionItems.length > 0) {
        data.actionItems.forEach(function (a, i) {
          var metaParts = [];
          if (a.owner) metaParts.push((zh ? "负责人" : "Owner") + ": " + a.owner);
          if (a.dueDate) metaParts.push((zh ? "截止" : "Due") + ": " + a.dueDate);
          actionItems.push(
            h("div", { key: "a-" + i, className: "mmr-item action" },
              h("div", null,
                h("span", null, "☐ " + a.text),
                metaParts.length > 0 ? h("span", { className: "meta" }, " (" + metaParts.join(", ") + ")") : null
              )
            )
          );
        });
      } else {
        actionItems.push(
          h("div", { key: "a-empty", className: "mmr-empty" },
            zh ? "暂无待办事项" : "No action items"
          )
        );
      }
      contentSections.push(
        h("div", { key: "actions", className: "mmr-section" },
          h("div", { className: "mmr-section-title" },
            (zh ? "待办事项" : "Action Items"),
            h("span", { className: "mmr-count" }, "(" + (data.actionItems ? data.actionItems.length : 0) + ")")
          ),
          actionItems
        )
      );

      // Summary
      if (data.summary) {
        contentSections.push(
          h("div", { key: "summary", className: "mmr-section" },
            h("div", { className: "mmr-section-title" }, zh ? "总结" : "Summary"),
            h("div", { className: "mmr-item" }, data.summary)
          )
        );
      }

      // Recent content
      var contentItems = [];
      if (data.content && data.content.length > 0) {
        var recent = data.content.slice(-10);
        recent.forEach(function (c, i) {
          var label = c.role === "user" ? "👤" : "🤖";
          contentItems.push(
            h("div", { key: "c-" + i, className: "mmr-item" },
              h("span", { className: "speaker" }, label + " "),
              h("span", null, c.text.substring(0, 80) + (c.text.length > 80 ? "..." : ""))
            )
          );
        });
      } else {
        contentItems.push(
          h("div", { key: "c-empty", className: "mmr-empty" },
            zh ? "等待对话内容..." : "Waiting for content..."
          )
        );
      }
      contentSections.push(
        h("div", { key: "content", className: "mmr-section" },
          h("div", { className: "mmr-section-title" },
            (zh ? "最近对话" : "Recent Content"),
            h("span", { className: "mmr-count" }, "(" + (data.content ? data.content.length : 0) + ")")
          ),
          contentItems
        )
      );

      var minutesView = null;
      if (viewMode === "minutes" && minutesText) {
        minutesView = h("div", { className: "mmr-minutes" }, minutesText);
      }

      var generateBtnText = generating
        ? "⏳ " + (zh ? "生成中..." : "Generating...")
        : "📄 " + (zh ? "生成纪要" : "Generate Minutes");

      return h("div", { className: "mmr-overlay" },
        h("div", { className: "mmr-header" },
          h("span", { className: "mmr-header-title" }, "📝 " + (data.title || (zh ? "会议纪要" : "Meeting Minutes"))),
          h("span", { className: statusClass }, statusText),
          h("button", {
            className: "mmr-close-btn",
            onClick: function () { updateState({ active: false }); },
            title: zh ? "关闭" : "Close"
          }, "✕")
        ),
        h("div", { className: "mmr-body" },
          viewMode === "minutes" ? minutesView : contentSections
        ),
        h("div", { className: "mmr-actions" },
          h("button", {
            className: "mmr-action-btn primary",
            onClick: handleGenerate,
            disabled: generating
          }, generateBtnText),
          viewMode === "minutes"
            ? h("button", {
                className: "mmr-action-btn",
                onClick: handleCopy
              }, "📋 " + (zh ? "复制" : "Copy"))
            : null,
          h("button", {
            className: "mmr-action-btn",
            onClick: function () {
              setViewMode(viewMode === "content" ? "minutes" : "content");
            }
          }, viewMode === "content"
            ? "📋 " + (zh ? "纪要视图" : "Minutes View")
            : "📝 " + (zh ? "内容视图" : "Content View")),
          h("button", {
            className: "mmr-action-btn danger",
            onClick: handleReset
          }, "🔄 " + (zh ? "重置" : "Reset"))
        )
      );
    }

    // =============================================================
    //  Plugin apply
    // =============================================================
    function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;

      ctx.effect(function () { return insertStyles(styles); });

      // Register toggle button in session header
      slots.inject("conversation.session.header.utilities", function () {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "meeting-recorder-toggle", order: 50 },
          function () {
            return h(ToggleButton);
          }
        );
      });

      // Register mic button in input area
      slots.inject("conversation.input.right", function () {
        return slots.register(
          { name: "conversation.input.right", id: "meeting-recorder-mic", order: 0 },
          function (props) {
            props = props || {};
            return h(MicButton, props);
          }
        );
      });

      // Register meeting panel in overlay
      slots.inject("shell.overlay", function () {
        return slots.register(
          { name: "shell.overlay", id: "meeting-recorder-panel", order: 100 },
          function () {
            return h(MeetingPanel);
          }
        );
      });
    }

    exports.name = "dsh-meeting-recorder-client";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});