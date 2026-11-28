//! A guarded cost-sensitive route policy for exact `:has()` matching.

use crate::Relationship;

/// Identifier of the generated host policies mirrored by this module.
pub const HOST_MODEL_ID: &str = "planner-dispatch-crossed-2026-10-05-r1";

/// Host-specific trained policy shipped by NWSAPI v3.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Host {
    /// The policy trained for Chromium's native DOM selector path.
    Chromium,
    /// The policy trained for jsdom's selector path.
    Jsdom,
}

/// Inputs used by the committed v3 host route models.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HostFeatures {
    pub anchors: u32,
    pub witnesses: u32,
    /// Bit 1 is the anchor's `data-ok="1"` guard; bit 0 is the witness's.
    pub attributes: u8,
    pub dense_inverse: bool,
}

/// Evaluate a committed host model. Unsupported inputs conservatively use the
/// inverse route, matching the generated JavaScript model's guard behavior.
#[must_use]
pub fn choose_host(host: Host, features: HostFeatures) -> Route {
    if !host_features_supported(features) {
        return Route::Inverse;
    }
    let anchors = f64::from(features.anchors);
    let witnesses = f64::from(features.witnesses);
    let attributes = f64::from(features.attributes);
    let dense = f64::from(features.dense_inverse);
    let ratio = witnesses / anchors;
    let forward = match host {
        Host::Chromium => chromium_host_model(anchors, witnesses, attributes, dense, ratio),
        Host::Jsdom => jsdom_host_model(anchors, witnesses, attributes, dense, ratio),
    };
    if forward {
        Route::Forward
    } else {
        Route::Inverse
    }
}

fn host_features_supported(features: HostFeatures) -> bool {
    let anchors = features.anchors;
    let witnesses = features.witnesses;
    let dense = features.dense_inverse;
    let attrs = features.attributes;
    ((attrs == 0 && dense) || ((1..=3).contains(&attrs) && !dense))
        && witnesses > anchors.saturating_mul(2)
        && (!dense || anchors > 192 || witnesses > anchors.saturating_mul(4))
        && (32..=192).contains(&anchors)
        && (80..=768).contains(&witnesses)
        && attrs <= 3
        && (2.5..=4.0).contains(&(f64::from(witnesses) / f64::from(anchors)))
}

fn chromium_host_model(
    anchors: f64,
    witnesses: f64,
    attributes: f64,
    dense: f64,
    ratio: f64,
) -> bool {
    if !matches!((attributes as u8, dense as u8), (0, 1) | (1..=3, 0)) {
        return false;
    }
    let h0 = (4.179_537_448_329_07 + 0.006_445_970_393_207_164 * anchors
        - 0.001_237_694_714_117_135 * witnesses
        - 1.693_496_998_779_078_9 * f64::from((attributes as u8) >> 1)
        + 1.998_774_040_388_822_3 * f64::from((attributes as u8) & 1)
        - 0.283_160_597_085_952_76 * dense
        - 1.210_197_369_257_609_1 * ratio)
        .max(0.0);
    let h1 = (2.597_287_748_725_064
        + 0.009_217_632_292_722_143 * anchors
        + 0.002_572_383_693_628_594_4 * witnesses
        - 0.888_835_499_375_548 * f64::from((attributes as u8) >> 1)
        - 1.336_876_371_285_424_6 * f64::from((attributes as u8) & 1)
        + 0.051_074_709_743_261_34 * dense
        - 0.685_463_428_497_314_5 * ratio)
        .max(0.0);
    let h2 = (1.960_208_883_512_894_1 + 0.001_692_133_990_677_274_3 * anchors
        - 0.001_167_914_931_574_293_1 * witnesses
        + 2.067_933_731_341_015_8 * f64::from((attributes as u8) >> 1)
        - 2.014_359_860_674_453_7 * f64::from((attributes as u8) & 1)
        + 0.052_165_184_170_007_706 * dense
        - 0.389_738_400_777_180_97 * ratio)
        .max(0.0);
    let h3 = (8.011_757_617_079_402
        - 0.012_647_065_327_815_697 * anchors
        - 0.005_570_000_639_262_182_5 * witnesses
        - 2.130_954_860_248_142_5 * f64::from((attributes as u8) >> 1)
        + 0.063_823_034_603_230_6 * f64::from((attributes as u8) & 1)
        + 0.178_647_547_960_281_37 * dense
        - 0.811_061_302_820_841_4 * ratio)
        .max(0.0);
    let value = 1.018_654_465_675_354
        + 0.831_055_998_802_185_1 * h0
        + 0.802_891_373_634_338_4 * h1
        + 0.600_017_130_374_908_4 * h2
        + 0.945_857_048_034_668 * h3;
    value.is_finite() && value > 3.000_01
}

fn jsdom_host_model(anchors: f64, witnesses: f64, attributes: f64, dense: f64, ratio: f64) -> bool {
    if !matches!((attributes as u8, dense as u8), (0, 1) | (1..=3, 0)) {
        return false;
    }
    let value = 2.254_592_973_577_907_3 + 0.006_305_653_682_638_130_5 * anchors
        - 0.000_076_101_428_114_832_55 * witnesses
        - 0.993_211_688_306_798_6 * f64::from((attributes as u8) >> 1)
        - 0.686_017_011_890_783_7 * f64::from((attributes as u8) & 1)
        + 0.181_680_336_594_581_6 * dense
        - 0.190_681_675_547_638_76 * ratio;
    value.is_finite() && value > 1e-5
}

/// Both routes produce the same ordered matches.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Route {
    Forward,
    Inverse,
}

#[derive(Clone, Copy, Debug)]
pub struct Features {
    pub relationship: Relationship,
    pub anchors: u32,
    pub witnesses: u32,
    pub sibling_anchors: bool,
    /// Host-model feature bits: anchor `data-ok=1` is bit 1, witness is bit 0.
    pub attributes: u8,
    pub dense_inverse: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Sample {
    pub features: Features,
    pub forward_ns: f64,
    pub inverse_ns: f64,
}

/// Within the measured domain, choose forward when the witness-to-anchor
/// ratio is at or above the learned cutoff. Outside it, keep inverse.
#[derive(Clone, Copy, Debug)]
pub struct Rule {
    pub min_anchors: u32,
    pub max_anchors: u32,
    pub min_witnesses: u32,
    pub max_witnesses: u32,
    pub witness_percent: u32,
}

impl Rule {
    fn applies(self, input: Features) -> bool {
        input.sibling_anchors
            && (self.min_anchors..=self.max_anchors).contains(&input.anchors)
            && (self.min_witnesses..=self.max_witnesses).contains(&input.witnesses)
            && u64::from(input.witnesses) * 100
                >= u64::from(input.anchors) * u64::from(self.witness_percent)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Policy {
    pub child: Option<Rule>,
    pub descendant: Option<Rule>,
}

impl Policy {
    #[must_use]
    pub fn choose(self, input: Features) -> Route {
        let rule = match input.relationship {
            Relationship::Child => self.child,
            Relationship::Descendant => self.descendant,
        };
        if rule.is_some_and(|rule| rule.applies(input)) {
            Route::Forward
        } else {
            Route::Inverse
        }
    }
}

#[derive(Debug)]
pub struct Metrics {
    pub geometric_speedup: f64,
    pub total_speedup: f64,
    pub worst_ratio: f64,
    pub forwards: usize,
}

#[must_use]
pub fn evaluate(policy: Policy, samples: &[Sample]) -> Option<Metrics> {
    if samples.is_empty() || samples.iter().any(|sample| !valid(sample)) {
        return None;
    }
    let mut sum_log = 0.0;
    let mut selected = 0.0;
    let mut baseline = 0.0;
    let mut worst_ratio: f64 = 0.0;
    let mut forwards = 0;
    for sample in samples {
        let time = match policy.choose(sample.features) {
            Route::Forward => {
                forwards += 1;
                sample.forward_ns
            }
            Route::Inverse => sample.inverse_ns,
        };
        let ratio = time / sample.inverse_ns;
        sum_log += ratio.ln();
        worst_ratio = worst_ratio.max(ratio);
        selected += time;
        baseline += sample.inverse_ns;
    }
    Some(Metrics {
        geometric_speedup: (-sum_log / samples.len() as f64).exp(),
        total_speedup: baseline / selected,
        worst_ratio,
        forwards,
    })
}

fn valid(sample: &Sample) -> bool {
    sample.features.anchors > 0
        && sample.features.witnesses > 0
        && sample.forward_ns.is_finite()
        && sample.inverse_ns.is_finite()
        && sample.forward_ns > 0.0
        && sample.inverse_ns > 0.0
}

impl Metrics {
    #[must_use]
    pub fn passes_gate(&self) -> bool {
        self.geometric_speedup >= 1.05 && self.total_speedup >= 1.0 && self.worst_ratio <= 1.15
    }
}

/// Fits one guarded split per relationship, using measured costs as in the v3
/// route trainer. Only promote a fitted policy after a separate held-out gate.
#[must_use]
pub fn train(samples: &[Sample]) -> Policy {
    if samples.iter().any(|sample| !valid(sample)) {
        return Policy::default();
    }
    Policy {
        child: train_relationship(samples, Relationship::Child),
        descendant: train_relationship(samples, Relationship::Descendant),
    }
}

fn train_relationship(samples: &[Sample], relationship: Relationship) -> Option<Rule> {
    let rows: Vec<_> = samples
        .iter()
        .filter(|row| row.features.relationship == relationship && row.features.sibling_anchors)
        .collect();
    let min_anchors = rows.iter().map(|r| r.features.anchors).min()?;
    let max_anchors = rows.iter().map(|r| r.features.anchors).max()?;
    let min_witnesses = rows.iter().map(|r| r.features.witnesses).min()?;
    let max_witnesses = rows.iter().map(|r| r.features.witnesses).max()?;
    let mut best = None;
    let mut best_score = 0.0;
    for witness_percent in [0, 12, 25, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1600] {
        let rule = Rule {
            min_anchors,
            max_anchors,
            min_witnesses,
            max_witnesses,
            witness_percent,
        };
        let chosen: Vec<_> = rows.iter().filter(|s| rule.applies(s.features)).collect();
        if chosen.len() < 2 || chosen.iter().any(|s| s.forward_ns > 1.15 * s.inverse_ns) {
            continue;
        }
        let score = chosen
            .iter()
            .map(|s| (s.inverse_ns / s.forward_ns).ln())
            .sum();
        if score > best_score {
            best_score = score;
            best = Some(rule);
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_models_match_generated_policy_examples_and_guard_inputs() {
        let cases = [
            (96, 320, 1, false, Route::Forward, Route::Forward),
            (64, 192, 2, false, Route::Forward, Route::Forward),
            (128, 384, 3, false, Route::Inverse, Route::Forward),
            (32, 80, 1, false, Route::Forward, Route::Forward),
            (192, 768, 1, false, Route::Forward, Route::Forward),
        ];
        for (anchors, witnesses, attributes, dense_inverse, chromium, jsdom) in cases {
            let features = HostFeatures {
                anchors,
                witnesses,
                attributes,
                dense_inverse,
            };
            assert_eq!(choose_host(Host::Chromium, features), chromium);
            assert_eq!(choose_host(Host::Jsdom, features), jsdom);
        }

        assert_eq!(
            choose_host(
                Host::Chromium,
                HostFeatures {
                    anchors: 96,
                    witnesses: 320,
                    attributes: 0,
                    dense_inverse: true,
                }
            ),
            Route::Inverse
        );
        assert_eq!(
            choose_host(
                Host::Jsdom,
                HostFeatures {
                    anchors: 20,
                    witnesses: 80,
                    attributes: 1,
                    dense_inverse: false,
                }
            ),
            Route::Inverse
        );
    }

    #[test]
    fn fits_a_guarded_rule_from_costs() {
        let sample = |witnesses, forward_ns| Sample {
            features: Features {
                relationship: Relationship::Child,
                anchors: 100,
                witnesses,
                sibling_anchors: true,
                attributes: 0,
                dense_inverse: false,
            },
            forward_ns,
            inverse_ns: 100.0,
        };
        let policy = train(&[
            sample(25, 200.0),
            sample(50, 200.0),
            sample(100, 40.0),
            sample(200, 35.0),
        ]);
        assert_eq!(policy.choose(sample(175, 40.0).features), Route::Forward);
        assert_eq!(policy.choose(sample(25, 200.0).features), Route::Inverse);
        assert_eq!(policy.choose(sample(300, 40.0).features), Route::Inverse);
        assert!(evaluate(policy, &[sample(25, 100.0), sample(125, 40.0)])
            .unwrap()
            .passes_gate());
    }
}
