//! PERF PROBE — not production. Tests whether running K independent DFA cursors interleaved
//! (round-robin, one step each) lifts single-core throughput by giving the out-of-order engine
//! K independent dependency chains to overlap, instead of the one strict left-to-right chain in
//! `super::tokenize`.
//!
//! Each stripe guesses `State::StartOfText` as its entry state (the "speculation"). That makes
//! boundaries at stripe seams potentially wrong, so this is a THROUGHPUT probe only — we compare
//! the breakpoint COUNT against the serial tokenizer as a sanity check, not byte-identical output.
//! If interleaving doesn't beat serial here, intra-document striping won't be worth the seam work.

use crate::uax29::Action;

use super::properties::{
    ASCII_WORD_BREAK_PROP, WordBreakProperty, is_word_like_strict,
    lookup_word_break_property_from_dictionary,
};
use super::transitions::{State, TABLE, Transition};
use super::{ASCII_BYTE_INFO, ASCII_WORD_CONTINUE, TokenProperties, WORD_BREAK_CONTRIB};

enum Step {
    /// Made progress, no breakpoint this step.
    Progress,
    /// Emitted a breakpoint at this byte offset, with these props.
    Break(usize, TokenProperties),
    /// Cursor is finished.
    Done,
}

/// One independent DFA cursor over `bytes[..]`, mirroring the loop body of `super::tokenize`
/// but advancing one logical iteration per `step()` so several cursors can be interleaved.
struct WordCursor<'a> {
    text: &'a str,
    bytes: &'a [u8],
    state: State,
    pos: usize,
    last_was_zwj: bool,
    deferred_break_pos: Option<usize>,
    token_props: TokenProperties,
    deferred_props: TokenProperties,
    /// Finalization stage once `pos` reaches the end: 0 = still running, 1 = need EOT emits, 2 = done.
    fin: u8,
}

impl<'a> WordCursor<'a> {
    fn new(text: &'a str) -> Self {
        Self {
            text,
            bytes: text.as_bytes(),
            state: State::StartOfText,
            pos: 0,
            last_was_zwj: false,
            deferred_break_pos: None,
            token_props: TokenProperties::default(),
            deferred_props: TokenProperties::default(),
            fin: 0,
        }
    }

    #[inline(always)]
    fn step(&mut self) -> Step {
        if self.pos >= self.bytes.len() {
            return self.finalize();
        }

        // Fast path for ASCII word runs (mirrors super::tokenize lines ~93-118).
        if matches!(
            self.state,
            State::ALetter | State::Numeric | State::ExtendNumLet | State::HLetter
        ) {
            let scan_start = self.pos;
            let mut fast_acc: u8 = 0;
            while self.pos < self.bytes.len() && self.bytes[self.pos] < 0x80 {
                let info = ASCII_BYTE_INFO[self.bytes[self.pos] as usize];
                if info & ASCII_WORD_CONTINUE == 0 {
                    break;
                }
                fast_acc |= info;
                self.pos += 1;
            }
            if self.pos > scan_start {
                self.token_props.0 |= fast_acc & !ASCII_WORD_CONTINUE;
                let last = self.bytes[self.pos - 1];
                self.state = match last {
                    b'0'..=b'9' => State::Numeric,
                    b'_' => State::ExtendNumLet,
                    _ => State::ALetter,
                };
                self.last_was_zwj = false;
                return Step::Progress;
            }
        }

        let b = self.bytes[self.pos];
        let (c, prop, char_len, char_props) = if b < 0x80 {
            (
                b as char,
                ASCII_WORD_BREAK_PROP[b as usize],
                1usize,
                TokenProperties(ASCII_BYTE_INFO[b as usize] & !ASCII_WORD_CONTINUE),
            )
        } else {
            let c = self.text[self.pos..].chars().next().unwrap();
            let prop = lookup_word_break_property_from_dictionary(c);
            let mut char_props = TokenProperties::NON_ASCII;
            char_props |= WORD_BREAK_CONTRIB[prop as usize];
            if !char_props.is_word_like() && is_word_like_strict(c) {
                char_props |= TokenProperties::WORD_LIKE;
            }
            (c, prop, c.len_utf8(), char_props)
        };

        let Transition(next_state, action) = TABLE[self.state as usize][prop as usize];
        match action {
            Action::Break => {
                let boundary = self.pos;
                self.pos += char_len;
                if self.last_was_zwj {
                    self.last_was_zwj = false;
                    if WordBreakProperty::is_ext_pictographic(c) {
                        self.token_props |= char_props;
                        return Step::Progress;
                    }
                }
                self.last_was_zwj = prop == WordBreakProperty::ZWJ;
                self.state = next_state;
                let emitted = core::mem::take(&mut self.token_props);
                self.token_props |= char_props;
                Step::Break(boundary, emitted)
            }
            Action::NoBreak => {
                self.last_was_zwj = false;
                if next_state.is_deferred() {
                    if self.deferred_break_pos.is_none() {
                        self.deferred_break_pos = Some(self.pos);
                    }
                    self.deferred_props |= char_props;
                } else {
                    if self.deferred_break_pos.take().is_some() {
                        self.token_props |= core::mem::take(&mut self.deferred_props);
                    }
                    self.token_props |= char_props;
                }
                self.state = next_state;
                self.pos += char_len;
                Step::Progress
            }
            Action::DeferredBreak => {
                self.last_was_zwj = false;
                let boundary = self.deferred_break_pos.take().unwrap();
                self.state = next_state;
                Step::Break(boundary, core::mem::take(&mut self.token_props))
                // deferred_props fold into next token; applied lazily on next NoBreak.
            }
            Action::Transparent => {
                self.last_was_zwj = prop == WordBreakProperty::ZWJ;
                self.pos += char_len;
                if self.deferred_break_pos.is_some() {
                    self.deferred_props |= char_props;
                } else {
                    self.token_props |= char_props;
                }
                Step::Progress
            }
        }
    }

    #[cold]
    fn finalize(&mut self) -> Step {
        match self.fin {
            0 => {
                if self.state.is_deferred() {
                    let bp = self.deferred_break_pos.take().unwrap();
                    self.fin = 1;
                    return Step::Break(bp, core::mem::take(&mut self.token_props));
                }
                self.fin = 1;
                self.finalize()
            }
            1 => {
                self.fin = 2;
                Step::Break(self.text.len(), self.token_props)
            }
            _ => Step::Done,
        }
    }
}

/// Interleaved K-stripe speculative tokenizer (throughput probe). Splits `text` into K stripes at
/// char boundaries, runs K cursors round-robin, and reports every breakpoint via `on_breakpoint`
/// (out of order — fine for counting). Returns nothing useful beyond what the callback collects.
pub fn tokenize_striped<const K: usize>(
    text: &str,
    mut on_breakpoint: impl FnMut(usize, TokenProperties),
) {
    if text.is_empty() {
        return;
    }
    if K <= 1 {
        let mut cur = WordCursor::new(text);
        loop {
            match cur.step() {
                Step::Break(bp, p) => on_breakpoint(bp, p),
                Step::Progress => {}
                Step::Done => break,
            }
        }
        return;
    }

    // Build K stripes on char boundaries. Offsets are absolute into `text`; each cursor sees its
    // own subslice and reports breakpoints relative to that subslice's start.
    let n = text.len();
    let mut bounds = [0usize; 32]; // supports K up to 31 stripes + end
    let kk = K.min(31);
    for i in 0..=kk {
        let mut off = (n * i) / kk;
        while off < n && !text.is_char_boundary(off) {
            off += 1;
        }
        bounds[i] = off;
    }

    let mut cursors: Vec<(usize, WordCursor)> = Vec::with_capacity(kk);
    for i in 0..kk {
        let (a, b) = (bounds[i], bounds[i + 1]);
        if a < b {
            cursors.push((a, WordCursor::new(&text[a..b])));
        }
    }

    // Round-robin: one step per cursor per pass. Independent cursors → independent dep chains.
    let mut active = cursors.len();
    while active > 0 {
        active = 0;
        for (base, cur) in cursors.iter_mut() {
            // Drive each cursor one logical step this pass; skip if already Done.
            match cur.step() {
                Step::Break(bp, p) => {
                    on_breakpoint(*base + bp, p);
                    active += 1;
                }
                Step::Progress => active += 1,
                Step::Done => {}
            }
        }
    }
}
