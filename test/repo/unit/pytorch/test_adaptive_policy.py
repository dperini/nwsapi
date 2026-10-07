import json
import tempfile
import unittest
from pathlib import Path

from fixture.rows import evaluate_javascript
import numpy as np
import torch
from adaptive_policy import Policy, save_model, score


class AdaptivePolicyTests(unittest.TestCase):
    def test_model_outputs_and_saved_checkpoint_agree(self):
        torch.manual_seed(42)
        model = Policy(2)
        values = np.array([[1, 2, 3, 4, 5, 0, 0], [2, 3, 4, 5, 6, 1, 1]])
        mean = np.zeros(7)
        scale = np.ones(7)
        domain = np.array([np.zeros(7), np.ones(7) * 10])
        expected = model(torch.tensor(values, dtype=torch.float32)).detach().numpy()
        np.testing.assert_allclose(score(model, values, mean, scale), expected)
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            save_model(model, mean, scale, domain, 0.5, directory)
            payload = json.loads((directory / "weights.json").read_text())
            self.assertEqual(payload["numericalBand"], 1e-5)
            self.assertEqual(payload["threshold"], 0.5)
            restored = Policy(2)
            restored.load_state_dict(torch.load(directory / "model.pt", weights_only=True))
            np.testing.assert_allclose(score(restored, values, mean, scale), expected)
            self.assertTrue((directory / "chromium.mjs").is_file())
            self.assertTrue((directory / "jsdom.mjs").is_file())
            cases = [[1, 2, 3, 4, 5, 0], [2, 3, 4, 1, 6, 1], [1000, 3, 4, 1, 6, 1]]
            for host in ["chromium", "jsdom"]:
                raw = np.array([row + [float(host == "jsdom")] for row in cases])
                logits = score(model, raw, mean, scale)
                expected = []
                for row, logit in zip(cases, logits):
                    fallback = row[2] > 0 and row[3] * 2 < row[2]
                    inside = all(0 <= value <= 10 for value in row)
                    expected.append(not fallback if inside and logit > 0.5 + 1e-5 else fallback)
                self.assertEqual(evaluate_javascript((directory / f"{host}.mjs").read_text().removeprefix("export "), "adaptiveChoice", cases), expected)
