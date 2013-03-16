/* @requires gis, shapes */

(function() {

  test("Proximity: Basic distance tests", basicDistanceTests );
  test("Proximity: Basic point-in-polygon tests", basicPointTests );

  var vec = new VertexSet([0, 1, 1, 0], [0, 0, 1, 1]);
  var shp = new ShapeVector(0, vec);

  function basicDistanceTests() {
    expect(3)

    var res = Proximity.getPointPolylineDistance(0, 0, shp);
    equal(res, 0, "Point on 0,0 corner vertex");

    res = Proximity.getPointPolylineDistance(-1, 0, shp);
    equal(res, 1, "Point on -1,0  vertex");

    res = Proximity.getPointPolylineDistance(0.5, 0.5, shp);
    equal(res, 0.5, "Point on 0.5, 0.5 polygon center");
  }

  function basicPointTests() {
    expect(3)
    var res = Proximity.testPointInPolygon(0.5, 0.5, shp);
    equal(res, true, "Point on 0.5, 0.5 polygon center");

    res = Proximity.testPointInPolygon(0.5, -0.5, shp);
    equal(res, false, "(0.5, -0.5)");

    res = Proximity.testPointInPolygon(-0.5, 0.5, shp);
    equal(res, false, "(-0.5, 0.5)");
  }

})();
