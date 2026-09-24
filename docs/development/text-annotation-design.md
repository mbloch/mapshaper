---
title: Text annotation design
description: Design notes for fixed-width text blocks, automatic line breaks and callout lines on anchored labels.
---

# Text Annotation Design

A text annotation is a block of text, often several lines long, anchored to a
geographic location but usually offset from it and connected to it by a callout
line or an arrow. This document extends the label model described in
[label-tool-design.md](label-tool-design.md) with the three things an annotation
needs that a label does not have yet:

1. **Fixed-width text blocks** whose lines wrap automatically as the user types
   or pastes, rather than requiring line breaks to be inserted by hand.
2. **Callouts**: a straight, elbowed or curved line from the anchor to the text,
   optionally ending in a solid or open arrowhead. A dot at the anchor is the
   label's icon, which the line already stops short of.
3. **Direct manipulation** of both: a handle to resize a text block, and handles
   to reshape a callout, move the point where it meets the text, and keep it
   clear of whatever is drawn at the anchor.

The label design doc listed callouts as deferred ("the data model must not
preclude them") and wrapping as out of scope. This document supersedes the
second of those.

## Settled requirements

- **An annotation is an anchored label.** It is a single-point feature with a
  `label-text` field, like every other label. The point is the thing being
  annotated; the text is offset from it by `dx`/`dy` in pixels. Nothing about
  an annotation is stored in another layer.
- **Everything an annotation adds is in pixels in the label's own space**:
  origin at the anchor, y down, the same space as `dx`/`dy`. That is the space
  inside the symbol group the GUI scales with the frame, so text, offsets and
  callouts all scale together, and export draws them at native scale like
  every other symbol.
- **Line breaks are decided in the GUI and stored in the text.** Exported SVG
  can only carry explicit lines (see [Why lines are stored](#why-lines-are-stored)),
  so the question is only where they are decided. Deciding them where the user
  can see them, and storing the result, makes export match the editor exactly,
  independent of the fonts on the exporting machine, and makes session history
  replay exactly.
- **Callout shapes are editable.** Elbows and curves are routinely hand-placed
  to avoid nearby map symbols, so a generated shape is only a starting point.
- **A callout can stop short of its anchor**, e.g. to clear an icon drawn there.
- **Where a callout meets the text has a sensible default, and is draggable.**

## Data model

All new fields are per-feature style properties on anchored labels, declared in
`stylePropertyTypes` and accepted by `-style`. They are ignored on path labels.

| Field | Type | Meaning |
|---|---|---|
| `label-width` | number, px | Width of a fixed-width text block. Unset = point text, no wrapping |
| `callout` | `line`\|`elbow`\|`curve` | Draw a callout of this shape. Unset (or `none`) = no callout |
| `callout-end` | `arrow`\|`open-arrow`\|`none` | Arrowhead at the anchor end, filled or stroked. Default none |
| `callout-end-size` | number, px | The length of an arrowhead's sides. Unset = 10, more for a thicker line |
| `callout-via` | `x,y`, px | The elbow's corner, or a point the curve passes through. Unset = automatic |
| `callout-attach` | `x,y`, fractions | Where the callout meets the text, as fractions of the padded text box (`0,0` top left, `1,1` bottom right). Unset = automatic |
| `callout-gap` | number, px | How far short of the anchor the callout stops. Default: a plain line runs to the edge of the label's icon, and an arrowhead stops 2px clear of it |
| `callout-padding` | number, px | Clearance between the text and the callout. Default 3 |
| `callout-color` | color | Default: the text's `fill`, then black |
| `callout-width` | number, px | Line width. Default 1 |
| `callout-opacity` | number, 0-1 | Opacity of the line and its end marker |

### Why not `stroke` and friends

For the same reason the halo has `halo-*` properties: a label's record also
styles its icon, so `stroke` on a label already means something, and a callout
stored as a stroke would ring the icon as well. `callout-color`,
`callout-width` and `callout-opacity` follow `halo-color`, `halo-width`,
`halo-opacity` and `icon-color`.

### Why the point fields are strings

`callout-via` and `callout-attach` are pairs, stored as `"x,y"` strings rather
than two numeric columns each. A pair is set, moved and cleared as a unit, a
single column keeps the attribute table readable, and the string survives CSV,
DBF and GeoJSON unchanged. Values are rounded to tenths of a pixel (via) and
thousandths (attach) when the GUI writes them.

### Why `callout-via` is relative to the anchor

The via point is what the user moves to route a callout around a symbol near
the anchor, so it is stored in the anchor's space, where those symbols are.
When the *text* is dragged, the GUI moves the via point with it, in the same
command (see [Dragging the text](#dragging-the-text)); that is interaction
policy, not storage. A CLI edit of `dx`/`dy` leaves the via point alone.

### Why `callout-attach` is relative to the text box

The attachment point belongs to the text: it has to move when the text moves
and stay on the box when the box changes size as text is edited or rewrapped.
Fractions of the padded box do both. A fraction of `0` or `1` on either axis
puts the point on an edge, which is where the GUI snaps it.

## Line breaks

### The soft break marker

A **hard break** is one the user typed. It is stored as the two-character `\n`
escape, as now; a real newline and `<br>` are also accepted on input.

A **soft break** is one the wrapper inserted. It is stored as **`<wbr>`**,
inserted at the break point and consuming no character: the space the line
broke at, or the hyphen it broke after, stays in the text before the marker.
Removing every `<wbr>` therefore gives back exactly the text the user typed,
which is what the editor edits and what the wrapper rewraps.

```
label-text: "Mount Rainier National <wbr>Park\\nEst. 1899"
```

Reasons for `<wbr>`:

- **It is inspectable.** It reads plainly in the GUI's attribute table and in
  JSON output, which an invisible character (U+200B, U+2028) would not.
- **It follows an existing convention.** `<br>` is already accepted as a line
  break in `label-text`; `<wbr>` is its HTML sibling, and the case-insensitive
  `<br>` pattern does not match it.
- **It degrades well outside mapshaper.** In HTML -- a web map's popup, a
  table in a report -- `<wbr>` is a line-break *opportunity*, so text that was
  wrapped for print reflows to its container instead of breaking at the print
  width, while hard breaks written as `<br>` still break.
- **It survives the command parser**, unlike a real newline.

The renderer treats `<wbr>` as a line break. Whitespace before a soft break is
dropped from the rendered line, because a trailing space would shift an
end- or middle-justified line by a space's width. The editor keeps it (see
[Editing](#editing)).

A path label cannot have multiple lines; soft breaks in one are removed and the
text is rendered on one line, as hard breaks already are (they are joined with
spaces).

### Why lines are stored

SVG 1.1 has no area text. SVG 2's `inline-size` would wrap text natively, but
only Firefox implements it, and Illustrator imports SVG text as point text
either way; Illustrator's own SVG export writes area text as positioned lines.
`<foreignObject>` with HTML wraps natively but is dropped or mangled by
Illustrator, Figma, Inkscape and most non-browser renderers. So exported text
carries explicit lines whatever the design, and the only question is where they
are decided.

Recomputing them at export (in Node, with fontkit and a line-breaking
algorithm) was the alternative. It fails the WYSIWYG requirement whenever the
exporting machine's fonts or line-breaking rules differ from the browser's, and
a line break is a far more visible difference than the few pixels an alignment
correction can be off by. Node wrapping is still useful for text blocks written
from the CLI and is planned, but as a fallback, later.

### Staleness

Stored breaks are only right for the text, width and font they were computed
with. The GUI rewraps in the same command as any change to those: text edits,
`label-width`, `font-family`, `font-size`, `font-weight`, `font-style`,
`font-stretch`, `letter-spacing` and `css`. Each label has text of its own, so a
style change on several text blocks is followed by one `-style label-text=...
ids=N` per block whose breaks moved, all in one command string: one undo step
and one line of session history.

```
-style font-size='20' ids=0,3 -style label-text='Mount Rainier <wbr>National Park' ids=0
```

A CLI `-style` that changes one of them on a text block leaves its breaks as
they were until the label is next edited in the GUI, which saves the text with
fresh breaks even if not a character of it changed. There is no Node wrapper to
rewrap it sooner yet.

### How the GUI wraps

The browser's own line breaker is used, read back through the DOM, so that
every rule it implements comes for free: UAX #14 line-break classes (breaks
after hyphens and dashes, none at no-break spaces, none before closing
punctuation, CJK breaks between ideographs), dictionary breaking for Thai, Lao
and Khmer, and grapheme-cluster safety.

1. An offscreen `<div>` is given the label's font properties, `width:
   label-width px`, `white-space: pre-wrap` and `overflow-wrap: break-word`.
2. The unwrapped text is set as its content.
3. `Range.getClientRects()` over successive characters reports each one's line
   box; a change in `top` marks the start of a new line. Offsets where a line
   starts without a hard break before it are the soft breaks.
4. `<wbr>` is inserted at those offsets.

There is no API that reports line breaks directly (`Intl.Segmenter` has no line
granularity, and canvas does not wrap), but this technique is reliable across
all three engines. For label-length text it takes well under a millisecond, so
it runs on every keystroke.

Not in the first version: automatic hyphenation (`hyphens: auto` inserts a
hyphen glyph the DOM text does not contain, so it would need detecting and
storing), `text-wrap: balance`, and a per-label `lang`.

## Callouts

### Geometry

Everything is computed at render time, in the label's local pixel space, from
the anchor, the text box and the callout fields. Nothing derived is stored.

**The text box** is estimated from the drawn offset (`getDrawnLabelOffset()`),
the measured width of the widest line (`getMeasuredTextWidth()`, which the GUI
and Node both supply), the number of lines, the line height and the font size.
The top of the box is 0.8em above the first baseline and the bottom 0.2em below
the last. When the width cannot be measured, `label-width` is used; when that
is missing too, the box has no width and the callout attaches at the text
origin. The padded box is the text box grown by `callout-padding`.

**The attachment point** `T`:

- with `callout-attach`: that fraction of the padded box;
- automatic, `elbow`: the side of the padded box facing the via point (or the
  anchor), level with the middle of the first line -- unless the via point (or
  anchor) is directly above or below the box, within its horizontal extent,
  where a side landing would cross the text. Then it is the facing top or
  bottom edge: at its middle when coming from the anchor, or straight above or
  below the via point;
- automatic, `line` and `curve`: where the segment from the anchor (or via
  point) to the box's centre crosses the padded box.

**The via point** `V`:

- `elbow`, automatic, into a side: level with `T`, placed so the segment from
  the anchor rises at 45 degrees, or straight up or down if the text is too
  close horizontally for that;
- `elbow`, automatic, into the top or bottom: level with the anchor, directly
  under or over `T`, so that the line leaves the anchor horizontally and lands
  vertically. A horizontal leg shorter than 8px, or than 1.5 times the end
  marker, is a jog rather than a leg: `T` moves over the anchor and the line
  goes straight up or down;
- `curve`, automatic: the midpoint of the chord from the anchor to `T`,
  pushed sideways by a fifth of its length.

**The path**:

- `line`: anchor to `T`.
- `elbow`: anchor to `V` to `T`.
- `curve`: the quadratic Bézier from the anchor to `T` that passes through `V`
  at its midpoint (control point `2V - (A + T) / 2`). A handle on the curve
  rather than a control point off it is what the path-label curvature tool
  already does. The curve's farthest point from the chord is at `V`, so the
  handle is where the bend visibly is.

**The anchor end** is trimmed by `callout-gap` along the path (for a curve, by
searching for the parameter at that distance), then an end marker is drawn
there, with sides `callout-end-size` px long. Unset, the size grows with the
line width: `7 + 3w`, which is 10 for the default 1px line. The size is the
length of the head's sides as drawn, rather than its length along the line,
because the two styles are different shapes: at one length along the line the
open one looked the larger, and sides of the same length are what make them
look the same size.

- `arrow`: a filled triangle pointing along the path's direction at its end,
  44° at its point; the line is shortened so its cap does not poke through the
  tip. On a curve the head points along the chord from its tip to where the
  curve leaves it, and the curve is refit to start at the middle of the head's
  base, heading along the head's axis, while keeping its end and its direction
  at the text. Without the refit, the curve would cross the base off-centre and
  at an angle.
- `open-arrow`: a stroked chevron in the line's colour and width, 70° at its
  point, with the line running into it. Round joins reach half a line width
  past a point, so the point is set back by that much and the arrow ends where
  a filled one would. The join and the round cap at the far end each add half
  a line width to an arm, so the arms are drawn a line width short of the
  size.

**No callout is drawn** when the anchor end falls inside the padded box, or
when the gap consumes the whole first segment.

### Rendering

`renderPoint()` puts the callout first in the label's group, below the icon
and the text:

```xml
<g transform="translate(...)">
  <g class="label-callout" opacity="...">
    <path d="M..." fill="none" stroke="..." stroke-width="1"/>
    <path d="M...Z" fill="..."/>   <!-- arrowhead; a stroked, unfilled path
                                        for an open one -->
  </g>
  <circle .../>   <!-- icon -->
  <text ...>...</text>
</g>
```

The GUI and export share this path, so the callout pans for free with the
label's group transform and scales with the frame. Arrowheads are drawn as
geometry rather than SVG `<marker>` elements, which Illustrator and Figma
import unreliably.

## Editing

The existing editing engine stays as it is: an offscreen `<textarea>` is the
model of record, its value is written into the SVG `<text>` on every input, and
the caret is drawn from SVG character positions. `<foreignObject>` is not used
for editing, for the reason the label design gives: it renders through a
different text engine from the `<text>` that is exported.

For a text block:

- `decodeLabelText()` strips soft breaks, so the textarea holds the text as
  typed.
- On every input, the text is wrapped with the offscreen `<div>` and the
  resulting lines are rendered.
- A soft break consumes no character, so the space it broke at stays at the end
  of its line in the session's rendered text (the session node already
  preserves whitespace). The editor's rule that every typed character is a
  laid-out character, and so the identity mapping between edited and rendered
  indexes, is unchanged.
- The text is committed with its soft breaks.

## GUI

### Panel

Sections whose heading carries an on/off switch -- Halo, Icon and the new
Callout section -- **collapse to their heading while off** and open when
switched on. The controls under a switched-off heading are inert anyway, so
hiding them loses nothing, and it keeps the panel short. A strict accordion
(one open section at a time) was rejected because it hides settings adjusted
together and makes the panel jump under the pointer. The panel does not
scroll: its colour pickers are wider than the panel and open over the map, and
a scrolling panel would clip them. Collapsing is what keeps it short.

A gap of 0 is not carried into the style of new labels, because merging the
remembered style drops falsy values; a new label gets the automatic gap.

The Callout section:

- **Line**: shape buttons (straight, elbow, curve), with the line's **Width**
  beside them in the narrow column;
- **End**: arrowhead buttons (none, solid, open), with the head's **Size**
  beside them. The size field shows the size the marker is
  drawn at, which for one with no `callout-end-size` is the default its line
  width gives it, and is inert with no marker;
- colour and opacity;
- gap, in the narrow column.

Each choice sits in the wide column with the size that qualifies it beside
it, as Alignment has Line height.

Geometry -- via point, attachment point, gap -- is edited on the map, not in
the panel.

There is no wrap width field. An earlier version had one in the Text section,
but a block's width is set by the drag that places it and changed with its
width handle, and a field that point text and path text cannot use was clutter
in a panel they share. A width typed into it before a label existed also had
no way to show which label it would apply to.

Text blocks have their own Fixed/Draggable mode, defaulting to Draggable (see
the label tool design's "The mode belongs to the tool"), and a drag of a
block's text leaves its justification alone: point text re-justifies as it
crosses its anchor so that it grows away from the point, but a block's lines
are laid out in its column, and re-justifying them would rearrange the text
rather than move it. While the text is dragged the selection's column box is
drawn from the drag's preview record, as the handles are during a handle drag,
and goes on being until the command's redraw replaces the preview.

### Handles

Shown only when exactly one anchored label is selected, to keep hit precedence
manageable (the label design already notes that several drags now land on one
object). Their positions and what dragging each one writes are pure functions
in `gui-label-handles.mjs`; the callout's come from the same
`getLabelCalloutShape()` the renderer draws with, which reports the padded
box, `T`, `V` and the trimmed tip along with the shape.

- **Width handle**, on text blocks only, a square at the bottom corner of the
  side that is free to move: the right for text that starts at its anchor, the
  left for text that ends there, the right for centred text, which grows both
  ways. A corner
  rather than the middle of the side, because the middle of a side is where an
  elbow meets a one-line label. A selected text block shows two boxes: a
  solid one around its wrapped text, which is the label itself and what a
  callout meets, and behind it a fainter dashed one for its column, the width
  it wraps to, whose corner the handle sits on. The editor draws the same
  column behind its pink box, so a block just placed shows its width before
  anything is typed into it.
  Dragging it rewraps the text live, and one command on release writes
  `label-width` and the rewrapped text. A label stays the kind it was made
  as: point text has no width handle, and double-clicking a block's does
  nothing, where it once turned the block back into point text. An earlier
  version gave point text the handle too, so that a drag converted it into a
  block, which was too easy to do by accident.
- **Via handle**, a ring at the elbow's corner or on the curve at `V`.
  Dragging an elbow's snaps to horizontal and vertical alignment with the
  anchor and the attachment point, within 5 screen px. A curve's does not
  snap: its midpoint has no reason to line up with either end.
- **Attachment handle**, a filled dot at `T`, which lands on the nearest edge
  of the padded box and snaps to its corners, its middle, and on a side, the
  first line's midline.
- **Gap handle**, a small ring at the trimmed anchor end; the gap is the
  pointer's distance from the anchor. Left off when it would be within 6 screen
  px of the anchor, where it would cover the anchor's own handle.

Double-clicking a callout handle returns it to automatic. The handles and the
anchor show the pointing-hand cursor, and the text shows `move`, since the two
are often close together. A click on a handle
does nothing, since the hit test counts the callout as the label and a second
click would otherwise open its text. A label handle and the anchor knot within
reach of the pointer go to whichever is nearer. In Draggable mode the glyphs
outrank the anchor handle under them, but not these handles, which sit on the
box's edge.

A drag previews by redrawing that one label from a copy of its record with the
drag's values (`replaceAnchoredSymbol()`), rendered exactly as the layer
renders it, and commits one `-style` on release. The data is never touched
before the command, and the command's own redraw replaces the preview.

### The text block tool

The label toolbar has a third button, between the anchored and path label
tools, which is the way to make a text block. A click places an anchored label with a wrap width of
160px. A drag across the map sets the width instead. Either way the block is left-aligned, with the top left of
its column at the anchor (`text-anchor` start, `dx` 0, and `dy` putting the top
of the first line there) in place of the panel's position; a drag to the left
anchors it where the drag ended. The drag's guide is drawn into the map's
shared `<svg>`, as a pending label is, because a new label layer has no markup
of its own until its first label exists.

### Dragging the text

Dragging the text changes `dx`/`dy` as now. A label with a callout is redrawn
on each move rather than moved by its attributes, so the line follows. If the
label has a `callout-via`, it moves with the text in the same command:

- `curve`: by the rotation and scale about the anchor that takes the old
  attachment point to the new one, so the curve keeps its shape;
- `elbow`: its x scales with the anchor-to-attachment span, and it stays level
  with the attachment point if it was level before (a horizontal landing stays
  horizontal); otherwise its y scales too.

Holding Alt leaves the via point where it is.

### Moving the anchor

Dragging the anchor moves the whole annotation, as now. Planned: with a
modifier it moves the anchor alone, `dx`/`dy` (and a `callout-via`) being
compensated so the text stays put, in the same command.

## Stages

1. **Core rendering** (done). `<wbr>` soft breaks in the renderer, the
   measurer and path labels; `label-width`; the callout fields, geometry and
   rendering; `-style` and `-add-label` options; tests.
2. **Panel** (done). Collapsing Halo, Icon and Callout while their switches
   are off; the Callout section.
3. **GUI wrapping** (done). The offscreen wrapper (`gui-label-wrap.mjs`);
   editor integration; rewrapping on typography changes. (A Wrap width field
   was added here and later taken out; see Panel.)
4. **Handles** (done, but for anchor-only drags). Width, via, attachment and
   gap handles; live callout preview and via-following during text drags; the
   text block tool.
5. **Node wrapping** (deferred). fontkit measurement plus a UAX #14
   implementation (e.g. the `linebreak` package from foliojs, whose
   `unicode-trie` dependency fontkit already brings in) and `Intl.Segmenter`
   for dictionary scripts, used when `-style` changes a text block's width or
   font, and for text blocks written from the CLI.

## Known limitations

- **Breaks depend on the authoring browser's fonts**, like every measurement.
  They are stored, so they do not change afterwards, but a project authored in
  two browsers can have text blocks wrapped by two engines.
- **CLI edits do not rewrap** until Node wrapping exists.
- **Soft hyphens (U+00AD)** are laid out by the wrapper's HTML but not drawn by
  SVG as a hyphen at a break, so a line broken at one loses its hyphen.
- **The text box height is estimated** from the font size and line height, not
  measured, so a callout attached to the top or bottom edge can sit slightly
  off the glyphs in fonts with unusual ascenders or descenders.
- **An automatic attachment point can jump** from one side of an elbowed
  label's text to the other as the text is dragged across its anchor. That is
  the intent, but a dragged attachment point stays where it was put.
