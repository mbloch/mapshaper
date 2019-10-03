/* @requires gui-lib */


internal.updateLayerStackOrder = function(layers) {
  // 1. assign ascending ids to unassigned layers above the range of other layers
  layers.forEach(function(o, i) {
    if (!o.layer.stack_id) o.layer.stack_id = 1e6 + i;
  });
  // 2. sort in ascending order
  layers.sort(function(a, b) {
    return a.layer.stack_id - b.layer.stack_id;
  });
  // 3. assign consecutve ids
  layers.forEach(function(o, i) {
    o.layer.stack_id = i + 1;
  });
  return layers;
};

internal.sortLayersForMenuDisplay = function(layers) {
  layers = internal.updateLayerStackOrder(layers);
  return layers.reverse();
};

