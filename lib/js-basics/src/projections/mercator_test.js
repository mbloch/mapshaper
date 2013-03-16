/* @requires testing mercator */

test("Testing Mercator()", testMercator );

function testMercator() {
  var proj = new Mercator();
  var projSph = new Mercator();
  projSph.useEllipsoid = false;

  var xy, ll;
  xy = proj.projectLatLng(0, 0);
	ok( xy.x === 0 && xy.y === 0, "Projecting origin gives 0, 0: " + strval(xy));
  ok(proj.useEllipsoid == true, "Check using ellipsoidal formulas by default.")

  var lat = 55, lon = -122;
  xy = projSph.projectLatLng(lat, lon);
  ll = projSph.unprojectXY(xy.x, xy.y);
  
  ok(aboutEqual(lat, ll.lat, 0.00001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, spheroid: " + strval(ll));

  xy = proj.projectLatLng(lat, lon);
  ll = proj.unprojectXY(xy.x, xy.y);

  ok(aboutEqual(lat, ll.lat, 0.000001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, ellipsoid: " + strval(ll));

  var start = new Date().getTime();
  var loops = 100000;
  for (var i=0; i<loops; i++) {
    xy = proj.projectLatLng(lat, lon, xy);
  }
  var stop = new Date().getTime();
  var elapsed = stop - start;

  ok( elapsed < 100, "100,000 projections completed in under 100ms: " + elapsed );
}
