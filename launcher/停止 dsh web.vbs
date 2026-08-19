' ============================================================
'  停止 dsh web —— 无控制台闪窗的入口（双击这个）
'  实际逻辑在同目录的「停止 dsh web.ps1」
' ============================================================
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, ".vbs", ".ps1")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
