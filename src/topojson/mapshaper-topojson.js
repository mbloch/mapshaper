/* @requires topojson-import, topojson-export, mapshaper-dataset-utils */

MapShaper.topojson = TopoJSON;

// Convert a TopoJSON topology into mapshaper's internal format
// Side-effect: data in topology is modified
//
MapShaper.importTopoJSON = function(topology, opts) {
  var layers = [],
      arcs;

  if (Utils.isString(topology)) {
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

  Utils.forEach(topology.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, opts);

    if (MapShaper.layerHasPaths(lyr)) {
      MapShaper.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
    }

    lyr.name = name;
    layers.push(lyr);
  });

  var dataset = {
    layers: layers,
    arcs: arcs,
    info: {}
  };

  return dataset;
};

MapShaper.exportTopoJSON = function(dataset, opts) {
  var topology = TopoJSON.exportTopology(dataset.layers, dataset.arcs, opts);
  var filename = "output.json", // default
  name;
  if (opts.output_file) {
    filename = opts.output_file;
  } else if (dataset.info && dataset.info.input_files) {
    name = MapShaper.getCommonFileBase(dataset.info.input_files);
    if (name) filename = name + ".json";
  }
  // TODO: consider supporting this option again
  /*
  if (opts.topojson_divide) {
    topologies = TopoJSON.splitTopology(topology);
    files = Utils.map(topologies, function(topo, name) {
      return {
        content: JSON.stringify(topo),
        name: name
      };
    });
  }
  */
  return [{
    content: JSON.stringify(topology),
    filename: filename
  }];
};
