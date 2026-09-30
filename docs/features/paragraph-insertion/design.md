# Paragraph insertion

The Chapter format bar has two separate paragraph controls:

- **Paragraph** converts the current body block to `p` and remains pressed while that format is active.
- **Insert paragraph** splits at the cursor and places the cursor in a new `p`. It can be clicked repeatedly. It leaves selected text intact; place a caret first.

From a heading, insertion keeps the whole title and creates a paragraph at the start of its following verse. The verse number stays with the new paragraph, and existing Poetry keeps its format. Enter retains its existing behavior.

Insertion uses Editorial's local delta transaction so USJ, autosave, and undo/redo observe the same change. A selection-only update is flushed before the next keystroke. This avoids Editorial 0.8.15's `insertMarker` path, which can split the DOM without updating the USJ snapshot used by Fluent's save callback.

Paragraphs containing text persist through autosave, reload, and Chapter/Pericope view changes. The existing verse API represents paragraph boundaries as offsets in text. Empty spacer paragraphs have no stored offset and disappear on reload; inserting them in the live document does not remove scripture or verse markers.
