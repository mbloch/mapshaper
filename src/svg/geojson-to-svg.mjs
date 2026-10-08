import GeoJSON from '../geojson/geojson-common';
import { renderPoint, getTransform } from './svg-symbols';
import { applyStyleAttributes, isSvgColor } from '../svg/svg-properties';
import { featureIsPathLabel, renderPathLabel } from '../svg/svg-label-paths';
import { labelHasHalo, splitLabelHalos } from '../svg/svg-label-halo';
import { lineHasEndStyles, renderArrowLine } from '../svg/svg-line-arrows';
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
  return features.map(function(obj, featureId) {
    var geom = obj.type == 'Feature' ? obj.geometry : obj; // could be null
    var geomType = geom && geom.type;
    var msType = GeoJSON.translateGeoJSONType(geomType);
    var d = obj.properties || {};
    var svgObj = null;
    if (featureIsPathLabel(geom, d)) {
      // a label's knots are its geometry, so this is one label along a curve
      // rather than several labels at several points
      svgObj = renderPathLabel(d, geom.coordinates,
        {report: opts.path_label_report, id: featureId});
    } else if (msType == 'polyline' && geom.coordinates && lineHasEndStyles(d)) {
      svgObj = renderArrowLine(geomType == 'LineString' ?
        [geom.coordinates] : geom.coordinates, d);
    } else if (geomType && geom.coordinates) {
      svgObj = geojsonImporters[geomType](geom.coordinates, d);
    }
    if (!svgObj) {
      return {tag: 'g'}; // empty element
    } else if (msType == 'polyline' || msType == 'polygon') {
      applyStyleAttributes(svgObj, msType, d);
      if (msType == 'polygon' && opts.seam_stroke_width > 0) {
        applySeamStroke(svgObj, d, opts.seam_stroke_width);
      }
    } else if (msType == 'point' && isSimpleCircle(d)) {
      // kludge -- maintains bw compatibility/passes tests -- style attributes
      // are applied to the <g> container, 'r' property is applied to circle
      applyStyleAttributes(svgObj, msType, d, simpleCircleFilter);
    } else {
      // other point symbols: attributes are complicated, added downstream
    }
    // Only here, where SVG is written for other programs to read: the GUI
    // draws the same labels with paint-order and has no use for the copies.
    if (labelHasHalo(d)) {
      svgObj = splitLabelHalos(svgObj);
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

// Image output (PNG, JPEG and the image in HTML output) only. Where two
// polygons share an edge, each one only partly covers the pixels along it, and
// the background shows through the gap as a faint seam. A stroke one image
// pixel wide in the polygon's own fill covers the seam, at the cost of growing
// the polygon by half an image pixel.
function applySeamStroke(svgObj, rec, width) {
  var color = getSeamStrokeColor(rec);
  if (!color) return;
  svgObj.properties.stroke = color;
  svgObj.properties['stroke-width'] = width;
  svgObj.properties['stroke-linejoin'] = 'round';
}

// The fill color of a polygon that can take a seam stroke, or null. Polygons
// that are left alone: those with a stroke of their own; translucent ones,
// where the stroke would double the fill along the edge; pattern and effect
// fills, which a stroke can't match; and inline CSS, which may restyle the fill.
export function getSeamStrokeColor(rec) {
  var fill = rec.fill;
  if (!fill || !isSvgColor(fill) || /^(none|transparent)$/i.test(fill) ||
      /^(rgba|hsla)\(/i.test(fill) || /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(fill)) {
    return null;
  }
  if (rec.stroke && rec.stroke != 'none' && rec['stroke-width'] !== 0 &&
      rec['stroke-width'] !== '0') {
    return null;
  }
  if (isTranslucent(rec['fill-opacity']) || isTranslucent(rec.opacity)) return null;
  if (rec['fill-pattern'] || rec['fill-effect'] || rec.css) return null;
  return fill;
}

function isTranslucent(val) {
  return val !== undefined && val !== null && val !== '' && Number(val) < 1;
}

function simpleCircleFilter(k) {
  return k != 'r';
}

// just a dot, no label or icon
function isSimpleCircle(rec) {
  return rec && (rec.r > 0 && !rec['svg-symbol'] && !rec['label-text'] && !rec.icon && !rec['icon-size'] && !rec['icon-color']);
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

