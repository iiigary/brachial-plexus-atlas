@echo off
rem Double-click to open the atlas on Windows. Uses built-in PowerShell, nothing to install.
rem (ES modules cannot be loaded from file://, so a local server is needed.)
title Brachial Plexus Atlas
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
