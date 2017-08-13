/* @requires
mapshaper-common
geojson-export
geojson-points
geojson-to-svg
mapshaper-svg-style
svg-common
mapshaper-pixel-transform
*/

//
//
internal.exportSVG = function(dataset, opts) {
  var template = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ' +
    'version="1.2" baseProfile="tiny" width="%d" height="%d" viewBox="%s %s %s %s" stroke-linecap="round" stroke-linejoin="round">\n%s\n</svg>';
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
  svg = dataset.layers.map(function(lyr) {
    return SVG.stringify(internal.exportLayerForSVG(lyr, dataset, opts));
  }).join('\n');
  svg = utils.format(template, size[0], size[1], 0, 0, size[0], size[1], svg);
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
  // TODO: convert geojson features one at a time
  var d = utils.defaults({layers: [lyr]}, dataset);
  var geojson = internal.exportDatasetAsGeoJSON(d, opts);
  var features = geojson.features || geojson.geometries || (geojson.type ? [geojson] : []);
  if (opts.point_symbol == 'square' && geojson.type == 'FeatureCollection') {
    features.forEach(function(feat) {
      GeoJSON.convertPointFeatureToSquare(feat, 'r', 2);
    });
  }
  var symbols = SVG.importGeoJSONFeatures(features);
  var layerObj = {
    tag: 'g',
    properties: {id: lyr.name},
    children: symbols
  };

  // add default display properties to line layers
  // (these are overridden by feature-level styles set via -svg-style)
  if (lyr.geometry_type == 'polyline') {
    layerObj.properties.fill = 'none';
    layerObj.properties.stroke = 'black';
    layerObj.properties['stroke-width'] = 1;
  }

  // add default text properties to label layers
  if (lyr.data && lyr.data.fieldExists('label-text')) {
    layerObj.properties['font-family'] = 'sans-serif';
    layerObj.properties['font-size'] = '12';
    layerObj.properties['text-anchor'] = 'middle';
  }

  return layerObj;
};
