import { utils } from './gui-core';

export function filterLayerByIds(lyr, ids) {
  var shapes;
  if (lyr.shapes) {
    shapes = ids.map(function(id) {
      return lyr.shapes[id];
    });
    return utils.defaults({shapes: shapes, data: null}, lyr);
  }
  return lyr;
}

export function formatLayerNameForDisplay(name) {
  return name || '[unnamed]';
}

export function cleanLayerName(raw) {
  return raw.replace(/[\n\t/\\]/g, '')
    .replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
}

export function updateLayerStackOrder(layers) {
  // 1. assign ascending ids to unassigned layers above the range of other layers
  layers.forEach(function(o, i) {
    if (!o.layer.menu_order) o.layer.menu_order = 1e6 + i;
  });
  // 2. sort in ascending order
  layers.sort(function(a, b) {
    return a.layer.menu_order - b.layer.menu_order;
  });
  // 3. assign consecutve ids
  layers.forEach(function(o, i) {
    o.layer.menu_order = i + 1;
  });
  return layers;
}

export function sortLayersForMenuDisplay(layers) {
  layers = updateLayerStackOrder(layers);
  return layers.reverse();
}

