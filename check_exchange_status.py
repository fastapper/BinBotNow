import requests

def check_binance_status(base_url="https://testnet.binance.vision"):
    try:
        r = requests.get(base_url + "/api/v3/ping", timeout=5)
        if r.status_code == 200:
            return "✅ Binance API responde correctamente"
        else:
            return f"⚠️ Binance API responde con código {r.status_code}"
    except requests.exceptions.RequestException as e:
        return f"❌ Error al conectar con Binance: {e}"

if __name__ == "__main__":
    print(check_binance_status())
