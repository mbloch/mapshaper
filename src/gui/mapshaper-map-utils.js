
function getDisplayCoordsById(id, layer, ext) {
  var coords = getPointCoordsById(id, layer);
  return ext.translateCoords(coords[0], coords[1]);
}

function getPointCoordsById(id, layer) {
  var coords = layer && layer.geometry_type == 'point' && layer.shapes[id];
  if (!coords || coords.length != 1) {
    return null;
  }
  return coords[0];
}

function translateDeltaDisplayCoords(dx, dy, ext) {
  var a = ext.translatePixelCoords(0, 0);
  var b = ext.translatePixelCoords(dx, dy);
  return [b[0] - a[0], b[1] - a[1]];
}
