@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================================
echo   EVENTHUB - CLIENT PERFORMANCE TEST CHUC NANG DAT VE (500/1000/2000/5000 CCU)
echo ============================================================================
echo.
echo [1/3] Khoi tao du lieu & 5,000 Client JWT Sessions...
node setup-booking-perf-data.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Khong the khoi tao du lieu test.
    exit /b 1
)

echo.
echo [2/3] Chay kich ban Test Client Performance + Concurrent Load (500, 1000, 2000, 5000 Users)...
node run-booking-client-perf.js --tiers=500,1000,2000,5000

echo.
echo [3/3] Don dep du lieu giu ghe & don hang test...
node setup-booking-perf-data.js --cleanup

echo.
echo ============================================================================
echo   HOAN TAT! Xem bao cao chi tiet tai:
echo   - %~dp0BOOKING_CLIENT_PERF_REPORT.md
echo   - %~dp0booking-client-perf-results.json
echo ============================================================================

