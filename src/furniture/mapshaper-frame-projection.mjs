import { ArcCollection } from '../paths/mapshaper-arcs';
import { Bounds } from '../geom/mapshaper-bounds';
import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { projectAndDensifyArcs } from '../crs/mapshaper-densify';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';
import { getDatasetCrsInfo, setDatasetCrsInfo } from '../crs/mapshaper-projections';
import { getSingleFrameRecord, isFrameLayer } from './mapshaper-frame-utils';
import { fillOutBbox } from '../commands/mapshaper-frame';
import { error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// A frame is a viewport, not data, so it can legitimately extend past the
// edges of the globe: fitting a near-global extent to a fixed aspect ratio pads
// it with whitespace, and that padding can reach beyond a pole. Those
// coordinates have no projected equivalent, and projectAndDensifyArcs() drops a
// whole arc when any of its vertices fails -- which took out three sides of the
// rectangle and left a zero-area bbox. Clamping first keeps the frame
// projectable; the off-globe padding is what gets lost.
function clampLatLngBbox(bbox) {
  return [
    utils.clamp(bbox[0], -180, 180),
    utils.clamp(bbox[1], -90, 90),
    utils.clamp(bbox[2], -180, 180),
    utils.clamp(bbox[3], -90, 90)
  ];
}

// Project a rectangular frame as a sampled boundary, rather than projecting
// only its corners. Curved projections can reach their x/y extrema between
// corners, so a corner-only bbox can crop content that was inside the frame.
export function getProjectedFrameBounds(bbox, project, srcIsLatLng) {
  var b = new Bounds(srcIsLatLng ? clampLatLngBbox(bbox) : bbox);
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
export function rebuildProjectedFrameLayer(snapshot, dataset, project, srcIsLatLng) {
  var bounds = getProjectedFrameBounds(snapshot.bbox, project, srcIsLatLng);
  var rec = getSingleFrameRecord(snapshot.layer) || {};
  var fixedAspect = utils.isFiniteNumber(rec.frame_aspect_ratio) &&
    rec.frame_aspect_ratio > 0 ? rec.frame_aspect_ratio : null;
  var props;
  if (fixedAspect) {
    // Projecting a rectangle's boundary and taking its bounds does not preserve
    // the rectangle's shape, so a frame that declares a ratio has to be padded
    // back out to it -- otherwise the geometry and the page disagree.
    var bbox = bounds.toArray();
    fillOutBbox(bbox, fixedAspect, 1);
    bounds = new Bounds(bbox);
  } else {
    // Height is derived from the extent, so it goes stale when the extent is
    // reprojected. getFrameLayerData() recomputes it, but the record is what
    // gets written to an output file.
    props = {height: Math.round(rec.width * bounds.height() / bounds.width())};
  }
  rebuildFrameLayerGeometry(snapshot.layer, dataset, bounds, props);
}

export function rebuildFrameLayerGeometry(lyr, dataset, bounds, props) {
  bounds = bounds instanceof Bounds ? bounds : new Bounds(bounds);
  var frameDataset = createFrameRectangleDataset(lyr, bounds, props);
  // The replacement rectangle is imported from bare GeoJSON, so it carries no
  // CRS. Merging it into the host dataset runs a projected/unprojected
  // compatibility check, and during -proj the host still reports its source CRS
  // while the new rectangle already holds projected coordinates -- so the
  // check has to compare like with like.
  setDatasetCrsInfo(frameDataset, getDatasetCrsInfo(dataset));
  replaceLayerContents(lyr, dataset, frameDataset);
}

// Return an isolated rectangular display layer. Dynamic display projection
// must not mutate source shapes or the ArcCollection shared by other layers.
export function getProjectedFrameDisplayLayer(lyr, arcs, project, srcIsLatLng) {
  if (!isFrameLayer(lyr, arcs)) return null;
  var bbox = getLayerBounds(lyr, arcs).toArray();
  var bounds = getProjectedFrameBounds(bbox, project, srcIsLatLng);
  var dataset = createFrameRectangleDataset(lyr, bounds);
  return {
    layer: dataset.layers[0],
    arcs: dataset.arcs
  };
}

function createFrameRectangleDataset(lyr, bounds, props) {
  var record = lyr.data && lyr.data.getReadOnlyRecordAt(0);
  var feature = {
    type: 'Feature',
    properties: Object.assign({}, record || {}, props || {}),
    geometry: bboxToPolygon(bounds.toArray())
  };
  var dataset = importGeoJSON(feature);
  dataset.layers[0].name = lyr.name;
  return dataset;
}
