window.__ModuleLoader__.load({
  id: "@anoslide/dsh-upload-file",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;

    exports.inject = ['slots'];
    exports.apply = function(ctx) {
      var slots = ctx.get('slots');
      if (!slots) return;

      slots.inject('conversation.input.left', function() {
        slots.register(
          { name: 'conversation.input.left', id: 'upl-file-btn', order: 0, label: '\u4e0a\u4f20\u6587\u4ef6' },
          function(props) {
            var state = react.useState({ uploading: false, fileName: null, filePath: null, error: null });
            var ui = state[0];
            var setUi = state[1];

            var handleClick = function() {
              var input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx,.xlsm,.xls,.csv';
              input.onchange = async function() {
                var file = input.files[0];
                if (!file) return;
                setUi({ uploading: true, fileName: file.name, filePath: null, error: null });
                try {
                  var reader = new FileReader();
                  reader.onload = async function() {
                    try {
                      var base64 = reader.result.split(',')[1];
                      var resp = await fetch('/api/upload-file', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ name: file.name, data: base64 }),
                      });
                      var result = await resp.json();
                      if (result.ok) {
                        setUi({ uploading: false, fileName: file.name, filePath: result.path, error: null });
                        if (props.inputActions) {
                          props.inputActions.setDraft('\u5206\u6790\u8fd9\u4e2a\u6587\u4ef6\uff1a' + result.path);
                          setTimeout(function() { props.inputActions.submit(); }, 100);
                        }
                      } else {
                        setUi({ uploading: false, fileName: null, filePath: null, error: result.error || '\u4e0a\u4f20\u5931\u8d25' });
                      }
                    } catch (e) {
                      setUi({ uploading: false, fileName: null, filePath: null, error: String(e) });
                      console.error('Upload error:', e);
                    }
                  };
                  reader.readAsDataURL(file);
                } catch (e) {
                  setUi({ uploading: false, fileName: null, filePath: null, error: String(e) });
                  console.error('File read error:', e);
                }
              };
              input.click();
            };

            return h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
              h('button', {
                onClick: handleClick,
                disabled: ui.uploading,
                title: '\u4e0a\u4f20 Excel \u6587\u4ef6\u5230 AI \u5206\u6790',
                style: {
                  background: 'none',
                  border: 'none',
                  cursor: ui.uploading ? 'wait' : 'pointer',
                  padding: '4px 10px',
                  fontSize: '18px',
                  lineHeight: '1',
                  opacity: ui.uploading ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--c-text)',
                },
              }, ui.uploading ? '\u23f3' : '\ud83d\udcce'),
              ui.fileName ? h('span', {
                style: {
                  fontSize: '11px',
                  color: 'var(--c-text)',
                  maxWidth: '120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'default',
                },
                title: ui.filePath || ui.fileName,
              }, ui.fileName) : null,
              ui.error ? h('span', {
                style: { fontSize: '11px', color: 'red' },
              }, '\u2716 ' + ui.error) : null
            );
          }
        );
      });
    };
  }
});