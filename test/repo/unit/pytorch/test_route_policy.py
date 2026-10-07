import unittest

from fixture.rows import evaluate_javascript
from route_policy import input_guard_lines


class RoutePolicyTests(unittest.TestCase):
    def test_generated_guards_run_in_javascript_and_decline_unobserved_inputs(self):
        domain = [[32, 128, 0, 0, 2], [256, 1024, 3, 1, 16]]
        source = "\n".join(input_guard_lines(domain, [[0, 0], [3, 1]]))
        cases = [[64, 256, 0, 0, 4], [193, 600, 3, 1, 3],
                 [64, 512, 3, 1, 8], [64, 200, 3, 1, 3],
                 [64, 128, 0, 0, 2], [64, 256, 1, 0, 4],
                 [1000, 256, 0, 0, 4], [64, 256, 0, 0, "invalid"]]
        self.assertEqual(evaluate_javascript(source, "supportedInputs", cases),
                         [True, True, True, False, False, False, False, False])
