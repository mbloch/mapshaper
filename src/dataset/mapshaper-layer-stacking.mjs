import {
  markLayerMetadataChanged,
  noteLayerMetadataWillChange
} from '../undo/mapshaper-undo-tracking';

// Layer stacking order and visibility in frames
//
// lyr.menu_order is a layer's place in the stack (higher draws on top), shared
// by the CLI and the GUI and saved in .msx files. Layers without a value sit
// above the ones that have one, in catalog order, which is also how the GUI's
// layers menu numbers them. Only the order within a frame, or within the
// unframed layers, means anything; the numbers are global for simplicity.
//
// lyr.frame_hidden marks a frame member that stays in its frame but is left
// off the map. Unframed layers use the GUI's own pinning instead.

// All the catalog's layers, as [{layer, dataset}], from bottom to top
export function getStackedLayers(catalog) {
  return catalog.getLayers().map(function(o, i) {
    var order = o.layer.menu_order;
    return {o: o, i: i, key: order > 0 ? order : 1e6 + i};
  }).sort(function(a, b) {
    return a.key - b.key || a.i - b.i;
  }).map(function(e) {
    return e.o;
  });
}

// Puts @layers at a place in the stack, and numbers every layer in the
// catalog from 1.
// @position {above: <layer>}, {below: <layer>}, {top: true}, {bottom: true}
//   or {in_place: true} (where the lowest of @layers is); the anchor layer
//   must not be one of @layers
// @opts.group layers that top and bottom refer to (e.g. a frame's members);
//   the top or bottom of an empty group is the top of the stack
// @opts.ordered stack @layers in the given order, first at the bottom
//   (otherwise they keep their order in the stack)
// @opts.operation undo operation name
export function moveLayersInStack(catalog, layers, position, opts) {
  var stack = getStackedLayers(catalog).map(function(o) { return o.layer; });
  var group = opts && opts.group || [];
  var moving = opts && opts.ordered ?
    layers.filter(function(lyr, i) { return stack.includes(lyr) && layers.indexOf(lyr) == i; }) :
    stack.filter(function(lyr) { return layers.includes(lyr); });
  var rest = stack.filter(function(lyr) { return !layers.includes(lyr); });
  var groupRest = rest.filter(function(lyr) { return group.includes(lyr); });
  var idx;
  if (position.in_place) {
    idx = stack.findIndex(function(lyr) { return layers.includes(lyr); });
    idx = idx == -1 ? rest.length : stack.slice(0, idx).filter(function(lyr) {
      return !layers.includes(lyr);
    }).length;
  } else if (position.above) {
    idx = rest.indexOf(position.above) + 1;
  } else if (position.below) {
    idx = rest.indexOf(position.below);
  } else if (groupRest.length === 0) {
    idx = rest.length;
  } else if (position.bottom) {
    idx = rest.indexOf(groupRest[0]);
  } else {
    idx = rest.indexOf(groupRest[groupRest.length - 1]) + 1;
  }
  setStackOrder(rest.slice(0, idx).concat(moving, rest.slice(idx)), opts && opts.operation);
}

// @layers every layer, from bottom to top
export function setStackOrder(layers, operation) {
  layers.forEach(function(lyr, i) {
    setLayerMetadata(lyr, 'menu_order', i + 1, operation);
  });
}

export function setFrameHidden(lyr, hidden, operation) {
  setLayerMetadata(lyr, 'frame_hidden', hidden ? true : undefined, operation);
}

function setLayerMetadata(lyr, key, value, operation) {
  var detail = {operation: operation || 'stacking', unit: 'stacking'};
  if (lyr[key] === value) return;
  noteLayerMetadataWillChange(lyr, detail);
  if (value === undefined) {
    delete lyr[key];
  } else {
    lyr[key] = value;
  }
  markLayerMetadataChanged(lyr, detail);
}
