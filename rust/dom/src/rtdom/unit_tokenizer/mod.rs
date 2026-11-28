// Copyright 2014-2017 The html5ever Project Developers. See the
// COPYRIGHT file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! The HTML5 tokenizer.

pub use self::interface::{CharacterTokens, EOFToken, NullCharacterToken, ParseError};
pub use self::interface::{CommentToken, DoctypeToken, TagToken, Token};
pub use self::interface::{Doctype, EndTag, StartTag, Tag, TagKind};
pub use self::interface::{TokenSink, TokenSinkResult};

use self::states::{DoctypeIdKind, Public, System};
use self::states::{DoubleEscaped, Escaped};
use self::states::{DoubleQuoted, SingleQuoted, Unquoted};
use self::states::{RawKind, ScriptEscapeKind};
use self::states::{Rawtext, Rcdata, ScriptData, ScriptDataEscaped};

use self::char_ref::{CharRef, CharRefTokenizer};

fn lower_ascii_letter(c: char) -> Option<char> {
    c.is_ascii_alphabetic().then(|| c.to_ascii_lowercase())
}

use html5ever::{ns, small_char_set, TokenizerResult};
use log::{debug, trace};
use std::borrow::Cow::{self, Borrowed};
use std::cell::{Cell, RefCell, RefMut};
use std::mem;

use self::macros::unwrap_or_return;
pub use html5ever::buffer_queue::{BufferQueue, FromSet, NotFromSet, SetResult};
use html5ever::tendril::StrTendril;
use html5ever::{Attribute, LocalName, QualName, SmallCharSet};

mod char_ref;
mod interface {
    pub use html5ever::tokenizer::*;
}
mod macros;
pub use html5ever::tokenizer::states;

/// The result of invoking the tokenizer once.
pub enum ProcessResult<Handle> {
    /// The tokenizer should be re-invoked immediately.
    Continue,
    /// The tokenizer has not finished, but it needs to wait for more
    /// input to arrive before it can continue.
    Suspend,
    /// The tokenizer was blocked by a `<script>`.
    ///
    /// This `<script>` needs to be executed before tokenization
    /// can continue, as it might invoke `document.write`.
    Script(Handle),
    /// The tokenizer was blocked because it found a `<meta charset>` tag.
    ///
    /// Such tags may force the user agent to re-parse the document with the new
    /// encoding, but non-conformant implementations can reasonably treat
    /// this as [Self::Continue].
    EncodingIndicator(StrTendril),
}

fn option_push(opt_str: &mut Option<StrTendril>, c: char) {
    match *opt_str {
        Some(ref mut s) => s.push_char(c),
        None => *opt_str = Some(StrTendril::from_char(c)),
    }
}

/// Tokenizer options, with a derived `Default`.
///
/// The native adapter never discards a leading U+FEFF (it is DOM-string content),
/// reports parse errors in the inexact form, and never profiles, so upstream's
/// `exact_errors`, `discard_bom` and `profile` options are not carried.
#[derive(Clone, Default)]
pub struct TokenizerOpts {
    /// Initial state override.  Only the test runner should use
    /// a non-`None` value!
    pub initial_state: Option<states::State>,

    /// Last start tag.  Only the test runner should use a
    /// non-`None` value!
    ///
    /// FIXME: Can't use Tendril because we want TokenizerOpts
    /// to be Send.
    pub last_start_tag_name: Option<String>,

    /// Tokenize `<?target data?>` as a processing instruction like Chrome 156
    /// (miaskiewicz/turbo-dom#135) instead of the HTML standard's bogus comment, which
    /// html5lib-tests (and so the conformance gates) still expect. A parsed instruction
    /// is emitted as a comment token whose text starts with [`PROCESSING_INSTRUCTION`].
    pub processing_instructions: bool,
}

/// The prefix of a comment token that carries a processing instruction: `target`, one
/// space, then `data` follow it. The escape transport never produces `U+F0000` followed
/// by `U+F0001` (an escape is followed by itself or by a lone-unit code point at or above
/// `U+F0800`), so no parsed comment starts with it.
pub const PROCESSING_INSTRUCTION: &str = "\u{f0000}\u{f0001}";

/// Where a Chrome-mode processing instruction is (`Off` outside one).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Instruction {
    Off,
    Start,
    Target,
    AfterTarget,
    Data,
}

/// The HTML tokenizer.
pub struct Tokenizer<Sink> {
    /// Destination for tokens we emit.
    pub sink: Sink,

    /// The abstract machine state as described in the spec.
    state: Cell<states::State>,

    /// Are we at the end of the file, once buffers have been processed
    /// completely? This affects whether we will wait for lookahead or not.
    at_eof: Cell<bool>,

    /// Tokenizer for character references, if we're tokenizing
    /// one at the moment.
    char_ref_tokenizer: RefCell<Option<CharRefTokenizer>>,

    /// Current input character.  Just consumed, may reconsume.
    current_char: Cell<char>,

    /// Should we reconsume the current input character?
    reconsume: Cell<bool>,

    /// Did we just consume \r, translating it to \n?  In that case we need
    /// to ignore the next character if it's \n.
    ignore_lf: Cell<bool>,

    /// Current tag kind.
    current_tag_kind: Cell<TagKind>,

    /// Current tag name.
    current_tag_name: RefCell<StrTendril>,

    /// Current tag is self-closing?
    current_tag_self_closing: Cell<bool>,

    /// Current tag had duplicate attributes?
    current_tag_had_duplicate_attributes: Cell<bool>,

    /// Current tag attributes.
    current_tag_attrs: RefCell<Vec<Attribute>>,

    /// Current attribute name.
    current_attr_name: RefCell<StrTendril>,

    /// Current attribute value.
    current_attr_value: RefCell<StrTendril>,

    /// Current comment.
    current_comment: RefCell<StrTendril>,

    /// Current doctype token.
    current_doctype: RefCell<Doctype>,

    /// Last start tag name, for use in checking "appropriate end tag".
    last_start_tag_name: RefCell<Option<LocalName>>,

    /// The "temporary buffer" mentioned in the spec.
    temp_buf: RefCell<StrTendril>,

    /// Track current line
    current_line: Cell<u64>,

    /// [`TokenizerOpts::processing_instructions`].
    processing_instructions: bool,

    /// The processing instruction being tokenized (in the bogus-comment state).
    instruction: Cell<Instruction>,
}

impl<Sink: TokenSink> Tokenizer<Sink> {
    /// Create a new tokenizer which feeds tokens to a particular `TokenSink`.
    pub fn new(sink: Sink, opts: TokenizerOpts) -> Tokenizer<Sink> {
        let start_tag_name = opts.last_start_tag_name.map(|s| LocalName::from(&*s));
        let state = opts.initial_state.unwrap_or(states::Data);
        Tokenizer {
            sink,
            state: Cell::new(state),
            char_ref_tokenizer: RefCell::new(None),
            at_eof: Cell::new(false),
            current_char: Cell::new('\0'),
            reconsume: Cell::new(false),
            ignore_lf: Cell::new(false),
            current_tag_kind: Cell::new(StartTag),
            current_tag_name: RefCell::new(StrTendril::new()),
            current_tag_self_closing: Cell::new(false),
            current_tag_had_duplicate_attributes: Cell::new(false),
            current_tag_attrs: RefCell::new(vec![]),
            current_attr_name: RefCell::new(StrTendril::new()),
            current_attr_value: RefCell::new(StrTendril::new()),
            current_comment: RefCell::new(StrTendril::new()),
            current_doctype: RefCell::new(Doctype::default()),
            last_start_tag_name: RefCell::new(start_tag_name),
            temp_buf: RefCell::new(StrTendril::new()),
            current_line: Cell::new(1),
            processing_instructions: opts.processing_instructions,
            instruction: Cell::new(Instruction::Off),
        }
    }

    /// Feed an input string into the tokenizer.
    pub fn feed(&self, input: &BufferQueue) -> TokenizerResult<Sink::Handle> {
        if input.is_empty() {
            return TokenizerResult::Done;
        }

        self.run(input)
    }

    fn process_token(&self, token: Token) -> TokenSinkResult<Sink::Handle> {
        self.sink.process_token(token, self.current_line.get())
    }

    fn process_token_and_continue(&self, token: Token) {
        let result = self.process_token(token);
        assert!(matches!(result, TokenSinkResult::Continue));
    }

    //§ preprocessing-the-input-stream
    // Get the next input character, which might be the character
    // 'c' that we already consumed from the buffers.
    fn get_preprocessed_char(&self, mut c: char, input: &BufferQueue) -> Option<char> {
        if self.ignore_lf.get() {
            self.ignore_lf.set(false);
            if c == '\n' {
                c = input.next()?;
            }
        }

        if c == '\r' {
            self.ignore_lf.set(true);
            c = '\n';
        }

        if c == '\n' {
            self.current_line.set(self.current_line.get() + 1);
        }

        trace!("got character {c}");
        self.current_char.set(c);
        Some(c)
    }

    //§ tokenization
    // Get the next input character, if one is available.
    fn get_char(&self, input: &BufferQueue) -> Option<char> {
        if self.reconsume.get() {
            self.reconsume.set(false);
            Some(self.current_char.get())
        } else {
            input
                .next()
                .and_then(|c| self.get_preprocessed_char(c, input))
        }
    }

    fn pop_except_from(&self, input: &BufferQueue, set: SmallCharSet) -> Option<SetResult> {
        // Bail to the slow path for various corner cases.
        // This means that `FromSet` can contain characters not in the set!
        // It shouldn't matter because the fallback `FromSet` case should
        // always do the same thing as the `NotFromSet` case.
        if self.reconsume.get() || self.ignore_lf.get() {
            return self.get_char(input).map(FromSet);
        }

        let d = input.pop_except_from(set);
        trace!("got characters {d:?}");
        match d {
            Some(FromSet(c)) => self.get_preprocessed_char(c, input).map(FromSet),

            // NB: We don't set self.current_char for a run of characters not
            // in the set.  It shouldn't matter for the codepaths that use
            // this.
            _ => d,
        }
    }

    // Check if the next characters are an ASCII case-insensitive match.  See
    // BufferQueue::eat.
    //
    // NB: this doesn't set the current input character.
    fn eat(&self, input: &BufferQueue, pat: &str, eq: fn(&u8, &u8) -> bool) -> Option<bool> {
        if self.ignore_lf.get() {
            self.ignore_lf.set(false);
            if self.peek(input) == Some('\n') {
                self.discard_char(input);
            }
        }

        input.push_front(mem::take(&mut self.temp_buf.borrow_mut()));
        match input.eat(pat, eq) {
            None if self.at_eof.get() => Some(false),
            None => {
                while let Some(data) = input.next() {
                    self.temp_buf.borrow_mut().push_char(data);
                }
                None
            }
            Some(matched) => Some(matched),
        }
    }

    /// Run the state machine for as long as we can.
    fn run(&self, input: &BufferQueue) -> TokenizerResult<Sink::Handle> {
        loop {
            match self.step(input) {
                ProcessResult::Continue => (),
                ProcessResult::Suspend => break,
                ProcessResult::Script(node) => return TokenizerResult::Script(node),
                ProcessResult::EncodingIndicator(encoding) => {
                    return TokenizerResult::EncodingIndicator(encoding)
                }
            }
        }
        TokenizerResult::Done
    }

    #[inline]
    fn bad_char_error(&self) {
        #[cfg(feature = "trace_tokenizer")]
        trace!("  error");

        let c = self.current_char.get();
        let state = self.state.get();
        self.emit_error(Cow::from(format!("Saw {c} in state {state:?}")));
    }

    #[inline]
    fn bad_eof_error(&self) {
        #[cfg(feature = "trace_tokenizer")]
        trace!("  error_eof");

        let state = self.state.get();
        self.emit_error(Cow::from(format!("Saw EOF in state {state:?}")));
    }

    fn emit_char(&self, c: char) {
        #[cfg(feature = "trace_tokenizer")]
        trace!("  emit");

        self.process_token_and_continue(match c {
            '\0' => NullCharacterToken,
            _ => CharacterTokens(StrTendril::from_char(c)),
        });
    }

    // The string must not contain '\0'!
    fn emit_chars(&self, b: StrTendril) {
        self.process_token_and_continue(CharacterTokens(b));
    }

    fn emit_current_tag(&self) -> ProcessResult<Sink::Handle> {
        self.finish_attribute();

        let name = LocalName::from(&**self.current_tag_name.borrow());
        self.current_tag_name.borrow_mut().clear();

        match self.current_tag_kind.get() {
            StartTag => {
                *self.last_start_tag_name.borrow_mut() = Some(name.clone());
            }
            EndTag => {
                if !self.current_tag_attrs.borrow().is_empty() {
                    self.emit_error(Borrowed("Attributes on an end tag"));
                }
                if self.current_tag_self_closing.get() {
                    self.emit_error(Borrowed("Self-closing end tag"));
                }
            }
        }

        let token = TagToken(Tag {
            kind: self.current_tag_kind.get(),
            name,
            self_closing: self.current_tag_self_closing.get(),
            attrs: std::mem::take(&mut self.current_tag_attrs.borrow_mut()),
            had_duplicate_attributes: self.current_tag_had_duplicate_attributes.get(),
        });

        match self.process_token(token) {
            TokenSinkResult::Continue => ProcessResult::Continue,
            TokenSinkResult::Plaintext => {
                self.state.set(states::Plaintext);
                ProcessResult::Continue
            }
            TokenSinkResult::Script(node) => {
                self.state.set(states::Data);
                ProcessResult::Script(node)
            }
            TokenSinkResult::RawData(kind) => {
                self.state.set(states::RawData(kind));
                ProcessResult::Continue
            }
            TokenSinkResult::EncodingIndicator(encoding) => {
                ProcessResult::EncodingIndicator(encoding)
            }
        }
    }

    fn emit_temp_buf(&self) {
        #[cfg(feature = "trace_tokenizer")]
        trace!("  emit_temp");

        // FIXME: Make sure that clearing on emit is spec-compatible.
        let buf = mem::take(&mut *self.temp_buf.borrow_mut());
        self.emit_chars(buf);
    }

    fn clear_temp_buf(&self) {
        // Do this without a new allocation.
        self.temp_buf.borrow_mut().clear();
    }

    fn emit_current_comment(&self) {
        let comment = mem::take(&mut *self.current_comment.borrow_mut());
        self.process_token_and_continue(CommentToken(comment));
    }

    fn discard_tag(&self) {
        self.current_tag_name.borrow_mut().clear();
        self.current_tag_self_closing.set(false);
        self.current_tag_had_duplicate_attributes.set(false);
        *self.current_tag_attrs.borrow_mut() = vec![];
    }

    fn create_tag(&self, kind: TagKind, c: char) {
        self.discard_tag();
        self.current_tag_name.borrow_mut().push_char(c);
        self.current_tag_kind.set(kind);
    }

    fn have_appropriate_end_tag(&self) -> bool {
        match self.last_start_tag_name.borrow().as_ref() {
            Some(last) => {
                (self.current_tag_kind.get() == EndTag)
                    && (**self.current_tag_name.borrow() == **last)
            }
            None => false,
        }
    }

    fn create_attribute(&self, c: char) {
        self.finish_attribute();

        self.current_attr_name.borrow_mut().push_char(c);
    }

    fn finish_attribute(&self) {
        if self.current_attr_name.borrow().is_empty() {
            return;
        }

        // Check for a duplicate attribute.
        // FIXME: the spec says we should error as soon as the name is finished.
        let dup = {
            let name = &*self.current_attr_name.borrow();
            self.current_tag_attrs
                .borrow()
                .iter()
                .any(|a| *a.name.local == **name)
        };

        if dup {
            self.emit_error(Borrowed("Duplicate attribute"));
            self.current_tag_had_duplicate_attributes.set(true);
            self.current_attr_name.borrow_mut().clear();
            self.current_attr_value.borrow_mut().clear();
        } else {
            let name = LocalName::from(&**self.current_attr_name.borrow());
            self.current_attr_name.borrow_mut().clear();
            self.current_tag_attrs.borrow_mut().push(Attribute {
                // The tree builder will adjust the namespace if necessary.
                // This only happens in foreign elements.
                name: QualName::new(None, ns!(), name),
                value: mem::take(&mut self.current_attr_value.borrow_mut()),
            });
        }
    }

    fn emit_current_doctype(&self) {
        let doctype = self.current_doctype.take();
        self.process_token_and_continue(DoctypeToken(doctype));
    }

    fn doctype_id(&self, kind: DoctypeIdKind) -> RefMut<'_, Option<StrTendril>> {
        let current_doctype = self.current_doctype.borrow_mut();
        match kind {
            Public => RefMut::map(current_doctype, |d| &mut d.public_id),
            System => RefMut::map(current_doctype, |d| &mut d.system_id),
        }
    }

    // Each identifier of a DOCTYPE token is started once (the token is fresh per
    // DOCTYPE), so this sets the empty identifier upstream also "clears" into.
    fn clear_doctype_id(&self, kind: DoctypeIdKind) {
        *self.doctype_id(kind) = Some(StrTendril::new());
    }

    fn start_consuming_character_reference(&self) {
        // A character reference never nests in another.
        debug_assert!(self.char_ref_tokenizer.borrow().is_none());

        let is_in_attribute = matches!(self.state.get(), states::AttributeValue(_));
        *self.char_ref_tokenizer.borrow_mut() = Some(CharRefTokenizer::new(is_in_attribute));
    }

    fn emit_eof(&self) {
        self.process_token_and_continue(EOFToken);
    }

    // The peek-based states (before-attribute-value, the character-reference
    // sub-tokenizer, and `eat`'s keyword matching in markup-declaration-open /
    // after-DOCTYPE-name) are never entered by `reconsume` (its targets all read with
    // `get_char`), so upstream's reconsume branches here are not carried: a pending
    // reconsume has always been taken by `get_char` before any peek.
    fn peek(&self, input: &BufferQueue) -> Option<char> {
        debug_assert!(!self.reconsume.get(), "peek with a pending reconsume");
        input.peek()
    }

    fn discard_char(&self, input: &BufferQueue) {
        // peek() deals in un-processed characters (no newline normalization), while get_char()
        // does.
        //
        // since discard_char is supposed to be used in combination with peek(), discard_char must
        // discard a single raw input character, not a normalized newline.
        debug_assert!(!self.reconsume.get(), "discard with a pending reconsume");
        input.next();
    }

    fn emit_error(&self, error: Cow<'static, str>) {
        self.process_token_and_continue(ParseError(error));
    }
}
//§ END

// Shorthand for common state machine behaviors.
macro_rules! shorthand (
    ( $me:ident : create_tag $kind:ident $c:expr   ) => ( $me.create_tag($kind, $c)                           );
    ( $me:ident : push_tag $c:expr                 ) => ( $me.current_tag_name.borrow_mut().push_char($c)     );
    ( $me:ident : discard_tag                      ) => ( $me.discard_tag()                                   );
    ( $me:ident : discard_char $input:expr         ) => ( $me.discard_char($input)                            );
    ( $me:ident : push_temp $c:expr                ) => ( $me.temp_buf.borrow_mut().push_char($c)             );
    ( $me:ident : clear_temp                       ) => ( $me.clear_temp_buf()                                );
    ( $me:ident : create_attr $c:expr              ) => ( $me.create_attribute($c)                            );
    ( $me:ident : push_name $c:expr                ) => ( $me.current_attr_name.borrow_mut().push_char($c)    );
    ( $me:ident : push_value $c:expr               ) => ( $me.current_attr_value.borrow_mut().push_char($c)   );
    ( $me:ident : append_value $c:expr             ) => ( $me.current_attr_value.borrow_mut().push_tendril($c));
    ( $me:ident : push_comment $c:expr             ) => ( $me.current_comment.borrow_mut().push_char($c)      );
    ( $me:ident : append_comment $c:expr           ) => ( $me.current_comment.borrow_mut().push_slice($c)     );
    ( $me:ident : emit_comment                     ) => ( $me.emit_current_comment()                          );
    ( $me:ident : clear_comment                    ) => ( $me.current_comment.borrow_mut().clear()            );
    ( $me:ident : create_doctype                   ) => ( *$me.current_doctype.borrow_mut() = Doctype::default() );
    ( $me:ident : push_doctype_name $c:expr        ) => ( option_push(&mut $me.current_doctype.borrow_mut().name, $c) );
    ( $me:ident : push_doctype_id $k:ident $c:expr ) => ( option_push(&mut $me.doctype_id($k), $c)            );
    ( $me:ident : clear_doctype_id $k:ident        ) => ( $me.clear_doctype_id($k)                            );
    ( $me:ident : force_quirks                     ) => ( $me.current_doctype.borrow_mut().force_quirks = true);
    ( $me:ident : emit_doctype                     ) => ( $me.emit_current_doctype()                          );
);

// Tracing of tokenizer actions.  This adds significant bloat and compile time,
// so it's behind a cfg flag.
#[cfg(feature = "trace_tokenizer")]
macro_rules! sh_trace ( ( $me:ident : $($cmds:tt)* ) => ({
    trace!("  {:?}", stringify!($($cmds)*));
    shorthand!($me : $($cmds)*);
}));

#[cfg(not(feature = "trace_tokenizer"))]
macro_rules! sh_trace ( ( $me:ident : $($cmds:tt)* ) => ( shorthand!($me: $($cmds)*) ) );

// A little DSL for sequencing shorthand actions.
macro_rules! go (
    // A pattern like $($cmd:tt)* ; $($rest:tt)* causes parse ambiguity.
    // We have to tell the parser how much lookahead we need.

    ( $me:ident : $a:tt                   ; $($rest:tt)* ) => ({ sh_trace!($me: $a);          go!($me: $($rest)*); });
    ( $me:ident : $a:tt $b:tt             ; $($rest:tt)* ) => ({ sh_trace!($me: $a $b);       go!($me: $($rest)*); });
    ( $me:ident : $a:tt $b:tt $c:tt       ; $($rest:tt)* ) => ({ sh_trace!($me: $a $b $c);    go!($me: $($rest)*); });
    ( $me:ident : $a:tt $b:tt $c:tt $d:tt ; $($rest:tt)* ) => ({ sh_trace!($me: $a $b $c $d); go!($me: $($rest)*); });

    // These can only come at the end.

    ( $me:ident : to $s:ident                    ) => ({ $me.state.set(states::$s); return ProcessResult::Continue;           });
    ( $me:ident : to $s:ident $k1:expr           ) => ({ $me.state.set(states::$s($k1)); return ProcessResult::Continue;      });
    ( $me:ident : to $s:ident $k1:ident $k2:expr ) => ({ $me.state.set(states::$s($k1($k2))); return ProcessResult::Continue; });

    ( $me:ident : reconsume $s:ident                    ) => ({ $me.reconsume.set(true); go!($me: to $s);         });
    ( $me:ident : reconsume $s:ident $k1:expr           ) => ({ $me.reconsume.set(true); go!($me: to $s $k1);     });
    ( $me:ident : reconsume $s:ident $k1:ident $k2:expr ) => ({ $me.reconsume.set(true); go!($me: to $s $k1 $k2); });

    ( $me:ident : consume_char_ref             ) => ({ $me.start_consuming_character_reference(); return ProcessResult::Continue;         });

    // We have a default next state after emitting a tag, but the sink can override.
    ( $me:ident : emit_tag $s:ident ) => ({
        $me.state.set(states::$s);
        return $me.emit_current_tag();
    });

    ( $me:ident : eof ) => ({ $me.emit_eof(); return ProcessResult::Suspend; });

    // If nothing else matched, it's a single command
    ( $me:ident : $($cmd:tt)+ ) => ( sh_trace!($me: $($cmd)+) );

    // or nothing.
    ( $me:ident : ) => (());
);

// This is a macro because it can cause early return
// from the function where it is used.
macro_rules! get_char ( ($me:expr, $input:expr) => (
    unwrap_or_return!($me.get_char($input), ProcessResult::Suspend)
));

macro_rules! peek ( ($me:expr, $input:expr) => (
    unwrap_or_return!($me.peek($input), ProcessResult::Suspend)
));

macro_rules! pop_except_from ( ($me:expr, $input:expr, $set:expr) => (
    unwrap_or_return!($me.pop_except_from($input, $set), ProcessResult::Suspend)
));

macro_rules! eat ( ($me:expr, $input:expr, $pat:expr) => (
    unwrap_or_return!($me.eat($input, $pat, u8::eq_ignore_ascii_case), ProcessResult::Suspend)
));

macro_rules! eat_exact ( ($me:expr, $input:expr, $pat:expr) => (
    unwrap_or_return!($me.eat($input, $pat, u8::eq), ProcessResult::Suspend)
));

impl<Sink: TokenSink> Tokenizer<Sink> {
    // Run the state machine for a while.
    // Return true if we should be immediately re-invoked
    // (this just simplifies control flow vs. break / continue).
    #[allow(clippy::never_loop)]
    fn step(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        if self.char_ref_tokenizer.borrow().is_some() {
            return self.step_char_ref_tokenizer(input);
        }

        trace!("processing in state {:?}", self.state);
        match Self::step_group(self.state.get()) {
            0 => self.step_group_0(input),
            1 => self.step_group_1(input),
            2 => self.step_group_2(input),
            3 => self.step_group_3(input),
            4 => self.step_group_4(input),
            5 => self.step_group_5(input),
            6 => self.step_group_6(input),
            7 => self.step_group_7(input),
            8 => self.step_group_8(input),
            9 => self.step_group_9(input),
            10 => self.step_group_10(input),
            11 => self.step_group_11(input),
            _ => self.step_group_12(input),
        }
    }

    /// Which `step_group_N` runs `state`: the arms of the original `step` match, in
    /// their order, split into groups so each stays under the complexity limit.
    fn step_group(state: states::State) -> u8 {
        match state {
            states::Data => 0,
            states::RawData(Rcdata) => 0,
            states::RawData(Rawtext) => 0,
            states::RawData(ScriptData) => 0,
            states::RawData(ScriptDataEscaped(Escaped)) => 1,
            states::RawData(ScriptDataEscaped(DoubleEscaped)) => 1,
            states::Plaintext => 1,
            states::TagOpen => 1,
            states::EndTagOpen => 2,
            states::TagName => 2,
            states::RawLessThanSign(ScriptDataEscaped(Escaped)) => 2,
            states::RawLessThanSign(ScriptDataEscaped(DoubleEscaped)) => 2,
            states::RawLessThanSign(_) => 3,
            states::RawEndTagOpen(_) => 3,
            states::RawEndTagName(_) => 3,
            states::ScriptDataEscapeStart(DoubleEscaped) => 4,
            states::ScriptDataEscapeStart(Escaped) => 4,
            states::ScriptDataEscapeStartDash => 4,
            states::ScriptDataEscapedDash(_) => 4,
            states::ScriptDataEscapedDashDash(_) => 5,
            states::ScriptDataDoubleEscapeEnd => 5,
            states::BeforeAttributeName => 5,
            states::AttributeName => 6,
            states::AfterAttributeName => 6,
            states::BeforeAttributeValue => 6,
            states::AttributeValue(DoubleQuoted) => 6,
            states::AttributeValue(SingleQuoted) => 7,
            states::AttributeValue(Unquoted) => 7,
            states::AfterAttributeValueQuoted => 7,
            states::SelfClosingStartTag => 7,
            states::CommentStart => 7,
            states::CommentStartDash => 7,
            states::Comment => 8,
            states::CommentLessThanSign => 8,
            states::CommentLessThanSignBang => 8,
            states::CommentLessThanSignBangDash => 8,
            states::CommentLessThanSignBangDashDash => 8,
            states::CommentEndDash => 8,
            states::CommentEnd => 9,
            states::CommentEndBang => 9,
            states::Doctype => 9,
            states::BeforeDoctypeName => 9,
            states::DoctypeName => 9,
            states::AfterDoctypeName => 10,
            states::AfterDoctypeKeyword(_) => 10,
            states::BeforeDoctypeIdentifier(_) => 10,
            states::DoctypeIdentifierDoubleQuoted(_) => 10,
            states::DoctypeIdentifierSingleQuoted(_) => 10,
            states::AfterDoctypeIdentifier(Public) => 11,
            states::AfterDoctypeIdentifier(System) => 11,
            states::BetweenDoctypePublicAndSystemIdentifiers => 11,
            states::BogusDoctype => 11,
            states::BogusComment => 11,
            states::MarkupDeclarationOpen => 12,
            states::CdataSection => 12,
            states::CdataSectionBracket => 12,
            states::CdataSectionEnd => 12,
        }
    }

    fn step_data_state(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            let set = small_char_set!('\r' '\0' '&' '<' '\n');
            let set_result = self.data_state_pop(input, set);
            let Some(set_result) = set_result else {
                return ProcessResult::Suspend;
            };
            match set_result {
                FromSet('\0') => {
                    self.bad_char_error();
                    self.emit_char('\0');
                }
                FromSet('&') => go!(self: consume_char_ref),
                FromSet('<') => go!(self: to TagOpen),
                FromSet(c) => self.emit_char(c),
                NotFromSet(b) => self.emit_chars(b),
            }
        }
    }

    fn data_state_pop(&self, input: &BufferQueue, set: SmallCharSet) -> Option<SetResult> {
        if self.reconsume.get() || self.ignore_lf.get() {
            return self.pop_except_from(input, set);
        }
        let front_buffer = input.peek_front_chunk_mut();
        let mut front_buffer = front_buffer?;
        let first_char = front_buffer
            .chars()
            .next()
            .expect("Input buffers are never empty");
        if matches!(first_char, '\r' | '\0' | '&' | '<' | '\n') {
            drop(front_buffer);
            return self.pop_except_from(input, set);
        }
        let result = self.data_state_fast_path(&mut front_buffer);
        if front_buffer.is_empty() {
            drop(front_buffer);
            input.pop_front();
        }
        Some(result)
    }

    /// `step` for the states [`Self::step_group`] routes to group 0.
    #[allow(clippy::never_loop)]
    fn step_group_0(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ data-state
            states::Data => self.step_data_state(input),

            //§ rcdata-state
            states::RawData(Rcdata) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '&' '<' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet('&') => go!(self: consume_char_ref),
                    FromSet('<') => go!(self: to RawLessThanSign Rcdata),
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            //§ rawtext-state
            states::RawData(Rawtext) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '<' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet('<') => go!(self: to RawLessThanSign Rawtext),
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            //§ script-data-state
            states::RawData(ScriptData) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '<' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet('<') => go!(self: to RawLessThanSign ScriptData),
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 0"),
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 1.
    #[allow(clippy::never_loop)]
    fn step_group_1(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ script-data-escaped-state
            states::RawData(ScriptDataEscaped(Escaped)) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '-' '<' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet('-') => {
                        self.emit_char('-');
                        go!(self: to ScriptDataEscapedDash Escaped);
                    }
                    FromSet('<') => go!(self: to RawLessThanSign ScriptDataEscaped Escaped),
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            //§ script-data-double-escaped-state
            states::RawData(ScriptDataEscaped(DoubleEscaped)) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '-' '<' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet('-') => {
                        self.emit_char('-');
                        go!(self: to ScriptDataEscapedDash DoubleEscaped);
                    }
                    FromSet('<') => {
                        self.emit_char('<');
                        go!(self: to RawLessThanSign ScriptDataEscaped DoubleEscaped)
                    }
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            //§ plaintext-state
            states::Plaintext => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\0' '\n')) {
                    FromSet('\0') => {
                        self.bad_char_error();
                        self.emit_char('\u{fffd}');
                    }
                    FromSet(c) => self.emit_char(c),
                    NotFromSet(b) => self.emit_chars(b),
                }
            },

            //§ tag-open-state
            states::TagOpen => self.step_tag_open(input),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 1"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_tag_open(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '!' => go!(self: to MarkupDeclarationOpen),
                '/' => go!(self: to EndTagOpen),
                '?' if self.processing_instructions => {
                    self.instruction.set(Instruction::Start);
                    go!(self: clear_comment; push_comment '?'; to BogusComment)
                }
                '?' => {
                    self.bad_char_error();
                    go!(self: clear_comment; reconsume BogusComment)
                }
                c => match lower_ascii_letter(c) {
                    Some(cl) => go!(self: create_tag StartTag cl; to TagName),
                    None => {
                        self.bad_char_error();
                        self.emit_char('<');
                        go!(self: reconsume Data)
                    }
                },
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_end_tag_open(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '>' => {
                    self.bad_char_error();
                    go!(self: to Data)
                }
                c => match lower_ascii_letter(c) {
                    Some(cl) => go!(self: create_tag EndTag cl; to TagName),
                    None => {
                        self.bad_char_error();
                        go!(self: clear_comment; reconsume BogusComment)
                    }
                },
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_raw_less_than_escaped(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '/' => go!(self: clear_temp; to RawEndTagOpen ScriptDataEscaped Escaped),
                c => match lower_ascii_letter(c) {
                    Some(cl) => {
                        go!(self: clear_temp; push_temp cl);
                        self.emit_char('<');
                        self.emit_char(c);
                        go!(self: to ScriptDataEscapeStart DoubleEscaped);
                    }
                    None => {
                        self.emit_char('<');
                        go!(self: reconsume RawData ScriptDataEscaped Escaped);
                    }
                },
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 2.
    #[allow(clippy::never_loop)]
    fn step_group_2(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ end-tag-open-state
            states::EndTagOpen => self.step_end_tag_open(input),

            //§ tag-name-state
            states::TagName => loop {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => go!(self: to BeforeAttributeName),
                    '/' => go!(self: to SelfClosingStartTag),
                    '>' => go!(self: emit_tag Data),
                    '\0' => {
                        self.bad_char_error();
                        go!(self: push_tag '\u{fffd}')
                    }
                    c => go!(self: push_tag (c.to_ascii_lowercase())),
                }
            },

            //§ script-data-escaped-less-than-sign-state
            states::RawLessThanSign(ScriptDataEscaped(Escaped)) => {
                self.step_raw_less_than_escaped(input)
            }

            //§ script-data-double-escaped-less-than-sign-state
            states::RawLessThanSign(ScriptDataEscaped(DoubleEscaped)) => loop {
                match get_char!(self, input) {
                    '/' => {
                        go!(self: clear_temp);
                        self.emit_char('/');
                        go!(self: to ScriptDataDoubleEscapeEnd);
                    }
                    _ => go!(self: reconsume RawData ScriptDataEscaped DoubleEscaped),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 2"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_raw_end_tag_name(
        &self,
        input: &BufferQueue,
        kind: RawKind,
    ) -> ProcessResult<Sink::Handle> {
        loop {
            let c = get_char!(self, input);
            if self.have_appropriate_end_tag() {
                match c {
                    '\t' | '\n' | '\x0C' | ' ' => go!(self: clear_temp; to BeforeAttributeName),
                    '/' => go!(self: clear_temp; to SelfClosingStartTag),
                    '>' => go!(self: clear_temp; emit_tag Data),
                    _ => (),
                }
            }

            match lower_ascii_letter(c) {
                Some(cl) => go!(self: push_tag cl; push_temp c),
                None => {
                    go!(self: discard_tag);
                    self.emit_char('<');
                    self.emit_char('/');
                    self.emit_temp_buf();
                    go!(self: reconsume RawData kind);
                }
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 3.
    #[allow(clippy::never_loop)]
    fn step_group_3(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ rcdata-less-than-sign-state rawtext-less-than-sign-state script-data-less-than-sign-state
            // otherwise
            states::RawLessThanSign(kind) => loop {
                match get_char!(self, input) {
                    '/' => go!(self: clear_temp; to RawEndTagOpen kind),
                    '!' if kind == ScriptData => {
                        self.emit_char('<');
                        self.emit_char('!');
                        go!(self: to ScriptDataEscapeStart Escaped);
                    }
                    _ => {
                        self.emit_char('<');
                        go!(self: reconsume RawData kind);
                    }
                }
            },

            //§ rcdata-end-tag-open-state rawtext-end-tag-open-state script-data-end-tag-open-state script-data-escaped-end-tag-open-state
            states::RawEndTagOpen(kind) => loop {
                let c = get_char!(self, input);
                match lower_ascii_letter(c) {
                    Some(cl) => go!(self: create_tag EndTag cl; push_temp c; to RawEndTagName kind),
                    None => {
                        self.emit_char('<');
                        self.emit_char('/');
                        go!(self: reconsume RawData kind);
                    }
                }
            },

            //§ rcdata-end-tag-name-state rawtext-end-tag-name-state script-data-end-tag-name-state script-data-escaped-end-tag-name-state
            states::RawEndTagName(kind) => self.step_raw_end_tag_name(input, kind),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 3"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_double_escape_start(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            let c = get_char!(self, input);
            match c {
                '\t' | '\n' | '\x0C' | ' ' | '/' | '>' => {
                    let esc = if &**self.temp_buf.borrow() == "script" {
                        DoubleEscaped
                    } else {
                        Escaped
                    };
                    self.emit_char(c);
                    go!(self: to RawData ScriptDataEscaped esc);
                }
                _ => match lower_ascii_letter(c) {
                    Some(cl) => {
                        go!(self: push_temp cl);
                        self.emit_char(c);
                    }
                    None => go!(self: reconsume RawData ScriptDataEscaped Escaped),
                },
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_escaped_dash(
        &self,
        input: &BufferQueue,
        kind: ScriptEscapeKind,
    ) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => {
                    self.emit_char('-');
                    go!(self: to ScriptDataEscapedDashDash kind);
                }
                '<' => {
                    if kind == DoubleEscaped {
                        self.emit_char('<');
                    }
                    go!(self: to RawLessThanSign ScriptDataEscaped kind);
                }
                '\0' => {
                    self.bad_char_error();
                    self.emit_char('\u{fffd}');
                    go!(self: to RawData ScriptDataEscaped kind)
                }
                c => {
                    self.emit_char(c);
                    go!(self: to RawData ScriptDataEscaped kind);
                }
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 4.
    #[allow(clippy::never_loop)]
    fn step_group_4(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ script-data-double-escape-start-state
            states::ScriptDataEscapeStart(DoubleEscaped) => self.step_double_escape_start(input),

            //§ script-data-escape-start-state
            states::ScriptDataEscapeStart(Escaped) => loop {
                match get_char!(self, input) {
                    '-' => {
                        self.emit_char('-');
                        go!(self: to ScriptDataEscapeStartDash);
                    }
                    _ => go!(self: reconsume RawData ScriptData),
                }
            },

            //§ script-data-escape-start-dash-state
            states::ScriptDataEscapeStartDash => loop {
                match get_char!(self, input) {
                    '-' => {
                        self.emit_char('-');
                        go!(self: to ScriptDataEscapedDashDash Escaped);
                    }
                    _ => go!(self: reconsume RawData ScriptData),
                }
            },

            //§ script-data-escaped-dash-state script-data-double-escaped-dash-state
            states::ScriptDataEscapedDash(kind) => self.step_escaped_dash(input, kind),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 4"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_escaped_dash_dash(
        &self,
        input: &BufferQueue,
        kind: ScriptEscapeKind,
    ) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => {
                    self.emit_char('-');
                }
                '<' => {
                    if kind == DoubleEscaped {
                        self.emit_char('<');
                    }
                    go!(self: to RawLessThanSign ScriptDataEscaped kind);
                }
                '>' => {
                    self.emit_char('>');
                    go!(self: to RawData ScriptData);
                }
                '\0' => {
                    self.bad_char_error();
                    self.emit_char('\u{fffd}');
                    go!(self: to RawData ScriptDataEscaped kind)
                }
                c => {
                    self.emit_char(c);
                    go!(self: to RawData ScriptDataEscaped kind);
                }
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_before_attribute_name(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => (),
                '/' => go!(self: to SelfClosingStartTag),
                '>' => go!(self: emit_tag Data),
                '\0' => {
                    self.bad_char_error();
                    go!(self: create_attr '\u{fffd}'; to AttributeName)
                }
                c => match lower_ascii_letter(c) {
                    Some(cl) => go!(self: create_attr cl; to AttributeName),
                    None => {
                        if matches!(c, '"' | '\'' | '<' | '=') {
                            self.bad_char_error();
                        }

                        go!(self: create_attr c; to AttributeName);
                    }
                },
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 5.
    #[allow(clippy::never_loop)]
    fn step_group_5(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ script-data-escaped-dash-dash-state script-data-double-escaped-dash-dash-state
            states::ScriptDataEscapedDashDash(kind) => self.step_escaped_dash_dash(input, kind),

            //§ script-data-double-escape-end-state
            states::ScriptDataDoubleEscapeEnd => loop {
                let c = get_char!(self, input);
                match c {
                    '\t' | '\n' | '\x0C' | ' ' | '/' | '>' => {
                        let esc = if &**self.temp_buf.borrow() == "script" {
                            Escaped
                        } else {
                            DoubleEscaped
                        };
                        self.emit_char(c);
                        go!(self: to RawData ScriptDataEscaped esc);
                    }
                    _ => match lower_ascii_letter(c) {
                        Some(cl) => {
                            go!(self: push_temp cl);
                            self.emit_char(c);
                        }
                        None => go!(self: reconsume RawData ScriptDataEscaped DoubleEscaped),
                    },
                }
            },

            //§ before-attribute-name-state
            states::BeforeAttributeName => self.step_before_attribute_name(input),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 5"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_attribute_name(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => go!(self: to AfterAttributeName),
                '/' => go!(self: to SelfClosingStartTag),
                '=' => go!(self: to BeforeAttributeValue),
                '>' => go!(self: emit_tag Data),
                '\0' => {
                    self.bad_char_error();
                    go!(self: push_name '\u{fffd}')
                }
                c => match lower_ascii_letter(c) {
                    Some(cl) => go!(self: push_name cl),
                    None => {
                        if matches!(c, '"' | '\'' | '<') {
                            self.bad_char_error();
                        }
                        go!(self: push_name c);
                    }
                },
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_after_attribute_name(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => (),
                '/' => go!(self: to SelfClosingStartTag),
                '=' => go!(self: to BeforeAttributeValue),
                '>' => go!(self: emit_tag Data),
                '\0' => {
                    self.bad_char_error();
                    go!(self: create_attr '\u{fffd}'; to AttributeName)
                }
                c => match lower_ascii_letter(c) {
                    Some(cl) => go!(self: create_attr cl; to AttributeName),
                    None => {
                        if matches!(c, '"' | '\'' | '<') {
                            self.bad_char_error();
                        }

                        go!(self: create_attr c; to AttributeName);
                    }
                },
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 6.
    #[allow(clippy::never_loop)]
    fn step_group_6(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ attribute-name-state
            states::AttributeName => self.step_attribute_name(input),

            //§ after-attribute-name-state
            states::AfterAttributeName => self.step_after_attribute_name(input),

            //§ before-attribute-value-state
            // Use peek so we can handle the first attr character along with the rest,
            // hopefully in the same zero-copy buffer.
            states::BeforeAttributeValue => loop {
                match peek!(self, input) {
                    '\t' | '\n' | '\r' | '\x0C' | ' ' => go!(self: discard_char input),
                    '"' => go!(self: discard_char input; to AttributeValue DoubleQuoted),
                    '\'' => go!(self: discard_char input; to AttributeValue SingleQuoted),
                    '>' => {
                        go!(self: discard_char input);
                        self.bad_char_error();
                        go!(self: emit_tag Data)
                    }
                    _ => go!(self: to AttributeValue Unquoted),
                }
            },

            //§ attribute-value-(double-quoted)-state
            states::AttributeValue(DoubleQuoted) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '"' '&' '\0' '\n')) {
                    FromSet('"') => go!(self: to AfterAttributeValueQuoted),
                    FromSet('&') => go!(self: consume_char_ref),
                    FromSet('\0') => {
                        self.bad_char_error();
                        go!(self: push_value '\u{fffd}')
                    }
                    FromSet(c) => go!(self: push_value c),
                    NotFromSet(ref b) => go!(self: append_value b),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 6"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_attr_value_unquoted(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match pop_except_from!(
                self,
                input,
                small_char_set!('\r' '\t' '\n' '\x0C' ' ' '&' '>' '\0')
            ) {
                FromSet('\t') | FromSet('\n') | FromSet('\x0C') | FromSet(' ') => {
                    go!(self: to BeforeAttributeName)
                }
                FromSet('&') => go!(self: consume_char_ref),
                FromSet('>') => go!(self: emit_tag Data),
                FromSet('\0') => {
                    self.bad_char_error();
                    go!(self: push_value '\u{fffd}')
                }
                FromSet(_) => unreachable!("unquoted attribute value slow path"),
                NotFromSet(ref b) => go!(self: append_value b),
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment_start(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => go!(self: to CommentStartDash),
                '\0' => {
                    self.bad_char_error();
                    go!(self: push_comment '\u{fffd}'; to Comment)
                }
                '>' => {
                    self.bad_char_error();
                    go!(self: emit_comment; to Data)
                }
                c => go!(self: push_comment c; to Comment),
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment_start_dash(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => go!(self: to CommentEnd),
                '\0' => {
                    self.bad_char_error();
                    go!(self: append_comment "-\u{fffd}"; to Comment)
                }
                '>' => {
                    self.bad_char_error();
                    go!(self: emit_comment; to Data)
                }
                c => go!(self: push_comment '-'; push_comment c; to Comment),
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 7.
    #[allow(clippy::never_loop)]
    fn step_group_7(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ attribute-value-(single-quoted)-state
            states::AttributeValue(SingleQuoted) => loop {
                match pop_except_from!(self, input, small_char_set!('\r' '\'' '&' '\0' '\n')) {
                    FromSet('\'') => go!(self: to AfterAttributeValueQuoted),
                    FromSet('&') => go!(self: consume_char_ref),
                    FromSet('\0') => {
                        self.bad_char_error();
                        go!(self: push_value '\u{fffd}')
                    }
                    FromSet(c) => go!(self: push_value c),
                    NotFromSet(ref b) => go!(self: append_value b),
                }
            },

            //§ attribute-value-(unquoted)-state
            states::AttributeValue(Unquoted) => self.step_attr_value_unquoted(input),

            //§ after-attribute-value-(quoted)-state
            states::AfterAttributeValueQuoted => loop {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => go!(self: to BeforeAttributeName),
                    '/' => go!(self: to SelfClosingStartTag),
                    '>' => go!(self: emit_tag Data),
                    _ => {
                        self.bad_char_error();
                        go!(self: reconsume BeforeAttributeName)
                    }
                }
            },

            //§ self-closing-start-tag-state
            states::SelfClosingStartTag => loop {
                match get_char!(self, input) {
                    '>' => {
                        self.current_tag_self_closing.set(true);
                        go!(self: emit_tag Data);
                    }
                    _ => {
                        self.bad_char_error();
                        go!(self: reconsume BeforeAttributeName)
                    }
                }
            },

            //§ comment-start-state
            states::CommentStart => self.step_comment_start(input),

            //§ comment-start-dash-state
            states::CommentStartDash => self.step_comment_start_dash(input),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 7"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                c @ '<' => go!(self: push_comment c; to CommentLessThanSign),
                '-' => go!(self: to CommentEndDash),
                '\0' => {
                    self.bad_char_error();
                    go!(self: push_comment '\u{fffd}')
                }
                c => go!(self: push_comment c),
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment_less_than_sign(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                c @ '!' => go!(self: push_comment c; to CommentLessThanSignBang),
                c @ '<' => go!(self: push_comment c),
                _ => go!(self: reconsume Comment),
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment_end_dash(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => go!(self: to CommentEnd),
                '\0' => {
                    self.bad_char_error();
                    go!(self: append_comment "-\u{fffd}"; to Comment)
                }
                c => go!(self: push_comment '-'; push_comment c; to Comment),
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 8.
    #[allow(clippy::never_loop)]
    fn step_group_8(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ comment-state
            states::Comment => self.step_comment(input),

            //§ comment-less-than-sign-state
            states::CommentLessThanSign => self.step_comment_less_than_sign(input),

            //§ comment-less-than-sign-bang
            states::CommentLessThanSignBang => loop {
                match get_char!(self, input) {
                    '-' => go!(self: to CommentLessThanSignBangDash),
                    _ => go!(self: reconsume Comment),
                }
            },

            //§ comment-less-than-sign-bang-dash
            states::CommentLessThanSignBangDash => loop {
                match get_char!(self, input) {
                    '-' => go!(self: to CommentLessThanSignBangDashDash),
                    _ => go!(self: reconsume CommentEndDash),
                }
            },

            //§ comment-less-than-sign-bang-dash-dash
            states::CommentLessThanSignBangDashDash => loop {
                match get_char!(self, input) {
                    '>' => go!(self: reconsume CommentEnd),
                    _ => {
                        self.bad_char_error();
                        go!(self: reconsume CommentEnd)
                    }
                }
            },

            //§ comment-end-dash-state
            states::CommentEndDash => self.step_comment_end_dash(input),

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 8"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_comment_end_bang(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '-' => go!(self: append_comment "--!"; to CommentEndDash),
                '>' => {
                    self.bad_char_error();
                    go!(self: emit_comment; to Data)
                }
                '\0' => {
                    self.bad_char_error();
                    go!(self: append_comment "--!\u{fffd}"; to Comment)
                }
                c => go!(self: append_comment "--!"; push_comment c; to Comment),
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_before_doctype_name(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => (),
                '\0' => {
                    self.bad_char_error();
                    go!(self: create_doctype; push_doctype_name '\u{fffd}'; to DoctypeName)
                }
                '>' => {
                    self.bad_char_error();
                    go!(self: create_doctype; force_quirks; emit_doctype; to Data)
                }
                c => {
                    go!(self: create_doctype; push_doctype_name (c.to_ascii_lowercase()); to DoctypeName)
                }
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 9.
    #[allow(clippy::never_loop)]
    fn step_group_9(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ comment-end-state
            states::CommentEnd => loop {
                match get_char!(self, input) {
                    '>' => go!(self: emit_comment; to Data),
                    '!' => go!(self: to CommentEndBang),
                    '-' => go!(self: push_comment '-'),
                    _ => go!(self: append_comment "--"; reconsume Comment),
                }
            },

            //§ comment-end-bang-state
            states::CommentEndBang => self.step_comment_end_bang(input),

            //§ doctype-state
            states::Doctype => loop {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => go!(self: to BeforeDoctypeName),
                    '>' => go!(self: reconsume BeforeDoctypeName),
                    _ => {
                        self.bad_char_error();
                        go!(self: reconsume BeforeDoctypeName)
                    }
                }
            },

            //§ before-doctype-name-state
            states::BeforeDoctypeName => self.step_before_doctype_name(input),

            //§ doctype-name-state
            states::DoctypeName => loop {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => go!(self: clear_temp; to AfterDoctypeName),
                    '>' => go!(self: emit_doctype; to Data),
                    '\0' => {
                        self.bad_char_error();
                        go!(self: push_doctype_name '\u{fffd}')
                    }
                    c => go!(self: push_doctype_name (c.to_ascii_lowercase())),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 9"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_after_doctype_name(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            if eat!(self, input, "public") {
                go!(self: to AfterDoctypeKeyword Public);
            } else if eat!(self, input, "system") {
                go!(self: to AfterDoctypeKeyword System);
            } else {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => (),
                    '>' => go!(self: emit_doctype; to Data),
                    _ => {
                        self.bad_char_error();
                        go!(self: force_quirks; reconsume BogusDoctype)
                    }
                }
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_after_doctype_keyword(
        &self,
        input: &BufferQueue,
        kind: DoctypeIdKind,
    ) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => go!(self: to BeforeDoctypeIdentifier kind),
                '"' => {
                    self.bad_char_error();
                    go!(self: clear_doctype_id kind; to DoctypeIdentifierDoubleQuoted kind)
                }
                '\'' => {
                    self.bad_char_error();
                    go!(self: clear_doctype_id kind; to DoctypeIdentifierSingleQuoted kind)
                }
                '>' => {
                    self.bad_char_error();
                    go!(self: force_quirks; emit_doctype; to Data)
                }
                _ => {
                    self.bad_char_error();
                    go!(self: force_quirks; reconsume BogusDoctype)
                }
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_before_doctype_identifier(
        &self,
        input: &BufferQueue,
        kind: DoctypeIdKind,
    ) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => (),
                '"' => go!(self: clear_doctype_id kind; to DoctypeIdentifierDoubleQuoted kind),
                '\'' => go!(self: clear_doctype_id kind; to DoctypeIdentifierSingleQuoted kind),
                '>' => {
                    self.bad_char_error();
                    go!(self: force_quirks; emit_doctype; to Data)
                }
                _ => {
                    self.bad_char_error();
                    go!(self: force_quirks; reconsume BogusDoctype)
                }
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 10.
    #[allow(clippy::never_loop)]
    fn step_group_10(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ after-doctype-name-state
            states::AfterDoctypeName => self.step_after_doctype_name(input),

            //§ after-doctype-public-keyword-state after-doctype-system-keyword-state
            states::AfterDoctypeKeyword(kind) => self.step_after_doctype_keyword(input, kind),

            //§ before-doctype-public-identifier-state before-doctype-system-identifier-state
            states::BeforeDoctypeIdentifier(kind) => {
                self.step_before_doctype_identifier(input, kind)
            }

            //§ doctype-public-identifier-(double-quoted)-state doctype-system-identifier-(double-quoted)-state
            states::DoctypeIdentifierDoubleQuoted(kind) => loop {
                match get_char!(self, input) {
                    '"' => go!(self: to AfterDoctypeIdentifier kind),
                    '\0' => {
                        self.bad_char_error();
                        go!(self: push_doctype_id kind '\u{fffd}')
                    }
                    '>' => {
                        self.bad_char_error();
                        go!(self: force_quirks; emit_doctype; to Data)
                    }
                    c => go!(self: push_doctype_id kind c),
                }
            },

            //§ doctype-public-identifier-(single-quoted)-state doctype-system-identifier-(single-quoted)-state
            states::DoctypeIdentifierSingleQuoted(kind) => loop {
                match get_char!(self, input) {
                    '\'' => go!(self: to AfterDoctypeIdentifier kind),
                    '\0' => {
                        self.bad_char_error();
                        go!(self: push_doctype_id kind '\u{fffd}')
                    }
                    '>' => {
                        self.bad_char_error();
                        go!(self: force_quirks; emit_doctype; to Data)
                    }
                    c => go!(self: push_doctype_id kind c),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 10"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_after_doctype_public_id(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => {
                    go!(self: to BetweenDoctypePublicAndSystemIdentifiers)
                }
                '>' => go!(self: emit_doctype; to Data),
                '"' => {
                    self.bad_char_error();
                    go!(self: clear_doctype_id System; to DoctypeIdentifierDoubleQuoted System)
                }
                '\'' => {
                    self.bad_char_error();
                    go!(self: clear_doctype_id System; to DoctypeIdentifierSingleQuoted System)
                }
                _ => {
                    self.bad_char_error();
                    go!(self: force_quirks; reconsume BogusDoctype)
                }
            }
        }
    }

    #[allow(clippy::never_loop)]
    fn step_between_doctype_ids(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            match get_char!(self, input) {
                '\t' | '\n' | '\x0C' | ' ' => (),
                '>' => go!(self: emit_doctype; to Data),
                '"' => {
                    go!(self: clear_doctype_id System; to DoctypeIdentifierDoubleQuoted System)
                }
                '\'' => {
                    go!(self: clear_doctype_id System; to DoctypeIdentifierSingleQuoted System)
                }
                _ => {
                    self.bad_char_error();
                    go!(self: force_quirks; reconsume BogusDoctype)
                }
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 11.
    #[allow(clippy::never_loop)]
    fn step_group_11(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ after-doctype-public-identifier-state
            states::AfterDoctypeIdentifier(Public) => self.step_after_doctype_public_id(input),

            //§ after-doctype-system-identifier-state
            states::AfterDoctypeIdentifier(System) => loop {
                match get_char!(self, input) {
                    '\t' | '\n' | '\x0C' | ' ' => (),
                    '>' => go!(self: emit_doctype; to Data),
                    _ => {
                        self.bad_char_error();
                        go!(self: reconsume BogusDoctype)
                    }
                }
            },

            //§ between-doctype-public-and-system-identifiers-state
            states::BetweenDoctypePublicAndSystemIdentifiers => {
                self.step_between_doctype_ids(input)
            }

            //§ bogus-doctype-state
            states::BogusDoctype => loop {
                match get_char!(self, input) {
                    '>' => go!(self: emit_doctype; to Data),
                    '\0' => {
                        self.bad_char_error();
                    }
                    _ => (),
                }
            },

            //§ bogus-comment-state
            states::BogusComment => loop {
                if self.instruction.get() != Instruction::Off {
                    return self.step_instruction(input);
                }
                match get_char!(self, input) {
                    '>' => go!(self: emit_comment; to Data),
                    '\0' => {
                        self.bad_char_error();
                        go!(self: push_comment '\u{fffd}')
                    }
                    c => go!(self: push_comment c),
                }
            },

            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 11"),
        }
    }

    #[allow(clippy::never_loop)]
    fn step_markup_declaration_open(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        loop {
            if eat_exact!(self, input, "--") {
                go!(self: clear_comment; to CommentStart);
            } else if eat!(self, input, "doctype") {
                go!(self: to Doctype);
            } else {
                if self
                    .sink
                    .adjusted_current_node_present_but_not_in_html_namespace()
                    && eat_exact!(self, input, "[CDATA[")
                {
                    go!(self: clear_temp; to CdataSection);
                }
                self.bad_char_error();
                go!(self: clear_comment; to BogusComment);
            }
        }
    }

    /// `step` for the states [`Self::step_group`] routes to group 12.
    #[allow(clippy::never_loop)]
    fn step_group_12(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        match self.state.get() {
            //§ markup-declaration-open-state
            states::MarkupDeclarationOpen => self.step_markup_declaration_open(input),

            //§ cdata-section-state
            states::CdataSection => loop {
                match get_char!(self, input) {
                    ']' => go!(self: to CdataSectionBracket),
                    '\0' => {
                        self.emit_temp_buf();
                        self.emit_char('\0');
                    }
                    c => go!(self: push_temp c),
                }
            },

            //§ cdata-section-bracket
            states::CdataSectionBracket => match get_char!(self, input) {
                ']' => go!(self: to CdataSectionEnd),
                _ => go!(self: push_temp ']'; reconsume CdataSection),
            },

            //§ cdata-section-end
            states::CdataSectionEnd => loop {
                match get_char!(self, input) {
                    ']' => go!(self: push_temp ']'),
                    '>' => {
                        self.emit_temp_buf();
                        go!(self: to Data);
                    }
                    _ => go!(self: push_temp ']'; push_temp ']'; reconsume CdataSection),
                }
            },
            //§ END
            // `step_group` routes only this group's states here.
            _ => unreachable!("state not in step group 12"),
        }
    }

    /// One character of a Chrome-mode processing instruction: the target is an ASCII
    /// letter followed by ASCII alphanumerics, `-` or `_`, and is not `xml` (any case);
    /// whitespace after it is skipped; the data runs to the first `>`, less one `?`
    /// before it. A target that breaks these rules turns the whole `<?…` into the bogus
    /// comment the standard makes of it.
    fn step_instruction(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        let c = get_char!(self, input);
        match (self.instruction.get(), c) {
            (Instruction::Start, c) if c.is_ascii_alphabetic() => {
                self.instruction.set(Instruction::Target);
                {
                    self.current_comment.borrow_mut().push_char(c);
                    ProcessResult::Continue
                }
            }
            (Instruction::Target, c) if c.is_ascii_alphanumeric() || c == '-' || c == '_' => {
                self.current_comment.borrow_mut().push_char(c);
                ProcessResult::Continue
            }
            (Instruction::Target, '\t' | '\n' | '\x0C' | ' ' | '?' | '>')
                if !self.current_comment.borrow()[1..].eq_ignore_ascii_case("xml") =>
            {
                let target = mem::take(&mut *self.current_comment.borrow_mut());
                let mut comment = StrTendril::from_slice(PROCESSING_INSTRUCTION);
                comment.push_slice(&target[1..]);
                comment.push_char(' ');
                *self.current_comment.borrow_mut() = comment;
                self.instruction.set(Instruction::AfterTarget);
                self.instruction_data(c)
            }
            (Instruction::Start | Instruction::Target, _) => {
                self.instruction.set(Instruction::Off);
                self.bad_char_error();
                go!(self: reconsume BogusComment)
            }
            (_, c) => self.instruction_data(c),
        }
    }

    /// A character after a processing instruction's target: whitespace right after it is
    /// skipped, `>` emits it, anything else is data.
    fn instruction_data(&self, c: char) -> ProcessResult<Sink::Handle> {
        match c {
            '>' => {
                self.instruction.set(Instruction::Off);
                let mut comment = mem::take(&mut *self.current_comment.borrow_mut());
                if comment.ends_with('?') {
                    comment.pop_back(1);
                }
                self.process_token_and_continue(CommentToken(comment));
                go!(self: to Data)
            }
            '\t' | '\n' | '\x0C' | ' ' if self.instruction.get() == Instruction::AfterTarget => {
                ProcessResult::Continue
            }
            '\0' => {
                self.bad_char_error();
                self.instruction.set(Instruction::Data);
                {
                    self.current_comment.borrow_mut().push_char('\u{fffd}');
                    ProcessResult::Continue
                }
            }
            c => {
                self.instruction.set(Instruction::Data);
                {
                    self.current_comment.borrow_mut().push_char(c);
                    ProcessResult::Continue
                }
            }
        }
    }

    fn step_char_ref_tokenizer(&self, input: &BufferQueue) -> ProcessResult<Sink::Handle> {
        let mut char_ref_tokenizer = self.char_ref_tokenizer.borrow_mut();
        let progress = match char_ref_tokenizer.as_mut().unwrap().step(self, input) {
            char_ref::Status::Done(char_ref) => {
                self.process_char_ref(char_ref);
                *char_ref_tokenizer = None;
                return ProcessResult::Continue;
            }

            char_ref::Status::Stuck => ProcessResult::Suspend,
            char_ref::Status::Progress => ProcessResult::Continue,
        };

        progress
    }

    fn process_char_ref(&self, char_ref: CharRef) {
        let (mut chars, mut num_chars) = (char_ref.chars, char_ref.num_chars);

        if num_chars == 0 {
            chars[0] = '&';
            num_chars = 1;
        }

        for i in 0..num_chars {
            let c = chars[i as usize];
            if c == super::parser_units::ESCAPE {
                match self.state.get() {
                    states::Data | states::RawData(states::Rcdata) => self.emit_char(c),
                    states::AttributeValue(_) => self.current_attr_value.borrow_mut().push_char(c),
                    _ => unreachable!("character reference emission state"),
                }
            }
            match self.state.get() {
                states::Data | states::RawData(states::Rcdata) => self.emit_char(c),

                states::AttributeValue(_) => go!(self: push_value c),

                // A character reference is only started from these states.
                _ => unreachable!("character reference emission state"),
            }
        }
    }

    /// Indicate that we have reached the end of the input.
    pub fn end(&self) {
        // Handle EOF in the char ref sub-tokenizer, if there is one.
        // Do this first because it might un-consume stuff.
        let input = BufferQueue::default();
        match self.char_ref_tokenizer.take() {
            None => (),
            Some(mut tokenizer) => {
                self.process_char_ref(tokenizer.end_of_file(self, &input));
            }
        }

        // Process all remaining buffered input.
        // If we're waiting for lookahead, we're not gonna get it.
        self.at_eof.set(true);
        assert!(matches!(self.run(&input), TokenizerResult::Done));
        assert!(input.is_empty());

        loop {
            match self.eof_step() {
                ProcessResult::Continue => (),
                ProcessResult::Suspend => break,
                ProcessResult::Script(_) | ProcessResult::EncodingIndicator(_) => unreachable!(),
            }
        }

        self.sink.end();
    }

    fn eof_step(&self) -> ProcessResult<Sink::Handle> {
        debug!("processing EOF in state {:?}", self.state.get());
        match self.state.get() {
            states::Data
            | states::RawData(Rcdata)
            | states::RawData(Rawtext)
            | states::RawData(ScriptData)
            | states::Plaintext => {
                go!(self: eof)
            }

            states::TagName
            | states::RawData(ScriptDataEscaped(_))
            | states::BeforeAttributeName
            | states::AttributeName
            | states::AfterAttributeName
            | states::AttributeValue(_)
            | states::AfterAttributeValueQuoted
            | states::SelfClosingStartTag
            | states::ScriptDataEscapedDash(_)
            | states::ScriptDataEscapedDashDash(_) => {
                self.bad_eof_error();
                go!(self: to Data)
            }

            states::BeforeAttributeValue => go!(self: reconsume AttributeValue Unquoted),

            states::TagOpen => {
                self.bad_eof_error();
                self.emit_char('<');
                go!(self: to Data);
            }

            states::EndTagOpen => {
                self.bad_eof_error();
                self.emit_char('<');
                self.emit_char('/');
                go!(self: to Data);
            }

            states::RawLessThanSign(ScriptDataEscaped(DoubleEscaped)) => {
                go!(self: to RawData ScriptDataEscaped DoubleEscaped)
            }

            states::RawLessThanSign(kind) => {
                self.emit_char('<');
                go!(self: to RawData kind);
            }

            states::RawEndTagOpen(kind) => {
                self.emit_char('<');
                self.emit_char('/');
                go!(self: to RawData kind);
            }

            states::RawEndTagName(kind) => {
                self.emit_char('<');
                self.emit_char('/');
                self.emit_temp_buf();
                go!(self: to RawData kind)
            }

            states::ScriptDataEscapeStart(kind) => go!(self: to RawData ScriptDataEscaped kind),

            states::ScriptDataEscapeStartDash => go!(self: to RawData ScriptData),

            states::ScriptDataDoubleEscapeEnd => {
                go!(self: to RawData ScriptDataEscaped DoubleEscaped)
            }

            states::CommentStart
            | states::CommentStartDash
            | states::Comment
            | states::CommentEndDash
            | states::CommentEnd
            | states::CommentEndBang => {
                self.bad_eof_error();
                go!(self: emit_comment; to Data)
            }

            states::CommentLessThanSign | states::CommentLessThanSignBang => {
                go!(self: reconsume Comment)
            }

            states::CommentLessThanSignBangDash => go!(self: reconsume CommentEndDash),

            states::CommentLessThanSignBangDashDash => go!(self: reconsume CommentEnd),

            states::Doctype | states::BeforeDoctypeName => {
                self.bad_eof_error();
                go!(self: create_doctype; force_quirks; emit_doctype; to Data)
            }

            states::DoctypeName
            | states::AfterDoctypeName
            | states::AfterDoctypeKeyword(_)
            | states::BeforeDoctypeIdentifier(_)
            | states::DoctypeIdentifierDoubleQuoted(_)
            | states::DoctypeIdentifierSingleQuoted(_)
            | states::AfterDoctypeIdentifier(_)
            | states::BetweenDoctypePublicAndSystemIdentifiers => {
                self.bad_eof_error();
                go!(self: force_quirks; emit_doctype; to Data)
            }

            states::BogusDoctype => go!(self: emit_doctype; to Data),

            // Chrome drops a processing instruction the input cuts short.
            states::BogusComment if self.instruction.get() != Instruction::Off => {
                self.instruction.set(Instruction::Off);
                self.bad_eof_error();
                go!(self: clear_comment; to Data)
            }
            states::BogusComment => go!(self: emit_comment; to Data),

            // At EOF `eat` never asks for more input, so markup-declaration-open always
            // resolves in `run` before the EOF steps.
            states::MarkupDeclarationOpen => unreachable!("EOF in markup declaration open"),

            states::CdataSection => {
                self.emit_temp_buf();
                self.bad_eof_error();
                go!(self: to Data)
            }

            states::CdataSectionBracket => go!(self: push_temp ']'; to CdataSection),

            states::CdataSectionEnd => go!(self: push_temp ']'; push_temp ']'; to CdataSection),
        }
    }

    /// Implements the [data state] fast path: consumes the run of bytes before the
    /// next `<`, `&`, `\r` or NUL (newlines included, counted for `current_line`) as
    /// one chunk. The caller guarantees the first character is not in that set, so
    /// the run is never empty.
    ///
    /// Upstream html5ever scans 16-byte chunks with SSE2 (x86) or NEON (aarch64)
    /// intrinsics here, with a scalar fallback compiled on neither. The native
    /// adapter scans portably: the same chunks and tokens on every target, with
    /// no `unsafe` and no per-architecture code (measured within noise on the
    /// UTF-16 / source-position parse paths this tokenizer serves).
    ///
    /// [data state]: https://html.spec.whatwg.org/#data-state
    fn data_state_fast_path(&self, input: &mut StrTendril) -> SetResult {
        let mut n_newlines = 0;
        let end = input
            .as_bytes()
            .iter()
            .position(|&b| {
                n_newlines += u64::from(b == b'\n');
                matches!(b, b'<' | b'&' | b'\r' | b'\0')
            })
            .unwrap_or(input.len());
        let consumed_chunk = input.subtendril(0, end as u32);
        input.pop_front(end as u32);

        self.current_line.set(self.current_line.get() + n_newlines);

        NotFromSet(consumed_chunk)
    }
}

#[cfg(test)]
#[allow(non_snake_case)]
mod test {
    use super::option_push; // private items
    use html5ever::tendril::{SliceExt, StrTendril};

    use super::{TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts};

    use super::interface::{CharacterTokens, EOFToken, NullCharacterToken, ParseError};
    use super::interface::{EndTag, StartTag, Tag, TagKind};
    use super::interface::{TagToken, Token};

    use html5ever::buffer_queue::BufferQueue;
    use std::cell::RefCell;

    use html5ever::LocalName;

    // LinesMatch implements the TokenSink trait. It is used for testing to see
    // if current_line is being updated when process_token is called. The lines
    // vector is a collection of the line numbers that each token is on.
    struct LinesMatch {
        tokens: RefCell<Vec<Token>>,
        current_str: RefCell<StrTendril>,
        lines: RefCell<Vec<(Token, u64)>>,
    }

    impl LinesMatch {
        fn new() -> LinesMatch {
            LinesMatch {
                tokens: RefCell::new(vec![]),
                current_str: RefCell::new(StrTendril::new()),
                lines: RefCell::new(vec![]),
            }
        }

        fn push(&self, token: Token, line_number: u64) {
            self.finish_str();
            self.lines.borrow_mut().push((token, line_number));
        }

        fn finish_str(&self) {
            if !self.current_str.borrow().is_empty() {
                let s = self.current_str.take();
                self.tokens.borrow_mut().push(CharacterTokens(s));
            }
        }
    }

    impl TokenSink for LinesMatch {
        type Handle = ();

        fn process_token(&self, token: Token, line_number: u64) -> TokenSinkResult<Self::Handle> {
            match token {
                CharacterTokens(b) => {
                    self.current_str.borrow_mut().push_slice(&b);
                }

                NullCharacterToken => {
                    self.current_str.borrow_mut().push_char('\0');
                }

                ParseError(_) => {
                    panic!("unexpected parse error");
                }

                TagToken(mut t) => {
                    // The spec seems to indicate that one can emit
                    // erroneous end tags with attrs, but the test
                    // cases don't contain them.
                    match t.kind {
                        EndTag => {
                            t.self_closing = false;
                            t.attrs = vec![];
                        }
                        _ => t.attrs.sort_by(|a1, a2| a1.name.cmp(&a2.name)),
                    }
                    self.push(TagToken(t), line_number);
                }

                EOFToken => (),

                _ => self.push(token, line_number),
            }
            TokenSinkResult::Continue
        }
    }

    // Take in tokens, process them, and return vector with line
    // numbers that each token is on
    fn tokenize(input: Vec<StrTendril>, opts: TokenizerOpts) -> Vec<(Token, u64)> {
        let sink = LinesMatch::new();
        let tok = Tokenizer::new(sink, opts);
        let buffer = BufferQueue::default();
        for chunk in input.into_iter() {
            buffer.push_back(chunk);
            let _ = tok.feed(&buffer);
        }
        tok.end();
        tok.sink.lines.take()
    }

    // Create a tag token
    fn create_tag(token: StrTendril, tagkind: TagKind) -> Token {
        let name = LocalName::from(&*token);

        TagToken(Tag {
            kind: tagkind,
            name,
            self_closing: false,
            attrs: vec![],
            had_duplicate_attributes: false,
        })
    }

    #[test]
    fn push_to_None_gives_singleton() {
        let mut s: Option<StrTendril> = None;
        option_push(&mut s, 'x');
        assert_eq!(s, Some("x".to_tendril()));
    }

    #[test]
    fn push_to_empty_appends() {
        let mut s: Option<StrTendril> = Some(StrTendril::new());
        option_push(&mut s, 'x');
        assert_eq!(s, Some("x".to_tendril()));
    }

    #[test]
    fn push_to_nonempty_appends() {
        let mut s: Option<StrTendril> = Some(StrTendril::from_slice("y"));
        option_push(&mut s, 'x');
        assert_eq!(s, Some("yx".to_tendril()));
    }

    #[test]
    fn check_lines() {
        let opts = TokenizerOpts {
            initial_state: None,
            last_start_tag_name: None,
            processing_instructions: false,
        };
        let vector = vec![
            StrTendril::from("<a>\n"),
            StrTendril::from("<b>\n"),
            StrTendril::from("</b>\n"),
            StrTendril::from("</a>\n"),
        ];
        let expected = vec![
            (create_tag(StrTendril::from("a"), StartTag), 1),
            (create_tag(StrTendril::from("b"), StartTag), 2),
            (create_tag(StrTendril::from("b"), EndTag), 3),
            (create_tag(StrTendril::from("a"), EndTag), 4),
        ];
        let results = tokenize(vector, opts);
        assert_eq!(results, expected);
    }

    #[test]
    fn check_lines_with_new_line() {
        let opts = TokenizerOpts {
            initial_state: None,
            last_start_tag_name: None,
            processing_instructions: false,
        };
        let vector = vec![
            StrTendril::from("<a>\r\n"),
            StrTendril::from("<b>\r\n"),
            StrTendril::from("</b>\r\n"),
            StrTendril::from("</a>\r\n"),
        ];
        let expected = vec![
            (create_tag(StrTendril::from("a"), StartTag), 1),
            (create_tag(StrTendril::from("b"), StartTag), 2),
            (create_tag(StrTendril::from("b"), EndTag), 3),
            (create_tag(StrTendril::from("a"), EndTag), 4),
        ];
        let results = tokenize(vector, opts);
        assert_eq!(results, expected);
    }
}
