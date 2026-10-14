import { El } from './gui-el';
import { SizeField } from './gui-size-field';
import {
  appendFontOptions, getFontStyleVariants, getNearestFontStyleVariant, variantIsRegular
} from './gui-label-fonts';

// The font menu, and the face menu and size field under it: the label panel's
// Text section and the symbol panel's marker text share them, so that a
// marker's number is set in type the way a label is.
//
// The controls whose own contents say what they are -- a font name, a size
// beside a font style -- carry no label.

// What a control shows for a selection whose features disagree about it. One
// word, used in every field and menu that can be in that state, in the
// placeholder of a field emptied for it.
export var MIXED_TEXT = 'mixed';

// opts:
//   onFont(name)       a font was chosen from the menu
//   onFace(variant)    a face was chosen: {style, weight}
//   onSize(px)         a size was typed
//   onSizeStep(delta)  the size field's arrows or arrow keys
//   onDone()           the size field is finished with
export function FontControls(parent, opts) {
  var fontRow = El('div').addClass('label-style-row').appendTo(parent);
  var fontSelect = El('select').attr('aria-label', 'Font').addClass('font-menu')
    .appendTo(fontRow).on('change', function() {
      if (fontSelect.node().value) opts.onFont(fontSelect.node().value);
    });
  var styleSizeRow = El('div').addClass('label-style-row label-split-row').appendTo(parent);
  var faceCell = El('div').addClass('label-split-cell label-font-style-row').appendTo(styleSizeRow);
  var faceSelect = El('select').attr('aria-label', 'Font style').appendTo(faceCell)
    .on('change', function() {
      var variant = parseFontStyleVariant(faceSelect.node().value);
      if (variant) opts.onFace(variant);
    });
  var sizeCell = El('div').addClass('label-split-cell label-size-row').appendTo(styleSizeRow);
  var sizeField = new SizeField(sizeCell, {
    title: 'Font size in px',
    onSet: opts.onSize,
    onStep: opts.onSizeStep,
    onDone: opts.onDone
  });
  var fontOptionsRendered = false;

  // Detecting the installed fonts takes a moment, so the menu is filled the
  // first time its panel is shown rather than when the panel is built.
  //
  // No "Default font" entry: it named a font the user could not see and
  // mapshaper could not measure. A label with no font-family of its own is
  // shown in the font the browser draws it in, under that font's own name.
  this.renderFontOptions = function() {
    if (fontOptionsRendered) return;
    fontOptionsRendered = true;
    fontSelect.empty();
    appendFontOptions(fontSelect.node());
  };

  // A font the menu does not list still has to show, or the label would look
  // as though it had no font: a file can name a font that is not installed
  // here, and a project moves between machines. It is added to the menu as
  // itself rather than replaced by an installed font, since the name is the
  // user's data and choosing something else for them would restyle the label.
  //
  // shown: {value, mixed}
  this.showFont = function(shown, disabled) {
    var fontVal = shown.value;
    fontSelect.node().disabled = !!disabled;
    // A font menu is a list of fonts, so "they are in different fonts" cannot
    // be one of the fonts: it is an entry that appears only while it is true,
    // and picking it does nothing (the change handler ignores a blank value).
    // The list stays live, so choosing a font is how the selection is brought
    // into line -- as it is for the face menu below.
    setMixedOption(fontSelect, shown.mixed);
    fontSelect.node().value = fontVal || '';
    if (fontVal && fontSelect.node().selectedIndex < 0) {
      El('option').attr('value', fontVal).text(fontVal).appendTo(fontSelect);
      fontSelect.node().value = fontVal;
    }
    // Nothing selected, rather than the first font in the list, for a target
    // there is nothing to say about -- a disabled menu with nothing behind it.
    if (!fontVal && !shown.mixed) fontSelect.node().selectedIndex = -1;
  };

  // The faces the chosen font is installed with, and no entry for "whatever
  // the font is set in by default": that is Regular, which is one of the faces
  // and is named as one. With no font chosen the menu is empty and dead --
  // there are no faces to list, and a face belongs to a font.
  //
  // style, weight: what the features agree on, or '' if they disagree
  this.showFace = function(fontName, style, weight, disabled) {
    // Empty means the selection disagrees, here as everywhere in the panels;
    // an unset style reads as Regular, because that is what it renders as.
    var mixed = !!fontName && !(style && weight);
    // A font-style and font-weight the font has no face for still has to
    // show as something, and the nearest face is what the browser is
    // rendering it as anyway.
    var shown = mixed || !fontName ? null :
      getNearestFontStyleVariant(fontName, style, weight);
    faceSelect.empty();
    if (fontName) {
      getFontStyleVariants(fontName).forEach(function(variant) {
        El('option').attr('value', variant.value).appendTo(faceSelect).text(variant.label);
      });
    }
    // The faces are rebuilt above, so the "mixed" entry goes on afterwards.
    setMixedOption(faceSelect, mixed);
    faceSelect.node().disabled = !!disabled || !fontName;
    faceSelect.node().value = shown ? shown.value : '';
    // Nothing selected rather than the first face, for a menu with no font to
    // list the faces of.
    if (!shown && !mixed) faceSelect.node().selectedIndex = -1;
  };

  // shown: {value, mixed}
  this.showSize = function(shown, disabled) {
    sizeField.setValue(shown.value || '');
    sizeField.setPlaceholder(shown.mixed ? MIXED_TEXT : '');
    sizeField.setDisabled(!!disabled);
  };

  // What the controls are showing, for saving as a style
  this.getFont = function() { return fontSelect.node().value; };
  this.getFace = function() { return parseFontStyleVariant(faceSelect.node().value); };
  this.getSize = function() { return sizeField.getValue(); };
}

// The [field, value] pairs that change a font to @fontName, carrying the face
// across with it: text in Bold Italic stays in Bold Italic, or in the nearest
// thing the new font is installed with. Both go in one command, so the change
// is one undo step and the text is never briefly in a face the font does not
// have.
//   style, weight: what the features are set in, with their defaults filled in
export function getFontChangeValues(fontName, style, weight) {
  var values = [['font-family', fontName]];
  var variant = getNearestFontStyleVariant(fontName, style, weight);
  if (variant && !(variant.style == style && variant.weight == weight)) {
    values = values.concat(getFontStyleValues(variant));
  }
  return values;
}

// Regular is stored as no face at all, for the same reason full opacity is
// stored as no opacity: normal 400 is what a font renders as when nothing
// says otherwise, and a column of them on every feature a panel has touched
// is noise in the user's table.
export function getFontStyleValues(variant) {
  if (variantIsRegular(variant)) {
    return [['font-style', ''], ['font-weight', '']];
  }
  return [['font-style', variant.style], ['font-weight', variant.weight]];
}

// A face menu's value is 'style|weight'
export function parseFontStyleVariant(value) {
  var parts = String(value).split('|');
  if (parts.length != 2) return null;
  return {
    style: parts[0],
    weight: parts[1]
  };
}

// Adds or removes a menu's "mixed" entry, which carries no value: a select
// showing nothing looks like a control that failed to load, and this is the
// one state a panel cannot express by lighting no button.
//
// First in the list, and removed as soon as the selection agrees, so that it
// is never an option among the real ones.
function setMixedOption(select, mixed) {
  var el = select.node();
  var first = el.options[0];
  var has = !!first && first.value === '' && first.dataset.mixed == 'true';
  if (mixed && !has) {
    first = document.createElement('option');
    first.value = '';
    first.textContent = MIXED_TEXT;
    first.dataset.mixed = 'true';
    el.insertBefore(first, el.firstChild);
  } else if (!mixed && has) {
    el.removeChild(first);
  }
}
