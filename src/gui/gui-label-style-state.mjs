// The style the label tool gives to the next label it creates.
//
// The style panel is worth having open before there is anything to point it at:
// pick a font, then place labels in it. Values set with nothing selected are
// held here rather than written to a layer, and -add-label writes them when a
// label finally exists -- so this is a tool default, not data, and it never
// needs its own undo step.
//
// See docs/development/label-tool-design.md.

// The style properties -add-label accepts. A panel control whose property is
// missing from this list would appear to do nothing when set with no selection,
// so the list is checked rather than assumed.
export var NEW_LABEL_STYLE_FIELDS = [
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch',
  'letter-spacing', 'line-height', 'text-anchor', 'label-align',
  'dominant-baseline',
  'label-pos', 'label-side', 'label-start-offset', 'dx', 'dy',
  'fill', 'opacity', 'css', 'class',
  'icon', 'icon-size', 'icon-color', 'icon-opacity'
];

// values: [[field, value], ...], the form the panel's controls produce
// Returns a new object, leaving the original alone.
//
// A blank or zero value removes the field instead of setting it: that is how
// the panel says "no icon" (icon='', icon-size=0) and "no inline css", and
// carrying those through to -add-label would write properties that mean
// nothing.
export function mergeStyleValues(style, values) {
  var out = Object.assign({}, style);
  (values || []).forEach(function(pair) {
    var field = pair[0];
    var value = pair[1];
    if (NEW_LABEL_STYLE_FIELDS.indexOf(field) == -1) return;
    if (!value && value !== false) {
      delete out[field];
    } else {
      out[field] = value;
    }
  });
  return out;
}

// What the tool gives a label before anything has been chosen for it.
//
// A label with no position at all sits with its baseline on its anchor point,
// so the point lands at the foot of the text rather than in it: click a spot,
// type, and the words appear above the place they are about to be read as
// marking. 'c' centres the text on the anchor instead, which is what clicking
// somewhere and typing looks like it should do, and it is the position an icon
// is drawn to sit behind.
//
// Only the tool defaults this. -add-label with no position still creates a
// label without one, so the default is a choice this tool makes and passes on
// explicitly, not a meaning the command gives to its absence.
export var DEFAULT_NEW_LABEL_STYLE = {'label-pos': 'c'};

export function getNewLabelStyle(gui) {
  if (!gui.state.new_label_style) {
    gui.state.new_label_style = Object.assign({}, DEFAULT_NEW_LABEL_STYLE);
  }
  return gui.state.new_label_style;
}

export function updateNewLabelStyle(gui, values) {
  gui.state.new_label_style = mergeStyleValues(getNewLabelStyle(gui), values);
  return gui.state.new_label_style;
}

export function clearNewLabelStyle(gui) {
  gui.state.new_label_style = null;
}

// What a drag on a label's glyphs means: 'fixed' moves the label, anchor and
// text together, and 'draggable' leaves the anchor where it is and offsets the
// text from it.
//
// A question that has to be answered somewhere, and answering it with a mode
// rather than by hit priority is what keeps a centred label -- whose text sits
// on top of its own anchor -- grabbable at all.
//
// It belongs to the tool and not to the label. Which segment is lit cannot be
// derived from a record: a label with label-pos=ne can be dragged or not, and
// one that has been dragged stays dragged when the toggle goes back to Fixed.
// A per-label "locked" flag would be a field nothing else reads and one more
// column in -o out.csv.
//
// Fixed on entry, so that a stray drag cannot displace text in a session that
// never asked for it, and remembered while the tool stays on.
export var LABEL_POSITION_MODES = ['fixed', 'draggable'];

export function getLabelPositionMode(gui) {
  return gui.state.label_position_mode || 'fixed';
}

export function setLabelPositionMode(gui, mode) {
  gui.state.label_position_mode =
    LABEL_POSITION_MODES.indexOf(mode) > -1 ? mode : 'fixed';
  // The panel's toggle and the tool's drag both read this, and neither owns the
  // other; the panel also has to relight the grid, whose cells mean something
  // different in each mode.
  gui.dispatchEvent('label_position_mode_change');
}

export function labelTextIsDraggable(gui) {
  return getLabelPositionMode(gui) == 'draggable';
}

// The label currently open for text editing, or null: {id, refocus}.
//
// Two modules need it and neither owns the other. The editor needs to say
// which label the caret is in, because a label is usually styled while it is
// being typed into -- you place one, then set its font and position with the
// text still empty -- and the panel would otherwise be pointed at "the next
// label" and leave the one on screen unstyled. The panel needs @refocus to put
// the caret back after a control that takes focus, such as the font menu, so
// that typing carries on where it left off.
//
// This is the live session only, set when it opens and cleared when it closes.
// It is not a memory of the last label edited: a panel that keeps acting on a
// label the user has finished with is the bug this replaced.
export function setLabelTextSession(gui, session) {
  gui.state.label_text_session = session || null;
  // The panel's controls and its "Editing:" line both read the session, so it
  // has to hear about one opening or closing -- neither is a map redraw or a
  // selection change, which are the events it already watches.
  gui.dispatchEvent('label_text_session_change');
}

export function getLabelTextSession(gui) {
  return gui.state.label_text_session || null;
}
