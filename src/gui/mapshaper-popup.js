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
  }
};

function Popup() {
  var maxWidth = 0;
  var el = El('div').addClass('popup').appendTo('#mshp-main-map').hide();
  var content = El('div').addClass('popup-content').appendTo(el);

  this.show = function(rec, types) {
    render(content, rec, types);
    el.show();
  };

  this.hide = function() {
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
      el.empty();
      table.appendTo(el);
    } else {
      el.html('<div class="note">This layer is missing attribute data.</div>');
    }
  }

  function renderRow(table, rec, key, types) {
    var isNum = utils.isNumber(rec[key]),
        className = isNum ? 'num-field' : 'str-field',
        el = El('tr').appendTo(table);
    el.html(utils.format('<td class="field-name">%s</td><td><span class="value %s">%s</span> </td>',
          key, className, utils.htmlEscape(rec[key])));

    if (types && types[key]) {
      editItem(el.findChild('.value'), rec, key, types[key]);
    }
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
        input.value(strval);
      } else {
        strval = strval2;
        rec[key] = val2;
      }
    });
  }
}
