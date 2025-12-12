# manage.py
import subprocess
from pathlib import Path
import typer

app = typer.Typer()

BASE_DIR = Path(__file__).resolve().parent
PYTHON = BASE_DIR / "venv" / "Scripts" / "python.exe"

def run_in_new_console(command: str, title: str):
    # Siempre arranca en la raíz del proyecto con un título claro
    full_command = f'cd /d "{BASE_DIR}" && title {title} && {command}'
    subprocess.Popen(
        f'start "{title}" cmd /k "{full_command}"',
        shell=True
    )

# -----------------------------
# Subcomando: db
# -----------------------------
db_app = typer.Typer()
app.add_typer(db_app, name="db")

@db_app.command("init")
def db_init():
    """
    Crea las tablas en la base de datos definida en .env (DB_URL).
    """
    # Importamos aquí para garantizar que los modelos estén registrados
    from app.core.db import Base, engine
    from app.core import models  # noqa: F401 - necesario para registrar modelos
    Base.metadata.create_all(bind=engine)
    typer.echo("Tablas creadas.")

# -----------------------------
# Subcomando: run
# -----------------------------
run_app = typer.Typer()
app.add_typer(run_app, name="run")

@run_app.command("all")
def run_all(
    backend: bool = typer.Option(False, help="Inicia el FastAPI backend"),
    bot: bool = typer.Option(False, help="Inicia el trading bot (worker)"),
    dashboard: bool = typer.Option(False, help="Inicia el dashboard React (npm run dev)")
):
    """
    Inicia uno o más componentes del sistema en ventanas separadas.
    """
    if backend:
        run_in_new_console(
            f'"{PYTHON}" -m uvicorn app.backend.server:app --reload --host 0.0.0.0 --port 8080',
            "Backend"
        )
    if bot:
        run_in_new_console(
            f'"{PYTHON}" -m app.workers.runner',
            "Bot"
        )
    if dashboard:
        dashboard_dir = BASE_DIR / "dashboard-react"
        run_in_new_console(
            f'cd /d "{dashboard_dir}" && npm run dev',
            "Dashboard"
        )

if __name__ == "__main__":
    app()
