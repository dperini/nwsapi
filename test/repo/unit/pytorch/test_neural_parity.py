import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fixture.rows import ROOT
import neural_parity as parity
import neural_train as retired


class NeuralParityTests(unittest.TestCase):
    def data(self):
        weights = {"MEAN": [0] * 6, "SCALE": [1] * 6,
                   "W1": [[0] * 6] * 2, "B1": [0, 0],
                   "W2": [[0, 0], [0, 0]], "B2": [1, 0]}
        inputs = [[64, 256, 0, False, "chromium"],
                  [64, 256, 1, False, "jsdom"],
                  [1000, 1, 3, True, "other"],
                  [64, 256, 3, True, "jsdom"]]
        return {"weights": weights, "margin": 0.01, "numericalBand": 1e-5,
                "domain": {"anchors": [32, 128], "witnesses": [128, 512], "ratio": [2, 8]},
                "cases": [{"input": value, "score": 1, "decision": decision}
                          for value, decision in zip(inputs, [True, False, True, True])]}

    def invoke(self, data, entry=False):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            (directory / "parity-reference.json").write_text(json.dumps(data))
            with patch.object(sys, "argv", ["neural_parity.py", str(directory)]), contextlib.redirect_stdout(io.StringIO()):
                if entry:
                    runpy.run_path(str(ROOT / "scripts/repo/pytorch/neural_parity.py"), run_name="__main__")
                else:
                    parity.main()
            return json.loads((directory / "python-parity.json").read_text())

    def test_scores_and_decisions_are_checked_against_the_recorded_reference(self):
        result = self.invoke(self.data(), True)
        self.assertEqual(result["cases"], 4)
        self.assertEqual(result["maximumScoreError"], 0)
        self.assertEqual(result["decisionDisagreements"], 0)

    def test_bad_scores_or_decisions_reject_the_export(self):
        data = self.data()
        data["cases"][0]["score"] = 2
        with self.assertRaises(ValueError):
            self.invoke(data)
        data = self.data()
        data["cases"][0]["decision"] = False
        with self.assertRaises(ValueError):
            self.invoke(data)

    def test_retired_training_entrypoints_fail_without_creating_artifacts(self):
        with patch.object(sys, "argv", ["neural_train.py"]):
            with self.assertRaises(SystemExit):
                retired.main()
            with self.assertRaises(SystemExit):
                runpy.run_path(str(ROOT / "scripts/repo/pytorch/neural_train.py"), run_name="__main__")
