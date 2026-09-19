// Who owns the keyboard while a style panel is open, and what happens to a
// field that has been used.
//
// Shared by the label panel and the layer style panel, which have the same
// shape of controls: text fields that commit on `change`, native menus, and
// divs that are not focusable at all.
//
// See docs/development/label-tool-design.md, "Keeping the caret while the
// panel is used".

// Whether typing into @node means typing into a field rather than at the map.
export function isTextInput(node) {
  if (!node) return false;
  if (node.nodeName == 'TEXTAREA') return true;
  return node.nodeName == 'INPUT' &&
    !/^(button|checkbox|radio|submit)$/.test(node.type);
}

// While the caret is in one of @panel's fields, the keyboard belongs to that
// field. Without this the GUI's own handlers see the keystrokes: a Backspace
// typed into a field takes back the last knot of a curve being drawn, and an
// Escape disarms the tool rather than leaving the field -- silently, because
// the tool consumes the key before the panel sees it. The cost is that a
// browser shortcut in a field, such as undo, is the field's rather than the
// application's, which is what it means in a text field anywhere else.
//
// Enter and Escape are what finish with a field. Enter keeps what was typed,
// which the field's own change handler applies as focus leaves it; Escape
// calls @opts.revert to put back what the panel was showing, which is also
// what stops that handler from firing on the way out. Both then call
// @opts.release, which decides where the keyboard goes next.
export function claimFieldKeys(panel, opts) {
  panel.addEventListener('keydown', function(e) {
    if (!isTextInput(e.target)) return;
    e.stopPropagation();
    if (e.key != 'Enter' && e.key != 'Escape') return;
    e.preventDefault();
    if (e.key == 'Escape' && opts.revert) opts.revert();
    if (opts.release) opts.release();
  });
}

// Lets go of whatever in @panel has focus, so that the keyboard goes back to
// the map. A control that keeps focus keeps the keyboard, and goes on showing
// a focus ring over a value that has already been applied, which reads as a
// value still being edited.
//
// Only reaches into the panel, so that a click somewhere else while a menu is
// open still means what it says.
export function releasePanelFocus(panel) {
  var el = document.activeElement;
  if (!el || !panel.contains(el)) return false;
  el.blur();
  return true;
}
