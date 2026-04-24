// Hamburger menu in the top-right of the header. After the user starts
// editing, the splash bar (Docs / GitHub / Survey / Sponsor) is hidden by
// gui.mjs; this menu is the post-edit replacement, exposing the same links
// from a single button so the editing controls don't have to share the row.

import { El } from './gui-el';

export function HeaderMenu() {
  var btn = El('#header-menu-btn');
  var dropdown = El('#header-menu-dropdown');
  if (!btn.node() || !dropdown.node()) return; // markup missing; nothing to do

  var open = false;

  function setOpen(state) {
    if (state === open) return;
    open = state;
    dropdown.classed('hidden', !open);
    btn.attr('aria-expanded', open ? 'true' : 'false');
  }

  btn.on('click', function(e) {
    e.stopPropagation();
    setOpen(!open);
  });

  // Keyboard activation matches button semantics for the role="button" span.
  btn.on('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(!open);
    }
  });

  // Outside click closes the menu. Clicks on menu items also close it (they
  // navigate or open in a new tab; either way the menu shouldn't linger).
  document.addEventListener('click', function(e) {
    if (!open) return;
    var target = e.target;
    if (btn.node().contains(target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function(e) {
    if (open && e.key === 'Escape') {
      setOpen(false);
      btn.node().focus();
    }
  });
}
