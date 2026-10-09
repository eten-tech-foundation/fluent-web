# Paragraph insertion

The Chapter format bar has two separate paragraph controls:

- **Paragraph** converts the current body block to `p` and remains pressed while that format is active.
- **Insert paragraph** splits at the cursor and places the cursor in a new `p`. It can be clicked repeatedly. With text selected it does nothing, so selected text stays intact; place a caret first.

The button is only in the Chapter view format bar. Paragraphs it inserts still round-trip through Pericope view.

Inside a Poetry line (`q1`–`q4`) or another non-`p` block, the text after the cursor up to the next verse number moves into the new `p`; that is the paragraph the button inserts. Text before the cursor keeps the block's style, and any later verse in the same block keeps it too, so it still reloads as Poetry. Use Enter to break a Poetry line without changing its style. At the end of a block, the new `p` starts empty after it.

From a heading, insertion keeps the whole title and creates a paragraph at the start of its following verse. The verse number moves to the new paragraph, and the verse text after it keeps its Poetry format. Enter retains its existing behavior.

Insertion uses Editorial's local delta transaction so USJ, autosave, and undo/redo observe the same change. A selection-only update is flushed before the next keystroke. This avoids Editorial 0.8.15's `insertMarker` path, which can split the DOM without updating the USJ snapshot used by Fluent's save callback.

Paragraphs containing text persist through autosave, reload, and Chapter/Pericope view changes. The existing verse API represents paragraph boundaries as offsets in text. Empty spacer paragraphs have no stored offset and disappear on reload; inserting them in the live document does not remove scripture or verse markers.
