import { El } from './gui-el';

// A number field with a stepper attached to its right edge: type a size, click
// the stepper's arrows, or use the arrow keys while the field has focus. Each covers a
// different way a size is really chosen -- typed when it is known, stepped when
// it is being judged against the map, keyboard when the hand is already in the
// field. The panel's sizes were display-only spans with a −/+ pair, so the only
// route from 12 to 24 was twelve clicks.
//
// Blank is a state here, not a value: a size over a mixed selection has no
// number to show, and leaving the field must not invent one. That is why
// ClickText() is not wrapped, close as its parse/bounds/commit behaviour is --
// it holds a number at all times and reverts a blank field to it, which here
// would restyle labels the user never looked at.
//
// opts:
//   min, max      bounds, inclusive (default 1, 999)
//   step, bigStep arrow-key and button increments (default 1, 10)
//   onSet(value)  a size was typed into the field
//   onStep(delta) a step was asked for. The caller resolves what to step from,
//                 because the field may be blank while the labels are not.
//   title         tooltip for the field
export function SizeField(parent, opts) {
  var o = Object.assign({min: 1, max: 999, step: 1, bigStep: 10}, opts || {});
  var box = El('div').addClass('size-field').appendTo(parent);
  var input = El('input').attr('type', 'text').addClass('size-field-input').appendTo(box);
  var stepper = El('div').addClass('size-field-stepper').appendTo(box);
  // Up above down, the way a stepper is read
  var plusBtn = makeStepButton(stepper, 1, 'size-field-up');
  var minusBtn = makeStepButton(stepper, -1, 'size-field-down');
  var shown = ''; // what the field was last told to display
  var dirty = false; // holds typing that has not been committed
  var disabled = false;

  if (o.title) input.attr('title', o.title);

  // While the caret is in this field the keyboard belongs to it. Without this
  // the GUI's own handlers see the keystrokes: Escape would disarm the tool,
  // Enter would finish a curve being drawn, Backspace would take back a knot.
  input.on('keydown', function(e) {
    var action = getSizeFieldKeyAction(e.key, e.shiftKey, o);
    e.stopPropagation();
    if (!action) return;
    e.preventDefault();
    if (action.type == 'step') {
      // A step supersedes whatever was being typed, and its result has to
      // reach the field: the value comes back through setValue().
      dirty = false;
      step(action.delta);
    } else if (action.type == 'commit') {
      commit();
    } else if (action.type == 'revert') {
      setDisplay(shown);
    }
  });

  input.on('input', function() {
    dirty = true;
  });

  // Fires on Enter and on blur-after-editing, which is the same commit point
  // the panel's colour and CSS fields use.
  input.on('change', commit);

  // Keeps the caret where it is while a size is stepped -- in this field, or in
  // the label being typed into. A click on a div blurs whatever has focus
  // unless the default is refused, and the panel only refuses it during an
  // editing session.
  stepper.on('mousedown', function(e) {
    e.preventDefault();
  });

  // Triangles rather than + and −, which read as arithmetic on the value:
  // these step to the next size, and one of them is at the end of its range as
  // often as not.
  function makeStepButton(parent, dir, className) {
    var arrow = dir > 0 ? 'M4.5 1.1L7.5 4.9H1.5z' : 'M4.5 4.9L1.5 1.1h6z';
    return El('div')
      .addClass('label-panel-btn size-field-btn')
      .addClass(className)
      .attr('role', 'button')
      .appendTo(parent)
      .html('<svg class="size-field-arrow" viewBox="0 0 9 6"><path d="' + arrow + '"></path></svg>');
  }

  function step(delta) {
    if (disabled || !o.onStep) return;
    o.onStep(delta);
  }

  function commit() {
    var val = parseSizeValue(input.node().value, o.min, o.max);
    if (disabled) return;
    if (val === null) {
      // Nothing usable typed, including nothing at all: put back what the
      // field was showing rather than styling anything.
      setDisplay(shown);
      return;
    }
    setDisplay(String(val));
    if (String(val) !== shown && o.onSet) o.onSet(val);
    shown = String(val);
  }

  function setDisplay(str) {
    input.node().value = str;
    dirty = false;
  }

  minusBtn.on('click', function() { step(-o.step); });
  plusBtn.on('click', function() { step(o.step); });

  // '' for no common value. Skipped while the field holds typing that has not
  // been committed, so that a refresh cannot overwrite a half-typed number --
  // but not merely because the field has focus, or a size stepped from the
  // keyboard would not appear in the field it was stepped in.
  this.setValue = function(val) {
    shown = val || val === 0 ? String(val) : '';
    if (dirty && document.activeElement === input.node()) return;
    setDisplay(shown);
  };

  this.setDisabled = function(off) {
    disabled = !!off;
    input.node().disabled = disabled;
    box.classed('disabled', disabled);
    [minusBtn, plusBtn].forEach(function(btn) {
      btn.classed('disabled', disabled)
        .attr('aria-disabled', disabled ? 'true' : 'false');
    });
  };

  // The size the field is showing, or null if it is not showing one.
  this.getValue = function() {
    return parseSizeValue(input.node().value, o.min, o.max);
  };

  this.node = function() {
    return box.node();
  };
}

// What a keystroke in a size field means, or null for one it leaves alone.
// Shift multiplies the step, the convention for a coarse nudge.
export function getSizeFieldKeyAction(key, shiftKey, opts) {
  var o = opts || {};
  var step = o.step > 0 ? o.step : 1;
  var bigStep = o.bigStep > 0 ? o.bigStep : 10;
  var delta = shiftKey ? bigStep : step;
  if (key == 'ArrowUp') return {type: 'step', delta: delta};
  if (key == 'ArrowDown') return {type: 'step', delta: -delta};
  if (key == 'Enter') return {type: 'commit'};
  if (key == 'Escape') return {type: 'revert'};
  return null;
}

// The size a typed string means, clamped to the field's bounds, or null if it
// does not hold one -- which includes holding nothing.
//
// Trailing units are accepted because the panel displays plain numbers but
// users paste values from CSS: "14px" is a size, and refusing it would be
// pedantry. Rounded to a tenth, so that a stepped value cannot accumulate
// float noise into the data.
export function parseSizeValue(str, min, max) {
  var val = parseFloat(str === null || str === undefined ? '' : String(str).trim());
  if (!isFinite(val)) return null;
  val = Math.round(val * 10) / 10;
  if (isFinite(min) && val < min) val = min;
  if (isFinite(max) && val > max) val = max;
  return val;
}
