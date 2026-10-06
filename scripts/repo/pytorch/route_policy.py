"""Render small JavaScript input guards for trained route policies."""

FEATURE_NAMES = ("anchors", "witnesses", "attributes", "dense", "ratio")


def input_guard_lines(domain, categorical_pairs):
    category_guard = " || ".join(
        f"(attributes === {attributes:g} && dense === {dense:g})"
        for attributes, dense in categorical_pairs
    )
    range_guards = " && ".join(
        f"inRange({name}, {float(domain[0][index])!r}, {float(domain[1][index])!r})"
        for index, name in enumerate(FEATURE_NAMES)
    )
    return [
        "function supportedCategory(attributes, dense) {",
        f"  return {category_guard};",
        "}",
        "function supportedRoute(anchors, witnesses, dense) {",
        "  return witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4);",
        "}",
        "function inRange(value, minimum, maximum) {",
        "  return Number.isFinite(value) && value >= minimum && value <= maximum;",
        "}",
        "function supportedInputs(anchors, witnesses, attributes, dense, ratio) {",
        f"  return supportedCategory(attributes, dense) && supportedRoute(anchors, witnesses, dense) && {range_guards};",
        "}",
    ]
