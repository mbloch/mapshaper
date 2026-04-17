import { reversePath } from '../paths/mapshaper-path-utils';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { getSliverFilter } from '../polygons/mapshaper-slivers';
import { getArcPresenceTest } from '../paths/mapshaper-path-utils';
import { composeDissolveLayer } from '../commands/mapshaper-dissolve';
import { getCategoryClassifier } from '../dissolve/mapshaper-data-aggregation';
import { DataTable } from '../datatable/mapshaper-data-table';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';
import utils from '../utils/mapshaper-utils';
import { message } from '../utils/mapshaper-logging';

// Assumes that arcs do not intersect except at endpoints
export function dissolvePolygonLayer2(lyr, dataset, opts) {
  opts = utils.extend({}, opts);
  if (opts.field) {
    opts.fields = [opts.field]; // support old "field" parameter
  }
  var getGroupId = getCategoryClassifier(opts.fields, lyr.data);
  var groups = groupPolygons2(lyr, getGroupId);
  var shapes2 = dissolvePolygonGroups2(groups, lyr, dataset, opts);
  return composeDissolveLayer(lyr, shapes2, getGroupId, opts);
}

function getArcLayer(arcs, name) {
  var records = [];
  var lyr = {
    geometry_type: 'polyline',
    shapes: [],
    name: name
  };
  for (var i=0, n=arcs.size(); i<n; i++) {
    lyr.shapes.push([[i]]);
    records.push({arc_id: i});
  }
  lyr.data = new DataTable(records);
  return lyr;
}

export function composeMosaicLayer(lyr, shapes2) {
  var records = shapes2.map(function(shp, i) {
    return {tile_id: i};
  });
  return utils.defaults({
    shapes: shapes2,
    data: new DataTable(records)
  }, lyr);
}

function groupPolygons2(lyr, getGroupId) {
  return lyr.shapes.reduce(function(groups, shape, shapeId) {
    var groupId = getGroupId(shapeId);
    if (groupId in groups === false) {
      groups[groupId] = [];
    }
    groups[groupId].push(shapeId);
    return groups;
  }, []);
}

function getGapRemovalMessage(removed, retained, areaLabel) {
  var msg;
  var tot = removed + retained;
  if (removed > 0 === false) return '';
  return utils.format('Removed %,d of %,d sliver%s using %s',
      removed, tot, utils.pluralSuffix(tot), areaLabel);
}

export function dissolvePolygonGroups2(groups, lyr, dataset, opts) {
  profileStart('dissolvePolygonGroups2');
  profileStart('dpg2.NodeCollection');
  var arcFilter = getArcPresenceTest(lyr.shapes, dataset.arcs);
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  profileEnd('dpg2.NodeCollection');
  var mosaicOpts = {
    flat: !opts.allow_overlaps,
    simple: groups.length == 1,
    overlap_rule: opts.overlap_rule
  };
  profileStart('dpg2.MosaicIndex');
  var mosaicIndex = new MosaicIndex(lyr, nodes, mosaicOpts);
  profileEnd('dpg2.MosaicIndex');
  // gap fill doesn't work yet with overlapping shapes
  var fillGaps = !opts.allow_overlaps && (opts.sliver_control || opts.gap_fill_area);
  var cleanupData, filterData;
  if (fillGaps) {
    profileStart('dpg2.removeGaps');
    var sliverOpts = utils.extend({sliver_control: 1}, opts);
    filterData = getSliverFilter(lyr, dataset, sliverOpts);
    cleanupData = mosaicIndex.removeGaps(filterData.filter);
    profileEnd('dpg2.removeGaps');
  }
  profileStart('dpg2.dissolveTiles');
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var dissolvedShapes = groups.map(function(shapeIds) {
    var tiles = mosaicIndex.getTilesByShapeIds(shapeIds);
    if (opts.tiles) {
      return tiles.reduce(function(memo, tile) {
        return memo.concat(tile);
      }, []);
    }
    return dissolveTileGroup2(tiles, pathfind);
  });
  profileEnd('dpg2.dissolveTiles');
  profileStart('dpg2.fixTangentHoles');
  dissolvedShapes = fixTangentHoles(dissolvedShapes, pathfind);
  profileEnd('dpg2.fixTangentHoles');

  if (fillGaps && !opts.quiet) {
    var msg = getGapRemovalMessage(cleanupData.removed, cleanupData.remaining, filterData.label);
    if (msg) message(msg);
  }
  profileEnd('dissolvePolygonGroups2');
  return dissolvedShapes;
}

function dissolveTileGroup2(tiles, pathfind) {
  var rings = [],
      holes = [],
      dissolved, tile;
  for (var i=0, n=tiles.length; i<n; i++) {
    tile = tiles[i];
    rings.push(tile[0]);
    if (tile.length > 1) {
      holes = holes.concat(tile.slice(1));
    }
  }
  dissolved = pathfind(rings.concat(holes), 'dissolve');
  if (dissolved.length > 1) {
    // Commenting-out nesting order repair -- new method should prevent nesting errors
    // dissolved = internal.fixNestingErrors(dissolved, arcs);
  }
  return dissolved.length > 0 ? dissolved : null;
}

function fixTangentHoles(shapes, pathfind) {
  var onRing = function(memo, ring) {
    reversePath(ring);
    var fixed = pathfind([ring], 'flatten');
    if (fixed.length > 1) {
      fixed.forEach(reversePath);
      memo = memo.concat(fixed);
    } else {
      memo.push(reversePath(ring));
    }
    return memo;
  };
  return shapes.map(function(rings) {
    if (!rings) return null;
    return rings.reduce(onRing, []);
  });
}
