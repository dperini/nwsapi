import copy
import json
import sys
import subprocess
import atexit
import errno
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT / "scripts/repo/pytorch"))


def blocked_network(*_args, **_kwargs):
    raise OSError(errno.ENETUNREACH, "Unit test network access is disabled")


for target in ("socket.socket.connect", "socket.socket.connect_ex", "socket.socket.sendto", "socket.getaddrinfo"):
    guard = patch(target, side_effect=blocked_network)
    guard.start()
    atexit.register(guard.stop)


def adaptive_row(family="plain", split="train", alternative=50):
    costs = [100, 100, 100, alternative, alternative, 100]
    return {"id": family + split, "family": family, "split": split,
            "fixtureSha256": "fixture", "observations": [64, 4, 4, 1, 100, 0],
            "costs": costs, "samples": [[cost] * 4 for cost in costs]}


def adaptive_dataset(directory):
    rows = [adaptive_row(), adaptive_row("nested"), adaptive_row("external"),
            adaptive_row("plain", "evaluation")]
    for host in ("chromium", "jsdom"):
        metadata = {"format": 1, "scenario": "adaptive-has", "host": host,
                    "prefix": 4, "candidateSha256": "candidate",
                    "labels": ["baseline", "forward", "inverse", "prefix-continue",
                               "prefix-switch", "prefix-rule"],
                    "variants": ["baseline"], "split": "family"}
        (directory / f"{host}-training.json").write_text(json.dumps({"metadata": metadata, "rows": rows}))


def alter_dataset(directory, update, host="chromium"):
    file = directory / f"{host}-training.json"
    data = json.loads(file.read_text())
    update(data)
    file.write_text(json.dumps(data))


def dispatch_row(family="dispatch-template-0", baseline="forward", alternative=50):
    costs = [100, alternative] if baseline == "forward" else [alternative, 100]
    return {"family": family, "host": "chromium", "decisionReached": True,
            "baselineRoute": baseline, "baselineCostNs": 100,
            "costsNs": costs, "baselineSamplesNs": [100] * 4,
            "costSamplesNs": [[value] * 4 for value in costs],
            "features": [64, 256, 0, 4], "routeFacts": {"denseInverse": False}}


def changed(row, **values):
    return {**copy.deepcopy(row), **values}


def evaluate_javascript(source, name, inputs):
    program = "import vm from 'node:vm'; import fs from 'node:fs'; const data = JSON.parse(fs.readFileSync(0, 'utf8')); const policy = vm.runInNewContext(data.source + '\\n' + data.name); console.log(JSON.stringify(data.inputs.map(input => policy(...input))));"
    result = subprocess.run([str(ROOT / ".cache/bin/node"), "--input-type=module", "-e", program],
                            input=json.dumps({"source": source, "name": name, "inputs": inputs}),
                            text=True, capture_output=True, check=True, cwd=ROOT)
    return json.loads(result.stdout)
