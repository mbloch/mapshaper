import { projectPointLayer, projectArcs } from '../commands/mapshaper-proj';
import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { R2D, D2R } from '../geom/mapshaper-basic-geom';

export function rotateDatasetCoords(dataset, rotation) {
  var proj = getRotationFunction(rotation);
  dataset.layers.filter(layerHasPoints).forEach(function(lyr) {
    projectPointLayer(lyr, proj);
  });
  if (dataset.arcs) {
    projectArcs(dataset.arcs, proj);
  }
}

function getRotationFunction(rotation) {
  var a = (rotation[0] || 0) * D2R,
      b = (rotation[1] || 0) * D2R,
      c = (rotation[2] || 0) * D2R;
  return function(lng, lat) {
    return rotatePoint([lng, lat], a, b, c);
  };
}

function rotatePoint(p, deltaLambda, deltaPhi, deltaGamma) {
  p[0] *= D2R;
  p[1] *= D2R;
  if (deltaLambda != 0) rotateLambda(p, deltaLambda);
  if (deltaPhi !== 0 || deltaGamma !== 0) {
    rotatePhiGamma(p, deltaPhi, deltaGamma);
  }
  p[0] *= R2D;
  p[1] *= R2D;
  return p;
}

function rotateLambda(p, deltaLambda) {
  var lam = p[0] + deltaLambda;
  if (lam > Math.PI) lam -= 2 * Math.PI;
  else if (lam < -Math.PI) lam += 2 * Math.PI;
  p[0] = lam;
}

function rotatePhiGamma(p, deltaPhi, deltaGamma) {
  var cosDeltaPhi = Math.cos(deltaPhi),
      sinDeltaPhi = Math.sin(deltaPhi),
      cosDeltaGamma = Math.cos(deltaGamma),
      sinDeltaGamma = Math.sin(deltaGamma),
      cosPhi = Math.cos(p[1]),
      x = Math.cos(p[0]) * cosPhi,
      y = Math.sin(p[0]) * cosPhi,
      z = Math.sin(p[1]),
      k = z * cosDeltaPhi + x * sinDeltaPhi;
  p[0] = Math.atan2(y * cosDeltaGamma - k * sinDeltaGamma, x * cosDeltaPhi - z * sinDeltaPhi);
  p[1] = Math.asin(k * cosDeltaGamma + y * sinDeltaGamma);
}
