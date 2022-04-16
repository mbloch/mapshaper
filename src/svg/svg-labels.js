import { applyStyleAttributes } from '../svg/svg-properties';

function toLabelString(val) {
  if (val || val === 0 || val === false) return String(val);
  return '';
}

// Kludge for applying fill and other styles to a <text> element
// (for rendering labels in the GUI with the dot in Canvas, not SVG)
export function renderStyledLabel(rec) {
  var o = renderLabel(rec);
  applyStyleAttributes(o, 'label', rec);
  return o;
}

export function renderLabel(rec) {
  var line = toLabelString(rec['label-text']);
  var morelines, obj;
  // Accepting \n (two chars) as an alternative to the newline character
  // (sometimes, '\n' is not converted to newline, e.g. in a Makefile)
  // Also accepting <br>
  var newline = /\n|\\n|<br>/i;
  var dx = rec.dx || 0;
  var dy = rec.dy || 0;
  var properties = {
    // using x, y instead of dx, dy for shift, because Illustrator doesn't apply
    // dx value when importing text with text-anchor=end
    y: dy,
    x: dx
  };
  if (newline.test(line)) {
    morelines = line.split(newline);
    line = morelines.shift();
  }
  obj = {
    tag: 'text',
    value: line,
    properties: properties
  };
  if (morelines) {
    // multiline label
    obj.children = [];
    morelines.forEach(function(line) {
      var tspan = {
        tag: 'tspan',
        value: line,
        properties: {
          x: dx,
          dy: rec['line-height'] || '1.1em'
        }
      };
      obj.children.push(tspan);
    });
  }
  return obj;
}
