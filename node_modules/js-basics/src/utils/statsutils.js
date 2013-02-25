/**
 * Implements the Excel normsdist() function
 */
function normsdist(x) {
  var b1 = 0.319381530;
  var b2 = -0.356563782;
  var b3 = 1.781477937;
  var b4 = -1.821255978;
  var b5 = 1.330274429;
  var p = 0.2316419;
  var c = 0.39894228;
  var t;

  var retn;
  if (x >= 0.0) {
    t = 1.0 / ( 1.0 + p * x );
    retn = (1.0 - c * Math.exp( -x * x / 2.0 ) * t *
      ( t *( t * ( t * ( t * b5 + b4 ) + b3 ) + b2 ) + b1 ));
  }
  else {
    t = 1.0 / ( 1.0 - p * x );
    retn = ( c * Math.exp( -x * x / 2.0 ) * t *
      ( t *( t * ( t * ( t * b5 + b4 ) + b3 ) + b2 ) + b1 ));
  }

  if (isNaN(retn)) {
    retn = 0;
  }
  return retn;
}