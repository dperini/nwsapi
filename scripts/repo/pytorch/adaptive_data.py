"""Read measured complete continuation pipelines without reconstructing costs."""
import hashlib
import json
from pathlib import Path

import numpy as np

EXPECTED_LABELS = ["baseline", "forward", "inverse", "prefix-continue",
                   "prefix-switch", "prefix-rule"]
VALIDATION = {"nested", "external"}


def load_rows(directory: Path):
    rows = []
    inputs = []
    metadata = []
    for host in ("chromium", "jsdom"):
        path = directory / f"{host}-training.json"
        blob = path.read_bytes()
        data = json.loads(blob)
        meta = data["metadata"]
        if meta.get("format") != 1 or meta.get("scenario") != "adaptive-has":
            raise ValueError("Expected adaptive measurements with complete pipelines")
        if meta["labels"] != EXPECTED_LABELS:
            raise ValueError("Unexpected adaptive action order")
        if meta["host"] != host or meta["prefix"] not in (2, 4, 8):
            raise ValueError("Unexpected host or prefix setting")
        metadata.append(meta)
        inputs.append({"file": path.name, "sha256": hashlib.sha256(blob).hexdigest()})
        seen = set()
        for row in data["rows"]:
            if row["id"] in seen:
                raise ValueError("Duplicate adaptive row")
            seen.add(row["id"])
            costs = np.asarray(row["costs"], dtype=float)
            samples = np.asarray(row["samples"], dtype=float)
            if (costs.shape != (6,) or samples.ndim != 2 or samples.shape[0] != 6
                    or samples.shape[1] < 3 or not np.isfinite(costs).all()
                    or not np.isfinite(samples).all() or (costs <= 0).any()
                    or (samples <= 0).any()):
                raise ValueError("Invalid continuation measurements")
            observation = row["observations"]
            if observation is not None:
                if len(observation) != 6 or not np.isfinite(observation).all():
                    raise ValueError("Invalid prefix observations")
            rows.append({**row, "host": host, "split": (
                "validation" if row["family"] in VALIDATION else
                "train" if row["split"] == "train" else "development"
            )})
    for field in ("candidateSha256", "prefix", "labels", "variants", "split"):
        if metadata[0][field] != metadata[1][field]:
            raise ValueError(f"Hosts use different {field}")
    first = {r["id"]: (r["fixtureSha256"], r["observations"])
             for r in rows if r["host"] == "chromium"}
    second = {r["id"]: (r["fixtureSha256"], r["observations"])
              for r in rows if r["host"] == "jsdom"}
    if first != second:
        raise ValueError("Host observations or fixtures differ")
    return rows, {"inputs": inputs, "metadata": metadata}


def features(row):
    return row["observations"] + [float(row["host"] == "jsdom")]


def default_switch(row):
    _, _, passed, hits, _, _ = row["observations"]
    return passed > 0 and hits * 2 < passed


def alternative_cost(row):
    return row["costs"][3 if default_switch(row) else 4]


def pair_weights(rows):
    rng = np.random.default_rng(20261005)
    sizes = {}
    for row in rows:
        sizes[row["family"]] = sizes.get(row["family"], 0) + 1
    weights, labels = [], []
    unresolved = 0
    for row in rows:
        base = row["costs"][5]
        alt = alternative_cost(row)
        sample = np.asarray(row["samples"], dtype=float)
        indices = rng.integers(0, sample.shape[1], (1000, sample.shape[1]))
        alternative = 3 if default_switch(row) else 4
        differences = np.median(sample[alternative][indices], axis=1) - np.median(sample[5][indices], axis=1)
        lower, upper = np.quantile(differences, [0.025, 0.975])
        tie = lower <= 0 <= upper
        unresolved += tie
        weight = 0 if tie else abs(alt - base) / max(alt, base)
        if alt > base * 1.15:
            weight *= 2
        weights.append(weight / sizes[row["family"]])
        labels.append(float(alt < base))
    return np.array(weights, dtype=np.float32), np.array(labels, dtype=np.float32), int(unresolved)
