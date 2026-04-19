@echo off
setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "SERVER_DIR=%PROJECT_DIR%\server"
set "CLIENT_DIR=%PROJECT_DIR%\client"
set "LOG_FILE=%PROJECT_DIR%\server.log"
set "ERR_FILE=%PROJECT_DIR%\server.err.log"
set "PID_FILE=%PROJECT_DIR%\server.pid"
set "PORT=8765"
set "ACTION=%~1"

if "%ACTION%"=="" set "ACTION=start"

cd /d "%PROJECT_DIR%" || goto fail

echo.
echo === Monopoly Bank Windows Launcher ===
echo Project: %PROJECT_DIR%
echo Action: %ACTION%
echo.

if /I "%ACTION%"=="start" goto cmd_start
if /I "%ACTION%"=="stop" goto cmd_stop
if /I "%ACTION%"=="restart" goto cmd_restart

echo Usage: %~nx0 [start^|stop^|restart]
goto fail

:cmd_start
call :detect_running
if "%SERVER_RUNNING%"=="1" (
  echo Server is already running. Restarting...
  call :stop_server
  if errorlevel 1 goto fail
)

call :ensure_runtime
if errorlevel 1 goto fail

call :install_dependencies
if errorlevel 1 goto fail

call :build_client
if errorlevel 1 goto fail

call :start_server
if errorlevel 1 goto fail

goto done

:cmd_stop
call :stop_server
if errorlevel 1 goto fail
goto done

:cmd_restart
call :stop_server
if errorlevel 1 goto fail
call :ensure_runtime
if errorlevel 1 goto fail
call :install_dependencies
if errorlevel 1 goto fail
call :build_client
if errorlevel 1 goto fail
call :start_server
if errorlevel 1 goto fail
goto done

:ensure_runtime
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first:
  echo https://nodejs.org/
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js with npm enabled.
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node"') do set "NODE_VERSION=%%v"
echo Node: v%NODE_VERSION%

powershell -NoProfile -ExecutionPolicy Bypass -Command "if ([version]'%NODE_VERSION%' -lt [version]'22.13.0') { exit 1 }"
if errorlevel 1 (
  echo Node.js v22.13.0 or newer is required because the server uses built-in SQLite.
  echo Please install the latest Node.js LTS from https://nodejs.org/
  exit /b 1
)

exit /b 0

:install_dependencies
if not exist "%SERVER_DIR%\node_modules" (
  echo.
  echo Installing server dependencies...
  pushd "%SERVER_DIR%" || exit /b 1
  call npm install
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

if not exist "%CLIENT_DIR%\node_modules" (
  echo.
  echo Installing client dependencies...
  pushd "%CLIENT_DIR%" || exit /b 1
  call npm install
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

exit /b 0

:build_client
echo.
echo Building client...
pushd "%CLIENT_DIR%" || exit /b 1
call npm run build
if errorlevel 1 (
  popd
  exit /b 1
)
popd
exit /b 0

:start_server
if exist "%LOG_FILE%" del "%LOG_FILE%" >nul 2>nul
if exist "%ERR_FILE%" del "%ERR_FILE%" >nul 2>nul

echo.
echo Starting server...
start "Monopoly Bank Server" /min cmd /d /c ""node" "%SERVER_DIR%\server.js" 1>"%LOG_FILE%" 2>"%ERR_FILE%""

timeout /t 2 /nobreak >nul

call :detect_running
if not "%SERVER_RUNNING%"=="1" (
  echo Server failed to stay running.
  echo.
  if exist "%LOG_FILE%" (
    echo --- server.log ---
    type "%LOG_FILE%"
  )
  if exist "%ERR_FILE%" (
    echo --- server.err.log ---
    type "%ERR_FILE%"
  )
  del "%PID_FILE%" >nul 2>nul
  exit /b 1
)

echo Server started. PID: !SERVER_PID!
echo URL: http://127.0.0.1:%PORT%
start "" "http://127.0.0.1:%PORT%"
exit /b 0

:stop_server
call :detect_running
if not "%SERVER_RUNNING%"=="1" (
  echo Server is not running.
  if exist "%PID_FILE%" del "%PID_FILE%" >nul 2>nul
  exit /b 0
)

echo Stopping server. PID: %SERVER_PID%
taskkill /PID %SERVER_PID% /T /F >nul 2>nul
if errorlevel 1 (
  echo Failed to stop PID %SERVER_PID%.
  exit /b 1
)

del "%PID_FILE%" >nul 2>nul
echo Server stopped.
exit /b 0

:detect_running
set "SERVER_RUNNING=0"
set "SERVER_PID="

if exist "%PID_FILE%" (
  set /p SERVER_PID=<"%PID_FILE%"
  if defined SERVER_PID (
    tasklist /FI "PID eq !SERVER_PID!" 2>nul | findstr /R /C:"^node.exe" >nul
    if not errorlevel 1 (
      set "SERVER_RUNNING=1"
      exit /b 0
    )
  )
)

set "SERVER_PID="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = @(Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique); foreach ($id in $pids) { try { $p = Get-Process -Id $id -ErrorAction Stop; if ($p.ProcessName -eq 'node') { $id; break } } catch {} }"`) do (
  set "SERVER_PID=%%p"
)

if defined SERVER_PID (
  set "SERVER_RUNNING=1"
  >"%PID_FILE%" echo !SERVER_PID!
)

exit /b 0

:done
echo.
echo Done. You can close this window.
pause
exit /b 0

:fail
echo.
echo Operation failed. Check the messages above.
pause
exit /b 1
