import { EventDispatcher } from './gui-events';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import { showPopupAlert } from './gui-alert';

// toNext, toPrev: trigger functions for switching between multiple records
export function Popup(gui, toNext, toPrev) {
  var self = new EventDispatcher();
  var parent = gui.container.findChild('.mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  var content = El('div').addClass('popup-content').appendTo(el);
  // multi-hit display and navigation
  var tab = El('div').addClass('popup-tab').appendTo(el).hide();
  var nav = El('div').addClass('popup-nav').appendTo(tab);
  var prevLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('◀');
  var navInfo = El('span').addClass('popup-nav-info').appendTo(nav);
  var nextLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('▶');
  var refresh = null;
  var currId = -1;

  el.addClass('rollover'); // used as a sentinel for the hover function

  nextLink.on('click', toNext);
  prevLink.on('click', toPrev);
  gui.on('popup-needs-refresh', function() {
    if (refresh) refresh();
  });

  self.show = function(id, ids, lyr, pinned) {
    var editable = pinned && gui.interaction.getMode() == 'data';
    var maxHeight = parent.node().clientHeight - 36;
    currId = id;
    // stash a function for refreshing the current popup when data changes
    // while the popup is being displayed (e.g. while dragging a label)
    refresh = function() {
      render(content, id, lyr, editable);
    };
    refresh();
    if (ids && ids.length > 1) {
      showNav(id, ids, pinned);
    } else {
      tab.hide();
    }
    el.show();
    if (content.node().clientHeight > maxHeight) {
      content.css('height:' + maxHeight + 'px');
    }
  };

  self.hide = function() {
    if (!isOpen()) return;
    refresh = null;
    currId = -1;
    // make sure any pending edits are made before re-rendering popup
    GUI.blurActiveElement(); // this should be more selective -- could cause a glitch if typing in console
    content.empty();
    content.node().removeAttribute('style'); // remove inline height
    el.hide();
  };

  return self;

  function isOpen() {
    return el.visible();
  }

  function showNav(id, ids, pinned) {
    var num = ids.indexOf(id) + 1;
    navInfo.text(' ' + num + ' / ' + ids.length + ' ');
    nextLink.css('display', pinned ? 'inline-block' : 'none');
    prevLink.css('display', pinned && ids.length > 2 ? 'inline-block' : 'none');
    tab.show();
  }

  function render(el, recId, lyr, editable) {
    var table = lyr.data; // table can be null (e.g. if layer has no attribute data)
    var rec = table && (editable ? table.getRecordAt(recId) : table.getReadOnlyRecordAt(recId)) || {};
    var tableEl = El('table').addClass('selectable'),
        rows = 0;
    // self.hide(); // clean up if panel is already open
    el.empty(); // clean up if panel is already open
    utils.forEachProperty(rec, function(v, k) {
      var type;
      // missing GeoJSON fields are set to undefined on import; skip these
      if (v !== undefined) {
        type = getFieldType(v, k, table);
        renderRow(tableEl, rec, k, type, editable);
        rows++;
      }
    });

    tableEl.appendTo(el);
    if (rows > 0) {
      // tableEl.appendTo(el);

      tableEl.on('copy', function(e) {
        // remove leading or trailing tabs that sometimes get copied when
        // selecting from a table
        var pasted = window.getSelection().toString();
        var cleaned = pasted.replace(/^\t/, '').replace(/\t$/, '');
        if (pasted != cleaned && !window.clipboardData) { // ignore ie
          (e.clipboardData || e.originalEvent.clipboardData).setData("text", cleaned);
          e.preventDefault(); // don't copy original string with tabs
        }
      });

    } else {
      // Some individual features can have undefined values for some or all of
      // their data properties (properties are set to undefined when an input JSON file
      // has inconsistent fields, or after force-merging layers with inconsistent fields).
      el.html(utils.format('<div class="note">This %s is missing attribute data.</div>',
          table && table.getFields().length > 0 ? 'feature': 'layer'));
    }

    if (editable) {
      // render "add field" button
      var line = El('div').appendTo(el);
      El('span').addClass('add-field-btn').appendTo(line).on('click', async function(e) {
        // show "add field" dialog
        renderAddFieldPopup(recId, lyr);
      }).text('+ add field');
    }
  }

  function renderAddFieldPopup(recId, lyr) {
    var popup = showPopupAlert('', 'Add field');
    var el = popup.container();
    el.addClass('option-menu');
    var html = `<div><input type="text" class="field-name text-input" placeholder="field name"></div>
    <div><input type="text" class="field-value text-input" placeholder="value"><div>
    <div tabindex="0" class="btn dialog-btn">Apply</div> <span class="inline-checkbox"><input type="checkbox" class="all" />assign value to all records</span>`;
    el.html(html);

    var name = el.findChild('.field-name');
    name.node().focus();
    var val = el.findChild('.field-value');
    var box = el.findChild('.all');
    var btn = el.findChild('.btn').on('click', function() {
      var table = internal.getLayerDataTable(lyr); // creates new table if missing
      var all = box.node().checked;
      var nameStr = name.node().value.trim();
      if (!nameStr) return;
      if (table.fieldExists(nameStr)) {
        name.node().value = '';
        return;
      }
      var valStr = val.node().value.trim();
      var value = parseUnknownType(valStr);
      // table.addField(nameStr, function(d) {
      //   // parse each time to avoid multiple references to objects
      //   return (all || d == rec) ? parseUnknownType(valStr) : null;
      // });

      var cmdStr = `-each "d['${nameStr}'] = `;
      if (!all) {
        cmdStr += `this.id != ${recId} ? null : `;
      }
      valStr = JSON.stringify(JSON.stringify(value));
      cmdStr = valStr.replace('"', cmdStr);

      gui.console.runMapshaperCommands(cmdStr, function(err) {
        if (!err) {
          popup.close();
        } else {
          console.error(err);
        }
      });
    });
  }

  function renderRow(table, rec, key, type, editable) {
    var val = rec[key];
    var str = formatInspectorValue(val, type);
    var rowHtml = `<td class="field-name">${key}</td><td><span class="value">${utils.htmlEscape(str)}</span> </td>`;
    var cell = El('tr')
        .appendTo(table)
        .html(rowHtml)
        .findChild('.value');
    setFieldClass(cell, val, type);
    if (editable) {
      editItem(cell, rec, key, type);
    }
  }

  function setFieldClass(el, val, type) {
    var isNum = type ? type == 'number' : utils.isNumber(val);
    var isNully = val === undefined || val === null || val !== val;
    var isEmpty = val === '';
    el.classed('num-field', isNum);
    el.classed('object-field', type == 'object');
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, rec, key, type) {
    var input = new ClickText2(el),
        strval = formatInspectorValue(rec[key], type),
        parser = getInputParser(type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var val2 = parser(input.value()),
          strval2 = formatInspectorValue(val2, type);
      if (val2 === null && type != 'object') { // allow null objects
        // invalid value; revert to previous value
        input.value(strval);
      } else if (strval != strval2) {
        // field content has changed
        strval = strval2;
        gui.dispatchEvent('data_preupdate', {FID: currId}); // for undo/redo
        rec[key] = val2;
        gui.dispatchEvent('data_postupdate', {FID: currId});
        input.value(strval);
        setFieldClass(el, val2, type);
        self.dispatchEvent('update', {field: key, value: val2, id: currId});
      }
    });
  }
}

function formatInspectorValue(val, type) {
  var str;
  if (type == 'date') {
    str = utils.formatDateISO(val);
  } else if (type == 'object') {
    str = val ? JSON.stringify(val) : "";
  } else {
    str = String(val);
  }
  return str;
}

var inputParsers = {
  date: function(raw) {
    var d = new Date(raw);
    return isNaN(+d) ? null : d;
  },
  string: function(raw) {
    return raw;
  },
  number: function(raw) {
    var val = Number(raw);
    if (raw == 'NaN') {
      val = NaN;
    } else if (isNaN(val)) {
      val = null;
    }
    return val;
  },
  object: function(raw) {
    var val = null;
    try {
      val = JSON.parse(raw);
    } catch(e) {}
    return val;
  },
  boolean: function(raw) {
    var val = null;
    if (raw == 'true') {
      val = true;
    } else if (raw == 'false') {
      val = false;
    }
    return val;
  },
  multiple: function(raw) {
    var val = Number(raw);
    return isNaN(val) ? raw : val;
  }
};

function parseUnknownType(str) {
  var val = inputParsers.number(str);
  if (val !== null) return val;
  val = inputParsers.object(str);
  if (val !== null) return val;
  return str;
}

function getInputParser(type) {
  return inputParsers[type || 'multiple'];
}

function getFieldType(val, key, table) {
  // if a field has a null value, look at entire column to identify type
  return internal.getValueType(val) || internal.getColumnType(key, table.getRecords());
}
