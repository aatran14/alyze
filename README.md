# alyze

A high-performance tokenization and analysis implementation for full-text search. Provides a
[UAX #29](https://www.unicode.org/reports/tr29/) compilant tokenizer, implemented with a hand-rolled
deterministic finite automaton (DFA).

This crate is currently in alpha, but we have ambitious to expand the scope of this crate to encompass
a full suite of analysis tools, including stemming, stopword removal, case folding, etc. During alpha
development, backwards compatibility is not guarenteed, but we'll do our best to minimize breaking changes.