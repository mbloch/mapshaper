import { quoteCommandValue } from './gui-command-utils';

// Record fields of a scalebar, in the order they are written as options
var scalebarOptions = ['units', 'style', 'position', 'label_position',
  'font_size', 'font_family', 'font_style', 'font_weight', 'color', 'bar_width',
  'tic_length', 'label_offset', 'margin'];

// Returns a -scalebar command that recreates a scalebar with the given
// settings (a scalebar data record, with any edits applied). -scalebar
// replaces the frame's scalebar, so every setting has to be written.
export function getScalebarCommand(settings) {
  var parts = ['-scalebar'];
  var d = settings || {};
  if (isSet(d.label)) {
    parts.push(quoteCommandValue(d.label));
  }
  scalebarOptions.forEach(function(k) {
    if (isSet(d[k])) {
      parts.push(k.replace(/_/g, '-') + '=' + formatValue(d[k]));
    }
  });
  if (d.dual_units) {
    parts.push('dual-units');
  }
  return parts.join(' ');
}

function isSet(val) {
  return val !== undefined && val !== null && val !== '';
}

function formatValue(val) {
  var str = String(val);
  return /^[\w.#-]+$/.test(str) ? str : quoteCommandValue(str);
}
