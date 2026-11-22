// A hillshade being previewed in place of an elevation layer, while the
// hillshade panel is open. The layer is not changed: the map draws a stand-in
// layer whose raster is the hillshade, and which keeps the elevation layer's
// display state (its bounds, and its projection on the map). Its raster is
// replaced as the settings change, which the raster previews' caches notice,
// since they check the identity of the grid.
var standIns = new WeakMap(); // elevation layer -> stand-in layer

// @raster a hillshade raster covering the layer: the full image, or a reduced
//   copy while a slider is being dragged
export function setRasterHillshadePreview(layer, raster) {
  var standIn = standIns.get(layer);
  if (!standIn) {
    standIn = {raster_type: 'grid'};
    standIns.set(layer, standIn);
  }
  standIn.raster = raster;
}

export function clearRasterHillshadePreview(layer) {
  standIns.delete(layer);
}

// Returns the layer for the map to draw in place of @layer, or null
export function getRasterHillshadeStandIn(layer) {
  var standIn = standIns.get(layer);
  if (!standIn) return null;
  standIn.name = layer.name;
  standIn.gui = layer.gui;
  return standIn;
}
