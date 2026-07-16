# alyze

A high-performance tokenization and analysis implementation for full-text search. Provides a
[UAX #29](https://www.unicode.org/reports/tr29/) compliant tokenizer, implemented with a hand-rolled
deterministic finite automaton (DFA). Includes a complete analyzer implementation, with support for
lowercasing, ASCII case folding, stemming & stopword removal.

Currently in production at [turbopuffer](https://turbopuffer.com) powering the `word_v4` tokenizer.

### Benchmarks

Throughput over 64 MiB of English Wikipedia article text (`cargo bench`), running on an M5 Pro.
Numbers are the median of 16 samples.

**Tokenization** (`benches/wikipedia.rs`, `wikipedia` group):

| Benchmark                | Throughput |
| ------------------------ | ---------- |
| word break               | 529 MiB/s  |
| word break + `word_like` | 491 MiB/s  |
| sentence break           | 468 MiB/s  |

**Analysis** (`benches/wikipedia.rs`, `analysis` group) — each row adds one stage to the pipeline,
so the deltas approximate each filter's marginal cost:

| Pipeline                                              | Throughput |
| ----------------------------------------------------- | ---------- |
| tokenize only (case sensitive)                        | 402 MiB/s  |
| + lowercase                                           | 375 MiB/s  |
| + stopword removal (English)                          | 316 MiB/s  |
| + stemming (English)                                  | 139 MiB/s  |
| full (max length + stopwords + stemming + ASCII fold) | 134 MiB/s  |

Reproduce with `cargo bench --bench wikipedia` (first run downloads the Wikipedia dataset into
`.cache/`).
