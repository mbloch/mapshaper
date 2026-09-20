import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { getDatasetCrsInfo, setDatasetCrsInfo } from '../crs/mapshaper-projections';

cmd.addLayer = addLayer;

var GEOMETRY_TYPES = ['point', 'polygon', 'polyline'];

// Creates an empty layer, for features that are about to be added to it: by the
// GUI's drawing and label tools, or by -add-shape and -add-label in a script.
//
// The layer goes into a dataset of its own rather than joining the target's, so
// that shapes drawn into it have their own topology and editing them cannot
// disturb the arcs of the layer it was created beside. What it does take from
// the target is the CRS, without which a shape drawn at a projected coordinate
// would be read as lat-long.
//
// targetDataset: the current target, or undefined if there is none
// opts:
//   geometry_type: 'point', 'polygon' or 'polyline'
//   name: name for the new layer
// Returns a new dataset, for the caller to add to the catalog.
export function addLayer(targetDataset, opts) {
  var type = opts.geometry_type;
  var dataset;
  if (!type) {
    stop('Missing required geometry-type parameter:', GEOMETRY_TYPES.join('|'));
  }
  if (!GEOMETRY_TYPES.includes(type)) {
    stop('Unsupported geometry type:', type + '.', 'Expected',
      GEOMETRY_TYPES.join('|'));
  }
  dataset = {
    layers: [{
      name: opts.name || undefined,
      geometry_type: type,
      shapes: []
    }],
    info: {}
  };
  // A path layer needs somewhere to put its arcs. A point layer holds
  // coordinates in its shapes and never has an ArcCollection.
  if (type != 'point') {
    dataset.arcs = new ArcCollection();
  }
  if (targetDataset) {
    setDatasetCrsInfo(dataset, getDatasetCrsInfo(targetDataset));
  }
  return dataset;
}
