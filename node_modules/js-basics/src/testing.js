/* @requires browser */

function almostEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

var aboutEqual = almostEqual;

var strval = Utils.strval;