/* @require mapshaper-rectangle, mapshaper-projections, mapshaper-furniture */

api.frame = function(catalog, source, opts) {
  var width = Number(opts.width);
  var height, bounds, tmp, dataset;
  if (width > 0 === false) {
    stop("Missing a width");
  }
  if (opts.height) {
    opts = utils.extend({}, opts);
    opts.aspect_ratio = opts.height.split(',').map(function(opt) {
      var height = Number(opt);
      if (!opt) return '';
      if (height > 0 === false) {
        stop('Missing a valid height');
      }
      return width / height;
    }).join(',');
  }
  tmp = api.rectangle(source, opts);
  bounds = internal.getDatasetBounds(tmp);
  if (internal.probablyDecimalDegreeBounds(bounds)) {
    stop('Frames require projected, not geographical coordinates');
  } else if (!internal.getDatasetCRS(tmp)) {
    message('Warning: missing projection data. Assuming coordinates are meters and k (scale factor) is 1');
  }
  height = width * bounds.height() / bounds.width();
  dataset = {info: {}, layers:[{
    name: opts.name || 'frame',
    data: new DataTable([{
      width: width,
      height: height,
      bbox: bounds.toArray(),
      type: 'frame'
    }])
  }]};
  // return dataset;
  catalog.addDataset(dataset);
};


internal.getDatasetDisplayBounds = function(dataset) {
  var frameLyr = findFrameLayerInDataset(dataset);
  if (frameLyr) {
    // TODO: check for coordinate issues (non-intersection with other layers, etc)
    return internal.getFrameLayerBounds(frameLyr);
  }
  return internal.getDatasetBounds(dataset);
};

// @lyr dataset layer
internal.isFrameLayer = function(lyr) {
  return internal.getFurnitureLayerType(lyr) == 'frame';
};

internal.findFrameLayerInDataset = function(dataset) {
  return utils.find(dataset.layers, function(lyr) {
    return internal.isFrameLayer(lyr);
  });
};

internal.findFrameDataset = function(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return internal.isFrameLayer(o.layer);
  });
  return target ? target.dataset : null;
};

internal.findFrameLayer = function(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return internal.isFrameLayer(o.layer);
  });
  return target && target.layer || null;
};

internal.getFrameLayerBounds = function(lyr) {
  return new Bounds(internal.getFurnitureLayerData(lyr).bbox);
};


// @data frame data, including crs property if available
// Returns a single value: the ratio or
internal.getMapFrameMetersPerPixel = function(data) {
  var bounds = new Bounds(data.bbox);
  var k, toMeters, metersPerPixel;
  if (data.crs) {
    // TODO: handle CRS without inverse projections
    // scale factor is the ratio of coordinate distance to true distance at a point
    k = internal.getScaleFactorAtXY(bounds.centerX(), bounds.centerY(), data.crs);
    toMeters = data.crs.to_meter;
  } else {
    // Assuming coordinates are meters and k is 1 (not safe)
    // A warning should be displayed when relevant furniture element is created
    k = 1;
    toMeters = 1;
  }
  metersPerPixel = bounds.width() / k * toMeters / data.width;
  return metersPerPixel;
};

SVG.furnitureRenderers.frame = function(d) {
  var lineWidth = 1,
      // inset stroke by half of line width
      off = lineWidth / 2,
      obj = SVG.importPolygon([[[off, off], [off, d.height - off],
        [d.width - off, d.height - off],
        [d.width - off, off], [off, off]]]);
  utils.extend(obj.properties, {
      fill: 'none',
      stroke: 'black',
      'stroke-width': lineWidth
  });
  return [obj];
};
