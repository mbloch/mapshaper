import api from '../mapshaper.js';
import assert from 'assert';


// Runs @cb with instrumented logging functions, so that message() and warn()
// calls can be told apart (the CLI prints both the same way).
async function captureLogging(cb) {
  var messages = [];
  var warnings = [];
  api.internal.setLoggingFunctions(
    function() { messages.push(formatLogArgs(arguments)); },
    function() {},
    function(s) { throw new Error(s); },
    function() { warnings.push(formatLogArgs(arguments)); });
  api.enableLogging();
  try {
    var value = await cb();
  } finally {
    api.internal.setLoggingForCLI();
    api.internal.disableLogging();
  }
  return {value: value, messages: messages, warnings: warnings};
}

// Drops the "[command]" prefix that the logging functions prepend
function formatLogArgs(args) {
  return Array.prototype.join.call(args, ' ').replace(/^\[[^\]]+\] /, '');
}

describe('mapshaper-svg-style.js', function () {

  describe('command line tests', function() {
    it('-svg-style (old name) works', function(done) {
      var input = [{
        name: 'foo'
      }];
      api.applyCommands('-i data.json -svg-style r=2 -o', {'data.json': input}, function(err, out) {
        var result = JSON.parse(out['data.json']);
        assert.deepEqual(result, [{name: 'foo', r: 2}]);
        done();
      });
    })

    it('-style (new name) works', function(done) {
      var input = [{
        name: 'foo'
      }];
      api.applyCommands('-i data.json -style r=2 -o', {'data.json': input}, function(err, out) {
        var result = JSON.parse(out['data.json']);
        assert.deepEqual(result, [{name: 'foo', r: 2}]);
        done();
      });
    })

    it('-style ids= filters styled features', async function() {
      var input = [{name: 'a'}, {name: 'b'}, {name: 'c'}];
      var output = await api.applyCommands('-i data.json -style ids=1,2 fill=red -o', {
        'data.json': input
      });
      var result = JSON.parse(output['data.json']);
      assert.deepEqual(result, [
        {name: 'a'},
        {name: 'b', fill: 'red'},
        {name: 'c', fill: 'red'}
      ]);
    });

    it('-style ids= combines with where=', async function() {
      var input = [{name: 'a', keep: true}, {name: 'b', keep: false}, {name: 'c', keep: true}];
      var output = await api.applyCommands('-i data.json -style ids=1,2 where="keep" fill=red -o', {
        'data.json': input
      });
      var result = JSON.parse(output['data.json']);
      assert.deepEqual(result, [
        {name: 'a', keep: true},
        {name: 'b', keep: false},
        {name: 'c', keep: true, fill: 'red'}
      ]);
    });

    it('-style clear clears all styles', async function() {
      var records = [{foo: 'a', stroke: 'white', fill: 'pink', opacity: 0.3}, {foo: 'b', stroke: 'black', fill: 'yellow', opacity: 1}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        clear: true
      };
      var target = [{foo: 'a'}, {foo: 'b'}];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('-style css= creates inline style', async function() {
      var cmd = '-rectangle bbox=0,0,1,1 -style fill=white css="filter: drop-shadow(1px 1px 5px rgba(0, 0, 0, .7));" -o out.svg';
      var output = await api.applyCommands(cmd);
      var svg = output['out.svg'];
      assert(svg.includes('fill="white"'));
      assert(svg.includes('style="filter: drop-shadow(1px 1px 5px rgba(0, 0, 0, .7));"'));
    });

    it('-style icon does not hide labels without fill=', async function() {
      var geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {NAME: 'A'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        }]
      };
      var cmd = '-i pts.geojson -style label-text=NAME icon=circle icon-size=8 -o out.svg';
      var output = await api.applyCommands(cmd, {'pts.geojson': JSON.stringify(geojson)});
      var svg = output['out.svg'];
      assert(svg.includes('<circle cx="0" cy="0" r="3.5" fill="black"/>'));
      assert(svg.includes('<text y="0" x="0">A</text>'));
      assert(!svg.includes('<g id="pts" fill="none"'));
    });

    it('-style warns once about an unsupported icon name', async function() {
      var input = [{name: 'a'}, {name: 'b'}, {name: 'c'}];
      var capture = await captureLogging(function() {
        return api.applyCommands('-i data.json -style icon=triangle -o', {'data.json': input});
      });
      assert.deepEqual(capture.messages, []);
      assert.equal(capture.warnings.length, 1, JSON.stringify(capture.warnings));
      assert.equal(capture.warnings[0],
        'Unsupported icon name: triangle. Expected one of: circle, square, ring, star');
      // the value is still assigned; only the rendered icon is missing
      var result = JSON.parse(capture.value['data.json']);
      assert.deepEqual(result, [
        {name: 'a', icon: 'triangle'},
        {name: 'b', icon: 'triangle'},
        {name: 'c', icon: 'triangle'}
      ]);
    });

    it('-style warns about unsupported icon names assigned by an expression', async function() {
      var input = [{kind: 'star'}, {kind: 'triangle'}, {kind: 'blob'}, {kind: 'triangle'}];
      var capture = await captureLogging(function() {
        return api.applyCommands('-i data.json -style icon=kind -o', {'data.json': input});
      });
      assert.equal(capture.warnings.length, 1, JSON.stringify(capture.warnings));
      assert.equal(capture.warnings[0],
        'Unsupported icon names: triangle, blob. Expected one of: circle, square, ring, star');
    });

    it('-style does not warn about supported or blank icon names', async function() {
      var input = [{kind: 'star'}, {kind: 'circle'}, {kind: ''}];
      var capture = await captureLogging(function() {
        return api.applyCommands('-i data.json -style icon=kind -o', {'data.json': input});
      });
      assert.deepEqual(capture.warnings, []);
    });

    it('-style icon renders nothing for an unsupported name, without logging', async function() {
      var geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {type: 'Point', coordinates: [0, 0]}
        }]
      };
      var capture = await captureLogging(function() {
        return api.applyCommands('-i pts.geojson -style icon=triangle icon-size=8 -o out.svg',
          {'pts.geojson': JSON.stringify(geojson)});
      });
      var svg = String(capture.value['out.svg']);
      assert(!svg.includes('<circle'));
      // the render pass adds nothing to the single warning from -style
      assert.equal(capture.warnings.length, 1, JSON.stringify(capture.warnings));
    });

    it('-style label-pos sets label alignment', async function() {
      var geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {NAME: 'A'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        }]
      };
      var cmd = '-i pts.geojson -style label-text=NAME label-pos=SW -o out.svg';
      var output = await api.applyCommands(cmd, {'pts.geojson': JSON.stringify(geojson)});
      var svg = output['out.svg'];
      assert(svg.includes('<text y="0.7em" x="-0.4em" text-anchor="end"'));
      assert(!svg.includes('dominant-baseline'));
    });
  })


  describe('isSvgColor()', function () {
    var isSvgColor = api.internal.isSvgColor;
    it('hits', function () {
      assert(isSvgColor('#eee'))
      assert(isSvgColor('blue'))
      assert(isSvgColor('none'))
      assert(isSvgColor('rgb(0,32,0)'))
      assert(isSvgColor('rgba(0, 255, 92, 0.2)'))
    })
    it('misses', function() {
      assert.equal(isSvgColor('#'), false)
      assert.equal(isSvgColor('33'), false)
    })
  })

  describe('isSvgNumber()', function () {
    var isSvgNumber = api.internal.isSvgNumber;
    it('hits', function () {
      assert(isSvgNumber('4'))
      assert(isSvgNumber('0'))
      assert(isSvgNumber('-4'))
      assert(isSvgNumber(4))
      assert(isSvgNumber('0.003'))
    })
    it('misses', function () {
      assert.equal(isSvgNumber('#eee'), false)
      assert.equal(isSvgNumber('none'), false)
      assert.equal(isSvgNumber(''), false)
    })
  })

  describe('isSvgClassName()', function () {
    var isSvgClassName = api.internal.isSvgClassName;
    it('hits', function () {
      assert(isSvgClassName('_'))
      assert(isSvgClassName('black opaque'))
      assert(isSvgClassName('class-0'))
    })
    it('misses', function () {
      assert.equal(isSvgClassName('-somevar'), false)
      assert.equal(isSvgClassName(''), false)
      assert.equal(isSvgClassName('5'), false)
    })
  })

  describe('svgStyle()', function () {
    it('label-text expression detection', function() {
      var records = [{foo: 'a'}, {foo: 'b'}];
      var lyr = {data: new api.internal.DataTable(records)};

    })

    it('expressions', function () {
      var records = [{foo: 2, bar: 'a', baz: 'white'}, {foo: 0.5, bar: 'b', baz: 'black'}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: 'baz',
        'stroke-width': 'foo / 2',
        'stroke-opacity': 'foo / 2',
        'fill-opacity': 'foo / 4',
        fill: 'bar == "a" ? "pink" : "green"'
      };
      var target = [{
        foo: 2,
        bar: 'a',
        baz: 'white',
        stroke: 'white',
        'stroke-width': 1,
        'stroke-opacity': 1,
        'fill-opacity': 0.5,
        fill: 'pink'
      }, {
        foo: 0.5,
        bar: 'b',
        baz: 'black',
        stroke: 'black',
        'stroke-width': 0.25,
        'stroke-opacity': 0.25,
        'fill-opacity': 0.125,
        fill: 'green'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('literals', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: '#222222',
        'stroke-width': '4',
        fill: 'rgba(255,255,255,0.2)'
      };
      var target = [{
        stroke: '#222222',
        'stroke-width': 4,
        fill: 'rgba(255,255,255,0.2)'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('ids= filters styled records', function() {
      var records = [{foo: 'a'}, {foo: 'b'}, {foo: 'c'}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.cmd.svgStyle(lyr, {}, {
        ids: [1, 2],
        fill: 'red'
      });
      assert.deepEqual(lyr.data.getRecords(), [
        {foo: 'a', fill: undefined},
        {foo: 'b', fill: 'red'},
        {foo: 'c', fill: 'red'}
      ]);
    })

    it('ids= combines with where=', function() {
      var records = [{foo: 'a', keep: true}, {foo: 'b', keep: false}, {foo: 'c', keep: true}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      api.cmd.svgStyle(lyr, {}, {
        ids: [1, 2],
        where: 'keep',
        fill: 'red'
      });
      assert.deepEqual(lyr.data.getRecords(), [
        {foo: 'a', keep: true, fill: undefined},
        {foo: 'b', keep: false, fill: undefined},
        {foo: 'c', keep: true, fill: 'red'}
      ]);
    })

    it('literals 2', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: 'red',
        label_text: 'green',
        fill: 'SteelBlue'
      };
      var target = [{
        stroke: 'red',
        'label-text': 'green',
        fill: 'SteelBlue'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('icon literals', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        icon: 'star',
        icon_size: '10',
        icon_color: 'purple'
      };
      var target = [{
        icon: 'star',
        'icon-size': 10,
        'icon-color': 'purple'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('label-pos is stored alone, and is case-insensitive', function() {
      // The offsets and justification a position stands for are resolved when
      // the label is drawn, so they are not in the record. They used to be
      // written alongside it: four columns in the user's table where one was
      // meant, and the table of offsets acting as a code generator rather than
      // a lookup.
      'n s e w ne se nw sw c'.split(' ').forEach(function(pos) {
        var input = pos.toUpperCase();
        var lyr = {data: new api.internal.DataTable([{}])};
        api.cmd.svgStyle(lyr, {}, {label_pos: input});
        // and not so much as an empty column for the three it overrides: a
        // position clears an offset a label was carrying, but there is nothing
        // to clear on a label that never had one
        assert.deepStrictEqual(lyr.data.getRecords(), [{'label-pos': input}]);
      });
    })

    it('a position clears an offset that is really there', function() {
      // and only the ones that are: dy is not in this table, so the position
      // has nothing to take back in it
      var lyr = {data: new api.internal.DataTable([{dx: 4, 'text-anchor': 'end'}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: 'n'});
      assert.deepStrictEqual(lyr.data.getRecords(),
        [{'label-pos': 'n', dx: undefined, 'text-anchor': undefined}]);
    })

    it('a position clears an offset on every record, not just the ones with one', function() {
      // the column exists, so it is cleared for the whole layer rather than
      // for the records that happened to be carrying a value
      var lyr = {data: new api.internal.DataTable([{dx: 4}, {}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: 's'});
      assert.deepStrictEqual(lyr.data.getRecords(),
        [{'label-pos': 's', dx: undefined}, {'label-pos': 's', dx: undefined}]);
    })

    it('a position given to some records does not blank the rest', function() {
      var lyr = {data: new api.internal.DataTable([{}, {}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: 'n', ids: [1]});
      assert.deepStrictEqual(lyr.data.getRecords(),
        [{'label-pos': undefined}, {'label-pos': 'n'}]);
    })

    it('label-pos resolves to the offsets that draw it', function() {
      var cases = {
        n: {dx: '0', dy: '-0.5em', 'text-anchor': 'middle'},
        s: {dx: '0', dy: '1.1em', 'text-anchor': 'middle'},
        e: {dx: '0.45em', dy: '0.23em', 'text-anchor': 'start'},
        w: {dx: '-0.45em', dy: '0.23em', 'text-anchor': 'end'},
        ne: {dx: '0.4em', dy: '-0.15em', 'text-anchor': 'start'},
        se: {dx: '0.4em', dy: '0.7em', 'text-anchor': 'start'},
        nw: {dx: '-0.4em', dy: '-0.15em', 'text-anchor': 'end'},
        sw: {dx: '-0.4em', dy: '0.7em', 'text-anchor': 'end'},
        c: {dx: '0', dy: '0.25em', 'text-anchor': 'middle'}
      };
      Object.keys(cases).forEach(function(pos) {
        var out = api.internal.resolveLabelPosition({'label-pos': pos.toUpperCase()});
        // strict, because dx has to be a string in every position: a drag
        // materializes these values into the record, and a column holding 0
        // from one position and '0.45em' from another cannot be merged
        assert.deepStrictEqual(out, Object.assign({'label-pos': pos.toUpperCase()},
          cases[pos]));
      });
    })

    it('a value on the record wins over the position, per property', function() {
      // So that `label-pos=n dx=3` reads as "north, nudged 3px right" instead
      // of losing the north.
      var out = api.internal.resolveLabelPosition({'label-pos': 'n', dx: 3});
      assert.strictEqual(out.dx, 3);
      assert.strictEqual(out.dy, '-0.5em');
      assert.strictEqual(out['text-anchor'], 'middle');
    })

    it('an explicit zero cancels an offset rather than falling back', function() {
      // Presence, not truthiness: the `rec.dy || 0` idiom the renderers use
      // would read this as absent and restore the offset it was written to
      // remove.
      var out = api.internal.resolveLabelPosition({'label-pos': 'n', dy: 0});
      assert.strictEqual(out.dy, 0);
    })

    it('a blank or missing value falls back to the position', function() {
      var out = api.internal.resolveLabelPosition({'label-pos': 'e', dx: '', dy: undefined});
      assert.strictEqual(out.dx, '0.45em');
      assert.strictEqual(out.dy, '0.23em');
    })

    it('a record with no position is returned untouched', function() {
      var rec = {'label-text': 'x', dx: 4};
      assert.strictEqual(api.internal.resolveLabelPosition(rec), rec);
    })

    it('an unusable position renders as if it were unset', function() {
      // Reaching the renderer with one means it came from an expression or a
      // data file, where refusing to draw the map is the wrong response.
      var rec = {'label-pos': 'nope'};
      assert.strictEqual(api.internal.resolveLabelPosition(rec), rec);
    })

    it('setting label-pos takes back the offsets a label was carrying', function() {
      // A value on the record wins, so without this a position chosen for a
      // label that had been dragged would appear to do nothing.
      var lyr = {data: new api.internal.DataTable([{dx: 12, dy: -30, 'text-anchor': 'start'}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: 'n'});
      assert.deepStrictEqual(lyr.data.getRecords(),
        [{'label-pos': 'n', dx: undefined, dy: undefined, 'text-anchor': undefined}]);
    })

    it('an offset given with label-pos survives it', function() {
      var lyr = {data: new api.internal.DataTable([{}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: 'n', dx: '3'});
      assert.deepStrictEqual(lyr.data.getRecords(), [{'label-pos': 'n', dx: 3}]);
    })

    it('an empty value removes a typed property', function() {
      // There is otherwise no way to take a single property back off a
      // feature: -style clear removes all of them, and an empty value used to
      // be rejected as unparseable.
      var lyr = {data: new api.internal.DataTable([{fill: 'red', 'font-size': 12}])};
      api.cmd.svgStyle(lyr, {}, {fill: ''});
      assert.deepStrictEqual(lyr.data.getRecords(), [{fill: undefined, 'font-size': 12}]);
    })

    it('an empty value is a value for a property whose type accepts one', function() {
      // Inline css takes any string as a literal, and the empty one is a
      // string: the unset rule is for a type with no empty value to store.
      var lyr = {data: new api.internal.DataTable([{css: 'fill:red'}])};
      api.cmd.svgStyle(lyr, {}, {css: ''});
      assert.deepStrictEqual(lyr.data.getRecords(), [{css: ''}]);
    })

    it('an empty value removes an offset', function() {
      // How a label goes back to taking a standard position: the offsets it
      // was dragged to have to come off, or they would win over the position.
      var lyr = {data: new api.internal.DataTable([{dx: 12, dy: -4}])};
      api.cmd.svgStyle(lyr, {}, {dx: '', dy: ''});
      assert.deepStrictEqual(lyr.data.getRecords(), [{dx: undefined, dy: undefined}]);
    })

    it('removing label-pos leaves the offsets given with it', function() {
      // The shape of the command a drag produces: the label stops taking a
      // standard position and starts carrying the offsets it was dragged to.
      var lyr = {data: new api.internal.DataTable([{'label-pos': 'n'}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: '', dx: '12', dy: '-4', text_anchor: 'start'});
      assert.deepStrictEqual(lyr.data.getRecords(),
        [{'label-pos': undefined, dx: 12, dy: -4, 'text-anchor': 'start'}]);
    })

    it('removing label-pos on its own leaves the offsets alone', function() {
      // Setting a position clears them; removing one is not setting one.
      var lyr = {data: new api.internal.DataTable([{'label-pos': 'n', dx: 12}])};
      api.cmd.svgStyle(lyr, {}, {label_pos: ''});
      assert.deepStrictEqual(lyr.data.getRecords(), [{'label-pos': undefined, dx: 12}]);
    })

    it('removing label-pos from a path label is not an unusable position', function() {
      // The path-label check reads the value being set, and there is none.
      var lyr = {
        shapes: [[[0, 0], [1, 1]]],
        data: new api.internal.DataTable([{'label-text': 'x'}])
      };
      api.cmd.svgStyle(lyr, {}, {label_pos: ''});
      assert.strictEqual(lyr.data.getRecords()[0]['label-pos'], undefined);
    })

    it('literals 3', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        label_text: 'National Oceanic and Atmospheric Administration (NOAA)',
        font_family: 'Helvetica,_sans'
      };
      var target = [{
        'label-text': 'National Oceanic and Atmospheric Administration (NOAA)',
        'font-family': 'Helvetica,_sans'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    });

    it('literals 4', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        label_text: 'dane © OpenStreetMap (licencja ODBL)' // issue 363
      };
      var target = [{
        'label-text': 'dane © OpenStreetMap (licencja ODBL)'
      }];
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    });

    // The cli parser converts hyphens to underscores, so the property name has
    // to be restored with a global replacement. Replacing only the first
    // underscore left properties with more than one hyphen unsupported, and
    // silently skipped rather than reported.
    it('a property name containing two hyphens is applied', function() {
      var records = [{}];
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        label_start_offset: '50%',
        letter_spacing: '2'
      };
      api.cmd.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), [{
        'label-start-offset': '50%',
        'letter-spacing': '2'
      }]);
    });

  })
});