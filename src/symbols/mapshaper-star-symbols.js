

export function getMinorRadius(points) {
  var innerAngle = 360 / points;
  var pointAngle = getDefaultPointAngle(points);
  var thetaA = Math.PI / 180 * innerAngle / 2;
  var thetaB = Math.PI / 180 * pointAngle / 2;
  var a = Math.tan(thetaB) / (Math.tan(thetaB) + Math.tan(thetaA));
  var c = a / Math.cos(thetaA);
  return c;
}


function getPointAngle(points, skip) {
  var unitAngle = 360 / points;
  var centerAngle = unitAngle * (skip + 1);
  return 180 - centerAngle;
}

function getDefaultPointAngle(points) {
  var minSkip = 1;
  var maxSkip = Math.ceil(points / 2) - 2;
  var skip = Math.floor((maxSkip + minSkip) / 2);
  return getPointAngle(points, skip);
}
