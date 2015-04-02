/* @requires mapshaper-common, mapshaper-projections */

api.proj = function(dataset, opts) {
  var proj = MapShaper.getProjection(opts.projection, opts);
  if (!proj) {
    stop("[proj] Unknown projection:", opts.projection);
  }
  MapShaper.projectDataset(dataset, proj);
};

MapShaper.getProjection = function(name, opts) {
  var f = MapShaper.projectionIndex[name.toLowerCase().replace(/-_ /g, '')];
  return f ? new f(opts) : null;
};

MapShaper.printProjections = function() {
  var names = Object.keys(MapShaper.projectionIndex);
  names.sort();
  names.forEach(function(n) {
    message(n);
  });
};

MapShaper.projectionIndex = {
  webmercator: WebMercator,
  mercator: Mercator,
  albers: AlbersEqualAreaConic,
  albersusa: AlbersNYT,
  albersnyt: AlbersNYT,
  lambertcc: LambertConformalConic,
  transversemercator: TransverseMercator,
  utm: UTM,
  winkeltripel: WinkelTripel
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
    proj.projectLatLng(p[1], p[0], xy);
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
    proj.projectLatLng(yy[i], xx[i], p);
    xx[i] = p.x;
    yy[i] = p.y;
  }
  arcs.updateVertexData(data.nn, xx, yy);
};
