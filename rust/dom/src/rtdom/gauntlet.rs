//! Phase-4 end-to-end gauntlet for the Rust-native runtime. Exercises the whole
//! stack in one in-process flow (no JS boundary): parse → query → getComputedStyle
//! cascade → event dispatch whose handler MUTATES the tree → cache-invalidated
//! re-query → serialize. This is the Rust-consumer analogue of the RTL gauntlet;
//! it proves the native API composes correctly across modules.

use super::cascade;
use super::events::{Dom, Event};
use super::serialize;
use std::fmt::Write;

const PAGE: &str = "<!doctype html><html><head><style>\
.card{color:blue;padding:0}\
#hero{color:green}\
.card .title{font-weight:bold}\
</style></head><body><main class=grid>\
<div class='card' id=hero data-testid=c0><h2 class=title>A</h2><button type=button>add</button></div>\
<div class='card' data-testid=c1><h2 class=title>B</h2></div>\
<div class='card' data-testid=c2><h2 class=title>C</h2></div>\
</main></body></html>";

#[test]
fn full_stack_parse_query_cascade_event_mutate_serialize() {
    let mut dom = Dom::parse(PAGE);

    // --- query ---
    let cards = dom.tree.query_selector_all("div.card");
    assert_eq!(cards.len(), 3);
    let titles = dom.tree.query_selector_all(".card .title");
    assert_eq!(titles.len(), 3);
    assert_eq!(dom.tree.text_content(cards[0]), "Aadd"); // h2 "A" + button "add"

    // --- attributes ---
    assert_eq!(dom.tree.get_attribute(cards[1], "data-testid"), Some("c1"));
    assert_eq!(dom.tree.tag_name(cards[0]).as_deref(), Some("DIV"));

    // --- getComputedStyle cascade ---
    // .card sets color:blue; #hero (id) sets color:green and wins on specificity.
    let hero_cs = cascade::computed_style(&dom.tree, cards[0]);
    assert_eq!(
        cascade::get_property_value(&hero_cs, "color"),
        "rgb(0, 128, 0)"
    ); // green
    let plain_cs = cascade::computed_style(&dom.tree, cards[1]);
    assert_eq!(
        cascade::get_property_value(&plain_cs, "color"),
        "rgb(0, 0, 255)"
    ); // blue
       // honest absence
    assert_eq!(cascade::get_property_value(&plain_cs, "margin-top"), "");

    // --- event dispatch whose handler mutates the tree ---
    let main = dom.tree.query_selector("main.grid").unwrap();
    dom.add_event_listener(
        main,
        "addcard",
        false,
        false,
        Box::new(|tree, _ev| {
            let m = tree.query_selector("main.grid").unwrap();
            let card = tree.create_element("div");
            tree.set_attribute(card, "class", "card");
            tree.append_child(m, card);
        }),
    );
    let button = dom.tree.query_selector("button").unwrap();
    let mut ev = Event::new("addcard", true, false);
    dom.dispatch_event(button, &mut ev); // bubbles button → div → main

    // --- cache-invalidated re-query reflects the mutation ---
    assert_eq!(dom.tree.query_selector_all("div.card").len(), 4);

    // --- serialize ---
    let inner = serialize::serialize_inner(&dom.tree, main);
    assert!(inner.matches("class=\"card\"").count() + inner.matches("class='card'").count() >= 1);
    let outer = serialize::serialize_outer(&dom.tree, cards[2]);
    assert!(outer.starts_with("<div"));
    assert!(outer.contains("data-testid=\"c2\""));
}

/// Native in-process throughput on the SAME chatty workload as the JS↔WASM spike
/// (bench/spike.mjs): qsa-once → per-node getAttribute×2 + tagName + parent-walk.
/// Run: `cargo test --release --lib rtdom::gauntlet::native -- --ignored --nocapture`.
/// Zero boundary here — contrast with the spike's WASM-from-JS 0.56× JS result.
#[test]
#[ignore = "end-to-end gauntlet — run explicitly with --ignored"]
fn native_workload_throughput() {
    use super::tree::Tree;
    use std::time::Instant;

    let n = 300;
    let mut html = String::from("<!doctype html><html><body><main class=grid>");
    for i in 0..n {
        let _ = write!(
            html,
            "<div class=\"card sx-{}\" data-testid=\"card-{}\" id=\"c{}\"><h2 class=title>T{}</h2><p>body</p><button type=button>Go</button></div>",
            i % 7, i, i, i
        );
    }
    html.push_str("</main></body></html>");

    let tree = Tree::parse(&html);
    let cards = tree.query_selector_all("div.card");
    assert_eq!(cards.len(), n);

    let workload = || {
        let mut sink: u64 = 0;
        for &el in cards.iter() {
            if let Some(c) = tree.get_attribute(el, "class") {
                sink += c.len() as u64;
            }
            if let Some(t) = tree.get_attribute(el, "data-testid") {
                sink += t.len() as u64;
            }
            if let Some(tag) = tree.tag_name(el) {
                sink += tag.len() as u64;
            }
            let mut p = tree.parent(el);
            let mut depth = 0u64;
            while let Some(x) = p {
                depth += 1;
                p = tree.parent(x);
            }
            sink += depth;
        }
        sink
    };

    let mut best = 0.0f64;
    let mut sink = 0u64;
    for _ in 0..6 {
        for _ in 0..200 {
            sink = sink.wrapping_add(workload());
        }
        let start = Instant::now();
        let mut iters = 0u64;
        while start.elapsed().as_millis() < 500 {
            sink = sink.wrapping_add(workload());
            iters += 1;
        }
        let ops = iters as f64 / start.elapsed().as_secs_f64();
        if ops > best {
            best = ops;
        }
    }
    println!(
        "rtdom native workload: {:.0} ops/s over {} cards (sink {}) — zero boundary",
        best,
        n,
        sink % 100_003
    );
}

/// CONTROLLED in-process A/B (same language, runtime, harness, fixture) — isolates
/// the ONE variable the design rests on: lazy COW reads (off the immutable buffer)
/// vs eager full-inflate (every node materialized into the owned `HashMap` overlay).
/// Run: `cargo test --release --lib rtdom::gauntlet::lazy_vs_eager -- --ignored --nocapture`.
#[test]
#[ignore = "end-to-end gauntlet — run explicitly with --ignored"]
fn lazy_vs_eager_ab() {
    use super::tree::Tree;
    use std::time::Instant;

    let n = 300;
    let mut html = String::from("<!doctype html><html><body><main class=grid>");
    for i in 0..n {
        let _ = write!(
            html,
            "<div class=\"card sx-{}\" data-testid=\"card-{}\" id=\"c{}\"><h2 class=title>T{}</h2><p>body</p><button type=button>Go</button></div>",
            i % 7, i, i, i
        );
    }
    html.push_str("</main></body></html>");

    let run = |tree: &Tree| {
        let cards = tree.query_selector_all("div.card");
        let work = || {
            let mut sink: u64 = 0;
            for &el in cards.iter() {
                if let Some(c) = tree.get_attribute(el, "class") {
                    sink += c.len() as u64;
                }
                if let Some(t) = tree.get_attribute(el, "data-testid") {
                    sink += t.len() as u64;
                }
                for c in tree.children(el) {
                    sink += tree.node_type(c) as u64;
                }
                let mut p = tree.parent(el);
                while let Some(x) = p {
                    sink += 1;
                    p = tree.parent(x);
                }
            }
            sink
        };
        let mut best = 0.0f64;
        let mut sink = 0u64;
        for _ in 0..6 {
            for _ in 0..200 {
                sink = sink.wrapping_add(work());
            }
            let start = Instant::now();
            let mut iters = 0u64;
            while start.elapsed().as_millis() < 400 {
                sink = sink.wrapping_add(work());
                iters += 1;
            }
            let ops = iters as f64 / start.elapsed().as_secs_f64();
            if ops > best {
                best = ops;
            }
        }
        (best, sink % 100_003)
    };

    let lazy = Tree::parse(&html);
    let (lazy_ops, s1) = run(&lazy);

    let mut eager = Tree::parse(&html);
    let inflate_start = Instant::now();
    eager.force_inflate_all();
    let inflate_ms = inflate_start.elapsed().as_secs_f64() * 1000.0;
    let (eager_ops, s2) = run(&eager);

    println!("lazy-vs-eager A/B (same runtime, {n} cards):");
    println!("  lazy  (buffer reads, zero overlay alloc): {lazy_ops:.0} ops/s (sink {s1})");
    println!("  eager (full HashMap overlay inflate)     : {eager_ops:.0} ops/s (sink {s2})");
    println!(
        "  eager up-front inflate cost: {:.2} ms; lazy read path is {:.2}x eager",
        inflate_ms,
        lazy_ops / eager_ops
    );
}

#[test]
fn innerhtml_then_query_and_serialize() {
    let mut dom = Dom::parse("<div id=root></div>");
    let root = dom.tree.query_selector("#root").unwrap();
    dom.tree
        .set_inner_html(root, "<ul><li class=x>1</li><li class=x>2</li></ul>");
    assert_eq!(dom.tree.query_selector_all("li.x").len(), 2);
    assert_eq!(dom.tree.text_content(root), "12");
    let html = serialize::serialize_inner(&dom.tree, root);
    assert!(html.starts_with("<ul>"));
}
