@echo off
echo 🚀 Instalando dependencias del proyecto completo...

REM Crear entorno virtual si no existe
if not exist .venv (
    python -m venv .venv
)

REM Activar entorno virtual
call .venv\Scripts\activate

REM Actualizar pip
python -m pip install --upgrade pip

REM Instalar dependencias backend
pip install -r requirements.txt

REM Instalar dependencias frontend
cd dashboard-react
call npm install
cd ..

echo ✅ Instalación completa.
pause
