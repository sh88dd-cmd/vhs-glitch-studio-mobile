@echo off
cd /d "%~dp0"
title VHS Glitch Studio Mobile - local preview
where py >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:8765"
  py -3 -m http.server 8765
) else (
  start "" "http://localhost:8765"
  python -m http.server 8765
)
echo.
echo Для закрытия нажми любую клавишу.
pause >nul
