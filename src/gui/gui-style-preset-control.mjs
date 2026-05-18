import { El } from './gui-el';
import { GUI } from './gui-lib';
import { showPopupAlert, showPrompt } from './gui-alert';
import { makeStylePresetId } from './gui-style-presets';

export function StylePresetControl(parent, opts) {
  var row = El('div').addClass('label-style-row label-saved-style-row').appendTo(parent);
  var select, saveBtn, deleteBtn;

  El('span').appendTo(row).text('Presets');
  select = El('select').appendTo(row).on('change', function() {
    var item = findVisibleStyle(select.node().value);
    if (item) {
      opts.applyStyle(item.style);
    }
    updateControls();
  });
  saveBtn = El('button').appendTo(row).text('Save preset').on('click', openSaveStylePopup);
  deleteBtn = El('button').appendTo(row).text('Delete').on('click', deleteSelectedStyle);
  render();

  this.render = render;
  this.update = updateControls;
  this.clearSelection = clearSelection;
  this.select = function() {
    return select;
  };

  function openSaveStylePopup() {
    var popup = showPopupAlert('', opts.saveTitle);
    var el = popup.container();
    el.addClass('option-menu');
    el.html(`<div><input type="text" class="style-name text-input" placeholder="style name"></div>
      <div tabindex="0" class="btn dialog-btn">Save</div>`);
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

  async function deleteSelectedStyle() {
    var id = select.node().value;
    var item = findVisibleStyle(id);
    var styles;
    if (!item) return;
    if (!await showPrompt('Delete ' + opts.styleLabel + ' "' + item.name + '"?', 'Delete preset')) return;
    styles = getSavedStyles().filter(function(item) {
      return getItemId(item) != id;
    });
    setSavedStyles(styles);
    render();
  }

  function render(selectedId) {
    var styles = getVisibleStyles();
    var value = selectedId || select.node().value;
    select.empty();
    if (styles.length > 0) {
      El('option').attr('value', '').appendTo(select).text('Apply preset...');
      styles.forEach(function(item) {
        El('option').attr('value', getItemId(item)).appendTo(select).text(item.name);
      });
      select.node().value = findVisibleStyle(value) ? value : '';
    } else {
      El('option').attr('value', '').appendTo(select).text('No presets');
      select.node().value = '';
    }
    updateControls();
  }

  function updateControls() {
    var disabled = opts.disabled ? opts.disabled() : false;
    var hasPresets = getVisibleStyles().length > 0;
    select.node().disabled = disabled || !hasPresets;
    saveBtn.node().disabled = disabled;
    deleteBtn.node().disabled = disabled || !select.node().value;
  }

  function clearSelection() {
    if (select.node().value) {
      select.node().value = '';
      updateControls();
    }
  }

  function getVisibleStyles() {
    var type = getType();
    return getSavedStyles().filter(function(item) {
      return opts.filter ? opts.filter(item, type) : true;
    });
  }

  function findVisibleStyle(id) {
    return getVisibleStyles().find(function(item) {
      return getItemId(item) == id;
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
