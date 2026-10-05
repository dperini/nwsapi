# Performance work guide

This guide is the starting point for developers who are new to `nwsapi` or
performance testing. It explains the common terms and points to the reports
that answer the main questions. The linked reports contain implementation
details and measurement evidence.

## What performance work tries to improve

`nwsapi` reads a CSS selector, finds possible matching elements, checks those
elements, and returns the matches. A performance change should reduce the
time or memory used by that work. It must still return the same elements in
the same order.

Start with the [current optimization plan](selector-optimization-luna-plan.md)
to see the work in progress. Read the [journal](journal.md) for past attempts
and results. Read the [benchmark guide](benchmarks.md) before comparing
numbers. The [neural planner outcome](neural-planner-outcome.md) explains why
the first trained model remains outside the runtime.

## Terms used in the reports

| Term              | Meaning                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selector          | CSS text such as `.card > button` that describes elements to find.                                                                                                 |
| Candidate         | An element that might match. The engine checks it against the selector.                                                                                            |
| Resolver          | A generated JavaScript function that checks whether an element matches.                                                                                            |
| Compile           | Turn selector text into a function that can check elements.                                                                                                        |
| Query             | One request to find matching elements.                                                                                                                             |
| First-match query | Return the first matching element and stop searching.                                                                                                              |
| All-results query | Return every matching element.                                                                                                                                     |
| Cold query        | The first query before the engine has saved a compiled function.                                                                                                   |
| Warm query        | A later query that can reuse saved work.                                                                                                                           |
| Mutation          | A change to the document, such as adding an element or changing an attribute.                                                                                      |
| Baseline          | The saved version used as the starting point for a comparison.                                                                                                     |
| Candidate build   | The version that contains a proposed change.                                                                                                                       |
| Geometric mean    | A way to combine speed ratios across many cases without letting large values dominate the result.                                                                  |
| Ratio above `1`   | In reports labeled baseline time divided by candidate time, this means the candidate is faster. Check each chart label because some reports use the reverse ratio. |
| Preflight check   | A cheap check that can prove a slower operation is unnecessary.                                                                                                    |
| Fallback          | The existing general path used when an optimization cannot prove it is safe.                                                                                       |
| Feature           | A fact given to a planner, such as the selector type or number of candidates. The code must be able to get the fact before it chooses a route.                     |
| Route             | One exact method the engine can use to find matching elements.                                                                                                     |
| Action            | The route a planner chooses for a query.                                                                                                                           |
| Training example  | One recorded query with its inputs and measured route costs.                                                                                                       |
| Label             | The route that performed best in a training example. It must come from a measured, correct run.                                                                    |
| Held-out case     | A test case kept out of training. It checks whether a model works on cases it did not study.                                                                       |
| Inference         | Running a trained model to get its route choice. The time for inference counts toward query time.                                                                  |
| Ablation          | A comparison that removes one proposed change so we can measure its separate effect.                                                                               |
| Headroom          | The most time an ideal route choice could save before the cost of choosing that route.                                                                             |

## How to read a performance result

First check what the report timed. A resolver-only measurement starts after
candidate elements are ready. A complete query also includes candidate
lookup, planning, and result collection. Complete-query time is the best
measure of what an application experiences.

Then check the host, selector cases, and query state. A browser result does
not automatically predict a `jsdom` result. A warm result does not tell you
how much the first query costs. A result from one test page does not prove
that every application will see the same change.

Before timing, the benchmark checks correctness. It compares the returned
elements and their order. A faster query that returns the wrong elements is
a failure, not an optimization.

## How we write these documents

These documents use the [Google developer documentation style
guide](https://developers.google.com/style) as a writing reference. They use
active voice, explain a goal before steps, and define terms when readers first
need them. They also use clear wording practices from
[ASD-STE100](https://www.asd-ste100.org/about_STE.html), a controlled English
standard with its own rules and dictionary.

This repository has local documentation rules in `AGENTS.md`. Those rules
take priority when they differ from a general writing guide. This writing
pass aims to make the documents easier for junior developers to follow; it
does not claim formal ASD-STE100 compliance. Formal compliance requires a
trained review against the standard's full rules and dictionary.

## Document map

- [Benchmark results](benchmarks.md): browser comparison and chart meaning.
- [`jsdom` results](jsdom.md): public `querySelectorAll()` comparison.
- [Benchmark commands](comparisons.md): compare two saved builds.
- [Compiler design](design.md): how selector queries become JavaScript checks.
- [Fast paths](query-fast-paths.md): shortcuts for common query shapes.
- [Resolver execution](resolver-execution.md): earlier compiler and loop changes.
- [Optimization plan](selector-optimization-luna-plan.md): current work and
  promotion gates.
- [Survey](survey-2026-10-03.md): measured opportunities and open questions.
- [Performance journal](journal.md): chronological evidence and decisions.
- [Neural planner outcome](neural-planner-outcome.md): model experiment result.
- [Trained `:has()` planner](trained-has-planner.md): limited retained rule.
- [Trained planner](trained-planner.md): broader planner experiment that did
  not pass its performance gate.
- [Upstream audit](upstream-audit.md): findings from related projects.
- [Compilation review](compilation-review-2026-10-01.md) and
  [performance review](review.md): earlier reviews; read their dates before
  using their measurements.
