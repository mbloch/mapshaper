import {Matrix2D} from '../geom/mapshaper-matrix2d';
import {Bounds} from '../geom/mapshaper-bounds';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
var mproj = require('mproj');

// A compound projection, consisting of a default projection and one or more rectangular frames
// that are projected separately and affine transformed.
// @mainParams: parameters for main projection, including:
//    proj: Proj string
//    bbox: lat-lon bounding box
export function MixedProjection(mainParams, options) {
  var mainFrame = initFrame(mainParams);
  var mainP = mainFrame.crs;
  var frames = [mainFrame];
  var mixedP = initMixedProjection(mproj);

  // This CRS masquerades as the main projection... the version with
  // custom insets is exposed to savvy users
  mainP.__mixed_crs = mixedP;

  // required opts:
  //    origin: [lng, lat] origin of frame (unprojected)
  //    placement: [x, y] location (in projected coordinates) to shift the origin
  //    proj: Proj.4 string for projecting data within the frame
  //    bbox: Lat-long bounding box of frame area
  //
  // optional:
  //    dx: x shift (meters)
  //    dy: y shift (meters)
  //    scale: scale factor (1 = no scaling)
  //    rotation: rotation in degrees (0 = no rotation)
  //
  mainP.addFrame = function(paramsArg) {
    var params = getFrameParams(paramsArg, options); // apply defaults and overrides
    var frame = initFrame(params);
    var m = new Matrix2D();
    //  originXY: the projected coordinates of the frame origin
    var originXY = params.origin ? projectFrameOrigin(params.origin, frame.crs) : [0, 0];
    var placementXY = params.placement || [0, 0];
    var dx = placementXY[0] - originXY[0] + (+params.dx || 0);
    var dy = placementXY[1] - originXY[1] + (+params.dy || 0);

    if (params.rotation) {
      m.rotate(params.rotation * Math.PI / 180.0, originXY[0], originXY[1]);
    }
    if (params.scale) {
      m.scale(params.scale, params.scale, originXY[0], originXY[1]);
    }
    m.translate(dx, dy);

    frame.matrix = m;
    frames.push(frame);
    return this;
  };

  function initFrame(params) {
    return {
      bounds: new Bounds(bboxToRadians(params.bbox)),
      crs:  mproj.pj_init(params.proj)
    };
  }

  function bboxToRadians(bbox) {
    var D2R = Math.PI / 180;
    return bbox.map(function(deg) {
      return deg * D2R;
    });
  }

  function projectFrameOrigin(origin, P) {
    var xy = mproj.pj_fwd_deg({lam: origin[0], phi: origin[1]}, P);
    return [xy.x, xy.y];
  }

  mixedP.fwd = function(lp, xy) {
    var frame, xy2;
    for (var i=0, n=frames.length; i<n; i++) {
      frame = frames[i];
      if (frame.bounds.containsPoint(lp.lam, lp.phi)) {
        xy2 = mproj.pj_fwd(lp, frame.crs);
        if (frame.matrix) {
          frame.matrix.transformXY(xy2.x, xy2.y, xy2);
        }
        break;
      }
    }
    xy.x = xy2 ? xy2.x : Infinity;
    xy.y = xy2 ? xy2.y : Infinity;
  };

  return mainP;
}

function initMixedProjection(mproj) {
  if (!mproj.internal.pj_list.mixed) {
    mproj.pj_add(function(P) {
      P.a = 1;
    }, 'mixed', 'Mapshaper Mixed Projection');
  }
  return mproj.pj_init('+proj=mixed');
}

function getFrameParams (params, options) {
  var opts = options[params.name];
  utils.defaults(params, {scale: 1, dx: 0, dy: 0, rotation: 0}); // add defaults
  if (!opts) return params;
  Object.keys(opts).forEach(function(key) {
    var val = opts[key];
    if (key in params) {
      params[key] = opts[key];
    } else {
      params.proj = replaceProjParam(params.proj, key, val);
    }
  });
  return params;
}

function replaceProjParam(proj, key, val) {
  var param = '+' + key + '=';
  return proj.split(' ').map(function(str) {
    if (str.indexOf(param) === 0) {
      str = str.substr(0, param.length) + val;
    }
    return str;
  }).join(' ');
}
