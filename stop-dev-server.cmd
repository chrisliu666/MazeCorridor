@echo off
set PORT=%1
if "%PORT%"=="" set PORT=5188
echo Stopping service on port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%"') do (
    if not "%%p"=="" (
        taskkill /PID %%p /F >nul 2>&1
        echo Killed process %%p
    )
)
echo Done.
