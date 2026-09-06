#!/usr/bin/env python3
"""Generate one narrated MP3 per hero in heroes.json using ElevenLabs.

The API key is read in-process from ~/.env~ (line ELEVENLABS_API_KEY=...)
or from the ELEVENLABS_API_KEY environment variable. It is never printed.

Usage: python3 generate_audio.py [--force] [--only ID ...]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

VOICE_PRIMARY = "epXgTDVzUWWMKRznMkXB"   # Dr. B (Instant)
VOICE_FALLBACK = "YCb3tvtVNiyso4dAHOCp"
MODELS = ["eleven_multilingual_v2", "eleven_flash_v2_5"]
OUTPUT_FORMAT = "mp3_44100_64"
MIN_BYTES = 5 * 1024
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(HERE, "audio")


def api_key() -> str:
    k = os.environ.get("ELEVENLABS_API_KEY")
    if k:
        return k
    path = os.path.expanduser("~") + "/.env~"
    with open(path) as fh:
        for line in fh:
            m = re.match(r"^(?:export )?ELEVENLABS_API_KEY=[\"']?([^\"'\s]+)", line)
            if m:
                return m.group(1)
    raise SystemExit("ELEVENLABS_API_KEY not found")


def narration_text(h: dict) -> str:
    return f"{h['name']}. {h['blurb']}.\n\n{h['story']}"


def synthesize(key: str, text: str, voice: str, model: str) -> bytes:
    url = (f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
           f"?output_format={OUTPUT_FORMAT}")
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75,
                           "speed": 1.0},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "xi-api-key": key, "Content-Type": "application/json",
        "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def generate_one(key: str, h: dict, force: bool) -> str:
    out = os.path.join(AUDIO_DIR, f"{h['id']}.mp3")
    if not force and os.path.exists(out) and os.path.getsize(out) >= MIN_BYTES:
        return "skip"
    text = narration_text(h)
    voices = [VOICE_PRIMARY, VOICE_FALLBACK]
    for voice in voices:
        for model in MODELS:
            for attempt in range(5):
                try:
                    data = synthesize(key, text, voice, model)
                    if len(data) < MIN_BYTES:
                        raise RuntimeError(f"too small: {len(data)} bytes")
                    with open(out, "wb") as fh:
                        fh.write(data)
                    return f"ok {len(data)//1024}KB voice={voice[:6]} model={model}"
                except urllib.error.HTTPError as e:
                    detail = e.read(300).decode(errors="replace")
                    if e.code == 429:
                        wait = 10 * (attempt + 1)
                        print(f"  429, waiting {wait}s", flush=True)
                        time.sleep(wait)
                        continue
                    if e.code in (500, 502, 503, 504):
                        time.sleep(5 * (attempt + 1))
                        continue
                    print(f"  HTTP {e.code} voice={voice[:6]} model={model}: "
                          f"{detail[:200]}", flush=True)
                    break  # try next model / voice
                except Exception as e:  # network hiccup
                    print(f"  error: {e}", flush=True)
                    time.sleep(5)
    return "FAILED"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    args = ap.parse_args()
    key = api_key()
    os.makedirs(AUDIO_DIR, exist_ok=True)
    with open(os.path.join(HERE, "heroes.json")) as fh:
        heroes = json.load(fh)["heroes"]
    if args.only:
        heroes = [h for h in heroes if h["id"] in args.only]
    failed = []
    for i, h in enumerate(heroes, 1):
        print(f"[{i}/{len(heroes)}] {h['id']}", flush=True)
        result = generate_one(key, h, args.force)
        print(f"  {result}", flush=True)
        if result == "FAILED":
            failed.append(h["id"])
        elif result != "skip":
            time.sleep(1.5)
    if failed:
        print("FAILED:", ", ".join(failed))
        return 1
    print("all done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
