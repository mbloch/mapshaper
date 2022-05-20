    /*
    // removing this test; pruneArcs() currently not in use
    it("unused arcs are pruned", function() {
      //      b --- c
      //     / \   /
      //    /   \ /
      //   a --- d

      var arcs = [
        [[2, 3], [4, 3], [3, 1]],  // bcd  (unused)
        [[3, 1], [1, 1], [2, 3]],  // dab
        [[3, 1], [2, 3]]];         // db

      var topology = {
        type: "Topology",
        arcs: arcs,
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [
              {type: "LineString", arcs: [2]},
              {type: "MultiLineString", arcs: [[2], [1]]},
              {type: "Polygon", arcs: [[1, ~2]]},
              {type: null},
              {type: 'Point', coordinates: [0.2, 1.3]}
            ]
          }
        }
      };

      // unused arc is removed, arc ids are renumbered
      var pruned = {
        type: "Topology",
        arcs: [[[3, 1], [1, 1], [2, 3]], [[3, 1], [2, 3]]],
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [
              {type: "LineString", arcs: [1]},
              {type: "MultiLineString", arcs: [[1], [0]]},
              {type: "Polygon", arcs: [[0, ~1]]},
              {type: null},
              {type: 'Point', coordinates: [0.2, 1.3]}
            ]
          }
        }
      };

      TopoJSON.pruneArcs(topology)
      assert.deepEqual(topology, pruned);
    })
    */