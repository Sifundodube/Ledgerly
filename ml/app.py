from fastapi import FastAPI

app = FastAPI(title="Ledgerly ML Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ledgerly-ml"}
