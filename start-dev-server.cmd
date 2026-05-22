@echo off
set PORT=%1
if "%PORT%"=="" set PORT=5188
echo MazeCorridor - Dev server starting on port %PORT%
echo.
echo   Visit: http://127.0.0.1:%PORT%/
echo.
echo Press Ctrl+C to stop
node dev-server.js %PORT%
