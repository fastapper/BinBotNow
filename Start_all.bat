@echo off
title 🚀 BinBotNow Starter (Debug Mode)
color 0A

echo.
echo ============================================================
echo   🚀 Iniciando entorno de trabajo: BinBotNow
echo ============================================================
echo.

REM ==========================
REM 🧩 1️⃣ Activar entorno virtual
REM ==========================
if exist ".venv\Scripts\activate.bat" (
    echo ⚙️ Activando entorno virtual .venv ...
    call .venv\Scripts\activate
    if errorlevel 1 (
        echo ❌ Error al activar entorno virtual.
        pause
        exit /b
    )
) else (
    echo ❌ No se encontró el entorno virtual .venv\Scripts\activate.bat
    echo 🔧 Crea uno ejecutando:
    echo     python -m venv .venv
    echo Luego vuelve a ejecutar este script.
    pause
    exit /b
)

REM ==========================
REM 🧠 2️⃣ Mostrar versión de Python activo
REM ==========================
echo.
echo Verificando versión de Python...
python --version
if errorlevel 1 (
    echo ❌ No se pudo ejecutar Python desde el entorno virtual.
    echo 🔧 Asegúrate de que el entorno .venv se haya creado correctamente.
    pause
    exit /b
)

REM ==========================
REM ⚙️ 3️⃣ Lanzar Backend (FastAPI)
REM ==========================
echo.
echo 🛰️  Iniciando Backend (FastAPI)...
start "📡 Backend" cmd /k ".venv\Scripts\activate && python -m uvicorn app.backend.main:app --reload --port 8080 --host 127.0.0.1"
if errorlevel 1 (
    echo ❌ Error al lanzar el backend.
    pause
    exit /b
)
timeout /t 3 >nul

REM ==========================
REM 🖥️ 4️⃣ Lanzar Frontend (React)
REM ==========================
echo.
echo 🖥️  Iniciando Frontend (React Dashboard)...
if exist "dashboard-react" (
    cd dashboard-react
    start "🧭 Frontend" cmd /k "npm run dev"
    cd ..
) else (
    echo ⚠️  Carpeta dashboard-react no encontrada. Saltando frontend.
)

REM ==========================
REM 🔁 5️⃣ Lanzar Runner (Worker)
REM ==========================
echo.
echo 🔄 Iniciando Runner (bot worker)...
start "⚙️ Runner" cmd /k ".venv\Scripts\activate && python -m app.workers.runner"
if errorlevel 1 (
    echo ❌ Error al lanzar el runner.
)

echo.
echo ============================================================
echo ✅ Todo iniciado.
echo 🌐 Abre tu navegador en: http://localhost:5173
echo ============================================================
echo.
pause
