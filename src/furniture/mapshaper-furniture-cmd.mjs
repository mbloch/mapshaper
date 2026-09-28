import { getFurnitureLayerType, layerIsFurniture } from '../furniture/mapshaper-furniture-utils';
import { markDatasetChanged, noteDatasetWillChange } from '../undo/mapshaper-undo-tracking';

// Adds a furniture layer as a standalone dataset, without changing the
// default target (so a following -o still exports the content layers)
export function addFurnitureLayer(lyr, catalog) {
  var o = {
    info: {},
    layers: [lyr]
  };
  catalog.captureCatalogBefore({operation: 'addFurnitureLayer'});
  catalog.getDatasets().push(o);
  catalog.markCatalogChanged({operation: 'addFurnitureLayer'});
}

// Adds a furniture layer to a frame's dataset, replacing any existing
// furniture of the same type. Passing a null layer removes it.
// Returns the replaced or removed layer, if any
export function setFrameFurnitureLayer(frameDataset, type, lyr) {
  var layers = frameDataset.layers;
  var idx = layers.findIndex(function(o) {
    return layerIsFurniture(o) && getFurnitureLayerType(o) == type;
  });
  var prev = idx > -1 ? layers[idx] : null;
  if (!prev && !lyr) return null;
  noteDatasetWillChange(frameDataset, {operation: 'setFrameFurniture', unit: 'layers'});
  layers = layers.slice();
  if (prev && lyr) {
    lyr.name = prev.name;
    layers[idx] = lyr;
  } else if (prev) {
    layers.splice(idx, 1);
  } else {
    layers.push(lyr);
  }
  frameDataset.layers = layers;
  markDatasetChanged(frameDataset, {operation: 'setFrameFurniture', unit: 'layers'});
  return prev;
}

// Moves a replaced frame's furniture into the dataset of the frame replacing it
export function moveFrameFurniture(fromDataset, toDataset) {
  var furniture = fromDataset.layers.filter(layerIsFurniture);
  if (furniture.length === 0) return;
  noteDatasetWillChange(fromDataset, {operation: 'moveFrameFurniture', unit: 'layers'});
  fromDataset.layers = fromDataset.layers.filter(function(lyr) {
    return !furniture.includes(lyr);
  });
  markDatasetChanged(fromDataset, {operation: 'moveFrameFurniture', unit: 'layers'});
  toDataset.layers = toDataset.layers.concat(furniture);
}
