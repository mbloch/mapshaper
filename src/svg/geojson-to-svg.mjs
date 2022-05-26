
import { stringifyLineStringCoords, stringifyPolygonCoords } from '../svg/svg-path-utils';
import GeoJSON from '../geojson/geojson-common';
import { renderPoint, getTransform } from './svg-symbols';
import { applyStyleAttributes } from '../svg/svg-properties';

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

export function importLineString(coords) {
  var d = stringifyLineStringCoords(coords);
  return {
    tag: 'path',
    properties: {d: d}
  };
}

export function importMultiLineString(coords) {
  var d = coords.map(stringifyLineStringCoords).join(' ');
  return {
    tag: 'path',
    properties: {d: d}
  };
}

export function importMultiPolygon(coords) {
 return importPolygon(flattenMultiPolygonCoords(coords));
}

export function flattenMultiPolygonCoords(coords) {
  return coords.reduce(function(memo, poly) {
    return memo.concat(poly);
  }, []);
}

export function importPolygon(coords) {
  if (coords.length === 0) return null;
  var o = {
    tag: 'path',
    properties: {
      d: stringifyPolygonCoords(coords)
    }
  };
  if (coords.length > 1) {
    o.properties['fill-rule'] = 'evenodd'; // support polygons with holes
  }
  return o;
}

