//! In-crate tests of the selector module's private helpers (P5-cov).
use super::{bounded_insert, CACHE_CAP};
use rustc_hash::FxHashMap;

#[test]
fn bounded_caches_clear_wholesale_at_capacity() {
    let mut map = FxHashMap::default();
    for key in 0..CACHE_CAP {
        bounded_insert(&mut map, key, key * 2);
    }
    assert_eq!(map.len(), CACHE_CAP);
    assert_eq!(map.get(&(CACHE_CAP - 1)), Some(&((CACHE_CAP - 1) * 2)));
    // the next distinct key clears the full map first, then is inserted
    bounded_insert(&mut map, CACHE_CAP, 7);
    assert_eq!(map.len(), 1);
    assert_eq!(map.get(&CACHE_CAP), Some(&7));
    assert_eq!(map.get(&0), None);
    // below capacity nothing is evicted, and an existing key is overwritten in place
    bounded_insert(&mut map, CACHE_CAP, 8);
    bounded_insert(&mut map, 1, 1);
    assert_eq!(map.len(), 2);
    assert_eq!(map.get(&CACHE_CAP), Some(&8));
}
