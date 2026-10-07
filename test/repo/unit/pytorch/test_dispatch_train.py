import unittest
import contextlib
import io
import json
import runpy
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from fixture.rows import ROOT, changed, dispatch_row
import numpy as np
import torch
from torch import nn
import dispatch_train as train


class DispatchTrainTests(unittest.TestCase):
    def test_family_splits_do_not_mix_evaluation_with_training(self):
        families = ["dispatch-template-0", "dispatch-template-6", "dispatch-template-8",
                    "dispatch-expanded-0", "dispatch-expanded-4", "dispatch-expanded-6",
                    "dispatch-crossed-0", "dispatch-crossed-4", "dispatch-crossed-6", "old-control"]
        self.assertEqual([train.split({"family": family}) for family in families],
                         ["train", "validation", "evaluation"] * 3 + ["development"])

    def test_encoded_filter_flags_and_baseline_costs(self):
        row = dispatch_row()
        self.assertEqual(train.inputs(row), [64, 256, 0, 0, 4])
        np.testing.assert_array_equal(train.encoded(np.array([[64, 256, 3, 1, 4]])), [[64, 256, 1, 1, 1, 4]])
        self.assertEqual(train.costs(row), [100, 50])
        self.assertEqual(train.costs(dispatch_row(baseline="inverse")), [100, 50])
        self.assertEqual(train.costs(changed(row, decisionReached=False)), [100, 100])

    def test_complete_query_metrics_include_only_reached_decision_overhead(self):
        row = dispatch_row()
        result = train.metrics([row, changed(row, decisionReached=False)], [True, False], 10)
        self.assertAlmostEqual(result["totalTimeSpeedRatio"], 200 / 160)
        self.assertEqual(result["worstTimeRatio"], 1)
        self.assertTrue(result["passesGate"])
        self.assertEqual(train.metrics([], [], 10)["overrides"], 0)
        self.assertFalse(train.metrics([], [], 10)["passesGate"])

    def test_identical_observations_cannot_choose_opposite_routes(self):
        rows = [dispatch_row(alternative=10), dispatch_row(alternative=120)]
        result = train.headroom(rows, 0)
        self.assertEqual(len(result["conflictingInputGroups"]), 1)
        self.assertEqual(result["safeForwardOnlyObservableChooser"]["overrides"], 0)
        self.assertEqual(result["observableChooser"]["overrides"], 2)
        self.assertEqual(train.headroom([dispatch_row()], 0)["safeForwardOnlyObservableChooser"]["overrides"], 1)
        self.assertEqual(train.headroom([dispatch_row(alternative=200)], 0)["observableChooser"]["overrides"], 0)
        self.assertEqual(train.headroom([changed(dispatch_row(), decisionReached=False)], 0)["featureGroups"], 1)

    def test_training_weights_drop_ties_and_inverse_baselines(self):
        rows = [dispatch_row(alternative=50), dispatch_row(alternative=200), dispatch_row(alternative=100), dispatch_row(baseline="inverse")]
        weights, labels, ties = train.weights(rows, 0)
        self.assertGreater(weights[1], weights[0])
        self.assertEqual(weights[2:].tolist(), [0, 0])
        self.assertEqual(labels.tolist(), [1, 0, 0, 1])
        self.assertEqual(ties, 1)

    def test_domain_category_and_direction_guards_decline_unsafe_inputs(self):
        model = nn.Sequential(nn.Linear(6, 1))
        with torch.no_grad():
            model[0].weight.zero_()
            model[0].bias.fill_(2)
        domain = np.array([[32, 128, 0, 0, 2], [128, 512, 3, 1, 8]])
        rows = [dispatch_row(), dispatch_row(baseline="inverse"), changed(dispatch_row(), features=[1000, 256, 0, 4]), changed(dispatch_row(), features=[64, 256, 1, 4])]
        decisions = train.decisions(model, rows, np.zeros(6), np.ones(6), domain, 1, [[0, 0], [3, 1]])
        self.assertEqual(decisions.tolist(), [True, False, False, False])
        self.assertFalse(train.rank({"worstTimeRatio": 1, "passesGate": True, "totalTimeSpeedRatio": 2, "geometricSpeedRatio": 2, "overrides": 1})[0])
        self.assertTrue(train.rank({"worstTimeRatio": 1, "passesGate": True, "totalTimeSpeedRatio": 2, "geometricSpeedRatio": 2, "overrides": 1}, safety={"worstTimeRatio": 1.2, "totalTimeSpeedRatio": 0.9})[0])
        self.assertTrue(train.forward_only_proof()["proved"])

    def test_fractional_decision_overhead_is_valid_for_integer_measurements(self):
        self.assertAlmostEqual(train.metrics([dispatch_row()], [True], 0.5)["totalTimeSpeedRatio"], 100 / 50.5)

    def test_fit_handles_linear_and_hidden_models_and_stale_validation(self):
        rows = [dispatch_row(alternative=50), dispatch_row(alternative=200)]
        fixed = {"worstTimeRatio": 1, "passesGate": True, "totalTimeSpeedRatio": 1.2, "geometricSpeedRatio": 1.2, "overrides": 1}
        with patch.object(train, "metrics", return_value=fixed):
            for hidden in [0, 2]:
                model, mean, scale, domain, chosen = train.fit(rows, rows, rows, hidden, 42, 0)
                self.assertEqual(chosen["hidden"], hidden)
                self.assertEqual(chosen["epoch"], 1)
                self.assertEqual(mean.shape, (6,))
                self.assertTrue((scale > 0).all())
                self.assertEqual(domain.shape, (2, 5))
                self.assertEqual(len(model), 3 if hidden else 1)
            with patch.object(train, "range", return_value=range(1, 3), create=True):
                self.assertEqual(train.fit(rows, rows, rows, 0, 42, 0)[-1]["epoch"], 1)
        with self.assertRaises(ValueError):
            train.fit([dispatch_row(alternative=100)], rows, rows, 0, 42, 0)

    def test_export_preserves_checkpoint_values_and_removes_provably_inactive_units(self):
        domain = np.array([[32, 128, 0, 0, 2], [128, 512, 3, 1, 8]])
        chosen = {"hidden": 0, "threshold": 1, "categoricalPairs": [[0, 0], [3, 1]]}
        model = nn.Sequential(nn.Linear(6, 1))
        source, compilation = train.export(model, np.zeros(6), np.ones(6), domain, chosen)
        self.assertEqual(compilation["removedInactiveUnits"], [])
        self.assertGreater(len(source), 0)
        hidden = nn.Sequential(nn.Linear(6, 3), nn.ReLU(), nn.Linear(3, 1))
        with torch.no_grad():
            hidden[0].weight.zero_()
            hidden[0].bias.copy_(torch.tensor([-1, 1, 0]))
            hidden[2].weight.copy_(torch.tensor([[1, 1, 0]]))
        source, compilation = train.export(hidden, np.zeros(6), np.ones(6), domain, {**chosen, "hidden": 3})
        self.assertEqual(compilation["removedInactiveUnits"], [0])
        self.assertEqual(compilation["removedReluChecks"], [1])
        self.assertGreater(len(source), 0)

    def test_simple_rule_respects_validation_and_old_control_safety(self):
        domain = np.array([[32, 128, 0, 0, 2], [128, 512, 0, 0, 8]])
        rows = [dispatch_row()]
        rule = train.simple_rule(rows, rows, rows, 0, domain, [[0, 0]])
        self.assertGreater(len(rule["policies"]), 0)
        self.assertTrue(rule["metrics"]["passesGate"])
        rejected = train.simple_rule(rows, rows, [dispatch_row(alternative=200)], 0, domain, [[0, 0]])
        self.assertEqual(rejected["policies"], [])
        self.assertEqual(rejected["metrics"]["overrides"], 0)
        self.assertEqual(train.rule_choices([], domain, [[0, 0]], []).tolist(), [])

    def test_cli_writes_host_exports_checkpoints_and_provenance(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            dataset = directory / "dataset"
            dataset.mkdir()
            rows = [changed(dispatch_row(family=family), host=host)
                    for host in ["chromium", "jsdom"]
                    for family in ["dispatch-template-0", "dispatch-template-6", "old-control"]]
            (dataset / "dataset.json").write_text(json.dumps({"format": 2, "contractVersion": 2, "rows": rows}))
            output = directory / "model"
            model = nn.Sequential(nn.Linear(6, 1))
            domain = np.array([[32, 128, 0, 0, 2], [128, 512, 0, 0, 8]])
            metric = train.metrics([dispatch_row()], [True], 0)
            chosen = {"rank": (False, 0, 0, False, 0, -2, -2, 1, 0), "epoch": 1, "threshold": 0, "metrics": metric, "hidden": 0, "seed": 42, "categoricalPairs": [[0, 0]]}
            fitted = (model, np.zeros(6), np.ones(6), domain, chosen)
            with patch.object(sys, "argv", ["dispatch_train.py", "--input", str(directory), "--output", str(output), "--decision-budget-ns", "0.5"]), patch.object(train, "fit", return_value=fitted), contextlib.redirect_stdout(io.StringIO()):
                train.main()
            report = json.loads((output / "evaluation.json").read_text())
            self.assertEqual(set(report["results"]), {"chromium", "jsdom"})
            self.assertEqual(report["decisionBudgetNs"], 0.5)
            for host in ["chromium", "jsdom"]:
                result = report["results"][host]
                self.assertEqual(result["status"], "validation-passed")
                self.assertEqual(len(result["candidates"]), 12)
                self.assertEqual(result["trainingRows"], 1)
                self.assertEqual(result["validationRows"], 1)
                self.assertEqual(len(json.loads((output / f"{host}-parity.json").read_text())), 10007)
                self.assertTrue((output / f"{host}.generated.pt").is_file())
            chosen["metrics"] = {**metric, "passesGate": False}
            with patch.object(train, "fit", return_value=fitted):
                self.assertEqual(train.train_host(rows, "chromium", output, 0)["status"], "rejected-on-validation")

    def test_cli_rejects_invalid_budget_reused_output_and_unproved_data(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            (directory / "dataset").mkdir()
            file = directory / "dataset/dataset.json"
            for output, budget in [(directory, "0"), (directory / "model", "-1"), (directory / "model", "inf")]:
                with patch.object(sys, "argv", ["dispatch_train.py", "--input", str(directory), "--output", str(output), "--decision-budget-ns", budget]):
                    with self.assertRaises(ValueError):
                        train.main()
            for data in [{"format": 1, "contractVersion": 2}, {"format": 2, "contractVersion": 1}]:
                file.write_text(json.dumps(data))
                with patch.object(sys, "argv", ["dispatch_train.py", "--input", str(directory), "--output", str(directory / "model")]):
                    with self.assertRaises(ValueError):
                        train.main()

    def test_entrypoint_reports_missing_required_arguments_by_exit_code(self):
        with patch.object(sys, "argv", ["dispatch_train.py"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                runpy.run_path(str(ROOT / "scripts/repo/pytorch/dispatch_train.py"), run_name="__main__")
        self.assertEqual(error.exception.code, 2)
