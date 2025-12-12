import sqlite3
from tabulate import tabulate

db_path = "app.db"

with sqlite3.connect(db_path) as conn:
    cur = conn.cursor()

    # Mostrar estructura de la tabla
    print("📌 Esquema actual de equity_snapshots:")
    cur.execute("PRAGMA table_info(equity_snapshots);")
    schema = cur.fetchall()
    print(tabulate(schema, headers=["cid", "name", "type", "notnull", "dflt_value", "pk"]))

    # Mostrar primeras 10 filas
    print("\n📊 Primeras 10 filas:")
    cur.execute("SELECT id, ts, equity, balance_usdt FROM equity_snapshots ORDER BY ts ASC LIMIT 10;")
    rows = cur.fetchall()
    print(tabulate(rows, headers=["id", "ts", "equity", "balance_usdt"]))
