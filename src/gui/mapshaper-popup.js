/* @requires mapshaper-gui-lib */


function Popup() {
  var parent = El('#mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  var content = El('div').addClass('popup-content').appendTo(el);

  this.show = function(rec, table, editable) {
    var maxHeight = parent.node().clientHeight - 36;
    this.hide(); // clean up if panel is already open
    render(content, rec, table, editable);
    el.show();
    if (content.node().clientHeight > maxHeight) {
      content.css('height:' + maxHeight + 'px');
    }
  };

  this.hide = function() {
    // make sure any pending edits are made before re-rendering popup
    // TODO: only blur popup fields
    gui.blurActiveElement();
    content.empty();
    content.node().removeAttribute('style'); // remove inline height
    el.hide();
  };

  function render(el, rec, table, editable) {
    var tableEl = El('table'),
        rows = 0;
    utils.forEachProperty(rec, function(v, k) {
      var type = MapShaper.getFieldType(v, k, table);
      renderRow(tableEl, rec, k, type, editable);
      rows++;
    });
    if (rows > 0) {
      tableEl.appendTo(el);
    } else {
      el.html('<div class="note">This layer is missing attribute data.</div>');
    }
  }

  function renderRow(table, rec, key, type, editable) {
    var rowHtml = '<td class="field-name">%s</td><td><span class="value">%s</span> </td>';
    var val = rec[key];
    var cell = El('tr')
        .appendTo(table)
        .html(utils.format(rowHtml, key, utils.htmlEscape(val)))
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
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, rec, key, type) {
    var input = new ClickText2(el),
        strval = String(rec[key]),
        parser = MapShaper.getInputParser(type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var val2 = parser(input.value()),
          strval2 = String(val2);
      if (strval == strval2) {
        // contents unchanged
      } else if (val2 === null) {
        // invalid value; revert to previous value
        input.value(strval);
      } else {
        // field content has changed;
        strval = strval2;
        rec[key] = val2;
        input.value(strval);
        setFieldClass(el, val2, type);
      }
    });
  }
}

MapShaper.inputParsers = {
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

MapShaper.getInputParser = function(type) {
  return MapShaper.inputParsers[type || 'multiple'];
};

MapShaper.getValueType = function(val) {
  var type = null;
  if (utils.isString(val)) {
    type = 'string';
  } else if (utils.isNumber(val)) {
    type = 'number';
  } else if (utils.isBoolean(val)) {
    type = 'boolean';
  }
  return type;
};

MapShaper.getColumnType = function(key, table) {
  var records = table.getRecords(),
      type = null;
  for (var i=0, n=records.length; i<n; i++) {
    type = MapShaper.getValueType(records[i][key]);
    if (type) break;
  }
  return type;
};

MapShaper.getFieldType = function(val, key, table) {
  // if a field has a null value, look at entire column to indentify type
  return MapShaper.getValueType(val) || MapShaper.getColumnType(key, table);
};
