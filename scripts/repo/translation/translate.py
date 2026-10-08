"""Translate prepared repository prose with the pinned local model."""
import json
import os
import re
from pathlib import Path

import ctranslate2
from transformers import MarianTokenizer

ROOT = Path(__file__).resolve().parents[3]
DIRECTORY = ROOT / ".cache/docs-localization"
CONFIG = json.loads((ROOT / ".config/docs-translation/model.json").read_text())
MODEL = ROOT / ".cache/guide-translation-model"
OUTPUT = DIRECTORY / "translations.json"
TOKEN = re.compile(r"ZXQ\d+QXZ")
if not (MODEL / "model.bin").is_file() or json.loads((MODEL / "model-source.json").read_text()) != CONFIG:
    raise SystemExit(
        "Pinned CTranslate2 model is missing. Download the configured revision and "
        "convert it with the documented translation setup command."
    )
tokenizer = MarianTokenizer.from_pretrained(str(MODEL))
translator = ctranslate2.Translator(
    str(MODEL),
    device="cpu",
    compute_type=CONFIG["quantization"],
    inter_threads=2,
    intra_threads=min(4, os.cpu_count() or 1),
)
translations = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
requests = json.loads((DIRECTORY / "requests.json").read_text())
pending = sorted((text for text in requests if text not in translations), key=len)


def translate(texts):
    inputs = [tokenizer.convert_ids_to_tokens(tokenizer.encode(text)) for text in texts]
    results = translator.translate_batch(
        inputs,
        beam_size=4,
        max_decoding_length=768,
        max_input_length=0,
        repetition_penalty=1.05,
    )
    return [
        tokenizer.decode(
            tokenizer.convert_tokens_to_ids(result.hypotheses[0]),
            skip_special_tokens=True,
        )
        for result in results
    ]


def retain_slots(source, translated):
    translated = re.sub(r"Z\s*X\s*Q\s*(\d+)\s*Q\s*X\s*Z", r"ZXQ\1QXZ", translated)
    if sorted(TOKEN.findall(source)) == sorted(TOKEN.findall(translated)):
        return translated
    pieces = re.split(r"(ZXQ\d+QXZ)", source)
    prose = [piece for piece in pieces if piece.strip() and not TOKEN.fullmatch(piece)]
    mapped = iter(translate(prose))
    return "".join(
        piece
        if not piece.strip() or TOKEN.fullmatch(piece)
        else (" " if piece.startswith(" ") else "")
        + next(mapped)
        + (" " if piece.endswith(" ") else "")
        for piece in pieces
    )


for offset in range(0, len(pending), 24):
    batch = pending[offset : offset + 24]
    for source, translated in zip(batch, translate(batch)):
        translations[source] = retain_slots(source, translated)
    OUTPUT.write_text(json.dumps(translations, ensure_ascii=False, indent=2) + "\n")
    print(f"Translated {min(offset + 24, len(pending))}/{len(pending)} new passages", flush=True)
