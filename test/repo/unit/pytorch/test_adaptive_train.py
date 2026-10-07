import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fixture.rows import ROOT, adaptive_dataset, adaptive_row, alter_dataset
import numpy as np
from adaptive_policy import Policy
import adaptive_train as train


class AdaptiveTrainingTests(unittest.TestCase):
    def rows(self):
        return [{**adaptive_row(alternative=cost), "host": "chromium"}
                for cost in [50, 200]]

    def test_metrics_apply_only_in_domain_overrides_and_include_budget(self):
        rows = self.rows()
        rows[1]["observations"][0] = 1000
        domain = np.array([[0] * 7, [100] * 7])
        result = train.estimated_metrics(rows, np.array([10, 10]), domain, 1, 0)
        self.assertEqual(result["swaps"], 1)
        self.assertEqual(result["domainMisses"], 1)
        self.assertAlmostEqual(result["estimatedSpeedRatio"], np.sqrt(2))
        self.assertEqual(train.geometric([]), 1)

    def test_fit_uses_training_weights_and_stops_when_validation_stales(self):
        rows = self.rows()
        fixed = {"estimatedWorstTimeRatio": 1, "estimatedSpeedRatio": 1.2, "swaps": 1}
        with patch.object(train, "estimated_metrics", return_value=fixed):
            model, mean, scale, domain, selected = train.fit_candidate(rows, rows, 2, 42, 0)
        self.assertIsInstance(model, Policy)
        self.assertTrue((scale > 0).all())
        self.assertEqual(mean.shape, (7,))
        self.assertEqual(domain.shape, (2, 7))
        self.assertEqual(selected["epoch"], 1)
        self.assertEqual(selected["hidden"], 2)
        with patch.object(train, "range", return_value=range(1, 3), create=True), patch.object(train, "estimated_metrics", return_value=fixed):
            self.assertEqual(train.fit_candidate(rows, rows, 2, 42, 0)[-1]["epoch"], 1)
        ties = [{**adaptive_row(alternative=100), "host": "chromium"}]
        with self.assertRaises(ValueError):
            train.fit_candidate(ties, ties, 2, 42, 0)

    def test_cli_writes_checkpoint_exports_parity_and_provenance(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            adaptive_dataset(directory)
            output = directory / "model"
            model = Policy(2)
            mean, scale = np.zeros(7), np.ones(7)
            domain = np.array([[0] * 7, [1000] * 7])
            chosen = {"rank": (False, -1.2, 1), "hidden": 2, "seed": 42,
                      "epoch": 1, "threshold": 0, "metrics": {}}
            args = ["adaptive_train.py", "--input", str(directory), "--output", str(output), "--decision-budget-ns", "0"]
            with patch.object(sys, "argv", args), patch.object(train, "fit_candidate", return_value=(model, mean, scale, domain, chosen)), contextlib.redirect_stdout(io.StringIO()):
                train.main()
            report = json.loads((output / "evaluation.json").read_text())
            self.assertEqual(report["trainingRows"], 2)
            self.assertEqual(report["validationRows"], 4)
            self.assertEqual(report["developmentRows"], 2)
            self.assertEqual(len(report["candidates"]), 9)
            self.assertEqual(len(json.loads((output / "parity-reference.json").read_text())), 10008)
            self.assertEqual(set(report["artifactSha256"]), {"chromium", "jsdom"})

    def test_cli_rejects_reused_directories_invalid_budgets_and_missing_splits(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            adaptive_dataset(directory)
            options = [(directory, "0"), (directory / "new", "-1"), (directory / "new", "inf")]
            for output, budget in options:
                with patch.object(sys, "argv", ["adaptive_train.py", "--input", str(directory), "--output", str(output), "--decision-budget-ns", budget]):
                    with self.assertRaises(ValueError):
                        train.main()
            for host in ("chromium", "jsdom"):
                alter_dataset(directory, lambda blob: blob.update(rows=blob["rows"][:1]), host)
            with patch.object(sys, "argv", ["adaptive_train.py", "--input", str(directory), "--output", str(directory / "new")]):
                with self.assertRaises(ValueError):
                    train.main()

    def test_script_entrypoint_propagates_missing_required_arguments(self):
        with patch.object(sys, "argv", ["adaptive_train.py"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                runpy.run_path(str(ROOT / "scripts/repo/pytorch/adaptive_train.py"), run_name="__main__")
        self.assertEqual(error.exception.code, 2)
