/* @requires testing, lambertconic */
var xy = new Point(), ll;

test("Testing LambertConicUSA()", testLambertConic );

function testLambertConic() {
  var proj = new LambertUSA();
  var projSph = new LambertUSA();
  projSph.useEllipsoid = false;

  proj.projectLatLng(39, -96, xy);

	ok( xy.x === 0 && xy.y === 0, "Projecting origin gives 0, 0."  );
  ok(proj.useEllipsoid == true, "Check using ellipsoidal formulas by default.")

  var lat = 55, lon = -122;
  projSph.projectLatLng(lat, lon, xy);
  ll = projSph.unprojectXY(xy.x, xy.y);
 
  
  ok(aboutEqual(lat, ll.lat, 0.00001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, spheroid: " + strval(ll));
  trace("xy:", xy);
  proj.projectLatLng(lat, lon, xy);
  trace("xy2:", xy);

  ll = proj.unprojectXY(xy.x, xy.y);
  ok(aboutEqual(lat, ll.lat, 0.000001) && aboutEqual(lon, ll.lng, 0.00001), "Double projection test, ellipsoid: " + strval(ll));


  var start = new Date().getTime();
  var loops = 100000;
  //var xy = new Point();
  for (var i=0; i<loops; i++) {
    proj.projectLatLng(lat, lon, xy);
    //ll = proj.unprojectXY(10, 10);
  }
  var stop = new Date().getTime();
  var elapsed = stop - start;

  ok( elapsed < 100, "100,000 projections completed in under 100ms: " + elapsed );
}
