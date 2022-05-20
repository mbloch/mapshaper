import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { Bounds } from '../geom/mapshaper-bounds';

export function getWorldBounds(e) {
  e = utils.isFiniteNumber(e) ? e : 1e-10;
  return [-180 + e, -90 + e, 180 - e, 90 - e];
}

export function probablyDecimalDegreeBounds(b) {
  var world = getWorldBounds(-1), // add a bit of excess
      bbox = (b instanceof Bounds) ? b.toArray() : b;
  return geom.containsBounds(world, bbox);
}

export function clampToWorldBounds(b) {
  var bbox = (b instanceof Bounds) ? b.toArray() : b;
  return new Bounds().setBounds(Math.max(bbox[0], -180), Math.max(bbox[1], -90),
      Math.min(bbox[2], 180), Math.min(bbox[3], 90));
}

export function getAntimeridian(lon0) {
  var anti = lon0 - 180;
  while (anti <= -180) anti += 360;
  return anti;
}
