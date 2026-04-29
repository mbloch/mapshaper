import GeoJSON from '../geojson/geojson-common';
import { renderPoint, getTransform } from './svg-symbols';
import { applyStyleAttributes } from '../svg/svg-properties';
import {
  importLineString, importMultiLineString, importPolygon,
  importMultiPolygon, flattenMultiPolygonCoords
} from '../svg/svg-geom-primitives';

// Re-exported from svg-geom-primitives.mjs for back-compat -- consumers
// (notably svg-symbols.mjs) used to import these from here.
export {
  importLineString, importMultiLineString, importPolygon,
  importMultiPolygon, flattenMultiPolygonCoords
};

var geojsonImporters = {
  Point: importPoint,
  Polygon: importPolygon,
  LineString: importLineString,
  MultiPoint: importMultiPoint,
  MultiLineString: importMultiLineString,
  MultiPolygon: importMultiPolygon
};

export function importGeoJSONFeatures(features, opts) {
  opts = opts || {};
  return features.map(function(obj) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var msType = GeoJSON.translateGeoJSONType(geomType);
    var d = obj.properties || {};
    var svgObj = null;
    if (geomType && geom.coordinates) {
      svgObj = geojsonImporters[geomType](geom.coordinates, d);
    }
    if (!svgObj) {
      return {tag: 'g'}; // empty element
    } else if (msType == 'polyline' || msType == 'polygon') {
      applyStyleAttributes(svgObj, msType, d);
    } else if (msType == 'point' && isSimpleCircle(d)) {
      // kludge -- maintains bw compatibility/passes tests -- style attributes
      // are applied to the <g> container, 'r' property is applied to circle
      applyStyleAttributes(svgObj, msType, d, simpleCircleFilter);
    } else {
      // other point symbols: attributes are complicated, added downstream
    }
    if ('id' in obj) {
      if (!svgObj.properties) {
        svgObj.properties = {};
      }
      svgObj.properties.id = (opts.id_prefix || '') + obj.id;
    }
    return svgObj;
  });
}

export function importPoint(coords, rec) {
  rec = rec || {};
  if (isSimpleCircle(rec)) {
    return {
      tag: 'circle',
      properties: {
        cx: coords[0],
        cy: coords[1],
        r: rec.r
      }
    };
  }
  var o = renderPoint(rec, coords);
  if (o) o.properties.transform = getTransform(coords);
  return o;
}

function simpleCircleFilter(k) {
  return k != 'r';
}

// just a dot, no label or icon
function isSimpleCircle(rec) {
  return rec && (rec.r > 0 && !rec['svg-symbol'] && !rec['label-text']);
}

function importMultiPoint(coords, rec) {
  var children = [], p;
  for (var i=0; i<coords.length; i++) {
    p = importPoint(coords[i], rec);
    if (!p) continue;
    if (p.tag == 'g' && p.children) {
      children = children.concat(p.children);
    } else {
      children.push(p);
    }
  }
  return children.length > 0 ? {tag: 'g', children: children} : null;
}

