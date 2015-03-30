/* @requires mapshaper-common, mapshaper-projections */

api.proj = function(dataset, opts) {
  var proj = MapShaper.getProjection(opts.name, opts);
  if (!proj) {
    stop("[proj] Unknown projection:", opts.name);
  }
  MapShaper.projectDataset(dataset, proj);
};

MapShaper.getProjection = function(name, opts) {
  var names = {
    webmercator: WebMercator,
    mercator: Mercator,
    albers: AlbersEqualAreaConic,
    albersusa: AlbersNYT,
    albersnyt: AlbersNYT,
    lambert: LambertConformalConic,
    lambertusa: LambertUSA
  };
  var f = names[name.toLowerCase().replace(/-_/g, '')];
  return f ? new f(opts) : null;
};

MapShaper.projectDataset = function(dataset, proj) {
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.projectPointLayer(lyr, proj);
    }
  });
  if (dataset.arcs) {
    MapShaper.projectArcs(dataset.arcs, proj);
  }
};

MapShaper.projectPointLayer = function(lyr, proj) {
  var xy = {x: 0, y: 0};
  MapShaper.forEachPoint(lyr, function(p) {
    proj.forward(p[0], p[1], xy);
    p[0] = xy.x;
    p[1] = xy.y;
  });
};

MapShaper.projectArcs = function(arcs, proj) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      p = {x: 0, y: 0};
  if (!MapShaper.probablyDecimalDegreeBounds(arcs.getBounds())) {
    stop("[proj] Only projection from lat-lng coordinates is supported");
  }
  for (var i=0, n=xx.length; i<n; i++) {
    proj.forward(xx[i], yy[i], p);
    xx[i] = p.x;
    yy[i] = p.y;
  }
  arcs.updateVertexData(data.nn, xx, yy);
};
