"""Fit a cost-sensitive preference for finishing a useful query prefix."""
import argparse
import copy
import hashlib
import itertools
import json
import math
from pathlib import Path

import numpy as np
import torch

from data import alternative_cost, default_switch, features, load_rows, pair_weights
from policy import Policy, save_model, score

THRESHOLDS = [math.log(p / (1 - p)) for p in (0.5, 0.6, 0.7, 0.8, 0.9, 0.95)]


def geometric(values):
    return float(np.exp(np.mean(np.log(values)))) if len(values) else 1.0


def in_domain(values, domain):
    return ((values >= domain[0]) & (values <= domain[1])).all(axis=1)


def estimated_metrics(rows, logits, domain, threshold, overhead):
    values = np.asarray([features(row) for row in rows])
    apply = in_domain(values, domain)
    swaps = apply & (logits > threshold + 1e-5)
    selected = np.array([alternative_cost(row) if swap else row["costs"][5]
                         for row, swap in zip(rows, swaps)])
    selected += overhead
    baseline = np.array([row["costs"][0] for row in rows])
    rule = np.array([row["costs"][5] for row in rows])
    return {"estimatedSpeedRatio": geometric(baseline / selected),
            "estimatedSpeedRatioVsPrefixRule": geometric(rule / selected),
            "estimatedWorstTimeRatio": float(np.max(selected / baseline)),
            "swaps": int(swaps.sum()), "domainMisses": int((~apply).sum())}


def fit_candidate(training, validation, hidden, seed, overhead):
    torch.manual_seed(seed)
    raw = np.asarray([features(row) for row in training])
    mean, scale = raw.mean(axis=0), raw.std(axis=0)
    scale[scale == 0] = 1
    domain = np.array([raw.min(axis=0), raw.max(axis=0)])
    x = torch.tensor((raw - mean) / scale, dtype=torch.float32)
    weights, labels, ties = pair_weights(training)
    if not weights.sum():
        raise ValueError("No resolved training comparisons")
    weights = torch.tensor(weights / weights.sum())
    labels = torch.tensor(labels)
    valid = np.asarray([features(row) for row in validation])
    model = Policy(hidden)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.01, weight_decay=0.01)
    best = None
    stale = 0
    for epoch in range(1, 1001):
        optimizer.zero_grad(set_to_none=True)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x), labels, reduction="none")
        (loss * weights).sum().backward()
        optimizer.step()
        logits = score(model, valid, mean, scale)
        scored = []
        for threshold in THRESHOLDS:
            metric = estimated_metrics(validation, logits, domain, threshold, overhead)
            # Prioritize satisfying the regression limit before average savings.
            rank = (metric["estimatedWorstTimeRatio"] > 1.15,
                    -metric["estimatedSpeedRatio"], metric["swaps"])
            scored.append((rank, threshold, metric))
        rank, threshold, metric = min(scored, key=lambda item: item[0])
        if best is None or rank < best["rank"]:
            best = {"rank": rank, "epoch": epoch, "threshold": threshold,
                    "metrics": metric, "state": copy.deepcopy(model.state_dict())}
            stale = 0
        else:
            stale += 1
        if stale >= 50:
            break
    model.load_state_dict(best.pop("state"))
    return model, mean, scale, domain, {
        **best, "hidden": hidden, "seed": seed, "unresolvedTrainingPairs": ties,
    }


def export_parity(model, rows, mean, scale, domain, threshold, output):
    rng = np.random.default_rng(20261005)
    random = rng.uniform(domain[0], domain[1], (10000, 7))
    random[:, :5] = np.round(random[:, :5])
    random[:, 5:] = np.round(random[:, 5:])
    raw = np.vstack([np.asarray([features(row) for row in rows]), random])
    logits = score(model, raw, mean, scale)
    cases = []
    for row, logit, eligible in zip(raw, logits, in_domain(raw, domain)):
        fallback = row[2] > 0 and row[3] * 2 < row[2]
        switch = not fallback if eligible and logit > threshold + 1e-5 else fallback
        cases.append({"features": row.tolist(), "logit": float(logit), "switch": bool(switch)})
    (output / "parity-reference.json").write_text(json.dumps(cases) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--decision-budget-ns", type=float, default=25)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Use a new model output directory")
    if not math.isfinite(args.decision_budget_ns) or args.decision_budget_ns < 0:
        raise ValueError("Invalid estimated decision budget")
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    rows, provenance = load_rows(args.input)
    eligible = [row for row in rows if row["observations"] is not None]
    training = [row for row in eligible if row["split"] == "train"]
    validation = [row for row in eligible if row["split"] == "validation"]
    development = [row for row in eligible if row["split"] == "development"]
    if not training or not validation or not development:
        raise ValueError("Missing grouped training, validation, or development data")
    args.output.mkdir(parents=True)
    config = {"hiddenSizes": [2, 4, 8], "seeds": [20261005, 20261006, 20261007],
              "thresholds": THRESHOLDS, "maxEpochs": 1000, "patience": 50,
              "decisionBudgetNs": args.decision_budget_ns,
              "budgetMeaning": "Unmeasured training estimate; integrated confirmation is required",
              "trainingGroups": sorted({r["family"] for r in training}),
              "validationGroups": sorted({r["family"] for r in validation}),
              "provenance": provenance, "torch": torch.__version__,
              "scope": "Development pilot on known families, not independent final evaluation"}
    (args.output / "experiment.json").write_text(json.dumps(config, indent=2) + "\n")
    candidates = []
    selected = None
    for hidden, seed in itertools.product(config["hiddenSizes"], config["seeds"]):
        result = fit_candidate(training, validation, hidden, seed, args.decision_budget_ns)
        candidates.append(result[-1])
        key = (*result[-1]["rank"], hidden)
        if selected is None or key < selected[0]:
            selected = (key, result)
    _, (model, mean, scale, domain, chosen) = selected
    save_model(model, mean, scale, domain, chosen["threshold"], args.output)
    export_parity(model, eligible, mean, scale, domain, chosen["threshold"], args.output)
    results = {}
    for host in ("chromium", "jsdom"):
        host_rows = [r for r in development if r["host"] == host]
        raw = np.asarray([features(r) for r in host_rows])
        logits = score(model, raw, mean, scale)
        results[host] = estimated_metrics(host_rows, logits, domain,
                                          chosen["threshold"], args.decision_budget_ns)
    report = {"selected": chosen, "candidates": candidates, "estimatedDevelopment": results,
              "trainingRows": len(training), "validationRows": len(validation),
              "developmentRows": len(development), "config": config,
              "artifactSha256": {host: hashlib.sha256((args.output / f"{host}.mjs").read_bytes()).hexdigest()
                                  for host in ("chromium", "jsdom")}}
    (args.output / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"selected": chosen, "estimatedDevelopment": results}, indent=2))


if __name__ == "__main__":
    main()
