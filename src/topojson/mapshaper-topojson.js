/* @requires topojson-import, topojson-export, mapshaper-dataset-utils, mapshaper-stringify */

MapShaper.topojson = TopoJSON;

// Convert a TopoJSON topology into mapshaper's internal format
// Side-effect: data in topology is modified
//
MapShaper.importTopoJSON = function(topology, opts) {
  var layers = [],
      dataset, arcs;

  if (utils.isString(topology)) {
    topology = JSON.parse(topology);
  }

  if (topology.arcs && topology.arcs.length > 0) {
    // TODO: apply transform to ArcCollection, not input arcs
    if (topology.transform) {
      TopoJSON.decodeArcs(topology.arcs, topology.transform);
    }

    if (opts && opts.precision) {
      TopoJSON.roundCoords(topology.arcs, opts.precision);
    }

    arcs = new ArcCollection(topology.arcs);
  }

  utils.forEachProperty(topology.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, opts);

    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }

    lyr.name = name;
    layers.push(lyr);
  });

  dataset = {
    layers: layers,
    arcs: arcs,
    info: {}
  };

  MapShaper.importCRS(dataset, topology);

  return dataset;
};

MapShaper.exportTopoJSON = function(dataset, opts) {
  var topology = TopoJSON.exportTopology(dataset, opts),
      stringify = JSON.stringify,
      filename;
  if (opts.prettify) {
    stringify = MapShaper.getFormattedStringify('coordinates,arcs,bbox,translate,scale'.split(','));
  }
  if (opts.output_file) {
    filename = opts.output_file;
  } else if (dataset.info && dataset.info.input_files) {
    // use base name of input file(s)
    filename = (MapShaper.getCommonFileBase(dataset.info.input_files) || 'output') + '.json';
  } else {
    filename = 'output.json';
  }

  return [{
    content: stringify(topology),
    filename: filename
  }];
};
