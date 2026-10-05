"""Check recorded JS scalar scores against the original PyTorch arithmetic."""
import argparse
import json
import math
from pathlib import Path

import torch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    data = json.loads((args.directory / "parity-reference.json").read_text())
    weights = {key: torch.tensor(value, dtype=torch.float32)
               for key, value in data["weights"].items()}
    raw = []
    for row in data["cases"]:
        a, w, attrs, _, host = row["input"]
        raw.append([math.log1p(a), math.log1p(w), float(bool(attrs)),
                    math.log1p(w / a), float(host == "chromium"),
                    float(host == "jsdom")])
    with torch.no_grad():
        x = (torch.tensor(raw) - weights["MEAN"]) / weights["SCALE"]
        hidden = torch.tanh(x @ weights["W1"].T + weights["B1"])
        costs = hidden @ weights["W2"].T + weights["B2"]
        scores = (costs[:, 0] - costs[:, 1]).tolist()
    errors = [abs(score - row["score"]) for score, row in zip(scores, data["cases"])]
    if max(errors) >= data["numericalBand"]:
        raise ValueError(f"PyTorch and JavaScript scores differ by {max(errors)}")
    disagreements = 0
    domain = data["domain"]
    for score, row in zip(scores, data["cases"]):
        a, w, attrs, dense, host = row["input"]
        fallback = w <= a * 2 or (dense and a <= 192 and w <= a * 4)
        eligible = (domain["anchors"][0] <= a <= domain["anchors"][1]
                    and domain["witnesses"][0] <= w <= domain["witnesses"][1]
                    and domain["ratio"][0] <= w/a <= domain["ratio"][1]
                    and attrs in (0, 3) and host in ("chromium", "jsdom"))
        decision = (score > 0 if eligible and abs(score) >
                    data["margin"] + data["numericalBand"] else fallback)
        disagreements += decision != row["decision"]
    if disagreements:
        raise ValueError(f"{disagreements} cross-language decisions differ")
    result = {"cases": len(scores), "maximumScoreError": max(errors),
              "decisionDisagreements": disagreements, "torch": torch.__version__}
    (args.directory / "python-parity.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
