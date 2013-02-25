/** @requires albersconic, lambertconic, mixed-projection */

function AlbersUSASpecial() {
  // mix in albers USA stuff
  var mproj = new MixedProjection(new AlbersUSA());
  var lambert = new LambertUSA();
  lambert.useEllipsoid = false; // spherical formula is faster
  mproj.addFrame(lambert, new GeoPoint(63, -152), new GeoPoint(27, -115), 6000000, 3000000, 0.31, 29.2);  // AK
  mproj.addFrame(lambert, new GeoPoint(20.9, -157), new GeoPoint(28.2, -106.6), 2000000, 4000000, 0.9, 40); // HI
  mproj.name = "AlbersUSASpecial";
  return mproj;
}
