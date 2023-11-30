import fs from 'fs';
import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #247 (Better SVG layer and feature ids)', function () {
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

  it ('-o id-prefix=<string> is applied to SVG layer and feature ids', function() {
    var dataset = {
        layers: [{
            name: 'dataset',
            geometry_type: 'point',
            shapes: [[[0,0], [1,1]]],
            data: new api.internal.DataTable([{FID: 'A', r: 3}])
        }]
    };
    var out = api.internal.exportLayerForSVG(dataset.layers[0], dataset, {id_prefix: 'points-'});
    var target = {
        tag: 'g',
        properties: {id: 'points-dataset'},
        children: [{
            tag: 'g',
            properties: {id: 'points-A'},
            children: [{
              "tag": "circle",
              "properties": {
                "cx": 0,
                "cy": 0,
                "r": 3
              }
            }, {
              "tag": "circle",
              "properties": {
                "cx": 1,
                "cy": 1,
                "r": 3
              }
            }]
        }]
    }
    assert.deepEqual(out, target);
  });

});
