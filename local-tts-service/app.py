import json
import threading
import time
import warnings
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

# Suppress common ML library deprecation warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="diffusers")
warnings.filterwarnings("ignore", category=FutureWarning, message=".*LoRACompatibleLinear.*")
warnings.filterwarnings("ignore", category=FutureWarning, message=".*torch.backends.cuda.sdp_kernel.*")
warnings.filterwarnings("ignore", message=".*sdpa.*attention does not support.*output_attentions.*")

import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAMPLES_DIR = DATA_DIR / "samples"
VOICE_DB = DATA_DIR / "voices.json"

# ---------------------------------------------------------------------------
# Chatterbox model (lazy-loaded on first synthesis request)
# ---------------------------------------------------------------------------
_tts_model = None
_tts_model_loaded = False
_tts_model_lock = threading.Lock()


def _get_model():
    global _tts_model, _tts_model_loaded
    if not _tts_model_loaded:
        with _tts_model_lock:
            if not _tts_model_loaded:
                _tts_model_loaded = True
                try:
                    from chatterbox.tts import ChatterboxTTS
                    
                    # Determine best device (GPU if available, otherwise CPU)
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    print(f"[TTS] Loading Chatterbox model ({device.upper()}) — first load downloads ~1 GB from HuggingFace …")
                    
                    # Enable GPU optimizations if available
                    if device == "cuda":
                        # Enable mixed precision and optimizations
                        torch.backends.cudnn.benchmark = True
                        torch.backends.cuda.matmul.allow_tf32 = True
                        print(f"[TTS] GPU detected: {torch.cuda.get_device_name(0)} with {torch.cuda.get_device_properties(0).total_memory // (1024**3)}GB VRAM")
                    
                    _tts_model = ChatterboxTTS.from_pretrained(device=device)
                    
                    # Apply torch.compile for faster inference (PyTorch 2.0+)
                    try:
                        if hasattr(torch, 'compile') and device == "cuda":
                            print("[TTS] Applying torch.compile optimization...")
                            _tts_model.model = torch.compile(_tts_model.model, mode="reduce-overhead")
                    except Exception as compile_err:
                        print(f"[TTS] torch.compile failed (continuing without): {compile_err}")
                    
                    print(f"[TTS] Chatterbox model ready on {device.upper()}.")
                except Exception as exc:
                    print(f"[TTS] Failed to load Chatterbox model: {exc}")
                    _tts_model = None
    return _tts_model


def _synthesize_chatterbox(text: str, sample_path: Path) -> bytes:
    model = _get_model()
    if model is None:
        raise RuntimeError("Chatterbox model unavailable — falling back to stub")
    
    start_time = time.time()
    
    # Use automatic mixed precision for GPU inference
    with torch.inference_mode():  # More efficient than torch.no_grad()
        if torch.cuda.is_available():
            with torch.autocast(device_type='cuda', dtype=torch.float16):
                wav: torch.Tensor = model.generate(text, audio_prompt_path=str(sample_path))
        else:
            wav: torch.Tensor = model.generate(text, audio_prompt_path=str(sample_path))
    
    if wav.dim() == 1:
        wav = wav.unsqueeze(0)
    buf = BytesIO()
    torchaudio.save(buf, wav.cpu(), sample_rate=24000, format="wav")
    buf.seek(0)
    
    synthesis_time = time.time() - start_time
    print(f"[TTS] Generated audio in {synthesis_time:.2f}s ({len(text)} chars)")
    
    return buf.read()


DATA_DIR.mkdir(parents=True, exist_ok=True)
SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

if not VOICE_DB.exists():
    VOICE_DB.write_text("[]\n", encoding="utf-8")


class SynthesizeRequest(BaseModel):
    voice_id: Optional[str] = None
    voice_tag: Optional[str] = None
    text: str


app = FastAPI(title="Kick Local TTS", version="0.2.0")


def _load_voices():
    try:
        payload = json.loads(VOICE_DB.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return payload
    except Exception:
        pass
    return []


def _save_voices(voices):
    VOICE_DB.write_text(json.dumps(voices, indent=2) + "\n", encoding="utf-8")


def _normalize_tag(raw_tag: str) -> str:
    return "".join(ch for ch in (raw_tag or "").strip().lower().lstrip("!") if ch.isalnum() or ch in "_-")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "kick-local-tts",
        "model": "chatterbox" if _tts_model is not None else "not_loaded",
        "time": datetime.utcnow().isoformat() + "Z"
    }


@app.post("/warmup")
def warmup_model():
    model = _get_model()
    if model is None:
        raise HTTPException(status_code=503, detail="Chatterbox model failed to load")

    return {
        "ok": True,
        "service": "kick-local-tts",
        "model": "chatterbox",
        "status": "ready",
        "time": datetime.utcnow().isoformat() + "Z"
    }


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    tag: str = Form(...),
    sample_file: UploadFile = File(...)
):
    normalized_tag = _normalize_tag(tag)
    if not normalized_tag:
        raise HTTPException(status_code=400, detail="Invalid tag")

    voices = _load_voices()
    if any(v.get("tag") == normalized_tag for v in voices):
        raise HTTPException(status_code=409, detail=f"Tag !{normalized_tag} already exists")

    ext = Path(sample_file.filename or "sample.wav").suffix or ".wav"
    sample_name = f"{int(datetime.utcnow().timestamp() * 1000)}-{normalized_tag}{ext}"
    sample_path = SAMPLES_DIR / sample_name

    content = await sample_file.read()
    sample_path.write_bytes(content)

    voice_id = f"local-{normalized_tag}-{int(datetime.utcnow().timestamp())}"
    voice_record = {
        "id": voice_id,
        "name": name.strip(),
        "tag": normalized_tag,
        "sample_file": sample_name,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    voices.append(voice_record)
    _save_voices(voices)

    return JSONResponse({"voice_id": voice_id})


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    voices = _load_voices()
    selected = None

    if request.voice_id:
        selected = next((v for v in voices if v.get("id") == request.voice_id), None)
    elif request.voice_tag:
        tag = _normalize_tag(request.voice_tag)
        selected = next((v for v in voices if v.get("tag") == tag), None)

    if selected is None:
        raise HTTPException(status_code=404, detail="Voice not found in local stub")

    sample_file = selected.get("sample_file")
    sample_path = SAMPLES_DIR / sample_file if sample_file else None

    if sample_path and sample_path.exists():
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            wav_bytes = await loop.run_in_executor(
                None, _synthesize_chatterbox, text, sample_path
            )
            return Response(content=wav_bytes, media_type="audio/wav")
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Synthesis failed: {exc}")
    else:
        raise HTTPException(status_code=404, detail="Voice sample file not found on disk")
