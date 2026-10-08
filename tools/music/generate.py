"""
Genera la banda sonora con MusicGen (Meta, modelo abierto) en local.

    uv venv -p 3.11 .musicenv && VIRTUAL_ENV=.musicenv uv pip install torch transformers scipy numpy
    .musicenv/bin/python tools/music/generate.py              # todas las pistas
    .musicenv/bin/python tools/music/generate.py battle boss  # solo algunas

Cada pista se genera en tramos: el primero desde el texto y los siguientes
continúan los últimos segundos del anterior, para pasar de los 30 s del
modelo. Después ffmpeg normaliza el volumen, suaviza los extremos y la guarda
en public/music/<nombre>.m4a. El motor de audio las encadena con fundidos.

Licencia: los pesos de MusicGen son CC-BY-NC 4.0 (uso no comercial).
"""

import os
import subprocess
import sys
import tempfile

import numpy as np
import torch
from scipy.io import wavfile
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL = os.environ.get("MUSICGEN", "facebook/musicgen-medium")
# En la rama principal los pesos solo están en .bin; Hugging Face publica la
# conversión a safetensors en esta otra rama (los mismos pesos, 7,5 GB).
WEIGHTS_REVISION = os.environ.get("MUSICGEN_REVISION", "refs/pr/10")
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "music")

# nombre: (descripción, segundos, semilla)
TRACKS = {
    "castle": (
        "warm medieval fantasy town theme, acoustic guitar, wooden flute melody, harp, soft strings, "
        "hopeful and cozy, major key, 90 bpm, orchestral video game soundtrack",
        60, 11,
    ),
    "road": (
        "adventurous orchestral fantasy journey theme, sweeping strings, french horn melody, "
        "harp arpeggios, light snare and timpani, heroic, major key, 105 bpm, video game soundtrack",
        60, 12,
    ),
    "night": (
        "calm mysterious fantasy night music, soft harp, celesta, slow strings, gentle flute, "
        "quiet and melancholic, minor key, 70 bpm, video game soundtrack",
        60, 13,
    ),
    "dark": (
        "dark ominous fantasy ambient music, low cello drones, eerie choir, distant tolling bells, "
        "tense and haunting, minor key, slow, video game soundtrack",
        55, 14,
    ),
    "battle": (
        "intense orchestral fantasy battle theme, fast strings ostinato, brass stabs, taiko drums, "
        "driving piano, energetic, minor key, 150 bpm, video game soundtrack",
        60, 15,
    ),
    "boss": (
        "epic dark orchestral boss battle music, menacing choir, pipe organ, heavy brass, timpani, "
        "fast strings, dramatic, minor key, 140 bpm, video game soundtrack",
        60, 16,
    ),
    "victory": (
        "short triumphant orchestral victory fanfare, bright brass and timpani, major key, joyful ending",
        9, 17,
    ),
    "defeat": (
        "short sad orchestral lament, slow solo piano and strings, minor key, sorrowful ending",
        10, 18,
    ),
}

SEGMENT = 30  # segundos por tramo (lo máximo del modelo)
CONTEXT = 10  # segundos del tramo anterior que guían el siguiente


def device():
    if torch.backends.mps.is_available():
        return "mps"
    return "cuda" if torch.cuda.is_available() else "cpu"


def generate(model, processor, text, seconds, seed, dev):
    rate = model.config.audio_encoder.sampling_rate
    fps = model.config.audio_encoder.frame_rate
    torch.manual_seed(seed)
    audio = np.zeros(0, dtype=np.float32)
    # Margen de medio segundo: el modelo devuelve a veces un cuadro menos.
    while len(audio) < (seconds - 0.5) * rate:
        left = seconds - len(audio) / rate
        if len(audio) == 0:
            new = min(SEGMENT, seconds)
            inputs = processor(text=[text], padding=True, return_tensors="pt")
        else:
            ctx = audio[-CONTEXT * rate :]
            new = min(SEGMENT - CONTEXT, left)
            inputs = processor(text=[text], audio=ctx, sampling_rate=rate, padding=True, return_tensors="pt")
        inputs = {k: v.to(dev) for k, v in inputs.items()}
        with torch.no_grad():
            out = model.generate(**inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=int(new * fps))
        seg = out[0, 0].float().cpu().numpy()
        # Con contexto, la salida empieza repitiendo el audio de entrada: se quita.
        if len(audio):
            seg = seg[len(seg) - int(new * rate) :] if len(seg) > new * rate + rate else seg
        audio = np.concatenate([audio, seg])
        print(f"  {len(audio) / rate:.0f}/{seconds} s", flush=True)
    return audio[: seconds * rate], rate


def has_gap(audio, rate, tail=3.0):
    """Hay un hueco: 1,5 s seguidos muy por debajo del volumen típico de la pista."""
    win = rate // 2
    body = audio[: max(win, len(audio) - int(tail * rate))]
    rms = np.array([np.sqrt(np.mean(body[i : i + win] ** 2)) for i in range(0, len(body) - win, win)])
    if len(rms) < 4:
        return False
    quiet = rms < 0.15 * np.median(rms)
    run = 0
    for q in quiet:
        run = run + 1 if q else 0
        if run >= 3:
            return True
    return False


def encode(audio, rate, path, seconds):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wavfile.write(f.name, rate, audio)
    fade_out = min(3, seconds * 0.3)
    filters = f"loudnorm=I=-18:TP=-1.5,afade=t=in:d=0.4,afade=t=out:st={seconds - fade_out}:d={fade_out}"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-af", filters, "-ar", "44100", "-c:a", "aac", "-b:a", "128k", path],
        check=True,
    )
    os.unlink(f.name)


def main():
    names = sys.argv[1:] or list(TRACKS)
    dev = device()
    print(f"Cargando {MODEL} en {dev}…", flush=True)
    processor = AutoProcessor.from_pretrained(MODEL)
    # Solo los pesos en safetensors: desde la rama principal, transformers baja
    # el .bin y además la conversión a safetensors (dos veces 7,5 GB).
    model = MusicgenForConditionalGeneration.from_pretrained(MODEL, revision=WEIGHTS_REVISION, use_safetensors=True).to(dev)
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        text, seconds, seed = TRACKS[name]
        print(f"{name}: {text[:60]}…", flush=True)
        # A veces el modelo "termina" la pieza y deja un silencio: se repite con otra semilla.
        for attempt in range(4):
            audio, rate = generate(model, processor, text, seconds, seed + attempt * 100, dev)
            if seconds < 15 or not has_gap(audio, rate):
                break
            print("  hueco de silencio; otra semilla", flush=True)
        encode(audio, rate, os.path.join(OUT, f"{name}.m4a"), seconds)
    print("Listo.")


if __name__ == "__main__":
    main()
