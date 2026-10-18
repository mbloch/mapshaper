import { El } from './gui-el';
import { makePanelButton, setPanelButtonDisabled } from './gui-panel-controls';
import { getIconShapeGlyph } from './gui-icon-shapes';

var MORE_GLYPH = '<svg class="label-icon-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
  '<circle cx="3" cy="8" r="1.5"></circle><circle cx="8" cy="8" r="1.5"></circle>' +
  '<circle cx="13" cy="8" r="1.5"></circle></svg>';

// The icon shape buttons of the label and symbol panels: a button for each
// shape, and the NYT icons in a menu opened by a "more" button at the end of
// the row. While one of the menu's icons is the selected shape, the button
// shows it.
//   parent: the button group
//   shapes: from getIconShapes()
//   onSelect(name)
export function IconShapeButtons(parent, shapes, onSelect) {
  var mainShapes = shapes.filter(function(o) { return !o.nytOnly; });
  var menuShapes = shapes.filter(function(o) { return o.nytOnly; });
  var btns = {};
  var menuItems = {};
  var moreBtn = null;
  var menu = null;
  var selected = '';

  mainShapes.forEach(function(item) {
    btns[item.name] = makePanelButton(parent, '', function() {
      onSelect(item.name);
    }).attr('data-icon', item.name).attr('aria-label', item.title);
    El(getIconShapeGlyph(item.name)).appendTo(btns[item.name]);
  });
  if (menuShapes.length > 0) {
    initMenu();
  }

  // @name: the selected shape, or '' for none
  // @isDisabled(name): whether a shape can't be chosen
  this.update = function(name, isDisabled) {
    var menuShape = findMenuShape(name);
    selected = name || '';
    mainShapes.forEach(function(item) {
      btns[item.name].classed('selected', item.name == selected);
      setPanelButtonDisabled(btns[item.name], isDisabled(item.name));
    });
    if (!moreBtn) return;
    menuShapes.forEach(function(item) {
      menuItems[item.name].classed('selected', item.name == selected);
      menuItems[item.name].classed('disabled', isDisabled(item.name));
    });
    moreBtn.classed('selected', !!menuShape);
    moreBtn.empty();
    El(menuShape ? getIconShapeGlyph(menuShape.name) : MORE_GLYPH).appendTo(moreBtn);
    setPanelButtonDisabled(moreBtn, menuShapes.every(function(item) {
      return isDisabled(item.name);
    }));
  };

  this.getSelected = function() {
    return selected;
  };

  this.closeMenu = closeMenu;

  function findMenuShape(name) {
    return menuShapes.find(function(o) { return o.name == name; }) || null;
  }

  function initMenu() {
    moreBtn = makePanelButton(parent, '', toggleMenu)
      .addClass('icon-shape-more-btn').attr('aria-label', 'More icons');
    El(MORE_GLYPH).appendTo(moreBtn);
    // In the page rather than the panel, so that the panel's edges don't clip it
    menu = El('div').addClass('icon-shape-menu').appendTo(document.body).hide();
    // Keeps the focus where it is: a label being typed into would otherwise
    // be saved and closed before the item's click
    menu.on('mousedown', function(e) { e.preventDefault(); });
    menuShapes.forEach(function(item) {
      var row = El('div').addClass('icon-shape-menu-item').attr('role', 'button')
        .attr('data-icon', item.name).appendTo(menu)
        .on('click', function() {
          if (row.hasClass('disabled')) return;
          closeMenu();
          onSelect(item.name);
        });
      El(getIconShapeGlyph(item.name)).appendTo(row);
      El('span').text(item.title).appendTo(row);
      menuItems[item.name] = row;
    });
  }

  function toggleMenu() {
    if (menu.visible()) closeMenu(); else openMenu();
  }

  function openMenu() {
    var rect = moreBtn.node().getBoundingClientRect();
    menu.css('top', Math.round(rect.bottom + 4) + 'px');
    menu.css('right', Math.round(window.innerWidth - rect.right) + 'px');
    menu.show();
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function closeMenu() {
    if (!menu || !menu.visible()) return;
    menu.hide();
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onDocumentMouseDown(e) {
    if (menu.node().contains(e.target) || moreBtn.node().contains(e.target)) return;
    closeMenu();
  }

  // Escape closes the menu, and nothing else: it would otherwise disarm the
  // tool too
  function onKeyDown(e) {
    if (e.key != 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    closeMenu();
  }
}
