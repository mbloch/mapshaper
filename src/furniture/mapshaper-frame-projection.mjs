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
  // Where part of the boundary is outside the projection's domain (e.g. the
  // far side of the globe in an orthographic projection), the frame covers
  // whatever part of its extent does project. Densifying such a boundary would
  // drop its arcs with unprojectable points, and can fail outright when the
  // points it probes for an interval don't project; the sampled interior
  // includes the boundary, at the same spacing.
  var projected = boundaryIsProjectable(b, project) ?
    getProjectedBoundaryBounds(b, project) :
    getProjectedInteriorBounds(b, project);
  if (!projected.hasBounds() || boundsAreDegenerate(projected)) {
    error('Unable to project map frame');
  }
  return projected;
}

function getProjectedBoundaryBounds(b, project) {
  var arcs = new ArcCollection([
    [[b.xmin, b.ymin], [b.xmax, b.ymin]],
    [[b.xmax, b.ymin], [b.xmax, b.ymax]],
    [[b.xmax, b.ymax], [b.xmin, b.ymax]],
    [[b.xmin, b.ymax], [b.xmin, b.ymin]]
  ]);
  projectAndDensifyArcs(arcs, project);
  return arcs.getBounds();
}

// A view may show none of the frame's extent
function getProjectedFrameBoundsInViews(bbox, transforms, srcIsLatLng) {
  var bounds = new Bounds();
  var failure = null;
  transforms.forEach(function(project) {
    try {
      bounds.mergeBounds(getProjectedFrameBounds(bbox, project, srcIsLatLng));
    } catch(e) {
      failure = e;
    }
  });
  if (!bounds.hasBounds()) throw failure;
  return bounds;
}

var FRAME_SAMPLE_STEPS = 200;

function boundaryIsProjectable(b, project) {
  for (var i = 0; i <= FRAME_SAMPLE_STEPS; i++) {
    var t = i / FRAME_SAMPLE_STEPS;
    var x = b.xmin + b.width() * t;
    var y = b.ymin + b.height() * t;
    if (!project(x, b.ymin) || !project(x, b.ymax) ||
        !project(b.xmin, y) || !project(b.xmax, y)) return false;
  }
  return true;
}

function getProjectedInteriorBounds(b, project) {
  var bounds = new Bounds();
  var p;
  for (var i = 0; i <= FRAME_SAMPLE_STEPS; i++) {
    for (var j = 0; j <= FRAME_SAMPLE_STEPS; j++) {
      p = project(b.xmin + b.width() * i / FRAME_SAMPLE_STEPS,
        b.ymin + b.height() * j / FRAME_SAMPLE_STEPS);
      if (p && isFinite(p[0]) && isFinite(p[1])) bounds.mergePoint(p[0], p[1]);
    }
  }
  return bounds;
}

// A frame needs a usable shape; a sliver would give an absurd page size
function boundsAreDegenerate(b) {
  var w = b.width(), h = b.height();
  return w > 0 === false || h > 0 === false || w / h < 1e-6 || h / w < 1e-6;
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
// @project: a transform, or an array of transforms for a projection that shows
//   some places more than once (one for each view). The frame covers the extent
//   in all of the views.
export function rebuildProjectedFrameLayer(snapshot, dataset, project, srcIsLatLng) {
  var bounds = Array.isArray(project) ?
    getProjectedFrameBoundsInViews(snapshot.bbox, project, srcIsLatLng) :
    getProjectedFrameBounds(snapshot.bbox, project, srcIsLatLng);
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
