"""Learn conservative route overrides using facts available before execution."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import torch
from torch import nn

THRESHOLDS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]
NAMES = ["anchors", "witnesses", "attributes", "dense", "ratio"]
MODEL_NAMES = ["anchors", "witnesses", "(attributes >> 1)", "(attributes & 1)", "dense", "ratio"]


def encoded(values):
    # Separate filter flags avoid forcing one numeric mask coefficient on both.
    return np.column_stack([values[:, 0], values[:, 1],
                            np.floor(values[:, 2] / 2), values[:, 2] % 2,
                            values[:, 3], values[:, 4]])


def split(row):
    family = row["family"]
    if family.startswith(("dispatch-expanded-", "dispatch-crossed-")):
        index = int(family.rsplit("-", 1)[1])
        return "train" if index < 4 else "validation" if index < 6 else "evaluation"
    if not family.startswith("dispatch-template-"):
        return "development"
    index = int(family.rsplit("-", 1)[1])
    return "train" if index < 6 else "validation" if index < 8 else "evaluation"


def inputs(row):
    a, w, attributes, ratio = row["features"]
    return [a, w, attributes, int(row["routeFacts"]["denseInverse"]), ratio]


def alternative(row):
    return 1 if row["baselineRoute"] == "forward" else 0


def costs(row):
    base = row["baselineCostNs"]
    if not row["decisionReached"]:
        return [base, base]
    return [base, row["costsNs"][alternative(row)]]


def metrics(rows, swaps, overhead=0):
    if not rows:
        return {"geometricSpeedRatio": 1.0, "totalTimeSpeedRatio": 1.0,
                "worstTimeRatio": 1.0, "overrides": 0, "passesGate": False}
    base = np.array([costs(row)[0] for row in rows])
    selected = np.array([costs(row)[int(swap)] for row, swap in zip(rows, swaps)])
    selected += np.array([overhead if row["decisionReached"] else 0 for row in rows])
    ratios = selected / base
    speed = float(np.exp(-np.log(ratios).mean()))
    total = float(base.sum() / selected.sum())
    worst = float(ratios.max())
    return {"geometricSpeedRatio": speed, "totalTimeSpeedRatio": total,
            "worstTimeRatio": worst, "overrides": int(np.sum(swaps)),
            "passesGate": speed >= 1.05 and total >= 1.0 and worst <= 1.15}


def headroom(rows, overhead):
    free_choices = [costs(row)[1] < costs(row)[0] for row in rows]
    choices = [costs(row)[1] + overhead < costs(row)[0] for row in rows]
    groups = {}
    for index, row in enumerate(rows):
        key = tuple(inputs(row)) if row["decisionReached"] else ("ineligible",)
        groups.setdefault(key, []).append(index)
    constrained = np.zeros(len(rows), dtype=bool)
    safe_choices = constrained.copy()
    conflicts = []
    for key, indices in groups.items():
        # Identical available inputs must produce the same decision.
        benefit = sum(math.log(costs(rows[i])[0] / (costs(rows[i])[1] + overhead)) for i in indices)
        ratios = [(costs(rows[i])[1] + overhead) / costs(rows[i])[0] for i in indices]
        if min(ratios) < 0.95 and max(ratios) > 1.05:
            conflicts.append({"inputs": list(key), "cases": len(indices),
                              "minimumAlternativeTimeRatio": min(ratios),
                              "maximumAlternativeTimeRatio": max(ratios)})
        if benefit > 0:
            constrained[indices] = True
            if max(ratios) <= 1.10 and all(rows[i]["baselineRoute"] == "forward" for i in indices):
                safe_choices[indices] = True
    return {"freeChooser": metrics(rows, free_choices),
            "budgetedChooser": metrics(rows, choices, overhead),
            "observableChooser": metrics(rows, constrained, overhead),
            "safeForwardOnlyObservableChooser": metrics(rows, safe_choices, overhead),
            "conflictingInputGroups": conflicts, "featureGroups": len(groups),
            "note": "Hindsight diagnostics; independent measurements and model integration required."}


def weights(rows, overhead):
    rng = np.random.default_rng(20261005)
    result, labels = [], []
    unresolved = 0
    average_cost = np.mean([costs(row)[0] for row in rows])
    for row in rows:
        base, alt = costs(row)
        base_samples = np.array(row["baselineSamplesNs"])
        alt_samples = np.array(row["costSamplesNs"][alternative(row)])
        indices = rng.integers(0, len(base_samples), (1000, len(base_samples)))
        differences = np.median(alt_samples[indices], axis=1) + overhead - np.median(base_samples[indices], axis=1)
        lower, upper = np.quantile(differences, [0.025, 0.975])
        tie = lower <= 0 <= upper
        unresolved += int(tie)
        relative_regret = abs(math.log((alt + overhead) / base))
        total_time_regret = abs(alt + overhead - base) / average_cost
        weight = relative_regret + total_time_regret
        if alt + overhead > base * 1.15:
            weight *= 4
        result.append(0 if tie or row["baselineRoute"] != "forward" else weight)
        labels.append(float(alt + overhead < base))
    return np.array(result, dtype=np.float32), np.array(labels, dtype=np.float32), unresolved


def logits(model, values, mean, scale):
    with torch.no_grad():
        return model(torch.tensor((encoded(values) - mean) / scale, dtype=torch.float32)).squeeze(-1).numpy()


def supported(values, domain, pairs):
    inside = ((values >= domain[0]) & (values <= domain[1])).all(axis=1)
    categories = np.zeros(len(values), dtype=bool)
    for attributes, dense in pairs:
        categories |= (values[:, 2] == attributes) & (values[:, 3] == dense)
    return inside & categories


def decisions(model, rows, mean, scale, domain, threshold, pairs):
    values = np.array([inputs(row) for row in rows])
    eligible = supported(values, domain, pairs)
    # Keep the existing inverse path. This experiment only replaces forward work.
    eligible &= np.array([row["baselineRoute"] == "forward" for row in rows])
    return eligible & (logits(model, values, mean, scale) > threshold + 1e-5)


def rank(metric, hidden=0, safety=None):
    safety = safety or {"worstTimeRatio": 1, "totalTimeSpeedRatio": 1}
    safe = safety["worstTimeRatio"] <= 1.10 and safety["totalTimeSpeedRatio"] >= 0.99
    return (not safe, max(0, safety["worstTimeRatio"] - 1.10),
            max(0, 0.99 - safety["totalTimeSpeedRatio"]), not metric["passesGate"], max(0, metric["worstTimeRatio"] - 1.15),
            -metric["totalTimeSpeedRatio"], -metric["geometricSpeedRatio"],
            metric["overrides"], hidden)


def fit(training, validation, controls, hidden, seed, overhead):
    torch.manual_seed(seed)
    values = np.array([inputs(row) for row in training])
    features = encoded(values)
    domain = np.array([values.min(axis=0), values.max(axis=0)])
    pairs = np.unique(values[:, 2:4], axis=0).tolist()
    weight, label, ties = weights(training, overhead)
    if not weight.sum():
        raise ValueError("No resolved route comparisons")
    useful = features[weight > 0]
    mean, scale = useful.mean(axis=0), useful.std(axis=0)
    scale[scale == 0] = 1
    x = torch.tensor((features - mean) / scale, dtype=torch.float32)
    weighted_rows = int(np.count_nonzero(weight))
    weight = torch.tensor(weight / weight.sum())
    label = torch.tensor(label)
    model = nn.Sequential(nn.Linear(6, hidden), nn.ReLU(), nn.Linear(hidden, 1)) if hidden else nn.Sequential(nn.Linear(6, 1))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.01, weight_decay=0.01)
    best, stale = None, 0
    for epoch in range(1, 501):
        optimizer.zero_grad(set_to_none=True)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x).squeeze(-1), label, reduction="none")
        (loss * weight).sum().backward()
        optimizer.step()
        scored = []
        for threshold in THRESHOLDS:
            selected = decisions(model, validation, mean, scale, domain, threshold, pairs)
            metric = metrics(validation, selected, overhead)
            safe_choices = decisions(model, controls, mean, scale, domain, threshold, pairs)
            safety = metrics(controls, safe_choices, overhead)
            scored.append((rank(metric, hidden, safety), threshold, metric, safety))
        key, threshold, metric, safety = min(scored, key=lambda item: item[0])
        if best is None or key < best["rank"]:
            best = {"rank": key, "epoch": epoch, "threshold": threshold,
                    "metrics": metric, "safetyMetrics": safety, "categoricalPairs": pairs,
                    "state": copy.deepcopy(model.state_dict())}
            stale = 0
        else:
            stale += 1
        if stale >= 40:
            break
    model.load_state_dict(best.pop("state"))
    return model, mean, scale, domain, {**best, "hidden": hidden, "seed": seed, "unresolvedTrainingPairs": ties, "weightedTrainingRows": weighted_rows}


def export(model, mean, scale, domain, chosen):
    first = model[0]
    weights = first.weight.detach().numpy().astype(float) / scale
    bias = first.bias.detach().numpy().astype(float) - (weights * mean).sum(axis=1)
    guards = [f"{name} < {float(domain[0][i])!r} || {name} > {float(domain[1][i])!r} || !Number.isFinite({name})" for i, name in enumerate(NAMES)]
    lines = ["function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {",
             "  if (!(" + " || ".join(f"(attributes === {a:g} && dense === {d:g})" for a, d in chosen["categoricalPairs"]) + ")) { return false; }",
             "  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }",
             "  if (" + " || ".join(guards) + ") { return false; }"]
    categories = np.array(chosen["categoricalPairs"])
    lower = np.array([domain[0][0], domain[0][1], np.min(categories[:, 0] // 2),
                      np.min(categories[:, 0] % 2), domain[0][3], domain[0][4]])
    upper = np.array([domain[1][0], domain[1][1], np.max(categories[:, 0] // 2),
                      np.max(categories[:, 0] % 2), domain[1][3], domain[1][4]])
    removed, affine = [], []
    for i, row in enumerate(weights):
        expression = repr(float(bias[i])) + "".join(f" + ({float(w)!r}) * {name}" for name, w in zip(MODEL_NAMES, row) if w != 0)
        minimum = bias[i] + np.sum(row * np.where(row >= 0, lower, upper))
        maximum = bias[i] + np.sum(row * np.where(row >= 0, upper, lower))
        margin = 1e-9 * (1 + abs(bias[i]) + np.sum(np.abs(row) * np.maximum(np.abs(lower), np.abs(upper))))
        if chosen["hidden"] and maximum < -margin:
            removed.append(i)
            continue
        if chosen["hidden"] and minimum <= margin:
            expression = f"Math.max(0, {expression})"
        elif chosen["hidden"]:
            affine.append(i)
        lines.append(f"  var h{i} = {expression};")
    if chosen["hidden"]:
        last = model[2]
        expression = repr(float(last.bias.detach()[0])) + "".join(f" + ({float(w)!r}) * h{i}" for i, w in enumerate(last.weight.detach()[0]) if i not in removed and w != 0)
    else:
        expression = "h0"
    lines.append(f"  var value = {expression};")
    lines.append(f"  return Number.isFinite(value) && value > {chosen['threshold'] + 1e-5!r};")
    return "\n".join(lines) + "\n}\n", {
        "removedInactiveUnits": removed, "removedReluChecks": affine,
        "bounds": "Guarded feature intervals with a numerical margin. No approximate weight pruning."}


def forward_only_proof():
    return {"proved": True, "enforcedByGuard": True,
            "meaning": "The exported policy explicitly declines every existing inverse route. The same restriction is applied during checkpoint selection."}


def rule_choices(rows, domain, pairs, policies):
    values = np.array([inputs(row) for row in rows]).reshape(-1, 5)
    selected = np.zeros(len(rows), dtype=bool)
    for mask, cap, threshold in policies:
        selected |= (values[:, 2] == mask) & (values[:, 0] <= cap) & (values[:, 4] <= threshold)
    return selected & supported(values, domain, pairs) & np.array([
        row["baselineRoute"] == "forward" for row in rows], dtype=bool)


def simple_rule(training, validation, controls, overhead, domain, pairs):
    # Fit disjoint filter groups with the same timing data and safety limits.
    policies = []
    for mask in sorted({pair[0] for pair in pairs}):
        group = [row for row in validation if inputs(row)[2] == mask]
        training_group = [row for row in training if inputs(row)[2] == mask]
        safety_group = [row for row in controls if inputs(row)[2] == mask]
        candidates = []
        options = [(0, 0)] + [(cap, threshold) for cap in [128, 192, 256]
                             for threshold in [2.5, 4, 8]]
        for cap, threshold in options:
            policy = [(mask, cap, threshold)]
            metric = metrics(group, rule_choices(group, domain, pairs, policy), overhead)
            safety = metrics(safety_group, rule_choices(safety_group, domain, pairs, policy), overhead)
            training_metric = metrics(training_group, rule_choices(training_group, domain, pairs, policy), overhead)
            key = (*rank(metric, safety=safety), -training_metric["totalTimeSpeedRatio"])
            candidates.append((key, cap, threshold))
        _, cap, threshold = min(candidates, key=lambda item: item[0])
        if cap:
            policies.append((mask, cap, threshold))
    metric = metrics(validation, rule_choices(validation, domain, pairs, policies), overhead)
    safety = metrics(controls, rule_choices(controls, domain, pairs, policies), overhead)
    if rank(metric, safety=safety)[0] or metric["totalTimeSpeedRatio"] <= 1 or metric["worstTimeRatio"] > 1.15:
        policies = []
        metric = metrics(validation, np.zeros(len(validation), dtype=bool), overhead)
        safety = metrics(controls, np.zeros(len(controls), dtype=bool), overhead)
    guards = [f"{name} < {float(domain[0][i])!r} || {name} > {float(domain[1][i])!r} || !Number.isFinite({name})" for i, name in enumerate(NAMES)]
    category_guard = " || ".join(f"(attributes === {a:g} && dense === {d:g})" for a, d in pairs)
    clauses = [f"(attributes === {mask:g} && anchors <= {cap} && ratio <= {threshold})"
               for mask, cap, threshold in policies]
    source = "function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {\n  if (!(" + category_guard + ")) { return false; }\n  if (" + " || ".join(guards) + ") { return false; }\n" + "  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }\n  return " + (" || ".join(clauses) or "false") + ";\n}\n"
    if not policies:
        source = "function dispatchOverride() { return false; }\n"
    return {"policies": policies, "metrics": metric, "safetyMetrics": safety, "source": source,
            "selection": "Per-mask validation ranking with training total cost as the final tie breaker, with per-mask and combined old-control safety checks. No evaluation timing used.",
            "search": {"anchorCaps": [128, 192, 256], "ratioThresholds": [2.5, 4, 8], "includesKeepBaseline": True}}


def train_host(rows, host, output, overhead):
    eligible = [r for r in rows if r["host"] == host and r["decisionReached"]]
    training = [r for r in eligible if split(r) == "train"]
    validation = [r for r in eligible if split(r) == "validation"]
    controls = [r for r in eligible if split(r) == "development"]
    candidates, best = [], None
    for hidden in [0, 2, 4, 8]:
        for seed in [20261005, 20261006, 20261007]:
            fitted = fit(training, validation, controls, hidden, seed, overhead)
            candidates.append(fitted[-1])
            key = fitted[-1]["rank"]
            if best is None or key < best[0]:
                best = key, fitted
    _, (model, mean, scale, domain, chosen) = best
    chosen["forwardOnlyProof"] = forward_only_proof()
    source, compilation = export(model, mean, scale, domain, chosen)
    chosen["compilation"] = compilation
    (output / f"{host}.mjs").write_text("export " + source)
    rule = simple_rule(training, validation, controls, overhead, domain, chosen["categoricalPairs"])
    rule["forwardOnly"] = True
    (output / f"{host}-rule.mjs").write_text("export " + rule.pop("source"))
    torch.save(model.state_dict(), output / f"{host}.pt")
    (output / f"{host}-weights.json").write_text(json.dumps({"weights": {k: v.tolist() for k, v in model.state_dict().items()}, "mean": mean.tolist(), "scale": scale.tolist(), "domain": domain.tolist(), "chosen": chosen}, indent=2) + "\n")
    rng = np.random.default_rng(20261005)
    parity = np.vstack([np.array([inputs(r) for r in eligible]), rng.uniform(domain[0], domain[1], (10000, 5)), domain, domain[0] - 1, domain[1] + 1])
    parity[len(eligible):-4, 2] = rng.choice(np.unique(np.array(chosen["categoricalPairs"])[:, 0]), 10000)
    parity[len(eligible):-4, 3] = rng.choice([0, 1], 10000)
    band = logits(model, parity, mean, scale) > chosen["threshold"] + 1e-5
    inside = supported(parity, domain, chosen["categoricalPairs"])
    inside &= (parity[:, 1] > parity[:, 0] * 2) & ((parity[:, 3] == 0) | (parity[:, 0] > 192) | (parity[:, 1] > parity[:, 0] * 4))
    (output / f"{host}-parity.json").write_text(json.dumps([{"features": row.tolist(), "override": bool(choice)} for row, choice in zip(parity, band & inside)]) + "\n")
    policies = rule["policies"]
    rule_band = np.zeros(len(parity), dtype=bool)
    for mask, cap, threshold in policies:
        rule_band |= (parity[:, 2] == mask) & (parity[:, 0] <= cap) & (parity[:, 4] <= threshold)
    (output / f"{host}-rule-parity.json").write_text(json.dumps([
        {"features": row.tolist(), "override": bool(choice)}
        for row, choice in zip(parity, rule_band & inside)]) + "\n")
    development = [r for r in eligible if split(r) == "development"]
    return {"status": "validation-passed" if chosen["metrics"]["passesGate"] and not chosen["rank"][0] else "rejected-on-validation",
            "chosen": chosen, "candidates": candidates, "simpleRule": rule,
            "trainingRows": len(training), "validationRows": len(validation),
            "trainingHeadroom": headroom(training, overhead), "validationHeadroom": headroom(validation, overhead),
            "developmentEstimate": metrics(development, decisions(model, development, mean, scale, domain, chosen["threshold"], chosen["categoricalPairs"]), overhead),
            "modelSha256": hashlib.sha256((output / f"{host}.mjs").read_bytes()).hexdigest(),
            "ruleSha256": hashlib.sha256((output / f"{host}-rule.mjs").read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--decision-budget-ns", type=float, default=25)
    args = parser.parse_args()
    if args.output.exists() or not math.isfinite(args.decision_budget_ns) or args.decision_budget_ns < 0:
        raise ValueError("Use a new output directory and a finite nonnegative budget")
    blob = (args.input / "dataset" / "dataset.json").read_bytes()
    dataset = json.loads(blob)
    if dataset["format"] != 2 or dataset["contractVersion"] != 2:
        raise ValueError("Expected corrected, route-proved dataset")
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    args.output.mkdir(parents=True)
    results = {host: train_host(dataset["rows"], host, args.output, args.decision_budget_ns) for host in ("chromium", "jsdom")}
    report = {"format": 2, "torch": torch.__version__, "datasetSha256": hashlib.sha256(blob).hexdigest(),
              "trainerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "search": {"hiddenSizes": [0, 2, 4, 8], "seeds": [20261005, 20261006, 20261007],
                         "thresholds": THRESHOLDS, "maxEpochs": 500, "patience": 40,
                         "rawFeatures": NAMES, "modelFeatures": MODEL_NAMES, "evaluationUsedForSelection": False},
              "decisionBudgetNs": args.decision_budget_ns, "budgetMeaning": "Unmeasured estimate; complete-query confirmation required.",
              "scope": "Synthetic family splits. Prior fixtures constrain checkpoint selection as safety controls. Evaluation families not used for training or selection.",
              "safetyGate": {"worstTimeRatio": 1.10, "minimumTotalTimeSpeedRatio": 0.99},
              "policy": "forward-only with exact observed categorical-pair guards",
              "loss": "Paired-bootstrap resolved comparisons. Combined log-relative and absolute-time regret. Inverse decisions receive no gradient weight. Errors above 15% receive four times the weight.",
              "results": results}
    (args.output / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({host: {"status": result["status"], "chosen": result["chosen"]} for host, result in results.items()}, indent=2))


if __name__ == "__main__":
    main()
