# Paragraph insertion

The Chapter format bar has two separate paragraph controls:

- **Paragraph** converts the current body block to `p` and remains pressed while that format is active. It only changes the verse the cursor is in: in a Poetry block that verse becomes a `p` line of its own, and the next line stays Poetry. Inside a `p` that holds several verses, it starts a new paragraph at that verse, and the verses after it stay in it ([#530](https://github.com/eten-tech-foundation/fluent-web/issues/530) QA). A verse that already starts its paragraph is left as it is.
- **Insert paragraph** splits at the cursor and places the cursor in a new `p`. It can be clicked repeatedly. With text selected it does nothing, so selected text stays intact; place a caret first.

Until the cursor is in the editor, every control in the bar is off and none reads as pressed, since there is no block to format yet ([#530](https://github.com/eten-tech-foundation/fluent-web/issues/530) QA).

The button is only in the Chapter view format bar. Paragraphs it inserts still round-trip through Pericope view.

Like the rest of the bar it is an icon (↵, the Enter key it duplicates), so the bar stays clear of the target language name ([#472](https://github.com/eten-tech-foundation/fluent-web/issues/472) QA). Chad kept it on [#530](https://github.com/eten-tech-foundation/fluent-web/issues/530) as the visible way to add a paragraph. Its tooltip only names it, as every tooltip in the bar does, disabled controls included.

Inside a Poetry line (`q1`–`q4`) or another non-`p` block, the text after the cursor up to the next verse number moves into the new `p`; that is the paragraph the button inserts. Text before the cursor keeps the block's style, and any later verse in the same block keeps it too, so it still reloads as Poetry. Use Enter to break a Poetry line without changing its style. At the end of a block, the new `p` starts empty after it.

From a heading, insertion keeps the whole title and opens an empty `p` under it, after the last heading when several are adjacent. Enter, Shift+Enter and Alt+Enter in a heading do the same. The following verse keeps its number, text and format, so a Poetry line stays Poetry. The first letter typed in the new `p` brings that verse's number to the start of the line, because those words begin the verse, and that is how they are saved.

A break never lands between a verse number and its text, because a verse row always starts with its number. Right after a verse number, Insert paragraph and Enter break in front of it, so the verse moves to the new line with its number. Shift+Enter and Alt+Enter do the same there; elsewhere Shift+Enter is still the editor's line break, which is not saved. Right before a space they break after the space: Editorial drops the space a paragraph starts with, so a later merge would glue the two words together. If a number still ends up alone on a line, Delete at the end of that line or Backspace at the start of the text joins them, and the line keeps the text's format.

Insertion uses Editorial's local delta transaction so USJ, autosave, and undo/redo observe the same change. A selection-only update is flushed before the next keystroke. This avoids Editorial 0.8.15's `insertMarker` path, which can split the DOM without updating the USJ snapshot used by Fluent's save callback.

Paragraphs containing text persist through autosave, reload, and Chapter/Pericope view changes. The existing verse API represents paragraph boundaries as offsets in text. Empty spacer paragraphs have no stored offset and disappear on reload; inserting them in the live document does not remove scripture or verse markers.
