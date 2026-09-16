/** 文件上传插件：HTTP 端点上支持上传 Excel 文件到 AI 分析 */
const name = 'dsh-upload-file';
const inject = ['webServer'];

function apply(ctx) {
  const webServer = ctx.get('webServer');
  if (!webServer) return;

  ctx.effect(function() {
    return webServer.register({
      method: 'POST',
      path: '/api/upload-file',
      kind: 'exact',
      handler: async function(req, res) {
        try {
          // Read JSON body
          var chunks = [];
          await new Promise(function(resolve, reject) {
            req.on('data', function(c) { chunks.push(c); });
            req.on('end', resolve);
            req.on('error', reject);
          });
          var total = chunks.reduce(function(s, c) { return s + c.length; }, 0);
          var buf = new Uint8Array(total);
          var off = 0;
          for (var i = 0; i < chunks.length; i++) {
            buf.set(chunks[i], off);
            off += chunks[i].length;
          }
          var body = JSON.parse(new TextDecoder().decode(buf));
          var name = body.name;
          var data = body.data;
          if (!name || !data) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'name and data required' }));
            return;
          }

          var ts = Date.now();
          var safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
          var fileName = ts + '_' + safeName;

          var subprocess = ctx.get('subprocess');
          if (!subprocess) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'subprocess service not available' }));
            return;
          }

          // Pure PowerShell approach: reads base64 from stdin via [Console]::In.ReadToEnd()
          var psScript = [
            "try {",
            "  $dir = Join-Path $env:USERPROFILE '.dsh\\uploads'",
            "  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }",
            "  $data = [Console]::In.ReadToEnd()",
            "  $path = Join-Path $dir '" + fileName.replace(/'/g, "''") + "'",
            "  $bytes = [System.Convert]::FromBase64String($data.Trim())",
            "  [System.IO.File]::WriteAllBytes($path, $bytes)",
            "  Write-Output $path",
            "} catch { Write-Error $_.Exception.Message; exit 1 }",
          ].join('; ');

          var handle = subprocess.spawn({
            argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', psScript],
            cwd: 'C:\\',
            stdio: {
              stdin: { data: data },
              stdout: { maxBytes: 4096 },
              stderr: { maxBytes: 4096 },
            },
            graceMs: 60000,
          });

          var outcome = await handle.done;
          var stdout = '';
          var stderr = '';
          if (handle.collected.stdout) {
            stdout = handle.collected.stdout.readFrom(0).text;
          }
          if (handle.collected.stderr) {
            stderr = handle.collected.stderr.readFrom(0).text;
          }

          if (outcome.exitCode !== 0) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'PowerShell failed: ' + (stderr || 'exit ' + outcome.exitCode) }));
            return;
          }

          var filePath = stdout.trim().split('\n').pop().trim();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, path: filePath, name: safeName }));
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      }
    });
  });
}

export { name, inject, apply };