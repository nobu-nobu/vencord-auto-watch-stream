@echo off
setlocal EnableExtensions
chcp 65001 >nul
title AutoWatchStream Installer

echo.
echo ========================================
echo   AutoWatchStream Windows Installer
echo ========================================
echo.
echo Git, Node.js, pnpm, Vencord and AutoWatchStream
echo will be installed under your user account.
echo.

where winget >nul 2>nul
if errorlevel 1 goto :no_winget

where git >nul 2>nul
if errorlevel 1 (
    echo [1/7] Installing Git...
    winget install --id Git.Git --exact --source winget --accept-package-agreements --accept-source-agreements
    if errorlevel 1 goto :failed
) else (
    echo [1/7] Git is already installed.
)

where node >nul 2>nul
if errorlevel 1 (
    echo [2/7] Installing Node.js LTS...
    winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
    if errorlevel 1 goto :failed
) else (
    echo [2/7] Node.js is already installed.
)

set "PATH=%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where git >nul 2>nul
if errorlevel 1 goto :restart_required
where node >nul 2>nul
if errorlevel 1 goto :restart_required
where npm >nul 2>nul
if errorlevel 1 goto :restart_required

set "INSTALL_ROOT=%USERPROFILE%\AutoWatchStream"
set "VENCORD_DIR=%INSTALL_ROOT%\Vencord"
set "PLUGIN_DIR=%VENCORD_DIR%\src\userplugins\autoWatchStream"

if not exist "%INSTALL_ROOT%" mkdir "%INSTALL_ROOT%"

if exist "%VENCORD_DIR%\.git" (
    echo [3/7] Updating Vencord...
    git -C "%VENCORD_DIR%" pull --ff-only
    if errorlevel 1 goto :failed
) else (
    if exist "%VENCORD_DIR%" (
        echo ERROR: %VENCORD_DIR% already exists but is not a Git repository.
        goto :failed
    )
    echo [3/7] Downloading Vencord...
    git clone https://github.com/Vendicated/Vencord.git "%VENCORD_DIR%"
    if errorlevel 1 goto :failed
)

if exist "%PLUGIN_DIR%\.git" (
    echo [4/7] Updating AutoWatchStream...
    git -C "%PLUGIN_DIR%" pull --ff-only
    if errorlevel 1 goto :failed
) else (
    if exist "%PLUGIN_DIR%" (
        echo ERROR: %PLUGIN_DIR% already exists but is not this Git repository.
        goto :failed
    )
    echo [4/7] Downloading AutoWatchStream...
    git clone https://github.com/nobu-nobu/vencord-auto-watch-stream.git "%PLUGIN_DIR%"
    if errorlevel 1 goto :failed
)

cd /d "%VENCORD_DIR%"
for /f "delims=" %%V in ('node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]"') do set "PNPM_VERSION=%%V"
if not defined PNPM_VERSION goto :failed

echo [5/7] Installing pnpm %PNPM_VERSION% and dependencies...
call npm install --global "pnpm@%PNPM_VERSION%"
if errorlevel 1 goto :failed
call pnpm install --frozen-lockfile
if errorlevel 1 goto :failed

echo [6/7] Building Vencord with AutoWatchStream...
call pnpm build --disable-updater
if errorlevel 1 goto :failed

echo [7/7] Installing the custom Vencord build into Discord...
call pnpm inject
if errorlevel 1 goto :failed

echo.
echo ========================================
echo   Installation completed successfully
echo ========================================
echo.
echo 1. Fully close Discord and start it again.
echo 2. Open User Settings ^> Plugins.
echo 3. Enable AutoWatchStream.
echo 4. Choose a display mode from its cog button.
echo.
echo Installed files: %INSTALL_ROOT%
echo Do not move or delete this folder while using this build.
echo.
pause
exit /b 0

:no_winget
echo ERROR: winget was not found.
echo Install or update "App Installer" from Microsoft Store, then try again.
goto :failed

:restart_required
echo.
echo Git or Node.js was installed, but CMD cannot find it yet.
echo Close this window, open CMD again, and run the same command once more.
goto :failed

:failed
echo.
echo Installation stopped because an error occurred.
echo Read the last error shown above. Existing files were not deleted.
echo.
pause
exit /b 1
