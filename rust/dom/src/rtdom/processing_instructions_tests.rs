//! Chrome-mode HTML processing instructions (miaskiewicz/turbo-dom#135). The expected
//! values are Chrome 156's (`innerHTML` / `Document.parseHTMLUnsafe` rows of
//! turbo-dom-browser-env's `processing_instructions_chrome156.json`, which the binding
//! asserts end to end); the default mode keeps html5lib-tests' bogus comment.
use super::{Handle, NodeType, Tree};
use crate::rtdom::serialize::serialize_inner_utf16;

fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}

/// `parent`'s children as Chrome-control descriptions.
fn describe(tree: &Tree, parent: Handle) -> Vec<String> {
    tree.children(parent)
        .into_iter()
        .map(|node| match tree.node_type(node) {
            NodeType::ProcessingInstruction => format!(
                "PI({}|{})",
                String::from_utf16_lossy(&tree.processing_instruction_target_utf16(node).unwrap()),
                String::from_utf16_lossy(&tree.node_value_utf16(node).unwrap())
            ),
            NodeType::Comment => format!(
                "C({})",
                String::from_utf16_lossy(&tree.node_value_utf16(node).unwrap())
            ),
            NodeType::Text => format!(
                "T({})",
                String::from_utf16_lossy(&tree.node_value_utf16(node).unwrap())
            ),
            NodeType::Doctype => "DOCTYPE".to_owned(),
            _ => format!(
                "E({}:{})",
                tree.local_name(node).unwrap(),
                describe(tree, node).join(" ")
            ),
        })
        .collect()
}

fn inner(html: &str) -> (String, String) {
    let mut tree = Tree::parse_utf16_with_processing_instructions(&units("<body>"));
    let body = tree.query_selector("body").unwrap();
    tree.set_inner_html_utf16(body, &units(html));
    (
        describe(&tree, body).join(" "),
        String::from_utf16_lossy(&serialize_inner_utf16(&tree, body)),
    )
}

#[test]
fn inner_html_parses_processing_instructions_like_chrome() {
    let rows: &[(&str, &str, &str)] = &[
        ("<?pi x?>", "PI(pi|x)", "<?pi x?>"),
        (
            "<?xml version=\"1.0\">",
            "C(?xml version=\"1.0\")",
            "<!--?xml version=\"1.0\"-->",
        ),
        ("<?>", "C(?)", "<!--?-->"),
        ("<? x?>", "C(? x?)", "<!--? x?-->"),
        ("<?1x?>", "C(?1x?)", "<!--?1x?-->"),
        ("<?", "", ""),
        ("<?pi", "", ""),
        ("<?pi ", "", ""),
        ("<?pi x", "", ""),
        ("<?pi x?", "", ""),
        ("<?a-", "", ""),
        ("<?a x\0", "", ""),
        ("<?1", "C(?1)", "<!--?1-->"),
        ("<?pi>", "PI(pi|)", "<?pi ?>"),
        ("<?pi?>", "PI(pi|)", "<?pi ?>"),
        ("<?pi x>", "PI(pi|x)", "<?pi x?>"),
        ("<?pi\tx?>", "PI(pi|x)", "<?pi x?>"),
        ("<?pi\nx?>", "PI(pi|x)", "<?pi x?>"),
        ("<?pi\x0cx?>", "PI(pi|x)", "<?pi x?>"),
        ("<?pi\rx?>", "PI(pi|x)", "<?pi x?>"),
        ("<?pi x\r\ny?>", "PI(pi|x\ny)", "<?pi x\ny?>"),
        ("<?PI x?>", "PI(PI|x)", "<?PI x?>"),
        ("<?a1-b_c x?>", "PI(a1-b_c|x)", "<?a1-b_c x?>"),
        ("<?a.b x?>", "C(?a.b x?)", "<!--?a.b x?-->"),
        ("<?a:b x?>", "C(?a:b x?)", "<!--?a:b x?-->"),
        ("<?a/>", "C(?a/)", "<!--?a/-->"),
        ("<?a\x0bb?>", "C(?a\x0bb?)", "<!--?a\x0bb?-->"),
        ("<?é x?>", "C(?é x?)", "<!--?é x?-->"),
        ("<?p\0i x?>", "C(?p\u{fffd}i x?)", "<!--?p\u{fffd}i x?-->"),
        ("<?xml x?>", "C(?xml x?)", "<!--?xml x?-->"),
        ("<?xmL x?>", "C(?xmL x?)", "<!--?xmL x?-->"),
        ("<?xml>", "C(?xml)", "<!--?xml-->"),
        ("<?xml?>", "C(?xml?)", "<!--?xml?-->"),
        ("<?xmlfoo x?>", "PI(xmlfoo|x)", "<?xmlfoo x?>"),
        ("<?xm>", "PI(xm|)", "<?xm ?>"),
        ("<?pi x? y?>", "PI(pi|x? y)", "<?pi x? y?>"),
        ("<?pi a>b?>", "PI(pi|a) T(b?>)", "<?pi a?>b?&gt;"),
        ("<?pi  x  ?>", "PI(pi|x  )", "<?pi x  ?>"),
        ("<?pi x\0y?>", "PI(pi|x\u{fffd}y)", "<?pi x\u{fffd}y?>"),
        ("<?a \0?>", "PI(a|\u{fffd})", "<?a \u{fffd}?>"),
        ("<?pi x??>", "PI(pi|x?)", "<?pi x??>"),
        ("<?a?b?>", "PI(a|?b)", "<?a ?b?>"),
        ("<?a ? >", "PI(a|? )", "<?a ? ?>"),
        ("<?a\n\n?>", "PI(a|)", "<?a ?>"),
        ("<?pi &amp;?>", "PI(pi|&amp;)", "<?pi &amp;?>"),
        ("<!--?pi x?-->", "C(?pi x?)", "<!--?pi x?-->"),
        (
            "<svg><?pi x?></svg>",
            "E(svg:PI(pi|x))",
            "<svg><?pi x?></svg>",
        ),
        (
            "<table><?pi x?></table>",
            "E(table:PI(pi|x))",
            "<table><?pi x?></table>",
        ),
    ];
    for &(html, nodes, serialized) in rows {
        assert_eq!(
            inner(html),
            (nodes.to_owned(), serialized.to_owned()),
            "{html:?}"
        );
    }
}

#[test]
fn lone_surrogates_keep_their_units_in_data_and_break_a_target() {
    let mut tree = Tree::parse_utf16_with_processing_instructions(&units("<body>"));
    let body = tree.query_selector("body").unwrap();
    tree.set_inner_html_utf16(body, &[0x3c, 0x3f, 0x61, 0x20, 0x78, 0xd800, 0x3f, 0x3e]);
    let pi = tree.first_child(body).unwrap();
    assert_eq!(
        tree.processing_instruction_target_utf16(pi),
        Some(units("a"))
    );
    assert_eq!(tree.node_value_utf16(pi), Some(vec![0x78, 0xd800]));
    tree.set_inner_html_utf16(body, &[0x3c, 0x3f, 0x61, 0xd800, 0x3e]);
    let comment = tree.first_child(body).unwrap();
    assert_eq!(tree.node_type(comment), NodeType::Comment);
    assert_eq!(
        tree.node_value_utf16(comment),
        Some(vec![0x3f, 0x61, 0xd800])
    );
}

#[test]
fn the_mode_is_per_tree_and_off_by_default() {
    let mut tree = Tree::parse_utf16(&units("<body>"));
    assert!(!tree.processing_instructions());
    let body = tree.query_selector("body").unwrap();
    tree.set_inner_html_utf16(body, &units("<?pi x?>"));
    assert_eq!(describe(&tree, body), ["C(?pi x?)"]);
    tree.insert_adjacent_html_utf16(body, "beforeend", &units("<?q y?>"));
    assert_eq!(describe(&tree, body), ["C(?pi x?)", "C(?q y?)"]);
    tree.set_processing_instructions(true);
    assert!(tree.processing_instructions());
    tree.insert_adjacent_html_utf16(body, "afterbegin", &units("<?q y?>"));
    let fragment = tree.create_contextual_fragment_utf16(body, &units("<?r z?>"), false);
    assert_eq!(describe(&tree, fragment), ["PI(r|z)"]);
    // Input without `<?` keeps the scalar fast path.
    tree.insert_adjacent_html_utf16(body, "beforeend", &units("<b>x</b>"));
    assert_eq!(
        describe(&tree, body),
        ["PI(q|y)", "C(?pi x?)", "C(?q y?)", "E(b:T(x))"]
    );
    tree.set_processing_instructions(false);
    let fragment = tree.create_contextual_fragment_utf16(body, &units("<?r z?>"), false);
    assert_eq!(describe(&tree, fragment), ["C(?r z?)"]);
}

#[test]
fn documents_parse_processing_instructions_like_chrome() {
    let tree = Tree::parse_utf16_with_processing_instructions(&units("<?a x?><p><?b y?>"));
    assert!(tree.processing_instructions());
    let root = tree.root();
    assert_eq!(describe(&tree, root)[0], "PI(a|x)");
    let p = tree.query_selector("p").unwrap();
    assert_eq!(describe(&tree, p), ["PI(b|y)"]);
    let plain = Tree::parse_utf16_with_processing_instructions(&units("<p>x"));
    assert!(plain.processing_instructions());
    assert_eq!(plain.text_content(plain.query_selector("p").unwrap()), "x");
    // The standard (html5lib-tests) document parse.
    let standard = Tree::parse_utf16(&units("<?a x?>"));
    assert_eq!(describe(&standard, standard.root())[0], "C(?a x?)");
}

#[test]
fn scalar_pages_take_the_fast_path_only_without_a_processing_instruction() {
    use crate::rtdom::serialize::serialize_outer_utf16;
    let dump = |tree: &Tree| {
        tree.children(tree.root())
            .into_iter()
            .map(|node| String::from_utf16_lossy(&serialize_outer_utf16(tree, node)))
            .collect::<Vec<_>>()
    };
    for html in [
        "<!doctype html><title>t</title><p class=a>x<!--c--><svg><g/></svg>",
        "<p>a ? b > c <!-- ? --></p>",
        "",
    ] {
        let scalar = Tree::parse_with_processing_instructions(html);
        let units = Tree::parse_utf16_with_processing_instructions(&units(html));
        assert!(scalar.processing_instructions() && units.processing_instructions());
        assert_eq!(dump(&scalar), dump(&units), "{html:?}");
        assert_eq!(scalar.compat_mode(), units.compat_mode(), "{html:?}");
        assert_eq!(dump(&scalar), dump(&Tree::parse(html)), "{html:?}");
    }
    let tree = Tree::parse_with_processing_instructions("<?a x?><p><?b y?>");
    assert!(tree.processing_instructions());
    assert_eq!(describe(&tree, tree.root())[0], "PI(a|x)");
    assert_eq!(
        describe(&tree, tree.query_selector("p").unwrap()),
        ["PI(b|y)"]
    );
}

#[test]
fn positioned_documents_parse_processing_instructions_like_chrome() {
    let source = units("<?pi x?><!doctype html><p><?q y?>");
    let tree = Tree::parse_utf16_with_source_positions_and_processing_instructions(&source);
    assert!(tree.processing_instructions());
    assert_eq!(describe(&tree, tree.root())[0], "PI(pi|x)");
    let p = tree.query_selector("p").unwrap();
    assert_eq!(describe(&tree, p), ["PI(q|y)"]);
    assert!(tree.source_position(p).is_some());
    // The default positioned parse (the html5lib-tests conformance path).
    let standard = Tree::parse_utf16_with_source_positions(&source);
    assert!(!standard.processing_instructions());
    assert_eq!(describe(&standard, standard.root())[0], "C(?pi x?)");
}
