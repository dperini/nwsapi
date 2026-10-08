"""Generate Italian clips and word cues from the speech model's durations."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import wave

from huggingface_hub import hf_hub_download
from kokoro import KModel
from misaki.espeak import EspeakG2P
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[4]
MANIFEST = json.loads((ROOT / '.config/guide-speech/model.json').read_text())
RATE = MANIFEST['sampleRate']
TARGET = ROOT / 'assets/repo/model-guide/narration'


def model_files():
    files = {}
    for entry in MANIFEST['files']:
        file = Path(hf_hub_download(
            MANIFEST['model'], entry['name'], revision=MANIFEST['revision'],
            cache_dir=ROOT / '.cache/guide-speech/models',
        ))
        if hashlib.sha256(file.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f"Model checksum mismatch: {entry['name']}")
        files[entry['name']] = str(file)
    return files


def spoken_word(word):
    word = re.sub(r'\bnwsapi\b', 'enne doppia vu sàpi', word, flags=re.I)
    word = re.sub(
        r'\b([\w.-]+)\.(?:mts|mjs|py|js)\b',
        lambda match: 'lo script ' + match[1].replace('_', ' ').replace('-', ' ').replace('.', ' '),
        word,
    )
    return word


def phoneme_words(text, g2p, vocabulary):
    result = []
    for word in text.split():
        phonemes, _ = g2p(spoken_word(word))
        phonemes = ''.join(char for char in phonemes if char in vocabulary)
        if not phonemes:
            raise ValueError(f'No phonemes for {word!r}')
        result.append((word, phonemes))
    return result


def word_cues(words, durations, length):
    # Kokoro emits 40 duration frames per second, including the boundary tokens.
    cursor = max(0, int(durations[0]) - 3) / 40
    index = 1
    cues = []
    for position, (word, phonemes) in enumerate(words):
        end = index + len(phonemes)
        spoken = float(durations[index:end].sum()) / 40
        space = float(durations[end]) / 40 if position < len(words) - 1 else 0
        cues.append({'text': word, 'start': min(cursor, length),
                     'end': min(cursor + spoken + space / 2, length)})
        cursor += spoken + space
        index = end + (1 if space else 0)
    return cues


def render_sentence(text, model, voice, g2p):
    words = phoneme_words(text, g2p, model.vocab)
    phonemes = ' '.join(value for _, value in words)
    if len(phonemes) > 510:
        raise ValueError('A narration sentence exceeds the model context.')
    output = model(phonemes, voice[len(phonemes) - 1],
                   speed=MANIFEST['speed'], return_output=True)
    audio = output.audio.numpy()
    cues = word_cues(words, output.pred_dur, len(audio) / RATE)
    return audio, cues


def write_clip(section, model, voice, g2p, temporary):
    clips, cues = [], []
    elapsed = 0
    silence = np.zeros(round(RATE * MANIFEST['sentencePauseMs'] / 1000), dtype=np.float32)
    for sentence in section['sentences']:
        audio, words = render_sentence(sentence, model, voice, g2p)
        for word in words:
            cues.append({**word, 'start': round(elapsed + word['start'], 3),
                         'end': round(elapsed + word['end'], 3)})
        clips.extend([audio, silence])
        elapsed += (len(audio) + len(silence)) / RATE
    samples = np.concatenate(clips)
    wav = temporary / (section['id'] + '.wav')
    with wave.open(str(wav), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    filename = section['id'] + '.it.generated.mp3'
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
        '-af', 'loudnorm=I=-18:TP=-1.5:LRA=7', '-ar', '44100',
        '-codec:a', 'libmp3lame', '-q:a', '2',
        '-metadata', f"comment=Kokoro {MANIFEST['revision']}, voice {MANIFEST['voice']}, it-IT",
        str(temporary / filename),
    ], check=True)
    return {'id': section['id'], 'file': filename, 'duration': round(elapsed, 3), 'words': cues}


def main():
    torch.set_num_threads(4)
    files = model_files()
    model = KModel(repo_id=MANIFEST['model'], config=files['config.json'],
                   model=files['kokoro-v1_0.pth']).eval()
    voice = torch.load(files['voices/' + MANIFEST['voice'] + '.pt'], weights_only=True)
    g2p = EspeakG2P('it')
    sections = json.loads(Path(sys.argv[1]).read_text())
    TARGET.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=TARGET) as directory:
        temporary = Path(directory)
        results = []
        for section in sections:
            print(f"Generating Italian narration: {section['id']}", flush=True)
            results.append(write_clip(section, model, voice, g2p, temporary))
        timing_file = temporary / 'timings.it.generated.json'
        timing_file.write_text(json.dumps({
            'model': MANIFEST['model'], 'revision': MANIFEST['revision'],
            'voice': MANIFEST['voice'], 'locale': MANIFEST['locale'],
            'alignment': 'Kokoro phoneme durations', 'sections': results,
        }, ensure_ascii=False, indent=2) + '\n')
        for result in results:
            os.replace(temporary / result['file'], TARGET / result['file'])
        os.replace(timing_file, TARGET / timing_file.name)


if __name__ == '__main__':
    main()
