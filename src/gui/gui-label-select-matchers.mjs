// Selecting a group of labels by pointing at one of them: every label on the
// layer, or the ones that share its text style, its colour or its symbol.
//
// Styling a group is something the panel could already do -- a control shows
// nothing when the selected labels disagree, and writes to all of them -- but
// there was no way to select more than a shift-click's worth. These are the
// predicates the context menu offers, as pure functions so that they can be
// tested without a map.
//
// See docs/development/label-tool-design.md.

// The properties that make up "the same text style": how the glyphs are drawn,
// and nothing about where the text sits.
//
// Alignment, position, offsets and a path label's start offset are left out
// deliberately. They are what the panel's other sections edit, and two labels
// in the same font at the same size are in the same text style whether one of
// them is centred and the other hangs north-east of its anchor -- which is
// usually the difference between a label placed by hand and one that was not.
//
// css and class are in, because either can carry anything the properties above
// carry and more: two labels are not in the same text style if one of them is
// wearing a stylesheet the other is not.
export var TEXT_STYLE_FIELDS = [
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch',
  'letter-spacing', 'line-height', 'css', 'class'
];

// The colour of the text, and not its opacity: the item says colour, and a
// label faded to 50% is the same colour as one that is not.
export var FILL_FIELDS = ['fill'];

// The shape of the symbol, and not its size or colour, for the same reason.
export var ICON_FIELDS = ['icon'];

// What a property means when a label does not carry it.
//
// Compared after this substitution, so that a label with font-size=12 and one
// with no font-size match: they render identically, and the panel already
// treats them as agreeing. Without it the commonest pair of labels on a map --
// one the panel has touched and one it has not -- would count as different
// text styles while looking the same.
//
// font-family is deliberately absent. An unset font is whatever the browser
// resolves sans-serif to, which differs by machine and is a real difference
// from a font the user named, so an unset font is its own value and matches
// only another unset one. css, class and icon are absent because they have no
// default: not having one is not the same as having a particular one.
var STYLE_DEFAULTS = {
  'font-size': 12,
  'font-style': 'normal',
  'font-weight': '400',
  'letter-spacing': 0,
  fill: '#000000'
};

// The items the "select" section offers, in menu order.
//
// needs: a property the pointed-at label must carry for the item to be worth
//   offering. "Same icon" on a label with no symbol would select every label
//   that has none, which is a question nobody asked and which "all labels"
//   nearly answers anyway.
var SELECT_KINDS = [
  {name: 'all', label: 'all labels'},
  {name: 'text-style', label: 'same text style', fields: TEXT_STYLE_FIELDS},
  {name: 'fill', label: 'same fill color', fields: FILL_FIELDS},
  {name: 'icon', label: 'same icon', fields: ICON_FIELDS, needs: 'icon'}
];

// Every label on the layer, in ascending id order.
//
// Not every feature: a labels layer can hold plain points as well -- a dots
// layer given label text by the point panel is one -- and a point is not
// something the label panel can style.
//
//   records: the layer's data records, or null
//   isLabel: (rec) -> whether a record is a label at all. Injected rather than
//     imported so that this module stays testable without the GUI's internals;
//     the caller passes internal.svg.featureIsLabel.
export function getAllLabelIds(records, isLabel) {
  var ids = [];
  var i;
  for (i = 0; records && i < records.length; i++) {
    if (isLabel(records[i])) ids.push(i);
  }
  return ids;
}

// The labels that match label @id on @kind, in ascending id order.
//
//   records: the layer's data records, or null
//   id:      the label the predicate is taken from, which is always in the result
//   kind:    'all', 'text-style', 'fill' or 'icon'
//   isLabel: as getAllLabelIds()
export function getMatchingLabelIds(records, id, kind, isLabel) {
  var defn = findKind(kind);
  var rec = records && records[id];
  if (!defn || !rec || !isLabel(rec)) return [];
  return getAllLabelIds(records, isLabel).filter(function(i) {
    return !defn.fields || fieldsMatch(records[i], rec, defn.fields);
  });
}

// The menu items worth offering for a right-click on label @id, as
// [{name, label, ids}, ...].
//
// Two kinds of item are dropped rather than shown and disabled:
//
// - One that would select the label already pointed at and nothing else. It
//   would look like a way of narrowing the selection to one label, which a
//   plain click on that label already is.
// - One that matches every label on the layer, which "all labels" says more
//   plainly. On a layer styled all at once -- a freshly placed set of labels,
//   or one styled from the CLI -- that is most of them, and four items doing
//   the same thing says nothing about the layer.
export function getLabelSelectActions(records, id, isLabel) {
  var out = [];
  var total = null;
  SELECT_KINDS.forEach(function(defn) {
    var rec = records && records[id];
    var ids;
    if (!rec || defn.needs && !hasValue(rec[defn.needs])) return;
    ids = getMatchingLabelIds(records, id, defn.name, isLabel);
    if (defn.name == 'all') total = ids.length;
    if (ids.length < 2) return;
    if (defn.name != 'all' && ids.length === total) return;
    out.push({name: defn.name, label: defn.label, ids: ids});
  });
  return out;
}

function findKind(name) {
  var found = null;
  SELECT_KINDS.forEach(function(defn) {
    if (defn.name == name) found = defn;
  });
  return found;
}

function fieldsMatch(a, b, fields) {
  return fields.every(function(field) {
    return styleValue(a, field) === styleValue(b, field);
  });
}

// A property as it is compared: what the label carries, or what it means to
// carry nothing, as a string so that 12 and '12' are one value.
function styleValue(rec, field) {
  var val = rec ? rec[field] : null;
  if (!hasValue(val)) {
    val = field in STYLE_DEFAULTS ? STYLE_DEFAULTS[field] : '';
  }
  return String(val);
}

function hasValue(val) {
  return !(val === undefined || val === null || val === '');
}
