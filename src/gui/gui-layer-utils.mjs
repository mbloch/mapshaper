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

export function setLayerPinning(lyr, pinned) {
  lyr.pinned = !!pinned;
}


export function adjustPointSymbolSizes(layers, overlayLyr, ext) {
  var bbox = ext.getBounds().scale(1.3).toArray(); // add buffer
  // var topTier = 50000; // can be a bottleneck
  var topTier = 10000; // short-circuit counting here
  var count = 0;
  layers = layers.filter(function(lyr) {
    return lyr.geometry_type == 'point' && lyr.gui.style.dotSize > 0;
  });
  layers.forEach(function(lyr) {
    count += countPoints(lyr.gui.displayLayer.shapes, topTier, bbox);
  });
  count = Math.min(topTier, count) || 1;
  var k = Math.pow(5 - utils.clamp(Math.log10(count), 1, 4), 1.25);

  // zoom adjustments
  var mapScale = ext.scale();
  if (mapScale < 0.5) {
    k *= Math.pow(mapScale + 0.5, 0.35);
  } else if (mapScale > 1) {
    // scale faster at first
    k *= Math.pow(Math.min(mapScale, 4), 0.25);
    k *= Math.pow(mapScale, 0.02);
  }


  // scale down when map is small
  var smallSide = Math.min(ext.width(), ext.height());
  k *= utils.clamp(smallSide / 500, 0.5, 1);

  layers.forEach(function(lyr) {
    lyr.gui.style.dotScale = k;
  });
  if (overlayLyr && overlayLyr.geometry_type == 'point' && overlayLyr.gui.style.dotSize > 0) {
    overlayLyr.gui.style.dotScale = k;
  }
}

function countPoints(shapes, max, bbox) {
  var count = 0;
  var shp, p;
  // short-circuit point counting above top threshold
  for (var i=0, n=shapes.length; i<n && count<max; i++) {
    shp = shapes[i];
    for (var j=0, m=(shp ? shp.length : 0); j<m; j++) {
      p = shp[j];
      if (p[0] > bbox[0] && p[0] < bbox[2] && p[1] > bbox[1] && p[1] < bbox[3]) {
        count ++;
      }
    }
  }
  return count;
}