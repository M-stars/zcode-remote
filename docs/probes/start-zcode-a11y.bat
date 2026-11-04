@echo off
rem 以无障碍增强模式重启 ZCode Desktop（会话自动恢复，插件与配置不变）
rem 用途：让桥接的 UIA 自动唤醒生效（手机任务到达时自动唤醒值守会话）
echo 正在关闭 ZCode...
taskkill /IM ZCode.exe /F >nul 2>&1
timeout /t 3 /nobreak >nul
echo 正在以增强模式启动...
start "" "D:\zcode\ZCode.exe" --force-renderer-accessibility
echo 完成。值守会话恢复后，手机任务将自动被接管执行。
pause
