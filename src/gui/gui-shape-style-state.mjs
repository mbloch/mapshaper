// The style the line and polygon tools give to the next shape they draw.
//
// With drawing armed and nothing selected, the style panel sets this instead
// of running -style, and the -add-shape command that creates a shape writes it
// (see getAddShapeCommand() in gui-draw-commands.mjs). So, as with the label
// tool's new-label style, it is a tool default rather than data, and setting it
// is not an undo step.
//
// See docs/development/line-tool-design.md.

var LINE_FIELDS = ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'line-start', 'line-end', 'line-end-size', 'line-fade', 'opacity'];

var POLYGON_FIELDS = ['stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity',
  'fill-pattern', 'outer-glow-color', 'outer-glow-opacity', 'outer-glow-width',
  'inner-glow-color', 'inner-glow-opacity', 'inner-glow-width', 'opacity'];

// The colors of the outline a layer with no style is drawn with (see
// gui-layer-styler.mjs), which a shape with no stroke of its own is drawn with
// while it is being drawn.
var DEFAULT_STROKE = '#334';
var DEFAULT_STROKE_DARK = 'white';

// The stroke written to a shape that needs one: the style panel's default
// stroke color, which its other controls add (see gui-layer-style-tool.mjs),
// in the six-digit form its color field and picker take.
var DEFAULT_SHAPE_STROKE = '#000000';
var DEFAULT_SHAPE_STROKE_DARK = '#ffffff';

// The style properties a shape of @geometryType can be drawn with
export function getNewShapeStyleFields(geometryType) {
  return geometryType == 'polygon' ? POLYGON_FIELDS : LINE_FIELDS;
}

// values: [[field, value], ...], the form the panel's controls produce
// Returns a new object, leaving the original alone. A blank value removes the
// field, which is how the panel's controls say "unset".
export function mergeShapeStyleValues(style, values, geometryType) {
  var fields = getNewShapeStyleFields(geometryType);
  var out = Object.assign({}, style);
  (values || []).forEach(function(pair) {
    var field = pair[0], value = pair[1];
    if (fields.indexOf(field) == -1) return;
    if (value === '' || value === null || value === undefined) {
      delete out[field];
    } else {
      out[field] = value;
    }
  });
  return out;
}

export function getNewShapeStyle(gui, geometryType) {
  var styles = gui.state.new_shape_styles || {};
  return styles[getKey(geometryType)] || {};
}

export function updateNewShapeStyle(gui, geometryType, values) {
  var styles = gui.state.new_shape_styles || {};
  styles[getKey(geometryType)] = mergeShapeStyleValues(getNewShapeStyle(gui, geometryType),
    values, geometryType);
  gui.state.new_shape_styles = styles;
  gui.dispatchEvent('new_shape_style_change', {geometry_type: geometryType});
  return styles[getKey(geometryType)];
}

export function clearNewShapeStyle(gui, geometryType) {
  var styles = gui.state.new_shape_styles || {};
  delete styles[getKey(geometryType)];
  gui.state.new_shape_styles = styles;
  gui.dispatchEvent('new_shape_style_change', {geometry_type: geometryType});
}

// The style a path is drawn with while it is being drawn: the stroke the shape
// will have, or the outline of a layer with no style when it has none. The
// path is open until it is finished, so a polygon's fill is not shown.
export function getPendingPathStyle(style, darkMode) {
  var out = {};
  LINE_FIELDS.forEach(function(field) {
    if (style && field in style) out[field] = style[field];
  });
  if (!out.stroke) {
    out.stroke = darkMode ? DEFAULT_STROKE_DARK : DEFAULT_STROKE;
  }
  if (!out['stroke-width'] && out['stroke-width'] !== 0) {
    out['stroke-width'] = 1;
  }
  return out;
}

// The style an -add-shape command gives a new shape. A layer with a style of
// its own draws a shape with none as nothing at all, so a shape given neither
// a stroke nor a fill gets the panel's default stroke. The path being drawn is
// shown in this style too (see refreshPath() in gui-draw-lines2.mjs), so that
// it does not change color when it is finished.
//
// layerIsStyled: the layer has style fields (see layerHasDrawableStyle())
export function getNewShapeCommandStyle(style, layerIsStyled, darkMode) {
  var out = Object.assign({}, style);
  if (layerIsStyled && !out.stroke && !out.fill) {
    out.stroke = darkMode ? DEFAULT_SHAPE_STROKE_DARK : DEFAULT_SHAPE_STROKE;
  }
  return out;
}

function getKey(geometryType) {
  return geometryType == 'polygon' ? 'polygon' : 'polyline';
}
