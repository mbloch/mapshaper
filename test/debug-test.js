var api = require('../'),
    internal = api.internal,
    assert = require('assert');

describe('debug', function () {

    good("file.shp name='a b'", {files:['file.shp'], name: 'a b'});

});

function good(str, reference) {
  it(str, function() {
    var parsed = internal.parseCommands(str);
    var target = parsed[0].options;
    assert.deepEqual(target, reference);
  })
}