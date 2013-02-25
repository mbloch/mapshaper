
var MathUtils = {
  round: function(val, dig) {
    dig = dig | 0;
    var f = 1;
    while(dig-- > 0) f *= 10;
    val = Math.round(val * f) / f;
    return val;
  }
}