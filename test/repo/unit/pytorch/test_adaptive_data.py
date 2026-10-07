import tempfile
import unittest
from pathlib import Path

from fixture.rows import adaptive_dataset, adaptive_row, alter_dataset
import adaptive_data as data


class AdaptiveDataTests(unittest.TestCase):
    def test_load_preserves_provenance_and_assigns_family_splits(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            adaptive_dataset(directory)
            rows, provenance = data.load_rows(directory)
            self.assertEqual(len(rows), 8)
            self.assertEqual([row["split"] for row in rows[:4]],
                             ["train", "validation", "validation", "development"])
            self.assertEqual(len(provenance["inputs"]), 2)
            self.assertEqual(len(provenance["inputs"][0]["sha256"]), 64)

    def test_invalid_measurement_contracts_are_rejected(self):
        changes = [
            lambda blob: blob["metadata"].update(format=2),
            lambda blob: blob["metadata"].update(scenario="other"),
            lambda blob: blob["metadata"].update(labels=[]),
            lambda blob: blob["metadata"].update(host="other"),
            lambda blob: blob["metadata"].update(prefix=3),
            lambda blob: blob["rows"].append(blob["rows"][0]),
            lambda blob: blob["rows"][0].update(costs=[1]),
            lambda blob: blob["rows"][0].update(samples=[1] * 6),
            lambda blob: blob["rows"][0].update(samples=[[1] * 4] * 5),
            lambda blob: blob["rows"][0].update(samples=[[1] * 2] * 6),
            lambda blob: blob["rows"][0].update(costs=[float("nan")] * 6),
            lambda blob: blob["rows"][0].update(samples=[[float("inf")] * 4] * 6),
            lambda blob: blob["rows"][0].update(costs=[0] * 6),
            lambda blob: blob["rows"][0].update(samples=[[-1] * 4] * 6),
            lambda blob: blob["rows"][0].update(observations=[1]),
            lambda blob: blob["rows"][0].update(observations=[float("nan")] * 6),
            lambda blob: blob["metadata"].update(candidateSha256="different"),
            lambda blob: blob["rows"][0].update(fixtureSha256="different"),
        ]
        for change in changes:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as location:
                directory = Path(location)
                adaptive_dataset(directory)
                alter_dataset(directory, change)
                with self.assertRaises(ValueError):
                    data.load_rows(directory)

    def test_rows_without_prefix_observations_are_retained(self):
        with tempfile.TemporaryDirectory() as location:
            directory = Path(location)
            adaptive_dataset(directory)
            for host in ("chromium", "jsdom"):
                alter_dataset(directory, lambda blob: blob["rows"][0].update(observations=None), host)
            self.assertIsNone(data.load_rows(directory)[0][0]["observations"])

    def test_features_and_switch_use_only_observed_facts(self):
        row = {**adaptive_row(), "host": "jsdom"}
        self.assertEqual(data.features(row), [64, 4, 4, 1, 100, 0, 1.0])
        self.assertTrue(data.default_switch(row))
        self.assertEqual(data.alternative_cost(row), row["costs"][3])
        row["observations"][3] = 4
        self.assertFalse(data.default_switch(row))
        self.assertEqual(data.alternative_cost(row), row["costs"][4])
        row["observations"][2] = 0
        self.assertFalse(data.default_switch(row))

    def test_bootstrap_weights_distinguish_wins_losses_and_ties(self):
        rows = [adaptive_row(alternative=value) for value in [50, 200, 100]]
        weights, labels, ties = data.pair_weights(rows)
        self.assertGreater(weights[0], 0)
        self.assertGreater(weights[1], weights[0])
        self.assertEqual(weights[2], 0)
        self.assertEqual(labels.tolist(), [1.0, 0.0, 0.0])
        self.assertEqual(ties, 1)
