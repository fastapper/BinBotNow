from fastapi import FastAPI, WebSocket
import uvicorn

app = FastAPI()

@app.websocket("/ws/test")
async def websocket_test(ws: WebSocket):
    await ws.accept()
    print("✅ WebSocket /ws/test conectado")
    await ws.send_json({"msg": "hello from test"})
    await ws.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=False)
