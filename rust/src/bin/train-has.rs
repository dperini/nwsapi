//! Fits a :has() route policy from native route measurements.

use nwsapi_has::has_policy::{evaluate, train, Features, Sample};
use nwsapi_has::Relationship;
use std::error::Error;
use std::io::{self, BufRead};

fn main() -> Result<(), Box<dyn Error>> {
    let mut training = Vec::new();
    let mut held_out = Vec::new();
    for line in io::stdin().lock().lines() {
        let line = line?;
        let parts: Vec<_> = line.split_whitespace().collect();
        let [split, relation, layout, anchors, witnesses, forward, inverse] = parts.as_slice()
        else {
            return Err(
                "expected: train|held-out child|descendant siblings|other anchors witnesses forward_ns inverse_ns"
                    .into(),
            );
        };
        let relationship = match *relation {
            "child" => Relationship::Child,
            "descendant" => Relationship::Descendant,
            _ => return Err(format!("unknown relationship: {relation}").into()),
        };
        let row = Sample {
            features: Features {
                relationship,
                anchors: anchors.parse()?,
                witnesses: witnesses.parse()?,
                sibling_anchors: match *layout {
                    "siblings" => true,
                    "other" => false,
                    _ => return Err(format!("unknown anchor layout: {layout}").into()),
                },
                attributes: 0,
                dense_inverse: false,
            },
            forward_ns: forward.parse()?,
            inverse_ns: inverse.parse()?,
        };
        match *split {
            "train" => training.push(row),
            "held-out" => held_out.push(row),
            _ => return Err(format!("unknown split: {split}").into()),
        }
    }
    let policy = train(&training);
    let training = evaluate(policy, &training).ok_or("invalid or missing training timings")?;
    let held_out = evaluate(policy, &held_out).ok_or("invalid or missing held-out timings")?;
    let promote = training.passes_gate() && held_out.passes_gate();
    eprintln!("training  {training:?}");
    eprintln!("held-out  {held_out:?}");
    eprintln!("candidate {policy:?}");
    eprintln!("promoted  {promote}");
    let emitted = if promote { policy } else { Default::default() };
    println!("pub(super) const NATIVE_HAS_POLICY: Policy = {emitted:#?};");
    Ok(())
}
