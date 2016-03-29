/* @require mapshaper-common, geojson-export, geojson-to-svg */

MapShaper.exportSVG = function(dataset, opts) {
  var template = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ' +
    'version="1.2" baseProfile="tiny" width="%d" height="%d" viewBox="%s %s %s %s">\n%s\n</svg>';
  var b, svg;

  dataset = MapShaper.copyDataset(dataset); // Modify a copy of the dataset
  b = MapShaper.transformCoordsForSVG(dataset, opts);
  svg = dataset.layers.map(function(lyr) {
    return MapShaper.exportLayerAsSVG(lyr, dataset, opts);
  }).join('\n');
  svg = utils.format(template, b.width(), b.height(), 0, 0, b.width(), b.height(), svg);
  return [{
    content: svg,
    filename: opts.output_file || utils.getOutputFileBase(dataset) + '.svg'
  }];
};

MapShaper.transformCoordsForSVG = function(dataset, opts) {
  var width = 800; // TODO: make this settable
  var margin = opts.margin >= 0 ? opts.margin : 1;
  var bounds = MapShaper.getDatasetBounds(dataset);
  var precision = opts.precision || 0.0001;
  var height, bounds2, fwd;
  MapShaper.padViewportBoundsForSVG(bounds, width, margin);
  height = Math.ceil(width * bounds.height() / bounds.width());
  bounds2 = new Bounds(0, -height, width, 0);
  fwd = bounds.getTransform(bounds2);
  MapShaper.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  MapShaper.setCoordinatePrecision(dataset, precision);
  return bounds2;
};

// pad bounds to accomodate stroke width and circle radius
MapShaper.padViewportBoundsForSVG = function(bounds, width, marginPx) {
  var marg;
  if (marginPx >= 0 === false) {
    marginPx = 1;
  }
  marg = bounds.width() / (width - marginPx * 2) * marginPx;
  bounds.padBounds(marg, marg, marg, marg);
};

MapShaper.exportLayerAsSVG = function(lyr, dataset, opts) {
  var geojson = MapShaper.exportGeoJSONObject(lyr, dataset, opts);
  var features = SVG.importGeoJSONFeatures(geojson);
  var svgObj = {
    tag: 'g',
    children: features,
    properties: {id: lyr.name}
  };
  var style = SVG.defaultStyles[lyr.geometry_type];
  utils.extend(svgObj.properties, style);
  return SVG.stringify(svgObj);
};
