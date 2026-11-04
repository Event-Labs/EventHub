@echo off
title EventHub Local AI Tunnel Worker
powershell -ExecutionPolicy Bypass -File "%~dp0ai\start-ai-tunnel.ps1"
pause
