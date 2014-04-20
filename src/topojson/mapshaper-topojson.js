/* @requires topojson-import, topojson-export */

MapShaper.topojson = TopoJSON;

// Convert a TopoJSON topology into mapshaper's internal format
// Side-effect: data in topology is modified
//
MapShaper.importTopoJSON = function(topology, opts) {
  if (Utils.isString(topology)) {
    topology = JSON.parse(topology);
  }
  // topology with only point objects might lack an arcs array --
  // add empty array so points can be imported (kludge)
  if (!topology.arcs) {
    topology.arcs = [];
  }
  var layers = [];
  Utils.forEach(topology.objects, function(object, name) {
    var lyr = TopoJSON.importObject(object, topology.arcs);
    lyr.name = name;
    layers.push(lyr);
  });

  // TODO: apply transform to ArcDataset, not input arcs
  if (topology.transform) {
    TopoJSON.decodeArcs(topology.arcs, topology.transform);
  }
  if (opts && opts.precision) {
    TopoJSON.roundCoords(topology.arcs, opts.precision);
  }

  return {
    arcs: new ArcDataset(TopoJSON.importArcs(topology.arcs)),
    layers: layers,
    info: {}
  };
};

// TODO: Support ids from attribute data
//
MapShaper.exportTopoJSON = function(layers, arcData, opts) {
  var topology = TopoJSON.exportTopology(layers, arcData, opts),
      topologies, files;
  if (opts.topojson_divide) {
    topologies = TopoJSON.splitTopology(topology);
    files = Utils.map(topologies, function(topo, name) {
      return {
        content: JSON.stringify(topo),
        name: name
      };
    });
  } else {
    files = [{
      content: JSON.stringify(topology),
      name: ""
    }];
  }
  return files;
};
