/* @requires loading.jsonp utf16 */

(function() {
  var loader = new JsonPLoader("data/jsonptest.utf16be.js", "__receive_jsonptest_utf16be", "utf-16be");
  loader.addEventListener('ready', handleReady);

  function handleReady() {
    trace("ready");
    var bytes = new Utf16Array(loader.data);
    
    var len = (1 << 16) - 1;
    var errorCount = 0;
    var maxErrors = 50;
    for( var i=0; i < len && errorCount < maxErrors; i++) {
      var val = bytes.readUnsignedShort();
      if (val !== i) {
        trace("Mismatch; expected:", i, "(", i.toString(16), ") found:", val);
        errorCount ++;
      }
    }
    
    test("Integers from 0-65535", function() {
      ok(errorCount == 0, "Mismatches: " + errorCount + (errorCount >= maxErrors ? " or more" : ""));
    });
  }
})();