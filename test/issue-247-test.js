var fs = require('fs'),
    api = require('..'),
    assert = require('assert');

describe('Issue #247: Nicer SVG layer names', function () {
  it ('SVG layer gets name of data layer', function(done) {
    var input = {
        type: 'LineString',
        coordinates: [[0, 0], [2, 1]]
    };
    api.applyCommands('-i line.json -points vertices + name="vertices" -o target=vertices,line graphic.svg', {'line.json': input}, function(err, output) {

        var svg = output['graphic.svg'];
        assert(/<g[^>]* id="vertices"/.test(svg))
        assert(/<g[^>]* id="line"/.test(svg))
        done();
    })
  });

});
