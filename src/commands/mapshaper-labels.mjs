import cmd from '../mapshaper-cmd';
import { copyLayer } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import './mapshaper-svg-style';

// -labels styles the labels in a point layer, or turns a point layer into
// labels by giving it text=. With coordinates=, it adds one label instead; that
// case is cmd.addLabel(), dispatched separately because it accepts an empty
// target.
//
// Styling writes the same properties -style writes, through the same code, so
// a label styled by either command is the same label.
cmd.labels = function(targetLayers, dataset, opts) {
  var styleOpts = getStyleOpts(opts);
  var output = targetLayers.map(function(lyr) {
    var out;
    requirePointLayer(lyr);
    out = opts.no_replace ? copyLayer(lyr) : lyr;
    cmd.svgStyle(out, dataset, styleOpts);
    return out;
  });
  return opts.no_replace ? output : null;
};

// text= is label-text= under the name that reads naturally in this command.
function getStyleOpts(opts) {
  var o = Object.assign({}, opts);
  if ('text' in o) {
    o.label_text = o.text;
    delete o.text;
  }
  return o;
}

// Labels are drawn at points. A layer with no geometry is let through, since
// it has nothing to conflict with.
function requirePointLayer(lyr) {
  if (lyr.geometry_type && lyr.geometry_type != 'point') {
    stop('Labels can only be applied to a point layer; layer "' +
      (lyr.name || '[unnamed]') + '" contains ' + lyr.geometry_type + 's. ' +
      'Use -points to make a point layer to label.');
  }
}
