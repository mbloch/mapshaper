import { exportDatasetAsGeoJSON } from '../geojson/geojson-export';
import { getFurnitureLayerData, layerHasFurniture, renderFurnitureLayer } from '../furniture/mapshaper-furniture';
import { getFrameData, fitDatasetToFrame } from '../furniture/mapshaper-frame-utils';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { getScalebarLayer } from '../commands/mapshaper-scalebar';
import { copyDataset } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import { message, warn, error, stop } from '../utils/mapshaper-logging';
import { stringify } from '../svg/svg-stringify';
import { convertPropertiesToDefinitions } from '../svg/svg-definitions';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';
import { importGeoJSONFeatures } from '../svg/geojson-to-svg';
import { layerIsRectangle, getLayerDataTable, copyLayer } from '../dataset/mapshaper-layer-utils';
import { getDatasetCRS, getDatasetCrsInfo, crsToProj4, parseAuthorityCodeString, parseAuthorityCodeFromWkt } from '../crs/mapshaper-projections';

var ILLUSTRATOR_PATH_VERTEX_LIMIT = 32000;

//
export function exportSVG(dataset, opts) {
  var namespace = 'xmlns="http://www.w3.org/2000/svg"';
  var defs = [];
  var frame, svg, layers, metadataJSON;
  var style = '';

  // kludge for map keys
  if (opts.crisp_paths) {
    style = `
<style>
  path {shape-rendering: crispEdges;}
</style>`;
  }

  // TODO: consider moving this logic to mapshaper-export.js
  if (opts.final) {
    if (dataset.arcs) dataset.arcs.flatten();
  } else {
    dataset = copyDataset(dataset); // Modify a copy of the dataset
  }

  // use invert_y: 0 setting for screen coordinates and geojson polygon generation
  // use 1px default margin so typical strokes don't get cut off on the sides
  opts = Object.assign({invert_y: true, margin: "1"}, opts);
  frame = getFrameData(dataset, opts);
  fitDatasetToFrame(dataset, frame);
  setCoordinatePrecision(dataset, opts.precision || 0.01);
  if (opts.metadata) {
    metadataJSON = JSON.stringify(getGeospatialMetadata(dataset, frame));
  }

  // error if one or more svg_data fields are not present in any layers
  if (opts.svg_data) validateSvgDataFields(dataset.layers, opts.svg_data);

  layers = dataset.layers;
  if (opts.scalebar) {
    layers.push(getScalebarLayer({})); // default options
  }
  svg = layers.map(function(lyr) {
    var obj;
    if (layerHasFurniture(lyr)) {
      obj = exportFurnitureLayerForSVG(lyr, frame, opts);
    } else {
      obj = exportLayerForSVG(lyr, dataset, opts);
    }
    convertPropertiesToDefinitions(obj, defs);
    return stringify(obj);
  }).join('\n');

  if (metadataJSON) {
    svg = getMetadataBlock(metadataJSON, [0, 0, frame.width, frame.height]) + svg;
  }

  if (defs.length > 0) {
    svg = '<defs>\n' + utils.pluck(defs, 'svg').join('') + '</defs>\n' + svg;
  }

  if (svg.includes('xlink:')) {
    namespace += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  }

  // default line style properties
  var capStyle = opts.default_linecap || 'round';
  var lineProps = `stroke-linecap="${capStyle}" stroke-linejoin="round"`;
  if (svg.includes('stroke-linejoin="miter"')) {
    // the default limit in Illustrator seems to be 10 -- too large for mapping
    // (Mapbox uses 2 as the default in their styles)
    lineProps += ' stroke-miterlimit="2"';
  }
  var template = `<?xml version="1.0"?>
<svg ${namespace} version="1.2" baseProfile="tiny" width="%d" height="%d" viewBox="%s %s %s %s" ${lineProps}>${style}
${svg}
</svg>`;
  svg = utils.format(template, frame.width, frame.height, 0, 0, frame.width, frame.height);
  return [{
    content: svg,
    filename: opts.file || getOutputFileBase(dataset) + '.svg'
  }];
}

function getMetadataBlock(metadataJSON, viewBox) {
  var x = viewBox && viewBox[0] || 0;
  var y = viewBox && viewBox[1] || 0;
  var width = viewBox && viewBox[2] || 0;
  var height = viewBox && viewBox[3] || 0;
  return '<metadata>' + metadataJSON + '</metadata>\n' +
    '<g id="mapshaper-metadata">\n' +
    '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" opacity="0"/>\n' +
    '<text opacity="0" font-size="0.1">' + metadataJSON + '</text>\n' +
    '</g>\n';
}

function getGeospatialMetadata(dataset, frame) {
  return {
    crs: getSVGMetadataCRS(dataset),
    bbox: frame.bbox || null
  };
}

function getSVGMetadataCRS(dataset) {
  var crs = getDatasetCRS(dataset);
  var info = getDatasetCrsInfo(dataset);
  var proj4 = null;
  if (crs) {
    proj4 = crsToProj4(crs);
  }
  if (proj4) return proj4;
  return getAuthorityCodeString(info) || null;
}

function getAuthorityCodeString(info) {
  var authority = null;
  if (info && info.crs_string) {
    authority = parseAuthorityCodeString(info.crs_string);
  }
  if (!authority && info && info.wkt1) {
    authority = parseAuthorityCodeFromWkt(info.wkt1);
  }
  if (!authority && info && info.geopackage_crs) {
    authority = parseGeoPackageAuthority(info.geopackage_crs);
  }
  return authority ? authority.authority + ':' + authority.code : null;
}

function parseGeoPackageAuthority(o) {
  if (!o) return null;
  var authority = o.organization || o.authority || null;
  var code = o.organization_coordsys_id || o.code || null;
  return authority && code != null ? {authority: String(authority).toUpperCase(), code: String(code)} : null;
}

export function exportFurnitureLayerForSVG(lyr, frame, opts) {
  var layerObj = getEmptyLayerForSVG(lyr, opts);
  layerObj.children = renderFurnitureLayer(lyr, frame);
  return layerObj;
}

// Prevent unstyled rectangle layers from displaying with the SVG default
// solid black fill.
// lyr: a layer, assumed to contain a single rectangular polygon
function adjustRectangleStyle(lyr) {
  var data = getLayerDataTable(lyr);
  var d = data.getRecords()[0];
  if (!d.fill && !d.stroke) {
    d.fill = "none";
  }
}

export function exportLayerForSVG(lyr, dataset, opts) {
  var layerObj = getEmptyLayerForSVG(lyr, opts);
  if (layerIsRectangle(lyr, dataset.arcs)) {
    lyr = copyLayer(lyr);
    adjustRectangleStyle(lyr);
  }
  layerObj.children = exportSymbolsForSVG(lyr, dataset, opts);
  return layerObj;
}

function exportSymbolsForSVG(lyr, dataset, opts) {
  // TODO: convert geojson features one at a time
  var d = utils.defaults({layers: [lyr]}, dataset);
  var geojson = exportDatasetAsGeoJSON(d, opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  warnIfIllustratorPathLimitExceeded(lyr, features);
  var children = importGeoJSONFeatures(features, opts);
  // Drop empty placeholder <g/> elements (features whose geometry was null in the
  // source data, collapsed during simplification, or otherwise produced no
  // visible output). Keep the layer's records in lockstep so that data-*
  // attributes added via -o svg-data= remain correctly aligned.
  var records = lyr.data ? lyr.data.getRecords() : null;
  var keptRecords = records ? [] : null;
  children = children.filter(function(child, i) {
    if (isEmptyPlaceholder(child)) return false;
    if (keptRecords) keptRecords.push(records[i]);
    return true;
  });
  if (opts.svg_data && lyr.data) {
    addDataAttributesToSVG(children, keptRecords, lyr.data.getFields(), opts.svg_data);
  }
  return children;
}

function warnIfIllustratorPathLimitExceeded(lyr, features) {
  var count = 0;
  var max = 0;
  if (lyr.geometry_type != 'polygon' && lyr.geometry_type != 'polyline') return;
  features.forEach(function(feature) {
    var geom = feature.geometry || feature;
    var n = countSvgPathVertices(geom);
    if (n > ILLUSTRATOR_PATH_VERTEX_LIMIT) {
      count++;
      max = Math.max(max, n);
    }
  });
  if (count > 0) {
    warn(utils.format(
      '%,d SVG path%s in layer "%s" contain%s more than %,d vertices; Adobe Illustrator may not import %s. The largest path has %,d vertices.',
      count,
      utils.pluralSuffix(count),
      lyr.name || '[unnamed]',
      count == 1 ? 's' : '',
      ILLUSTRATOR_PATH_VERTEX_LIMIT,
      count == 1 ? 'it' : 'them',
      max
    ));
  }
}

function countSvgPathVertices(geom) {
  var coords = geom && geom.coordinates;
  if (!coords) return 0;
  if (geom.type == 'LineString') return coords.length;
  if (geom.type == 'MultiLineString' || geom.type == 'Polygon') {
    return sumPathLengths(coords);
  }
  if (geom.type == 'MultiPolygon') {
    return coords.reduce(function(sum, polygon) {
      return sum + sumPathLengths(polygon);
    }, 0);
  }
  return 0;
}

function sumPathLengths(paths) {
  return paths.reduce(function(sum, path) {
    return sum + path.length;
  }, 0);
}

function isEmptyPlaceholder(o) {
  return o.tag == 'g' && (!o.children || o.children.length === 0);
}

export function validateSvgDataFields(layers, fieldsArg) {
  var missingFields = fieldsArg.reduce(function(memo, field) {
    if (!fieldExists(layers, field)) {
      memo.push(field);
    }
    return memo;
  }, []);

  if (missingFields.length && missingFields.indexOf('*') == -1) {
    stop("Missing data field(s):", missingFields.join(', '));
  }

  function fieldExists(layers, field) {
    return utils.some(layers, function(lyr) {
      return lyr.data && lyr.data.fieldExists(field) || false;
    });
  }
}

function addDataAttributesToSVG(children, records, allFields, fieldsArg) {
  var dataFields = fieldsArg.indexOf('*') > -1 ? allFields.concat() : fieldsArg;
  var missingFields = utils.difference(dataFields, allFields);
  if (missingFields.length > 0) {
    dataFields = utils.difference(dataFields, missingFields);
    // stop("Missing data field(s):", missingFields.join(', '));
  }
  var data = exportDataAttributesForSVG(records, dataFields);
  if (children.length != data.length) {
    error("Mismatch between number of SVG symbols and data attributes");
  }
  children.forEach(function(child, i) {
    utils.extend(child.properties || {}, data[i]);
  });
}

export function exportDataAttributesForSVG(records, fields) {
  var validRxp = /^[a-z_][a-z0-9_-]*$/i;
  var invalidRxp = /^xml/;
  var validFields = fields.filter(function(name) {
    return validRxp.test(name) && !invalidRxp.test(name);
  });
  var invalidFields = utils.difference(fields, validFields);
  if (invalidFields.length > 0) {
    message("Unable to add data-* attributes for field(s):", invalidFields.join(', '));
    message("data-* names should match pattern [a-z_][a-z0-9_-]*");
  }
  return records.map(function(rec) {
    var obj = {};
    for (var i=0; i<validFields.length; i++) {
      obj['data-' + validFields[i].toLowerCase()] =
        validDataAttributeValue(rec[validFields[i]]);
    }
    return obj;
  });
}

function validDataAttributeValue(val) {
  // TODO: consider converting some falsy values to empty strings
  // (e.g. null, undefined, NaN)
  return String(val);
}

// internal.validDataAttributeNames = function(names) {
//   return utils.uniqifyNames(names.map(internal.validDataAttributeName));
// };

// There are restrictions on data-* attribute names
// This function modifies names so they can be used
// See: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/data-*
// Mapshaper's rules are a bit more restrictive than the spec -- e.g.
//   the first character after "data-" is restricted to "_" | [a-z]
//
// internal.validDataAttributeName = function(name) {
//   name = name.toLowerCase();
//   name = name.replace(/[^a-z0-9_-]/g, ''); // accept only these letters
//   if (/^([0-9-]|xml)/.test(name) || name === '') {
//     name = '_' + name; // prepend underscore if needed
//   }
//   return name;
// };

export function getEmptyLayerForSVG(lyr, opts) {
  var id = (opts.id_prefix || '') + (lyr.name || utils.getUniqueName('layer'));
  var layerObj = {
    tag: 'g',
    properties: {id: id},
    children: []
  };

  // override default black fill for layers that might have open paths
  // TODO: set fill="none" in SVG symbols, not on the container
  //   (setting fill=none on the container overrides the default black fill
  //   on paths, which may alter the appearance of SVG icons loaded from external URLs).
  if (lyr.geometry_type == 'polyline' || layerHasSvgSymbolField(lyr)) {
    layerObj.properties.fill = 'none';
  }

  // add default display properties to line layers
  // (these are overridden by feature-level styles set via -style)
  if (lyr.geometry_type == 'polyline') {
    layerObj.properties.stroke = 'black';
    layerObj.properties['stroke-width'] = 1;
  }


  // add default text properties to layers with labels
  if (layerHasLabels(lyr) || layerHasSvgSymbols(lyr) || layerHasFurniture(lyr)) {
    layerObj.properties['font-family'] = 'sans-serif';
    layerObj.properties['font-size'] = '12';
    layerObj.properties['text-anchor'] = 'middle';
  }

  return layerObj;
}

// Re-exported from svg-feature-utils.mjs for back-compat.
export { featureHasSvgSymbol, featureHasLabel } from '../svg/svg-feature-utils';

export function layerHasSvgSymbols(lyr) {
  return lyr.geometry_type == 'point' && lyr.data && (
    lyr.data.fieldExists('svg-symbol') ||
    lyr.data.fieldExists('icon') ||
    lyr.data.fieldExists('icon-size') ||
    (lyr.data.fieldExists('icon-color') && lyr.data.fieldExists('r'))
  );
}

function layerHasSvgSymbolField(lyr) {
  return lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('svg-symbol');
}

export function layerHasLabels(lyr) {
  var hasLabels = lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('label-text');
  //if (hasLabels && internal.findMaxPartCount(lyr.shapes) > 1) {
  //  console.error('Multi-point labels are not fully supported');
  //}
  return hasLabels;
}
