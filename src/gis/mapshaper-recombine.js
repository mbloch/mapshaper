

MapShaper.recombineLayers = function(layers) {
  if (layers.length <= 1) return layers;
  var lyr0 = layers[0],
      mergedProperties = lyr0.data ? [] : null,
      mergedShapes = [];

  Utils.forEach(layers, function(lyr) {
    if (mergedProperties) {
      mergedProperties.push.apply(mergedProperties, lyr.data.getRecords());
    }
    mergedShapes.push.apply(mergedShapes, lyr.shapes);
  });

  return Opts.copyNewParams({
    data: new DataTable(mergedProperties),
    shapes: mergedShapes,
    name: ""
  }, lyr0);
};
