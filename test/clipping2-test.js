var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection,
    NodeCollection = api.internal.NodeCollection;


describe('mapshaper-clipping.js', function () {
  return;
  describe('Fig 7 - ring inside ring', function () {
    //
    //  a --------- b
    //  |           |
    //  |   e - f   |
    //  |   |   |   |
    //  |   h - g   |
    //  |           |
    //  d --------- c
    //
    var coords = [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]],
          [[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]];

    it('Divide arcs', function () {
      var target = JSON.parse(JSON.stringify(coords));
      var arcs = new ArcCollection(coords);

      var map = api.internal.insertClippingPoints(arcs);
      assert.deepEqual(arcs.toArray(), target);
      assert.deepEqual(api.utils.toArray(map), [0, 1]);
    })

    it ('Clip outer with inner', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clipLyr = api.internal.prepareClippingLayer("1", dataset);
      var clippedLyr = api.clipLayer(lyr1, clipLyr, dataset.arcs);
      var target = [[[1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Clip inner with outer', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clipLyr = api.internal.prepareClippingLayer("0", dataset);
      var clippedLyr = api.clipLayer(lyr2, clipLyr, dataset.arcs);
      var target = [[[1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Erase outer with inner', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clipLyr = api.internal.prepareClippingLayer("1", dataset);
      var clippedLyr = api.eraseLayer(lyr1, clipLyr, dataset.arcs);
      var target = [[[0], [~1]]];

      assert.deepEqual(clippedLyr.shapes, target);
    });

    it ('Erase inner with outer', function() {
      var lyr1 = {
        geometry_type: "polygon",
        shapes: [[[0]]]
      };
      var lyr2 = {
        geometry_type: "polygon",
        shapes: [[[1]]]
      };
      var dataset = {
        arcs: new ArcCollection(coords),
        layers: [lyr1, lyr2]
      };

      var clipLyr = api.internal.prepareClippingLayer("0", dataset);
      var clippedLyr = api.eraseLayer(lyr2, clipLyr, dataset.arcs);
      var target = [null];

      assert.deepEqual(clippedLyr.shapes, target);
    });



  })



})
