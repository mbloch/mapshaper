import { buildPolygonMosaic } from '../polygons/mapshaper-polygon-mosaic';
import { closeUndershoots } from '../topology/mapshaper-undershoots';
import { rewindPolygons } from '../polygons/mapshaper-ring-nesting';
import { editShapes } from '../paths/mapshaper-shape-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { requirePolylineLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { message, stop } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

cmd.polygons = function(layers, dataset, opts) {
  layers.forEach(requirePolylineLayer);
  // use larger-than-default snapping in addIntersectionCuts()
  // (kludge, snaps together some almost-identical pairs of lines in ne_10m_land_ocean_seams.shp)
  // if (opts.gap_tolerance) {
    //opts = utils.defaults({snap_interval: opts.gap_tolerance * 0.1}, opts);
  // }
  addIntersectionCuts(dataset, opts);
  return layers.map(function(lyr) {
    if (lyr.geometry_type != 'polyline') stop("Expected a polyline layer");
    if (opts.from_rings) {
      return createPolygonLayerFromRings(lyr, dataset);
    }
    return createPolygonLayer(lyr, dataset, opts);
  });
};

// Convert a polyline layer of rings to a polygon layer
function createPolygonLayerFromRings(lyr, dataset) {
  var arcs = dataset.arcs;
  var openCount = 0;
  editShapes(lyr.shapes, function(part) {
    if (geom.pathIsClosed(part, arcs)) {
      return part;
    }
    openCount++;
    return null;
  });
  if (openCount > 0) {
    message('Removed', openCount, 'open ' + (openCount == 1 ? 'ring' : 'rings'));
  }
  lyr.geometry_type = 'polygon';
  rewindPolygons(lyr, arcs);
  return lyr;
}

function createPolygonLayer(lyr, dataset, opts) {
  var nodes = closeUndershoots(lyr, dataset, opts);
  var data = buildPolygonMosaic(nodes);
  return {
    geometry_type: 'polygon',
    name: lyr.name,
    shapes: data.mosaic
  };
}
