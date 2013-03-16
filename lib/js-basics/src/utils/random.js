/**
 * A replacement for Math.random() that can be seeded
 * (A particular seed string yields the same number sequence every time).
 * 
 * Usage:
 *    Random.seed("daisies"); // optional
 *    var n = Random.number();
 */
var Random = (function() {
  var x, y, z;
  var obj = {
    /**
     * Seeds the number generator with a string (or number).
     */
    seed: function(s) {
      var str = String(s);
      x = y = z = 101;
      for (var i = 0, len=str.length; i < len; i++) {
        var c = str.charCodeAt(i);
        x = (c + x * 33) % 30000 + 1;
        y = (y + x * 33) % 30000 + 1;
        z = (c * 33 + z) % 30000 + 1;
      }
    },

    /**
     * Returns number in range [0, 1)
     *
     * Wichmann-Hill algorithm (1982)
     * Assumes x, y, z are positive integers less than modulo operands below
     * cf. http://www2.imperial.ac.uk/~hohs/S9/2007-2008/wichmannhill.pdf
     */
    number: function() {
      x = (171 * x) % 30269;
      y = (172 * y) % 30307;
      z = (170 * z) % 30323;
      return (x/30269.0 + y/30307.0 + z/30323.0) % 1.0;
    }
  };

  obj.seed(+new Date);
  return obj;
})();
