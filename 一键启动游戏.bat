@echo off
chcp 65001 >nul
title 火柴人格斗游戏 - 一键启动
color 0A

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║        联机火柴人格斗游戏 - 一键启动                  ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM 检查Node.js是否安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] 错误：未找到Node.js
    echo.
    echo 请先安装Node.js: https://nodejs.org/
    echo 安装完成后重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo [√] Node.js 已安装
echo.

REM 检查并安装依赖
if not exist "node_modules" (
    echo [*] 首次运行，正在安装依赖包...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [✗] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo.
    echo [√] 依赖安装完成
    echo.
)

REM 检查server.js是否存在
if not exist "server.js" (
    echo [✗] 错误：找不到server.js文件
    pause
    exit /b 1
)

echo [*] 正在启动游戏服务器...
echo.
echo ════════════════════════════════════════════════════════
echo   游戏地址: http://localhost:3000/stickman-fight.html
echo ════════════════════════════════════════════════════════
echo.
echo [提示] 
echo   - 服务器启动后会自动打开浏览器
echo   - 需要2名玩家才能开始游戏
echo   - 可以打开多个浏览器窗口/标签页进行对战
echo   - 按 Ctrl+C 可以停止服务器
echo.
echo ════════════════════════════════════════════════════════
echo.

REM 延迟2秒后自动打开浏览器
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/stickman-fight.html"

REM 启动服务器
node server.js

pause

