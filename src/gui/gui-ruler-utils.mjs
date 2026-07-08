export function getDistanceDisplay(distanceMeters, unitHint) {
  var unit = unitHint || (distanceMeters >= 1000 ? 'km' : 'm');
  var value = unit == 'km' ? distanceMeters / 1000 : distanceMeters;
  return {
    value,
    unit,
    label: formatDistanceValue(value) + ' ' + unit
  };
}

export function formatDistanceValue(value) {
  var decimals = getDistanceDecimals(value);
  return value.toFixed(decimals);
}

export function getDistanceUnit(distanceMeters) {
  return distanceMeters >= 1000 ? 'km' : 'm';
}

export function pointIsInLngLatRange(p) {
  return !!p && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
}

export function segmentCrossesAntimeridian(a, b) {
  return pointIsInLngLatRange(a) && pointIsInLngLatRange(b) && Math.abs(a[0] - b[0]) > 180;
}

export function pointIsNearPole(p) {
  return !!p && Math.abs(p[1]) >= 89.9;
}

export function interpolateGreatCirclePoint(a, b, k) {
  var v1 = lngLatToUnitVector(a[0], a[1]);
  var v2 = lngLatToUnitVector(b[0], b[1]);
  var dot = clamp(dotProduct(v1, v2), -1, 1);
  var omega = Math.acos(dot);
  var sinOmega = Math.sin(omega);
  var u, v;
  if (k === 0) return a.concat();
  if (k === 1) return b.concat();
  if (sinOmega < 1e-12) {
    return unitVectorToLngLat(normalizeVector([
      v1[0] * (1 - k) + v2[0] * k,
      v1[1] * (1 - k) + v2[1] * k,
      v1[2] * (1 - k) + v2[2] * k
    ]));
  }
  u = Math.sin((1 - k) * omega) / sinOmega;
  v = Math.sin(k * omega) / sinOmega;
  return unitVectorToLngLat([
    v1[0] * u + v2[0] * v,
    v1[1] * u + v2[1] * v,
    v1[2] * u + v2[2] * v
  ]);
}

function getDistanceDecimals(value) {
  if (value >= 100) return 0;
  if (value >= 10) return 1;
  if (value >= 1) return 2;
  return 3;
}

function lngLatToUnitVector(lng, lat) {
  var D2R = Math.PI / 180;
  var lngRad = lng * D2R;
  var latRad = lat * D2R;
  var cosLat = Math.cos(latRad);
  return [
    Math.cos(lngRad) * cosLat,
    Math.sin(lngRad) * cosLat,
    Math.sin(latRad)
  ];
}

function unitVectorToLngLat(v) {
  var R2D = 180 / Math.PI;
  return [
    Math.atan2(v[1], v[0]) * R2D,
    Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * R2D
  ];
}

function normalizeVector(v) {
  var len = Math.sqrt(dotProduct(v, v));
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : v;
}

function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
