"""Download and convert the pinned English to Italian translation model."""
import json
import shutil
from pathlib import Path

import ctranslate2
from huggingface_hub import snapshot_download
from transformers import MarianTokenizer

ROOT = Path(__file__).resolve().parents[3]
CONFIG = json.loads((ROOT / ".config/docs-translation/model.json").read_text())
SOURCE = ROOT / ".cache/docs-translation-source"
TARGET = ROOT / ".cache/guide-translation-model"

snapshot_download(
    repo_id=CONFIG["model"],
    revision=CONFIG["revision"],
    local_dir=SOURCE,
    allow_patterns=["*.json", "*.model", "*.spm", "*.txt", "pytorch_model.bin"],
)
if TARGET.exists():
    shutil.rmtree(TARGET)
ctranslate2.converters.TransformersConverter(str(SOURCE)).convert(
    str(TARGET), quantization=CONFIG["quantization"], force=True
)
MarianTokenizer.from_pretrained(str(SOURCE)).save_pretrained(str(TARGET))
(TARGET / "model-source.json").write_text(json.dumps(CONFIG, indent=2) + "\n")
print(f"Converted {CONFIG['model']} at {CONFIG['revision']} to {TARGET}")
