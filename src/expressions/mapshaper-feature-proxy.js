
import { findAnchorPoint } from '../points/mapshaper-anchor-points';
import { getInnerPctCalcFunction } from '../geom/mapshaper-perimeter-calc';
import { layerHasPaths, layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { addLayerGetters } from '../expressions/mapshaper-layer-proxy';
import { addGetters } from '../expressions/mapshaper-expression-utils';
import { stop } from '../utils/mapshaper-logging';
import { WGS84 } from '../geom/mapshaper-geom-constants';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';


// Returns a function to return a feature proxy by id
// (the proxy appears as "this" or "$" in a feature expression)
export function initFeatureProxy(lyr, arcs, optsArg) {
  var opts = optsArg || {},
      hasPoints = layerHasPoints(lyr),
      hasPaths = arcs && layerHasPaths(lyr),
      _records = lyr.data ? lyr.data.getRecords() : null,
      _isPlanar = hasPaths && arcs.isPlanar(),
      ctx = {},
      calcInnerPct,
      _bounds, _centroid, _innerXY, _xy, _ids, _id;

  // all contexts have this.id and this.layer
  addGetters(ctx, {
    id: function() { return _id; }
  });
  addLayerGetters(ctx, lyr, arcs);

  if (opts.geojson_editor) {
    Object.defineProperty(ctx, 'geojson', {
      set: function(o) {
        opts.geojson_editor.set(o, _id);
      },
      get: function() {
        return opts.geojson_editor.get(_id);
      }
    });
  }

  if (_records) {
    // add r/w member "properties"
    Object.defineProperty(ctx, 'properties',
      {set: function(obj) {
        if (utils.isObject(obj)) {
          _records[_id] = obj;
        } else {
          stop("Can't assign non-object to $.properties");
        }
      }, get: function() {
        var rec = _records[_id];
        if (!rec) {
          rec = _records[_id] = {};
        }
        return rec;
      }});
  }

  if (hasPaths) {
    addGetters(ctx, {
      // TODO: count hole/s + containing ring as one part
      partCount: function() {
        return _ids ? _ids.length : 0;
      },
      isNull: function() {
        return ctx.partCount === 0;
      },
      bounds: function() {
        return shapeBounds().toArray();
      },
      height: function() {
        return shapeBounds().height();
      },
      width: function() {
        return shapeBounds().width();
      }
    });

    if (lyr.geometry_type == 'polyline') {
      addGetters(ctx, {
        'length': function() {
          return geom.getShapePerimeter(_ids, arcs);
        }
      });
    }

    if (lyr.geometry_type == 'polygon') {
      addGetters(ctx, {
        area: function() {
          return _isPlanar ? ctx.planarArea : geom.getSphericalShapeArea(_ids, arcs);
        },
        // area2: function() {
        //   return _isPlanar ? ctx.planarArea : geom.getSphericalShapeArea(_ids, arcs, WGS84.SEMIMINOR_RADIUS);
        // },
        // area3: function() {
        //   return _isPlanar ? ctx.planarArea : geom.getSphericalShapeArea(_ids, arcs, WGS84.AUTHALIC_RADIUS);
        // },
        perimeter: function() {
          return geom.getShapePerimeter(_ids, arcs);
        },
        compactness: function() {
          return geom.calcPolsbyPopperCompactness(ctx.area, ctx.perimeter);
        },
        planarArea: function() {
          return geom.getPlanarShapeArea(_ids, arcs);
        },
        innerPct: function() {
          if (!calcInnerPct) calcInnerPct = getInnerPctCalcFunction(arcs, lyr.shapes);
          return calcInnerPct(_ids);
        },
        originalArea: function() {
          // Get area
          var i = arcs.getRetainedInterval(),
              area;
          arcs.setRetainedInterval(0);
          area = ctx.area;
          arcs.setRetainedInterval(i);
          return area;
        },
        centroidX: function() {
          var p = centroid();
          return p ? p.x : null;
        },
        centroidY: function() {
          var p = centroid();
          return p ? p.y : null;
        },
        innerX: function() {
          var p = innerXY();
          return p ? p.x : null;
        },
        innerY: function() {
          var p = innerXY();
          return p ? p.y : null;
        }
      });
    }

  } else if (hasPoints) {
    // TODO: add functions like bounds, isNull, pointCount
    Object.defineProperty(ctx, 'coordinates',
      {set: function(obj) {
        if (!obj || utils.isArray(obj)) {
          lyr.shapes[_id] = obj || null;
        } else {
          stop("Can't assign non-array to $.coordinates");
        }
      }, get: function() {
        return lyr.shapes[_id] || null;
      }});
    Object.defineProperty(ctx, 'x', {
      get: function() { xy(); return _xy ? _xy[0] : null;},
      set: function(val) { xy(); if (_xy) _xy[0] = Number(val);}
    });
    Object.defineProperty(ctx, 'y', {
      get: function() { xy(); return _xy ? _xy[1] : null;},
      set: function(val) { xy(); if (_xy) _xy[1] = Number(val);}
    });
  }

  function xy() {
    var shape = lyr.shapes[_id];
    if (!_xy) {
      _xy = shape && shape[0] || null;
    }
  }

  function centroid() {
    _centroid = _centroid || geom.getShapeCentroid(_ids, arcs);
    return _centroid;
  }

  function innerXY() {
    _innerXY = _innerXY || findAnchorPoint(_ids, arcs);
    return _innerXY;
  }

  function shapeBounds() {
    if (!_bounds) {
      _bounds = arcs.getMultiShapeBounds(_ids);
    }
    return _bounds;
  }

  return function(id) {
    _id = id;
    // reset stored values
    if (hasPaths) {
      _bounds = null;
      _centroid = null;
      _innerXY = null;
      _ids = lyr.shapes[id];
    }
    if (hasPoints) {
      _xy = null;
    }
    return ctx;
  };
}
