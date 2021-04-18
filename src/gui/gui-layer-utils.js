

export function formatLayerNameForDisplay(name) {
  return name || '[unnamed]';
}

export function cleanLayerName(raw) {
  return raw.replace(/[\n\t/\\]/g, '')
    .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
}

export function updateLayerStackOrder(layers) {
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
}

export function sortLayersForMenuDisplay(layers) {
  layers = updateLayerStackOrder(layers);
  return layers.reverse();
}

