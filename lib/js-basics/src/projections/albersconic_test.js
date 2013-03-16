/* @requires albersconic testing */

test("Testing AlbersConicUSA()", testAlbers );


function testAlbers() {
  var proj = new AlbersUSA();
  var projSph = new AlbersUSA();
  projSph.useEllipsoid = false;

  var xy, ll;
  xy = proj.projectLatLng(37.5, -96);

	ok( xy.x === 0 && xy.y === 0, "Projecting origin gives 0, 0."  );
  ok(proj.useEllipsoid == true, "Check using ellipsoidal formulas by default.")

  var lat = 30, lon = -90;
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
