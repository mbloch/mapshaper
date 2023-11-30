import api from '../mapshaper.js';
import assert from 'assert';

var SVG = api.internal.svg;


describe('mapshaper-svg.js', function () {

  describe('exportDatasetForSVG()', function () {
    it('export label properties', function () {
      var lyr = {
        name: 'labels',
        geometry_type: 'point',
        shapes: [[[0, 0]], [[1, 1]]],
        data: new api.internal.DataTable([{
          dx: 5,
          dy: -6,
          'label-text': 'TEXAS',
          'font-size': '13',
          'text-anchor': 'start'
        }, {
          dx: -5,
          dy: -6,
          'label-text': 'OKLA.',
          'font-size': '13',
          'text-anchor': 'end'
       }])
      };
      var dataset = {
        layers: [lyr],
        info: {}
      };

      var target= {
        tag: 'g',
        properties: {
          id: 'labels',
          'font-family': 'sans-serif',
          'font-size': '12',
          'text-anchor': 'middle'
        },
        children: [{
          tag: 'text',
          value: 'TEXAS',
          properties: {
            //x: 0,
            //y: 0,
            //dx: 5,
            //dy: -6,
            transform: 'translate(0 0)',
            x: 5,
            y: -6,
            'font-size': '13',
            'text-anchor': 'start'
          }
        }, {
          tag: 'text',
          value: 'OKLA.',
          properties: {
            // x: 1,
            // y: 1,
            // dx: -5,
            // dy: -6,
            transform: 'translate(1 1)',
            x: -5,
            y: -6,
            'font-size': '13',
            'text-anchor': 'end'
          }
        }]
      };

      var output = api.internal.exportLayerForSVG(lyr, dataset, {});
      assert.deepEqual(output, target);
    });
  })

  it ('default scaling w/ 1px margin, single point', function(done) {
    var geo = {
      type: 'Feature',
      properties: {
        stroke: 'purple',
        r: '10'
      },
      geometry: {
        type: 'Point',
        coordinates: [0, 0]
      }
    };
    var cmd = '-rename-layers dot -o format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="800" viewBox="0 0 800 800" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="dot">\n<circle cx="400" cy="400" r="10" stroke="purple"/>\n</g>\n</svg>'
      assert.equal(data, svg)
      done();
    });
  });

  it('outputs svg file if output filename ends in ".svg"', function(done) {
    api.applyCommands('-i test/data/two_states.shp -o two_states.svg', {}, function(err, output) {
      assert(/^<\?xml version="1.0"\?>/.test(output['two_states.svg']));
      done();
    });
  });

  it ('multipolygon exported as single path', function(done) {
    var geo = {
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]],
          [[[3, 2], [4, 2], [4, 1], [3, 1], [3, 2]]]]
      }
    };
    var target = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="900" height="300" viewBox="0 0 900 300" stroke-linecap="round" stroke-linejoin="round">\n<g id="path">\n<path d="M 0 300 0 0 300 0 300 300 0 300 Z M 600 0 900 0 900 300 600 300 600 0 Z" fill-rule="evenodd"/>\n</g>\n</svg>';
    api.applyCommands('-i path.json -o path.svg margin=0 width=900', {'path.json': geo}, function(err, output) {
      assert.equal(output['path.svg'], target);
      done();
    });
  })

  it ('-o svg-bbox option', async function() {
    var geo = {
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [1, 2]]
      }
    };
    var cmd = '-i geo.json -o svg-bbox=-1,-1,3,3 map.svg';
    var out = await api.applyCommands(cmd, {'geo.json': geo});
    var svg = out['map.svg'];
    assert(svg.includes('width="800" height="800" viewBox="0 0 800 800"'));
  })

  it ('default scaling w/ 1px margin, polyline', function(done) {
    var geo = {
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [1, 2]]
      }
    };
    var cmd = '-rename-layers line -o format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="1598" viewBox="0 0 800 1598" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="line" fill="none" stroke="black" stroke-width="1">\n<path d="M 1 1597 799 1"/>\n</g>\n</svg>'

      assert.equal(data, svg)
      done();
    });
  });

  it ('default stroke-miterlimit gets added', function(done) {
    var geo = {
      type: 'Feature',
      properties: {'stroke-linejoin': 'miter'},
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [1, 2]]
      }
    };
    var cmd = '-rename-layers line -o format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="1598" viewBox="0 0 800 1598" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="2">\n' +
      '<g id="line" fill="none" stroke="black" stroke-width="1">\n<path d="M 1 1597 799 1" stroke-linejoin="miter"/>\n</g>\n</svg>'

      assert.equal(data, svg)
      done();
    });
  });

  it ('id-field= works', function(done) {
    var geo = {
      type: 'Feature',
      geometry: {
        type: 'MultiPoint',
        coordinates: [[0, 2], [2, 0]]
      },
      properties: {name: 'dots', r: 1}
    };
    var cmd = '-o id-field=name format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="800" viewBox="0 0 800 800" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="layer1">\n<g id="dots">\n<circle cx="1" cy="1" r="1"/>\n<circle cx="799" cy="799" r="1"/>\n</g>\n</g>\n</svg>';

      assert.equal(data, svg)
      done();
    });
  });

  it ('XML entities are replaced', function(done) {
    var geo = {
      type: 'Feature',
      geometry: {
        type: 'MultiPoint',
        coordinates: [[0, 2], [2, 0]]
      },
      properties: {name: '"1980\'s" & <now>', r: 5}
    };
    var cmd = '-o id-field=name format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="800" height="800" viewBox="0 0 800 800" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="layer1">\n<g id="&quot;1980&apos;s&quot; &amp; &lt;now&gt;">\n<circle cx="1" cy="1" r="5"/>\n<circle cx="799" cy="799" r="5"/>\n</g>\n</g>\n</svg>';
      assert.equal(data, svg)
      done();
    });
  });

  it ('width= and margin= options work', function(done) {
    var geo = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {r: 2},
        geometry: {
          type: 'Point',
          coordinates: [0, -10]
        }}, {
        type: 'Feature',
        properties: {r: 2},
        geometry: {
          type: 'Point',
          coordinates: [-10, 10]
        }}]
    };
    var cmd = '-o width=10 margin=0 format=svg';

    api.applyCommands(cmd, geo, function(err, data) {
      var svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="10" height="20" viewBox="0 0 10 20" stroke-linecap="round" stroke-linejoin="round">\n' +
      '<g id="layer1">\n<circle cx="10" cy="20" r="2"/>\n<circle cx="0" cy="0" r="2"/>\n</g>\n</svg>';

      assert.equal(data, svg)
      done();
    });
  });
});
