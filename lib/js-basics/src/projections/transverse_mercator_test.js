/* @requires testing transverse_mercator */

test("Testing TransverseMercator()", function(){ testTransverseMercator(TransverseMercator, 0, 0); } );
//test("Testing UTM()", function(){ runTests(UTM, 28, false); } );

function testTransverseMercator(projClass, a, b) {
  var proj = new projClass(a, b);
  var projSph = new projClass(a, b);
  projSph.useEllipsoid = false;

  var xy, ll;
  xy = proj.projectLatLng(0, 0);

	ok( xy.x === 0 && xy.y === 0, "Projecting origin gives 0, 0: "  + strval(xy) );
  ok(proj.useEllipsoid == true, "Check using ellipsoidal formulas by default.")

  var lat = 70, lon = -20;
  xy = proj.projectLatLng(lat, lon);
  ll = proj.unprojectXY(xy.x, xy.y);
  
  ok(aboutEqual(lat, ll.lat, 0.00001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, ellipsoid: " + strval(ll));

  xy = projSph.projectLatLng(lat, lon);
  ll = projSph.unprojectXY(xy.x, xy.y);
  
  ok(aboutEqual(lat, ll.lat, 0.00001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, spheroid: " + strval(ll));

  var start = new Date().getTime();
  var loops = 100000;
  for (var i=0; i<loops; i++) {
    xy = proj.projectLatLng(lat, lon, xy);
  }
  var stop = new Date().getTime();
  var elapsed = stop - start;

  ok( elapsed < 100, "100,000 projections complete in under 100ms: " + elapsed );
}
