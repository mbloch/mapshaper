# Line and polygon drawing

The line tool (`gui-draw-lines2.mjs`) creates each shape with an `-add-shape`
command. A shape drawn in the GUI is therefore one undo step and one line of
session history, and an agent working from the command line can make the same
shape with the same syntax.

## One mode for drawing and styling

Drawing is part of the line and polygon style modes ("edit lines" and "edit
polygons" in the arrow menu, `line_style` and `polygon_style` internally). A
floating toolbar has undo and redo, then two buttons, Draw and Reshape, which
arm one of two tools; with neither armed, a click selects shapes for styling.
Then come a Styles button, which shows and hides the style panel, and Done,
which leaves the mode. The panel's × hides the panel too, rather than leaving
the mode, so that the whole map can be drawn on. A hidden panel stays hidden,
for the rest of the session, each time the mode is entered. Selection works the same with or without
Draw: the shape under the pointer is highlighted, a click selects it alone
(shift-click adds or removes it), and a click off the selection deselects.

- **Draw** adds shapes. A click on a shape still selects it, so a line can be
  restyled without leaving the tool; Esc or a click off the selection
  deselects it, and the next click starts a path. A drag pans the map unless a
  path is being drawn, a vertex is marked (below), or Alt or Cmd is held. In a
  polygon layer only a polygon's outline is a hit, so a click inside a polygon
  starts a path rather than selecting it.
- **Reshape** edits the vertices of any shape: hovering over a shape shows its
  vertices, and a vertex can be dragged, inserted (by dragging a point between
  two vertices) or deleted (from the context menu). It adds no shapes.
- **Interaction mode vs. tool mode.** `gui.interaction.getMode()` is the mode
  the user chose, which decides the panel, the menu and the edit session.
  `gui.interaction.getToolMode()` is what the pointer does: `edit_lines` or
  `edit_polygons` while Draw is armed, `reshape_lines` or `reshape_polygons`
  while Reshape is, otherwise the same as the mode. The hit control, the map's
  overlay styles and the drawing tool read the tool mode. Arming or disarming
  dispatches `interaction_tool_change` (`{mode, tool_mode, prev_tool_mode}`),
  and `interaction_mode_change` carries `tool_mode` as well.
- **Arming.** The toolbar buttons call `setArmedTool('draw' | 'reshape' |
  null)`; `getArmedTool()` reads it. Draw is armed on entry when the layer is
  empty, since there is nothing to style yet. The "lines" and "polygons" links
  in the layer panel, and `setMode('edit_lines')` / `setMode('edit_polygons')`
  (kept as aliases), open the style mode with Draw armed, adding an empty layer
  when the active layer is of another type.
- **Esc** does the first of: finish the path being drawn; deselect (in Draw);
  disarm the tool; leave the mode, as in other modes.
- **New-shape style.** While Draw is armed and nothing is selected, the panel's
  controls set the style of the next shape (`gui-shape-style-state.mjs`, kept
  in `gui.state.new_shape_styles` for each geometry type) instead of running
  `-style`. The editing status reads "Editing: new lines". Setting the style is
  not an undo step: like the label tool's new-label style, it is a tool default,
  not data. With a selection, or with Draw disarmed, the panel styles the
  layer's features again.
- **Writing the style.** `createShape()` passes the new-shape style to
  `getAddShapeCommand()`, which writes each field as a style option. Plain
  numbers are written without quotes. In a layer that has a style of its own, a
  shape with no stroke and no fill would not be drawn, so it gets the default
  stroke (`getNewShapeCommandStyle()`): `#000000`, the color the panel's other
  controls add when they need a stroke. The path being drawn uses the same
  style, so it doesn't change color when the shape is finished.

## Starting from an existing vertex

In Draw, a vertex is marked (in the hover-vertex color) when the pointer nears
one a path can start from, and a path started there begins at the vertex's
exact coordinates:

- **The end of a line** is marked without a modifier, and a path started there
  extends that line instead of adding one: extending is the more common
  intent. The path is drawn in the extended line's style, and finishing it
  runs `-add-shape ... extend`, with no style options, so the line keeps its
  attributes. An endpoint counts only if exactly one open path in the layer
  ends there (`internal.findLineEnds()`), since lines drawn in the GUI do not
  share topology and several can end at the same point.
- **With Alt (Option) held**, the nearest vertex of any shape is marked, not
  only an endpoint, and a path started there is a new line. This is how a T
  junction is made, and how a new line is started at the end of another. With
  Alt and no vertex near, a click starts a path where it is, even over a shape.
- Polygon layers have no extend, so a vertex is marked there only with Alt.

While a path is being drawn, snapping is as before: the pointer snaps to any
vertex, the path's start (to close a polygon) or a point on a shape.

## The command

`-add-shape` adds one point, line or polygon to the target layer, or to a new
layer when there is no target or with `+`:

```
-add-layer geometry-type=polyline name=routes
-add-shape coordinates=0,0,10,5,20,0 stroke=#c00 stroke-width=2 line-end=arrow target=routes
-add-shape coordinates=0,0,10,0,5,8 closed fill=#ccd stroke=#336 target=zones
```

- `coordinates=` is `x,y` for a point and `x,y,x,y,...` for a path. A path that
  ends where it starts is a polygon. `closed` closes an open path.
- `geojson=` takes a Feature or a bare geometry instead, and `properties=` sets
  attributes.
- The style options are the ones `-style` takes (`featureStyleOpts` in
  `mapshaper-options.mjs`), and become properties of the new feature.
- The shape is made to fit the target layer: a ring added to a line layer stays
  a line, and an open path added to a polygon layer is an error unless `closed`
  is given. New fields match the types of the target's existing ones.
- An empty target layer keeps its name.
- `extend` joins the path to the line in a polyline target that ends at the
  path's first vertex, or failing that its last, making the two one path of the
  same feature (`-add-shape coordinates=10,0,15,5 extend target=routes`). The
  vertex has to match the endpoint exactly, and only one line may end there.
  Style options and `properties=` update the line's attributes. The extended
  line is written to a copy of the target layer, which replaces it, as a merged
  layer does: until the command finishes, the GUI goes on drawing the layer it
  has, whose arcs its display arcs cover.

`getAddShapeCommand()` in `gui-draw-commands.mjs` writes the command for a
drawn path, with the coordinates at full precision: a vertex snapped to another
path has to land on it exactly.

## The path being drawn

A path being drawn belongs to the tool, not to the layer. Its vertices are held
in the tool, in data and display coordinates, and shown through
`hit.setPendingPath()`, which `getShapeEditingLayers()` in
`gui-overlay-styler.mjs` draws as a synthesized overlay layer. The layer only
changes when the path is finished, so a path that is abandoned leaves no trace
in the data or the history.

The pending path is drawn in the stroke of the new-shape style
(`getPendingPathStyle()`), converted for the canvas by `getCanvasDisplayStyle()`.
With no stroke set, it is drawn like an unstyled layer: dark gray, or white over
a dark basemap. The vertex markers are white over a dark basemap too. A
polygon's fill is not shown until the ring is finished.

While a path is being drawn, Undo takes back its last edit -- a click's vertex,
or a whole stroke -- and Redo restores it. The tool registers these with
`gui.undo.addInterceptor()`, which `Undo#undo()` and `redo()` consult first.
Taking back the first vertex abandons the path.

Finishing a path (double-click, Enter, Esc, leaving the map, closing a polygon,
disarming, or changing modes) runs the command if the path has enough distinct vertices:
two for a line, three for a polygon (`drawnPathIsValid()`). A polygon path that
was left open is closed.

The Reshape tool still edits the layer directly, with in-memory undo states
(`reshape_lines` and `reshape_polygons` are in `closureEditModes` in
`gui-undo.mjs`; the Draw modes are not, since each of their edits is a
command). The command that adds a shape is run with `changesEditTarget`, so an
edit session around those states is checkpointed first (see "Edit sessions and
commands" in `undo-redo-implementation.md`).

## Differences from before

- Each finished shape is one undo step. Before, every vertex and stroke was a
  step of its own, also after the path was finished.
- A polygon is made from one ring. Before, closing a path ran `-polygons` over
  every path drawn in the session, which could make holes.
- In polygon mode, clicking a vertex of another polygon adds a vertex snapped to
  it and goes on drawing, rather than ending the path.
- Drawing and styling were separate modes ("draw lines", "style lines"). New
  lines were black, and hard to see over a dark basemap.
- Drawing mode also reshaped any line under the pointer, and a line could not
  be selected for styling without leaving it. Reshaping is now a tool of its
  own, and a click in Draw selects.
- A path started at the end of a line extends it, rather than adding a line
  that touches it.

## Next steps

- Undo and Redo buttons do not yet reflect the pending path's steps: an
  interceptor has no `canUndo()`, so the buttons show the history underneath.
- Style presets (like the label tool's three styles), or a straight-line-only
  mode, would go beside the Draw and Reshape buttons.
- A click that deselects, followed at once by one that starts a path, makes a
  double-click, which finishes the one-vertex path and so abandons it.
