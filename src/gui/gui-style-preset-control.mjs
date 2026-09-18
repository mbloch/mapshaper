import { El } from './gui-el';
import { GUI } from './gui-lib';
import { showPopupAlert, showPrompt } from './gui-alert';
import { makeStylePresetId } from './gui-style-presets';

// Saved styles: a menu that applies one, and a button that saves the current
// one. Shared by the label panel and the layer style panel.
//
// The menu shows what it is for rather than what was last chosen -- "Apply
// saved style", before and after it closes. That is less display than a
// <select> gives, and it is less bookkeeping too: a menu that goes on naming
// the style it applied is making a claim that the next edit falsifies, so the
// display had to be walked back from every control in both panels, through a
// preservePreset flag that told a style command whether it came from the menu
// or from a font being picked by hand. With nothing displayed there is no
// claim to keep honest.
//
// Deleting is in the menu, one small button per row, because a Delete button
// outside it would refer to nothing on screen once the menu stopped naming a
// style. That is what costs the native <select>: an <option> holds text and
// nothing else, so a per-row button means a menu of divs.
//
// The gain is that the row now refuses focus like the rest of the panel. A
// native menu is drawn by the OS and closes the moment its element is blurred,
// which is why a label being typed into must not be handed its caret back on
// the click that opens one (see "Keeping the caret while the panel is used" in
// gui-label-tool.mjs). Divs never take the caret in the first place. The font
// menus are still native, so the exception stays for them.

// The one open menu, if any. Both panels build one of these, and only one
// panel is up at a time, but closing whatever was open is cheaper to keep true
// than the argument that two cannot overlap.
var openMenu = null;

document.addEventListener('mousedown', function(e) {
  if (!openMenu) return;
  // Clicks inside are the menu's own business: a name applies a style and
  // closes, a delete button opens a prompt.
  if (e.target.closest?.('.label-saved-style-menu')) return;
  closeOpenMenu();
}, true);

// Escape closes the menu and stops there, so that the key does not also reach
// whatever it means to the map behind the panel -- in label mode it ends the
// editing session. Captured at the document, before the GUI's own keydown
// listener, which bubbles.
document.addEventListener('keydown', function(e) {
  if (!openMenu || e.keyCode != 27) return;
  e.stopPropagation();
  closeOpenMenu();
}, true);

function closeOpenMenu() {
  if (openMenu) openMenu();
}

export function StylePresetControl(parent, opts) {
  // A section of the panel like Text and Icon, and headed like them.
  var row = El('div').addClass('label-style-section label-saved-style-row').appendTo(parent);
  var menu, menuBtn, list, saveBtn;

  var title = El('div').addClass('label-style-section-title').appendTo(row);
  El('span').addClass('label-style-section-name').appendTo(title).text('Saved styles');

  var controls = El('div').addClass('label-saved-style-controls').appendTo(row);
  menu = El('div').addClass('label-saved-style-menu').appendTo(controls);
  // "Apply style", not "Apply saved style": the heading above it has already
  // said what these styles are. "Save current" rather than "Save", which left
  // it to the reader to guess what was being saved.
  menuBtn = makeButton(menu, 'label-saved-style-btn', 'Apply style', toggleMenu);
  list = El('div').addClass('label-saved-style-list').appendTo(menu).hide();
  saveBtn = makeButton(controls, 'label-saved-style-save', 'Save current', openSaveStylePopup);

  render();

  this.render = render;
  this.update = updateControls;

  function makeButton(parent, className, label, action) {
    // No tabindex: the GUI is pointer-only (see the focus note in page.css).
    var btn = El('div').addClass('label-saved-style-button').addClass(className)
      .attr('role', 'button').appendTo(parent);
    El('span').appendTo(btn).text(label);
    btn.on('click', function() {
      if (this.classList.contains('disabled')) return;
      action();
    });
    return btn;
  }

  function toggleMenu() {
    if (menuIsOpen()) {
      closeMenu();
    } else {
      openTheMenu();
    }
  }

  function menuIsOpen() {
    return list.visible();
  }

  function openTheMenu() {
    closeOpenMenu();
    renderList();
    list.show();
    // Opens downward unless that would run off the bottom of the window. The
    // row is the last thing in the panel, so there is usually room below it --
    // the panel itself does not clip -- but a short window or a long list can
    // put the far end of the menu out of reach.
    list.classed('drop-up', false);
    if (list.node().getBoundingClientRect().bottom > window.innerHeight - 8) {
      list.classed('drop-up', true);
    }
    menuBtn.addClass('open');
    openMenu = closeMenu;
  }

  function closeMenu() {
    list.hide();
    menuBtn.removeClass('open');
    if (openMenu == closeMenu) openMenu = null;
  }

  function openSaveStylePopup() {
    closeMenu();
    var popup = showPopupAlert('', opts.saveTitle);
    var el = popup.container();
    el.addClass('option-menu');
    el.html(`<div><input type="text" class="style-name text-input" placeholder="style name"></div>
      <div class="btn dialog-btn">Save</div>`);
    var input = el.findChild('.style-name');
    var btn = el.findChild('.btn');
    input.node().focus();
    btn.on('click', function() {
      var name = input.node().value.trim();
      if (!name) return;
      saveStyleWithName(name);
      popup.close();
    });
    input.on('keydown', function(e) {
      if (e.key == 'Enter') {
        btn.node().click();
      }
    });
  }

  function saveStyleWithName(name) {
    var styles = getSavedStyles();
    var type = getType();
    var id = makeStylePresetId(styles, type, name);
    var item = {
      id: id,
      name: name,
      style: opts.getStyle()
    };
    if (opts.useType !== false) {
      item.type = type;
    }
    styles.push(item);
    styles.sort(opts.sort || sortByName);
    setSavedStyles(styles);
    render();
  }

  // Saved styles live in localStorage, outside the command pipeline, so
  // deleting one cannot be undone and this prompt is all there is between a
  // misclick and a lost style. The menu closes first: the prompt is a dialog
  // of its own, and leaving a menu open behind it would only raise the
  // question of what the menu is showing while it is answered.
  async function deleteStyle(item) {
    var id = getItemId(item);
    closeMenu();
    if (!await showPrompt('Delete ' + opts.styleLabel + ' "' + item.name + '"?', 'Delete saved style')) return;
    setSavedStyles(getSavedStyles().filter(function(other) {
      return getItemId(other) != id;
    }));
    render();
  }

  function render() {
    if (menuIsOpen()) renderList();
    updateControls();
  }

  // Built when the menu opens, rather than kept in step with the saved styles:
  // it is off screen the rest of the time, and the two things that change it
  // -- a save and a delete -- are both done from here.
  function renderList() {
    var styles = getVisibleStyles();
    list.empty();
    if (styles.length === 0) {
      // Drawn rather than left out, so that the menu says why it is empty. A
      // disabled <option> used to do this.
      El('div').addClass('label-saved-style-empty').appendTo(list).text('No saved styles');
      return;
    }
    styles.forEach(function(item) {
      var itemEl = El('div').addClass('label-saved-style-item').appendTo(list);
      // The name is the target for applying, and it stops short of the delete
      // button, so that the row reads as two things to click rather than one
      // with a hazard at the end of it.
      El('span').addClass('label-saved-style-name').appendTo(itemEl).text(item.name)
        .on('click', function() {
          closeMenu();
          opts.applyStyle(item.style);
        });
      // Hidden until the row is under the pointer -- the opposite of what the
      // size fields do with their steppers, and deliberately: those are the
      // point of a control in constant use, this is a rare destructive action
      // in a menu that is only on screen while it is being used, and a
      // destructive action is better for waiting until intent is shown.
      El('div').addClass('label-saved-style-delete').attr('role', 'button')
        .attr('title', 'Delete this ' + opts.styleLabel)
        .appendTo(itemEl).html('&times;')
        .on('click', function() {
          deleteStyle(item);
        });
    });
  }

  function updateControls() {
    var disabled = opts.disabled ? opts.disabled() : false;
    setButtonDisabled(menuBtn, disabled);
    setButtonDisabled(saveBtn, disabled);
    if (disabled && menuIsOpen()) closeMenu();
  }

  function setButtonDisabled(btn, disabled) {
    btn.classed('disabled', !!disabled).attr('aria-disabled', disabled ? 'true' : 'false');
  }

  function getVisibleStyles() {
    var type = getType();
    return getSavedStyles().filter(function(item) {
      return opts.filter ? opts.filter(item, type) : true;
    });
  }

  function getSavedStyles() {
    var styles = GUI.getSavedValue(opts.storageKey);
    return Array.isArray(styles) ? styles : [];
  }

  function setSavedStyles(styles) {
    GUI.setSavedValue(opts.storageKey, styles);
  }

  function getType() {
    return typeof opts.type == 'function' ? opts.type() : opts.type;
  }

  function getItemId(item) {
    return opts.getItemId ? opts.getItemId(item) : item.id;
  }
}

function sortByName(a, b) {
  var aName = String(a.name || '').toLowerCase();
  var bName = String(b.name || '').toLowerCase();
  return aName < bName ? -1 : aName > bName ? 1 : 0;
}
