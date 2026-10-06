"""Trainable continuation preference and allocation-free JS export."""
import json

import numpy as np
import torch
from torch import nn


class Policy(nn.Module):
    def __init__(self, hidden):
        super().__init__()
        self.hidden = nn.Linear(7, hidden)
        self.output = nn.Linear(hidden, 1)

    def forward(self, values):
        return self.output(torch.relu(self.hidden(values))).squeeze(-1)


def score(model, values, mean, scale):
    with torch.no_grad():
        return model(torch.tensor((values - mean) / scale, dtype=torch.float32)).numpy()


def exported_source(weights, mean, scale, domain, threshold, host):
    names = ["anchors", "processed", "passed", "hits", "candidates", "dense"]
    lines = ["function adaptiveChoice(anchors, processed, passed, hits, candidates, dense) {",
             "  var fallback = passed > 0 && hits * 2 < passed;"]
    guards = []
    for i, name in enumerate(names):
        guards.append(f"!Number.isFinite(+{name}) || {name} < {float(domain[0][i])!r} || {name} > {float(domain[1][i])!r}")
    lines.append("  if (" + " || ".join(guards) + ") { return fallback; }")
    hidden_weights = np.array(weights["hidden.weight"], dtype=float)
    hidden_bias = np.array(weights["hidden.bias"], dtype=float)
    folded = hidden_weights / scale
    bias = hidden_bias - (hidden_weights * mean / scale).sum(axis=1)
    bias += folded[:, 6] * float(host == "jsdom")
    for i, row in enumerate(folded):
        expression = repr(float(bias[i]))
        for j, name in enumerate(names):
            expression += f" + ({float(row[j])!r}) * {name}"
        lines.append(f"  var h{i} = Math.max(0, {expression});")
    expression = repr(float(weights["output.bias"][0]))
    for i, weight in enumerate(weights["output.weight"][0]):
        expression += f" + ({weight!r}) * h{i}"
    lines.append(f"  var logit = {expression};")
    lines.append(f"  if (!Number.isFinite(logit) || logit <= {threshold + 1e-5!r}) {{ return fallback; }}")
    lines.append("  return !fallback;\n}\n")
    return "\n".join(lines)


def save_model(model, mean, scale, domain, threshold, directory):
    weights = {name: value.detach().tolist() for name, value in model.state_dict().items()}
    payload = {"weights": weights, "mean": mean.tolist(), "scale": scale.tolist(),
               "domain": domain.tolist(), "threshold": threshold, "numericalBand": 1e-5}
    (directory / "weights.json").write_text(json.dumps(payload, indent=2) + "\n")
    torch.save(model.state_dict(), directory / "model.pt")
    for host in ("chromium", "jsdom"):
        source = exported_source(weights, mean, scale, domain, threshold, host)
        (directory / f"{host}.mjs").write_text("export " + source)
