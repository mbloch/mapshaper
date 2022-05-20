import { projectPointLayer, projectArcs } from '../commands/mapshaper-proj';
import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { R2D, D2R } from '../geom/mapshaper-basic-geom';

// based on d3 implementation of Euler-angle rotation
// https://github.com/d3/d3-geo/blob/master/src/rotation.js
// license: https://github.com/d3/d3-geo/blob/master/LICENSE

export function rotateDatasetCoords(dataset, rotation, inv) {
  var proj = getRotationFunction(rotation, inv);
  dataset.layers.filter(layerHasPoints).forEach(function(lyr) {
    projectPointLayer(lyr, proj);
  });
  if (dataset.arcs) {
    projectArcs(dataset.arcs, proj);
  }
}

export function getRotationFunction(rotation, inv) {
  var f = getRotationFunction2(rotation, inv);
  return function(lng, lat) {
    return f([lng, lat]);
  };
}

export function getRotationFunction2(rotation, inv) {
  var a = (rotation[0] || 0) * D2R,
      b = (rotation[1] || 0) * D2R,
      c = (rotation[2] || 0) * D2R;
  return function(p) {
    p[0] *= D2R;
    p[1] *= D2R;
    var rotate = inv ? rotatePointInv : rotatePoint;
    rotate(p, a, b, c);
    p[0] *= R2D;
    p[1] *= R2D;
    return p;
  };
}

function rotatePoint(p, deltaLam, deltaPhi, deltaGam) {
  if (deltaLam != 0) rotateLambda(p, deltaLam);
  if (deltaPhi !== 0 || deltaGam !== 0) {
    rotatePhiGamma(p, deltaPhi, deltaGam, false);
  }
  return p;
}

function rotatePointInv(p, deltaLam, deltaPhi, deltaGam) {
  if (deltaPhi !== 0 || deltaGam !== 0) {
    rotatePhiGamma(p, deltaPhi, deltaGam, true);
  }
  if (deltaLam != 0) rotateLambda(p, -deltaLam);
  return p;
}

function rotateLambda(p, deltaLam) {
  var lam = p[0] + deltaLam;
  if (lam > Math.PI) lam -= 2 * Math.PI;
  else if (lam < -Math.PI) lam += 2 * Math.PI;
  p[0] = lam;
}

function rotatePhiGamma(p, deltaPhi, deltaGam, inv) {
  var cosDeltaPhi = Math.cos(deltaPhi),
      sinDeltaPhi = Math.sin(deltaPhi),
      cosDeltaGam = Math.cos(deltaGam),
      sinDeltaGam = Math.sin(deltaGam),
      cosPhi = Math.cos(p[1]),
      x = Math.cos(p[0]) * cosPhi,
      y = Math.sin(p[0]) * cosPhi,
      z = Math.sin(p[1]),
      k;
  if (inv) {
    k = z * cosDeltaGam - y * sinDeltaGam;
    p[0] = Math.atan2(y * cosDeltaGam + z * sinDeltaGam, x * cosDeltaPhi + k * sinDeltaPhi);
    p[1] = Math.asin(k * cosDeltaPhi - x * sinDeltaPhi);
  } else {
    k = z * cosDeltaPhi + x * sinDeltaPhi;
    p[0] = Math.atan2(y * cosDeltaGam - k * sinDeltaGam, x * cosDeltaPhi - z * sinDeltaPhi);
    p[1] = Math.asin(k * cosDeltaGam + y * sinDeltaGam);
  }
}
