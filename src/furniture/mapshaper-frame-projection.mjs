import { ArcCollection } from '../paths/mapshaper-arcs';
import { Bounds } from '../geom/mapshaper-bounds';
import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { projectAndDensifyArcs } from '../crs/mapshaper-densify';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';
import { isFrameLayer } from './mapshaper-frame-utils';
import { error } from '../utils/mapshaper-logging';

// Project a rectangular frame as a sampled boundary, rather than projecting
// only its corners. Curved projections can reach their x/y extrema between
// corners, so a corner-only bbox can crop content that was inside the frame.
export function getProjectedFrameBounds(bbox, project) {
  var b = new Bounds(bbox);
  var xmin = b.xmin;
  var ymin = b.ymin;
  var xmax = b.xmax;
  var ymax = b.ymax;
  var arcs = new ArcCollection([
    [[xmin, ymin], [xmax, ymin]],
    [[xmax, ymin], [xmax, ymax]],
    [[xmax, ymax], [xmin, ymax]],
    [[xmin, ymax], [xmin, ymin]]
  ]);
  projectAndDensifyArcs(arcs, project);
  var projected = arcs.getBounds();
  if (!projected.hasBounds() || projected.area() > 0 === false) {
    error('Unable to project map frame');
  }
  return projected;
}

// Snapshot frame bounds before the dataset arcs are projected.
export function getFrameProjectionSnapshots(dataset) {
  return dataset.layers.reduce(function(memo, lyr) {
    if (isFrameLayer(lyr, dataset.arcs)) {
      memo.push({
        layer: lyr,
        bbox: getLayerBounds(lyr, dataset.arcs).toArray()
      });
    }
    return memo;
  }, []);
}

// Rebuild a projected frame through the normal topology-aware replacement
// path. This is safe when the frame shares an ArcCollection with other layers.
export function rebuildProjectedFrameLayer(snapshot, dataset, project) {
  var bounds = getProjectedFrameBounds(snapshot.bbox, project);
  var frameDataset = createFrameRectangleDataset(snapshot.layer, bounds);
  replaceLayerContents(snapshot.layer, dataset, frameDataset);
}

// Return an isolated rectangular display layer. Dynamic display projection
// must not mutate source shapes or the ArcCollection shared by other layers.
export function getProjectedFrameDisplayLayer(lyr, arcs, project) {
  if (!isFrameLayer(lyr, arcs)) return null;
  var bbox = getLayerBounds(lyr, arcs).toArray();
  var bounds = getProjectedFrameBounds(bbox, project);
  var dataset = createFrameRectangleDataset(lyr, bounds);
  return {
    layer: dataset.layers[0],
    arcs: dataset.arcs
  };
}

function createFrameRectangleDataset(lyr, bounds) {
  var record = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  var feature = {
    type: 'Feature',
    properties: record ? Object.assign({}, record) : {},
    geometry: bboxToPolygon(bounds.toArray())
  };
  var dataset = importGeoJSON(feature);
  dataset.layers[0].name = lyr.name;
  return dataset;
}
