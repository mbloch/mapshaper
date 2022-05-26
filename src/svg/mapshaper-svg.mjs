import { exportDatasetAsGeoJSON } from '../geojson/geojson-export';
import { getFurnitureLayerData, layerHasFurniture, importFurniture } from '../furniture/mapshaper-furniture';
import { getFrameData } from '../furniture/mapshaper-frame-data';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { getScalebarLayer } from '../commands/mapshaper-scalebar';
import { fitDatasetToFrame } from '../furniture/mapshaper-pixel-transform';
import { copyDataset } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import { message, error, stop } from '../utils/mapshaper-logging';
import { stringify } from '../svg/svg-stringify';
import { convertPropertiesToDefinitions } from '../svg/svg-definitions';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';
import { importGeoJSONFeatures } from '../svg/geojson-to-svg';

//
export function exportSVG(dataset, opts) {
  var namespace = 'xmlns="http://www.w3.org/2000/svg"';
  var defs = [];
  var frame, svg, layers;
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

  // invert_y setting for screen coordinates and geojson polygon generation
  utils.extend(opts, {invert_y: true});
  frame = getFrameData(dataset, opts);
  fitDatasetToFrame(dataset, frame, opts);
  setCoordinatePrecision(dataset, opts.precision || 0.0001);

  // error if one or more svg_data fields are not present in any layers
  if (opts.svg_data) validateSvgDataFields(dataset.layers, opts.svg_data);

  layers = dataset.layers;
  if (opts.scalebar) {
    layers.push(getScalebarLayer({})); // default options
  }
  svg = layers.map(function(lyr) {
    var obj;
    if (layerHasFurniture(lyr)) {
      obj = exportFurnitureForSVG(lyr, frame, opts);
    } else {
      obj = exportLayerForSVG(lyr, dataset, opts);
    }
    convertPropertiesToDefinitions(obj, defs);
    return stringify(obj);
  }).join('\n');

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

export function exportFurnitureForSVG(lyr, frame, opts) {
  var layerObj = getEmptyLayerForSVG(lyr, opts);
  layerObj.children = importFurniture(getFurnitureLayerData(lyr), frame);
  return layerObj;
}

export function exportLayerForSVG(lyr, dataset, opts) {
  var layerObj = getEmptyLayerForSVG(lyr, opts);
  layerObj.children = exportSymbolsForSVG(lyr, dataset, opts);
  return layerObj;
}

function exportSymbolsForSVG(lyr, dataset, opts) {
  // TODO: convert geojson features one at a time
  var d = utils.defaults({layers: [lyr]}, dataset);
  var geojson = exportDatasetAsGeoJSON(d, opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  var children = importGeoJSONFeatures(features, opts);
  if (opts.svg_data && lyr.data) {
    addDataAttributesToSVG(children, lyr.data, opts.svg_data);
  }
  return children;
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

function addDataAttributesToSVG(children, table, fieldsArg) {
  var allFields = table.getFields();
  var dataFields = fieldsArg.indexOf('*') > -1 ? allFields.concat() : fieldsArg;
  var missingFields = utils.difference(dataFields, allFields);
  if (missingFields.length > 0) {
    dataFields = utils.difference(dataFields, missingFields);
    // stop("Missing data field(s):", missingFields.join(', '));
  }
  var records = table.getRecords();
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
  if (lyr.geometry_type == 'polyline' || layerHasSvgSymbols(lyr)) {
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

export function featureHasSvgSymbol(d) {
  return !!(d && (d['svg-symbol'] || d.r));
}

export function featureHasLabel(d) {
  var text = d && d['label-text'];
  return text || text === 0; // accept numerical 0 as label text
}

export function layerHasSvgSymbols(lyr) {
  return lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('svg-symbol');
}

export function layerHasLabels(lyr) {
  var hasLabels = lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('label-text');
  //if (hasLabels && internal.findMaxPartCount(lyr.shapes) > 1) {
  //  console.error('Multi-point labels are not fully supported');
  //}
  return hasLabels;
}
