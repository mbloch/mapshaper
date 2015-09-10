/* @requires mapshaper-gui-lib */

gui.inputParsers = {
  string: function(raw) {
    return raw;
  },
  number: function(raw) {
    var val = Number(raw);
    return isNaN(val) ? null : val;
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

function Popup() {
  var parent = El('#mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  var content = El('div').addClass('popup-content').appendTo(el);

  this.show = function(rec, types) {
    var maxHeight = parent.node().clientHeight - 36;
    this.hide(); // clean up if panel is already open
    render(content, rec, types);
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

  function render(el, rec, types) {
    var table = El('table'),
        rows = 0;
    utils.forEachProperty(rec, function(v, k) {
      renderRow(table, rec, k, types);
      rows++;
    });
    if (rows > 0) {
      table.appendTo(el);
    } else {
      el.html('<div class="note">This layer is missing attribute data.</div>');
    }
  }

  function renderRow(table, rec, key, types) {
    var rowHtml = '<td class="field-name">%s</td><td><span class="value">%s</span> </td>';
    var val = rec[key];
    var cell = El('tr')
        .appendTo(table)
        .html(utils.format(rowHtml, key, utils.htmlEscape(val)))
        .findChild('.value');
    setFieldClass(cell, val);
    if (types) {
      editItem(cell, rec, key, types[key] || 'multiple');
    }
  }

  function setFieldClass(el, val) {
    var isNum = utils.isNumber(val);
    var isNully = val === undefined || val === null || val !== val;
    var isEmpty = val === '';
    el.classed('num-field', isNum);
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, rec, key, type) {
    var input = new ClickText2(el),
        strval = input.value(),
        parser = gui.inputParsers[type] || error("Unsupported type:", type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var strval2 = input.value(),
          val2 = parser(strval2);
      if (val2 === null) {
        // invalid value; revert to previous value
        input.value(strval);
      } else {
        strval = strval2;
        rec[key] = val2;
        setFieldClass(el, val2);
      }
    });
  }
}
