//! Pure-Rust port of the Location + History surface from
//! `src/runtime/stubs.mjs` (`makeLocation` / `makeHistory`).
//!
//! Standalone: no Tree dependency, no wasm/napi, no external crates. The JS
//! relies on the host `URL`; here we hand-parse the href (no `url` crate in
//! deps). Field semantics mirror the WHATWG `URL` fields the JS exposes:
//!   * `href`     — the parsed/normalized href
//!   * `protocol` — scheme + ":" (e.g. "https:")
//!   * `host`     — hostname[:port]
//!   * `hostname` — host without port
//!   * `port`     — port digits ("" if none)
//!   * `pathname` — path (defaults "/")
//!   * `search`   — query incl. leading "?" ("" if none)
//!   * `hash`     — fragment incl. leading "#" ("" if none)
//!   * `origin`   — protocol + "//" + host

/// Parsed location surface (mirrors `makeLocation`).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Location {
    pub href: String,
    pub protocol: String,
    pub host: String,
    pub hostname: String,
    pub port: String,
    pub pathname: String,
    pub search: String,
    pub hash: String,
    pub origin: String,
}

impl Location {
    /// Hand-parse an href into its component fields.
    ///
    /// Grammar handled: `scheme:` then optional `//authority`, then
    /// `path`, then optional `?query`, then optional `#fragment`.
    #[must_use]
    pub fn parse(href: &str) -> Location {
        // Split off the fragment first (everything after the first '#').
        let (before_hash, hash) = match href.find('#') {
            Some(i) => (&href[..i], href[i..].to_string()),
            None => (href, String::new()),
        };

        // Split off the query (everything after the first '?').
        let (before_query, search) = match before_hash.find('?') {
            Some(i) => (&before_hash[..i], before_hash[i..].to_string()),
            None => (before_hash, String::new()),
        };

        // Scheme: leading run up to the first ':'.
        let (protocol, after_scheme) = match before_query.find(':') {
            Some(i) => {
                let scheme = &before_query[..=i]; // include the ':'
                (scheme.to_string(), &before_query[i + 1..])
            }
            None => (String::new(), before_query),
        };

        // Optional `//authority`.
        let (authority, pathname) = if let Some(rest) = after_scheme.strip_prefix("//") {
            // Authority runs until the next '/' (or end-of-string).
            match rest.find('/') {
                Some(i) => (&rest[..i], &rest[i..]),
                None => (rest, ""),
            }
        } else {
            // No authority: everything left is the path.
            ("", after_scheme)
        };

        // Bracketed IPv6 literals may contain colons; only parse the port after `]`.
        let (hostname, port) = if let Some(bracket_end) = authority.find(']') {
            let hostname = authority[..=bracket_end].to_string();
            let port = authority[bracket_end + 1..]
                .strip_prefix(':')
                .unwrap_or("")
                .to_string();
            (hostname, port)
        } else {
            match authority.rfind(':') {
                Some(i) => (authority[..i].to_string(), authority[i + 1..].to_string()),
                None => (authority.to_string(), String::new()),
            }
        };

        // host = hostname[:port]
        let host = if port.is_empty() {
            hostname.clone()
        } else {
            format!("{hostname}:{port}")
        };

        // pathname defaults to "/".
        let pathname = if pathname.is_empty() {
            "/".to_string()
        } else {
            pathname.to_string()
        };

        // origin = protocol + "//" + host (mirrors URL.origin for hierarchical URLs).
        let origin = format!("{protocol}//{host}");

        Location {
            href: href.to_string(),
            protocol,
            host,
            hostname,
            port,
            pathname,
            search,
            hash,
            origin,
        }
    }

    /// Resolve a URL reference against a base URL using the common hierarchical
    /// URL forms accepted by `history.pushState` and `replaceState`.
    #[must_use]
    pub fn resolve(reference: &str, base_href: &str) -> Location {
        if has_scheme(reference) {
            return Self::parse(reference);
        }
        let base = Self::parse(base_href);
        if base.protocol.is_empty() || base.host.is_empty() {
            return Self::parse(reference);
        }
        let authority = format!("{}//{}", base.protocol, base.host);
        if let Some(rest) = reference.strip_prefix("//") {
            return Self::parse(&format!("{}//{rest}", base.protocol));
        }
        if reference.is_empty() {
            return base;
        }
        if reference.starts_with('#') {
            let href = base_href.split('#').next().unwrap_or(base_href);
            return Self::parse(&format!("{href}{reference}"));
        }
        if reference.starts_with('?') {
            let href = base_href.split(['?', '#']).next().unwrap_or(base_href);
            return Self::parse(&format!("{href}{reference}"));
        }
        let (path, suffix) = split_url_suffix(reference);
        let merged_path =
            if path.starts_with('/') {
                path.to_string()
            } else {
                let base_path = base.pathname.rsplit_once('/').map_or("/", |(dir, _)| {
                    if dir.is_empty() {
                        "/"
                    } else {
                        dir
                    }
                });
                format!("{base_path}/{path}")
            };
        let normalized = normalize_path(&merged_path);
        Self::parse(&format!("{authority}{normalized}{suffix}"))
    }
}

fn has_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    let mut chars = scheme.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
        })
}

fn split_url_suffix(value: &str) -> (&str, &str) {
    value
        .find(['?', '#'])
        .map_or((value, ""), |index| (&value[..index], &value[index..]))
}

fn normalize_path(path: &str) -> String {
    let trailing_slash = path.ends_with('/') || path.ends_with("/.") || path.ends_with("/..");
    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }
    let mut normalized = format!("/{}", segments.join("/"));
    if trailing_slash && !normalized.ends_with('/') {
        normalized.push('/');
    }
    normalized
}

/// One entry on the history stack.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Entry {
    state: String,
    url: String,
}

/// Browser-like history stack (mirrors `makeHistory`).
#[derive(Debug, Clone)]
pub struct History {
    stack: Vec<Entry>,
    idx: usize,
    location: Location,
}

impl History {
    /// Seed the stack with the initial location (state = "").
    #[must_use]
    pub fn new(initial: Location) -> History {
        let url = initial.href.clone();
        History {
            stack: vec![Entry {
                state: String::new(),
                url,
            }],
            idx: 0,
            location: initial,
        }
    }

    /// Push a new entry, truncating any forward entries (browser semantics).
    pub fn push_state(&mut self, state: String, url: Option<&str>) {
        let url = url.map_or_else(
            || self.current_url().to_string(),
            |reference| Location::resolve(reference, &self.location.href).href,
        );
        self.stack.truncate(self.idx + 1);
        self.stack.push(Entry { state, url });
        self.idx += 1;
        self.sync_location();
    }

    /// Replace the current entry in place (url defaults to the current url).
    pub fn replace_state(&mut self, state: String, url: Option<&str>) {
        let url = url.map_or_else(
            || self.stack[self.idx].url.clone(),
            |reference| Location::resolve(reference, &self.location.href).href,
        );
        self.stack[self.idx] = Entry { state, url };
        self.location = Location::parse(&self.stack[self.idx].url);
    }

    /// Move back one entry (clamped at 0).
    pub fn back(&mut self) {
        if self.idx > 0 {
            self.idx -= 1;
            self.sync_location();
        }
    }

    /// Move forward one entry (clamped at the top).
    pub fn forward(&mut self) {
        if self.idx < self.stack.len() - 1 {
            self.idx += 1;
            self.sync_location();
        }
    }

    /// Move by `delta` entries, clamped to `[0, len-1]`.
    pub fn go(&mut self, delta: i32) {
        let target = self.idx as i64 + i64::from(delta);
        let max = self.stack.len() as i64 - 1;
        let clamped = target.max(0).min(max);
        self.idx = clamped as usize;
        self.sync_location();
    }

    /// Number of entries on the stack.
    #[must_use]
    pub fn length(&self) -> usize {
        self.stack.len()
    }

    /// The location this history was seeded with.
    #[must_use]
    pub fn current(&self) -> &Location {
        &self.location
    }

    /// URL of the current history entry.
    #[must_use]
    pub fn current_url(&self) -> &str {
        &self.stack[self.idx].url
    }

    /// The state of the current entry.
    #[must_use]
    pub fn state(&self) -> &str {
        &self.stack[self.idx].state
    }

    fn sync_location(&mut self) {
        self.location = Location::parse(&self.stack[self.idx].url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_full_url() {
        let l = Location::parse("https://a.com:8080/p/q?x=1&y=2#sec");
        assert_eq!(l.href, "https://a.com:8080/p/q?x=1&y=2#sec");
        assert_eq!(l.protocol, "https:");
        assert_eq!(l.host, "a.com:8080");
        assert_eq!(l.hostname, "a.com");
        assert_eq!(l.port, "8080");
        assert_eq!(l.pathname, "/p/q");
        assert_eq!(l.search, "?x=1&y=2");
        assert_eq!(l.hash, "#sec");
        assert_eq!(l.origin, "https://a.com:8080");
    }

    #[test]
    fn parse_localhost_no_port() {
        let l = Location::parse("http://localhost/");
        assert_eq!(l.protocol, "http:");
        assert_eq!(l.host, "localhost");
        assert_eq!(l.hostname, "localhost");
        assert_eq!(l.port, "");
        assert_eq!(l.pathname, "/");
        assert_eq!(l.search, "");
        assert_eq!(l.hash, "");
        assert_eq!(l.origin, "http://localhost");
    }

    #[test]
    fn parse_authority_no_path() {
        // No trailing slash after authority -> pathname defaults to "/".
        let l = Location::parse("https://example.com");
        assert_eq!(l.hostname, "example.com");
        assert_eq!(l.port, "");
        assert_eq!(l.pathname, "/");
        assert_eq!(l.host, "example.com");
        assert_eq!(l.origin, "https://example.com");
    }

    #[test]
    fn parse_ipv6_authority_and_port() {
        let l = Location::parse("https://[2001:db8::1]:8443/path");
        assert_eq!(l.hostname, "[2001:db8::1]");
        assert_eq!(l.port, "8443");
        assert_eq!(l.host, "[2001:db8::1]:8443");
        assert_eq!(l.origin, "https://[2001:db8::1]:8443");
        assert_eq!(l.pathname, "/path");
    }

    #[test]
    fn parse_ipv6_authority_without_port() {
        let l = Location::parse("http://[::1]/");
        assert_eq!(l.hostname, "[::1]");
        assert_eq!(l.port, "");
        assert_eq!(l.host, "[::1]");
    }

    #[test]
    fn resolve_history_urls_against_current_base() {
        let base = "https://example.test/dir/page?old=1#old";
        assert_eq!(
            Location::resolve("/root", base).href,
            "https://example.test/root"
        );
        assert_eq!(
            Location::resolve("next", base).href,
            "https://example.test/dir/next"
        );
        assert_eq!(
            Location::resolve("../up", base).href,
            "https://example.test/up"
        );
        assert_eq!(
            Location::resolve("?new=2", base).href,
            "https://example.test/dir/page?new=2"
        );
        assert_eq!(
            Location::resolve("#new", base).href,
            "https://example.test/dir/page?old=1#new"
        );
        assert_eq!(
            Location::resolve("//other.test/x", base).href,
            "https://other.test/x"
        );
    }

    #[test]
    fn parse_path_only_relative() {
        // No scheme, no authority: everything is the path.
        let l = Location::parse("/foo/bar?q=1#frag");
        assert_eq!(l.protocol, "");
        assert_eq!(l.host, "");
        assert_eq!(l.hostname, "");
        assert_eq!(l.port, "");
        assert_eq!(l.pathname, "/foo/bar");
        assert_eq!(l.search, "?q=1");
        assert_eq!(l.hash, "#frag");
        assert_eq!(l.origin, "//");
    }

    #[test]
    fn parse_default_location() {
        // Default impl gives all-empty fields.
        let l = Location::default();
        assert_eq!(l.href, "");
        assert_eq!(l.pathname, "");
    }

    #[test]
    fn history_push_replace_back_forward_go() {
        let l = Location::parse("http://localhost/");
        let mut h = History::new(l.clone());
        assert_eq!(h.length(), 1);
        assert_eq!(h.state(), "");
        assert_eq!(h.current(), &l);

        // push two entries
        h.push_state("s1".to_string(), Some("/a"));
        assert_eq!(h.current_url(), "http://localhost/a");
        assert_eq!(h.current().pathname, "/a");
        h.push_state("s2".to_string(), None); // URL defaults to the current entry.
        assert_eq!(h.length(), 3);
        assert_eq!(h.state(), "s2");

        // back twice (second back clamps progress, not below 0)
        h.back();
        assert_eq!(h.state(), "s1");
        assert_eq!(h.current().pathname, "/a");
        h.back();
        assert_eq!(h.state(), "");
        assert_eq!(h.current().pathname, "/");
        h.back(); // clamp at 0
        assert_eq!(h.state(), "");

        // forward
        h.forward();
        assert_eq!(h.state(), "s1");
        assert_eq!(h.current().pathname, "/a");

        // replace current entry (no url -> keeps current url)
        h.replace_state("s1b".to_string(), None);
        assert_eq!(h.state(), "s1b");
        h.replace_state("s1c".to_string(), Some("../changed"));
        assert_eq!(h.state(), "s1c");
        assert_eq!(h.current().href, "http://localhost/changed");

        // push from idx=1 truncates the forward entry (was "s2"), then re-adds
        h.push_state("s3".to_string(), Some("/c"));
        assert_eq!(h.length(), 3);
        assert_eq!(h.state(), "s3");

        // forward at the top is a no-op (clamp)
        h.forward();
        assert_eq!(h.state(), "s3");

        // go: negative, positive, and over-shoot clamps
        h.go(-2);
        assert_eq!(h.state(), "");
        h.go(100); // clamp to top
        assert_eq!(h.state(), "s3");
        h.go(-100); // clamp to 0
        assert_eq!(h.state(), "");
        h.go(0); // no movement
        assert_eq!(h.state(), "");
    }
}
