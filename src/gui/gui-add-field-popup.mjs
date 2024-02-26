import { showPopupAlert } from './gui-alert';
import { internal } from './gui-core';

export function openAddFieldPopup(gui, ids, lyr) {
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
    var value = internal.parseUnknownType(valStr);
    // table.addField(nameStr, function(d) {
    //   // parse each time to avoid multiple references to objects
    //   return (all || d == rec) ? parseUnknownType(valStr) : null;
    // });

    var cmdStr = `-each "d['${nameStr}'] = `;
    if (!all) {
      cmdStr += ids.length == 1 ?
        `this.id != ${ids[0]}` :
        `!${JSON.stringify(ids)}.includes(this.id)`;
      cmdStr += ' ? null : ';
    }
    valStr = JSON.stringify(JSON.stringify(value)); // add escapes to strings
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
