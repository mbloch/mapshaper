import api from '../mapshaper.js';
import assert from 'assert';
var ArcCollection = api.internal.ArcCollection;

describe('mapshaper-path-endpoints.js', function () {

  describe('getPathEndpointTest()', function() {
      //
      //  b --- c
      //  |
      //  |
      //  a
      //
      var coords = [[[1, 1], [1, 2]], [[1, 2], [2, 2]]];
      it("test 1", function() {
        var arcs = new ArcCollection(coords);
        var layers = [{
          geometry_type: 'polyline',
          shapes: [[[0, 1]]]
        }];
        var test = api.internal.getPathEndpointTest(layers, arcs);
        assert(!test(0));
        assert(test(~0));
        assert(test(1));
        assert(!test(~1));
     });

      it("test 2", function() {
        var arcs = new ArcCollection(coords);
        var layers = [{
          geometry_type: 'polyline',
          shapes: [[[0, 1]]]
        },{
          geometry_type: 'polyline',
          shapes: [[[~1, ~0]]]
        }];
        var test = api.internal.getPathEndpointTest(layers, arcs);
        assert(!test(0));
        assert(test(~0));
        assert(test(1));
        assert(!test(~1));
     });

  });

});