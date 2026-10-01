@echo off
title XYZ Displays URL Checker

:START

echo.
echo ========================================
echo Starting URL Checker...
echo ========================================
echo.

node check-links.js

if %ERRORLEVEL% EQU 0 goto SUCCESS

echo.
echo ========================================
echo URL checker crashed.
echo Restarting in 30 seconds...
echo ========================================
echo.

timeout /t 30 /nobreak
goto START

:SUCCESS

echo.
echo ========================================
echo ALL URL CHECKS FINISHED SUCCESSFULLY
echo ========================================
echo.

pause