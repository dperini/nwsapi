#!/usr/bin/env python3
"""Retired entrypoint for the invalid October 4 route-cost experiment.

Historical code and outputs remain in Git. New training uses proved complete
adaptive pipelines and an explicit output directory.
"""
import argparse


def main():
    parser = argparse.ArgumentParser(
        description="Superseded. Use adaptive/train.py with corrected measurements."
    )
    parser.add_argument("--dataset")
    parser.add_argument("--output")
    parser.add_argument("--device")
    parser.parse_args()
    raise SystemExit(
        "The historical trainer used inconsistent route labels and fallback rules. "
        "Run scripts/repo/bench/planner/adaptive/train.py --help."
    )


if __name__ == "__main__":
    main()
