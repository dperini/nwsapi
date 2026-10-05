#!/usr/bin/env python3
"""Train and evaluate a tiny PyTorch planner from frozen route timings."""

import argparse
import json
import math
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn


SEED = 20261004
HIDDEN = 8
VALIDATION_FAMILY = "nested"
MAX_EPOCHS = 1000
PATIENCE = 60


class RouteNet(nn.Module):
    def __init__(self, inputs: int, hidden: int) -> None:
        super().__init__()
        self.hidden = nn.Linear(inputs, hidden)
        self.output = nn.Linear(hidden, 2)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return self.output(torch.tanh(self.hidden(values)))


def encode(row: dict) -> list[float]:
    anchors, witnesses, attributes, ratio = row["features"]
    return [
        math.log1p(anchors),
        math.log1p(witnesses),
        1.0 if attributes else 0.0,
        math.log1p(ratio),
        1.0 if row["host"] == "chromium" else 0.0,
        1.0 if row["host"] == "jsdom" else 0.0,
    ]


def prepare(rows: list[dict], mean=None, scale=None):
    raw = np.asarray([encode(row) for row in rows], dtype=np.float64)
    if mean is None:
        mean = raw.mean(axis=0)
        scale = raw.std(axis=0)
        scale[scale == 0] = 1.0
    values = ((raw - mean) / scale).astype(np.float32)
    targets = np.log(
        np.asarray([row["costsNs"] for row in rows], dtype=np.float64)
    ).astype(np.float32)
    return torch.tensor(values), torch.tensor(targets), mean, scale


def fit_epoch_count(rows: list[dict], validation: list[dict]) -> int:
    train_x, train_y, mean, scale = prepare(rows)
    valid_x, valid_y, _, _ = prepare(validation, mean, scale)
    seed_everything(SEED)
    model = RouteNet(train_x.shape[1], HIDDEN)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.02, weight_decay=0.01)
    best_loss = float("inf")
    best_epoch = 1
    stale = 0
    for epoch in range(1, MAX_EPOCHS + 1):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        loss = nn.functional.mse_loss(model(train_x), train_y)
        loss.backward()
        optimizer.step()
        model.eval()
        with torch.no_grad():
            validation_loss = nn.functional.mse_loss(model(valid_x), valid_y)
        value = float(validation_loss)
        if value < best_loss - 1e-7:
            best_loss = value
            best_epoch = epoch
            stale = 0
        else:
            stale += 1
            if stale >= PATIENCE:
                break
    return best_epoch


def fit_final(rows: list[dict], epochs: int):
    train_x, train_y, mean, scale = prepare(rows)
    seed_everything(SEED)
    model = RouteNet(train_x.shape[1], HIDDEN)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.02, weight_decay=0.01)
    for _ in range(epochs):
        optimizer.zero_grad(set_to_none=True)
        loss = nn.functional.mse_loss(model(train_x), train_y)
        loss.backward()
        optimizer.step()
    model.eval()
    return model, mean, scale


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)


def production_inverse(row: dict) -> bool:
    anchors, witnesses, _, _ = row["features"]
    if in_training_domain(row):
        return True
    return witnesses <= anchors * 2


def in_training_domain(row: dict) -> bool:
    anchors, witnesses, attributes, ratio = row["features"]
    # This matches the measured guarded domain: it admits plain selectors and
    # selectors whose anchor and witness compounds both have attributes.
    in_domain = (
        attributes in (0, 3)
        and 32 <= anchors <= 192
        and 0 <= witnesses <= 768
        and 0 <= ratio <= 4
    )
    return in_domain


def geomean(values: list[float]) -> float:
    return math.exp(sum(math.log(value) for value in values) / len(values))


def metrics(rows: list[dict], choices: list[int]) -> dict:
    selected = [row["costsNs"][choice] for row, choice in zip(rows, choices)]
    forward = [row["costsNs"][0] for row in rows]
    inverse = [row["costsNs"][1] for row in rows]
    oracle = [min(row["costsNs"]) for row in rows]
    production = [
        row["costsNs"][int(production_inverse(row))] for row in rows
    ]
    route_matches = [
        choice == int(row["costsNs"][1] < row["costsNs"][0])
        for row, choice in zip(rows, choices)
    ]
    model_domain_matches = [
        matched
        for row, matched in zip(rows, route_matches)
        if in_training_domain(row)
    ]
    return {
        "cases": len(rows),
        "routeAccuracy": sum(route_matches) / len(rows),
        "routeAccuracyInModelDomain": sum(model_domain_matches)
        / max(1, len(model_domain_matches)),
        "speedupVsAlwaysForward": geomean(
            [base / actual for base, actual in zip(forward, selected)]
        ),
        "speedupVsAlwaysInverse": geomean(
            [base / actual for base, actual in zip(inverse, selected)]
        ),
        "speedupVsProductionRule": geomean(
            [base / actual for base, actual in zip(production, selected)]
        ),
        "speedupProductionVsAlwaysForward": geomean(
            [base / actual for base, actual in zip(production, forward)]
        ),
        "speedupProductionVsAlwaysInverse": geomean(
            [base / actual for base, actual in zip(production, inverse)]
        ),
        "oracleRegret": geomean(
            [actual / best for actual, best in zip(selected, oracle)]
        ),
        "worstSlowdownVsProductionRule": max(
            actual / base for base, actual in zip(production, selected)
        ),
        "inverseChoices": sum(choice == 1 for choice in choices),
        "modelApplications": len(model_domain_matches),
        "fallbackApplications": len(rows) - len(model_domain_matches),
    }


def as_list(tensor: torch.Tensor) -> list:
    return tensor.detach().cpu().tolist()


def export_module(model: RouteNet, mean, scale, path: Path) -> None:
    first_weight = as_list(model.hidden.weight)
    first_bias = as_list(model.hidden.bias)
    last_weight = as_list(model.output.weight)
    last_bias = as_list(model.output.bias)
    source = f'''// Generated from train.py. Research artifact; not used by nwsapi runtime.
const MEAN = {json.dumps(mean.tolist())}
const SCALE = {json.dumps(scale.tolist())}
const W1 = {json.dumps(first_weight)}
const B1 = {json.dumps(first_bias)}
const W2 = {json.dumps(last_weight)}
const B2 = {json.dumps(last_bias)}

export function predictLogCosts(features, host) {{
  const [anchors, witnesses, attributes, ratio] = features
  const raw = [Math.log1p(anchors), Math.log1p(witnesses), attributes ? 1 : 0,
    Math.log1p(ratio), host === 'chromium' ? 1 : 0, host === 'jsdom' ? 1 : 0]
  const input = raw.map((value, index) => (value - MEAN[index]) / SCALE[index])
  const hidden = W1.map((weights, index) => Math.tanh(
    weights.reduce((sum, weight, column) => sum + weight * input[column], B1[index])))
  return W2.map((weights, index) =>
    weights.reduce((sum, weight, column) => sum + weight * hidden[column], B2[index]))
}}

export function chooseInverse(features, host) {{
  const [anchors, witnesses, attributes, ratio] = features
  const inDomain = [anchors, witnesses, attributes, ratio].every(Number.isFinite) &&
    (attributes === 0 || attributes === 3) && anchors >= 32 && anchors <= 192 &&
    witnesses >= 0 && witnesses <= 768 && ratio >= 0 && ratio <= 4
  if (!inDomain) return witnesses <= anchors * 2
  const costs = predictLogCosts(features, host)
  return costs[1] < costs[0]
}}
'''
    path.write_text(source)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", choices=["cpu"], default="cpu")
    args = parser.parse_args()
    dataset = json.loads(args.dataset.read_text())
    rows = dataset["rows"]
    training = [row for row in rows if row["split"] == "train"]
    holdout = [row for row in rows if row["split"] == "holdout"]
    validation = [row for row in training if row["family"] == VALIDATION_FAMILY]
    fitting = [row for row in training if row["family"] != VALIDATION_FAMILY]
    if not fitting or not validation or not holdout:
        raise SystemExit("Expected train, nested validation, and held-out families.")

    best_epoch = fit_epoch_count(fitting, validation)
    model, mean, scale = fit_final(training, best_epoch)
    args.output.mkdir(parents=True, exist_ok=True)
    module_path = args.output / "model.mjs"
    export_module(model, mean, scale, module_path)

    with torch.no_grad():
        inputs, _, _, _ = prepare(holdout, mean, scale)
        predictions = model(inputs).tolist()
    by_host = {}
    predictions_by_key = {
        (row["host"], row["id"]): (
            int(prediction[1] < prediction[0])
            if in_training_domain(row)
            else int(production_inverse(row))
        )
        for row, prediction in zip(holdout, predictions)
    }
    for host in ("chromium", "jsdom"):
        host_rows = [row for row in holdout if row["host"] == host]
        choices = [predictions_by_key[(host, row["id"])] for row in host_rows]
        by_host[host] = metrics(host_rows, choices)
        family_metrics = {}
        for family in sorted({row["family"] for row in host_rows}):
            family_rows = [row for row in host_rows if row["family"] == family]
            family_choices = [
                predictions_by_key[(host, row["id"])] for row in family_rows
            ]
            family_metrics[family] = metrics(family_rows, family_choices)
        by_host[host]["families"] = family_metrics

    report = {
        "model": "6-input, 8-hidden-unit tanh route-cost regressor",
        "trainingFramework": f"PyTorch {torch.__version__}",
        "device": args.device,
        "seed": SEED,
        "selectedEpochs": best_epoch,
        "trainingRows": len(training),
        "validationFamily": VALIDATION_FAMILY,
        "validationRows": len(validation),
        "heldOutFamilies": sorted({row["family"] for row in holdout}),
        "heldOutRows": len(holdout),
        "inputs": dataset["source"],
        "results": by_host,
        "artifact": module_path.name,
        "limitations": [
            "Synthetic DOM and selector families only.",
            "Training measurements record the host power state in the dataset provenance.",
            "Offline JavaScript artifact only; not wired into nwsapi runtime.",
        ],
    }
    (args.output / "evaluation.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
