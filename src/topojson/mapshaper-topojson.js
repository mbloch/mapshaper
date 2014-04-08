/* @requires topojson-import, topojson-export */

MapShaper.topojson = TopoJSON;

MapShaper.importTopoJSON = function(obj, opts) {
  var round = opts && opts.precision ? getRoundingFunction(opts.precision) : null;

  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var arcs = TopoJSON.importArcs(obj.arcs, obj.transform, round),
      layers = [];
  Utils.forEach(obj.objects, function(object, name) {
    var layerData = TopoJSON.importObject(object, arcs);
    var data;
    if (layerData.properties) {
      data = new DataTable(layerData.properties);
    }
    layers.push({
      name: name,
      data: data,
      shapes: layerData.shapes,
      geometry_type: layerData.geometry_type
    });
  });

  return {
    arcs: new ArcDataset(arcs),
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
