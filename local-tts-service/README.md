# Local TTS Stub Service

This is a local-only FastAPI stub that matches the provider contract used by the Node app.

## What it does

- `POST /clone`: stores uploaded samples and returns `voice_id`
- `POST /synthesize`: returns generated WAV audio bytes (stub tone)
- `GET /health`: simple health check

The generated audio is a deterministic synthetic tone per voice ID. It is not real speech synthesis, but it is useful to validate the full local pipeline end-to-end.

## Run

1. Create/activate a Python environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the server:

```bash
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

## Node App Configuration

Set these in your `.env`:

```env
LOCAL_TTS_ENABLED=true
LOCAL_TTS_BASE_URL=http://127.0.0.1:8000
```

Then restart the Node app.
