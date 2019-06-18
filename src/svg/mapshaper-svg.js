/* @requires
mapshaper-common
mapshaper-basic-symbols
geojson-export
geojson-to-svg
mapshaper-svg-style
svg-common
mapshaper-pixel-transform
*/

//
//
internal.exportSVG = function(dataset, opts) {
  var template = '<?xml version="1.0"?>\n<svg %s ' +
    'version="1.2" baseProfile="tiny" width="%d" height="%d" viewBox="%s %s %s %s" stroke-linecap="round" stroke-linejoin="round">\n%s\n</svg>';
  var namespace = 'xmlns="http://www.w3.org/2000/svg"';
  var symbols = [];
  var size, svg;

  // TODO: consider moving this logic to mapshaper-export.js
  if (opts.final) {
    if (dataset.arcs) dataset.arcs.flatten();
  } else {
    dataset = internal.copyDataset(dataset); // Modify a copy of the dataset
  }
  // invert_y setting for screen coordinates and geojson polygon generation
  utils.extend(opts, {invert_y: true});
  size = internal.transformCoordsForSVG(dataset, opts);

  // error if one or more svg_data fields are not present in any layers
  if (opts.svg_data) internal.validateSvgDataFields(dataset.layers, opts.svg_data);

  svg = dataset.layers.map(function(lyr) {
    var obj = internal.exportLayerForSVG(lyr, dataset, opts);
    SVG.embedImages(obj, symbols);
    return SVG.stringify(obj);
  }).join('\n');
  if (symbols.length > 0) {
    namespace += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    svg = '<defs>\n' + utils.pluck(symbols, 'svg').join('') + '</defs>\n' + svg;
  }
  svg = utils.format(template, namespace, size[0], size[1], 0, 0, size[0], size[1], svg);
  return [{
    content: svg,
    filename: opts.file || utils.getOutputFileBase(dataset) + '.svg'
  }];
};

internal.transformCoordsForSVG = function(dataset, opts) {
  var size = internal.transformDatasetToPixels(dataset, opts);
  var precision = opts.precision || 0.0001;
  internal.setCoordinatePrecision(dataset, precision);
  return size;
};

internal.exportLayerForSVG = function(lyr, dataset, opts) {
  var layerObj = internal.getEmptyLayerForSVG(lyr, opts);
  if (internal.layerHasFurniture(lyr)) {
    layerObj.children = internal.exportFurnitureForSVG(lyr, dataset, opts);
  } else {
    layerObj.children = internal.exportSymbolsForSVG(lyr, dataset, opts);
  }
  return layerObj;
};

internal.exportFurnitureForSVG = function(lyr, dataset, opts) {
  var frameLyr = internal.findFrameLayerInDataset(dataset);
  var frameData;
  if (!frameLyr) return [];
  frameData = internal.getFurnitureLayerData(frameLyr);
  frameData.crs = internal.getDatasetCRS(dataset); // required by e.g. scalebar
  return SVG.importFurniture(internal.getFurnitureLayerData(lyr), frameData);
};

internal.exportSymbolsForSVG = function(lyr, dataset, opts) {
  // TODO: convert geojson features one at a time
  var d = utils.defaults({layers: [lyr]}, dataset);
  var geojson = internal.exportDatasetAsGeoJSON(d, opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  var children = SVG.importGeoJSONFeatures(features, opts);
  var data;
  if (opts.svg_data && lyr.data) {
    internal.addDataAttributesToSVG(children, lyr.data, opts.svg_data);
  }
  return children;
};

internal.validateSvgDataFields = function(layers, fieldsArg) {
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
};

internal.addDataAttributesToSVG = function(children, table, fieldsArg) {
  var allFields = table.getFields();
  var dataFields = fieldsArg.indexOf('*') > -1 ? allFields.concat() : fieldsArg;
  var missingFields = utils.difference(dataFields, allFields);
  if (missingFields.length > 0) {
    dataFields = utils.difference(dataFields, missingFields);
    // stop("Missing data field(s):", missingFields.join(', '));
  }
  var records = table.getRecords();
  var data = internal.exportDataAttributesForSVG(records, dataFields);
  if (children.length != data.length) {
    error("Mismatch between number of SVG symbols and data attributes");
  }
  children.forEach(function(child, i) {
    utils.extend(child.properties || {}, data[i]);
  });
};

internal.exportDataAttributesForSVG = function(records, fields) {
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
        internal.validDataAttributeValue(rec[validFields[i]]);
    }
    return obj;
  });
};

internal.validDataAttributeValue = function(val) {
  // TODO: consider converting some falsy values to empty strings
  // (e.g. null, undefined, NaN)
  return String(val);
};

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

internal.getEmptyLayerForSVG = function(lyr, opts) {
  var layerObj = {
    tag: 'g',
    properties: {id: (opts.id_prefix || '') + lyr.name},
    children: []
  };

  // override default black fill for layers that might have open paths
  if (lyr.geometry_type == 'polyline' || internal.layerHasSvgSymbols(lyr)) {
    layerObj.properties.fill = 'none';
  }

  // add default display properties to line layers
  // (these are overridden by feature-level styles set via -style)
  if (lyr.geometry_type == 'polyline') {
    layerObj.properties.stroke = 'black';
    layerObj.properties['stroke-width'] = 1;
  }


  // add default text properties to layers with labels
  if (internal.layerHasLabels(lyr) || internal.layerHasSvgSymbols(lyr) || internal.layerHasFurniture(lyr)) {
    layerObj.properties['font-family'] = 'sans-serif';
    layerObj.properties['font-size'] = '12';
    layerObj.properties['text-anchor'] = 'middle';
  }

  return layerObj;
};

internal.layerHasSvgSymbols = function(lyr) {
  return lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('svg-symbol');
};

internal.layerHasLabels = function(lyr) {
  var hasLabels = lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('label-text');
  //if (hasLabels && internal.findMaxPartCount(lyr.shapes) > 1) {
  //  console.error('Multi-point labels are not fully supported');
  //}
  return hasLabels;
};
