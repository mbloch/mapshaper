import { ColorPicker, isHexColor, layerColorPresetRows } from './gui-color-picker';
import { El } from './gui-el';
import { parseOpacityValue } from './gui-style-values';

// The parts the style panels are built from. They were the label panel's, and
// three panels drawing the same control three ways is how they came to look
// like three programs: a colour was a swatch inside a field in one and a
// button beside a box in the others, and a size was a field with a stepper in
// one and a value between a − and a + in the others.
//
// The look is in page.css, keyed on .label-style-panel, which every style
// panel carries.

// A section of a panel: a heading and the rows under it. Whitespace and the
// heading separate one from the next -- a rule as well would be a third
// answer to a question already settled twice.
//
// opts.minor: a heading in the smaller grey of a row caption rather than the
// bold of a section name, for a section that is a single control.
export function makePanelSection(parent, title, opts) {
  var section = El('div').addClass('label-style-section').appendTo(parent);
  // The heading's type is on the name rather than on the row, because the row
  // also holds things that are not headings -- a switch, or a caption over a
  // column of the row below.
  var row = El('div').addClass('label-style-section-title')
    .classed('label-style-section-minor', !!(opts && opts.minor))
    .appendTo(section);
  El('span').addClass('label-style-section-name').appendTo(row).text(title);
  return section;
}

// Deliberately not focusable: the GUI is pointer-only, so a tab stop here
// would lead into a control the keyboard cannot then operate. See the focus
// note in page.css.
export function makePanelButton(parent, label, action) {
  return El('div')
    .addClass('label-panel-btn')
    .attr('role', 'button')
    .appendTo(parent)
    .text(label)
    .on('click', function(e) {
      if (this.classList.contains('disabled')) return;
      action(e);
    });
}

// A button with a word on it rather than a glyph: Clear style, Random fills,
// Create. Shaped like the panel's fields rather than like its 19px icon
// buttons, because what it does is named rather than drawn, and it is as wide
// as the name.
export function makePanelActionButton(parent, label, action) {
  var btn = El('div')
    .addClass('label-panel-action-btn')
    .attr('role', 'button')
    .appendTo(parent)
    .on('click', function(e) {
      if (this.classList.contains('disabled')) return;
      action(e);
    });
  El('span').appendTo(btn).text(label);
  return btn;
}

export function setPanelButtonDisabled(el, disabled) {
  el.classed('disabled', !!disabled)
    .attr('aria-disabled', disabled ? 'true' : 'false');
}

// A colour swatch and its hex value inside one border, so that the pair reads
// as one field rather than as a button beside a text box.
export function makeColorField(parent, chit, input) {
  var box = El('div').addClass('label-color-field').appendTo(parent);
  chit.appendTo(box);
  input.addClass('label-color-input').appendTo(box);
  return box;
}

// A colour field with its opacity at the right-hand end, behind a divider:
// opacity qualifies the colour, and one border says so where two fields side
// by side said they were separate settings. It also leaves the narrow column
// of the row free for a field that needs it. The opacity has no caption; its
// percent sign and its tooltip say what it is.
//
// Returns the field's box; the opacity input is made by makeOpacityInput().
export function makeColorOpacityField(parent, chit, input, opacityOpts) {
  var box = makeColorField(parent, chit, input).addClass('label-color-opacity-field');
  var opacity = makeOpacityInput(box, opacityOpts);
  return {box: box, opacity: opacity};
}

// A colour and its opacity in one field, captioned, in the wide column of a
// split row. Fill and Stroke are each one of these.
//
// opts.label            the caption over the field
// opts.onColor(hex)     a colour was typed, picked or previewed to a finish
// opts.onOpacity(frac)  a usable percentage was typed
// opts.revert()         one that was not, so put the row back as it was
//
// control.aside is the row's narrow column, empty, for a field that belongs
// beside the colour -- a stroke's width, say.
export function makeColorRow(parent, opts) {
  var row = El('div').addClass('label-style-row label-split-row').appendTo(parent);
  var colorCell = El('div').addClass('label-split-cell label-color-row').appendTo(row);
  var aside = El('div').addClass('label-split-cell').appendTo(row);
  var control = {row: row, aside: aside, chit: null, input: null, opacity: null, picker: null};

  control.setColor = function(color) {
    control.input.node().value = color || '';
    control.chit.css('background-color', isHexColor(color) ? color : 'transparent');
  };

  // What a panel calls when it refreshes from the data: the picker has to start
  // from the colour that is set, not from wherever it was left. A picker that
  // has never been opened is still on its default, so without this it opens on
  // black rather than on the colour beside it. Kept apart from setColor(),
  // which is also the picker's own preview callback and must not feed back into
  // it mid-drag.
  control.showColor = function(color) {
    control.setColor(color);
    if (isHexColor(color)) control.picker.setColor(color);
  };

  El('span').appendTo(colorCell).text(opts.label);
  control.chit = El('div').addClass('label-color-chit').attr('role', 'button')
    .on('click', function() {
      control.picker.toggle();
    });
  control.input = El('input').attr('type', 'text')
    .attr('title', opts.label + ' color')
    .on('change', function() {
      var color = control.input.node().value.trim();
      if (isHexColor(color)) control.picker.setColor(color);
      opts.onColor(color);
    });
  control.opacity = makeColorOpacityField(colorCell, control.chit, control.input, {
    onSet: opts.onOpacity,
    revert: opts.revert
  }).opacity;
  control.picker = new ColorPicker(colorCell, {
    presetRows: layerColorPresetRows,
    // A drag in the picker shows on the map's own terms -- the swatch and the
    // hex value -- and only the colour the drag ends on is applied.
    onPreview: control.setColor,
    onChange: function(hex) {
      control.setColor(hex);
      opts.onColor(hex);
    }
  });
  return control;
}

// Opacity is shown as a percentage and stored as a fraction. It is a plain
// field rather than a swatch or a slider: a swatch beside a colour reads as a
// second colour, and a slider gives up the exact value for a drag that a
// zoomable map makes risky.
//
// opts.onSet(fraction) a usable percentage was typed
// opts.revert()        it was not, so put back what the field was showing
export function makeOpacityInput(parent, opts) {
  var input = El('input').attr('type', 'text').addClass('label-opacity-input')
    .attr('title', 'Opacity, 0-100%')
    .appendTo(parent)
    .on('change', function() {
      var val = parseOpacityValue(input.node().value);
      if (val === null) {
        if (opts.revert) opts.revert();
        return;
      }
      opts.onSet(val);
    });
  return input;
}
