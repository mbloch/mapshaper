import assert from 'assert';
import api from '../mapshaper.js';
import {
  featureIsLabel, featureIsMarker, featureIsTextLabel
} from '../src/svg/svg-feature-utils.mjs';

async function getRecords(cmd) {
  var out = await api.applyCommands(cmd + ' -o format=geojson out.json', {});
  return JSON.parse(out['out.json']).features.map(function(f) { return f.properties; });
}

describe('svg-feature-utils.mjs', function () {
  describe('featureIsLabel()', function () {
    it('a label with text, or with the empty text of one being typed', function () {
      assert(featureIsLabel({'label-text': 'Paris'}));
      assert(featureIsLabel({'label-text': ''}));
      assert(featureIsLabel({'label-text': 0}));
    });

    it('not a symbol merged into a layer of labels, which has the field and no value', function () {
      assert(!featureIsLabel({icon: 'star', 'label-text': undefined}));
      assert(!featureIsLabel({r: 5, 'label-text': null}));
      assert(!featureIsLabel({icon: 'star'}));
      assert(!featureIsLabel(null));
    });

    it('not a curve with an empty field, but a path label with text', function () {
      assert(!featureIsLabel({icon: 'curve', 'label-text': ''}));
      assert(featureIsLabel({icon: 'curve', 'label-text': 'River'}));
    });

    it('a symbol placed in a layer of labels stays a symbol', async function () {
      var recs = await getRecords('-labels coordinates=1,1 name=pts text=A ' +
        '-symbols coordinates=2,2 type=star radius=5 target=pts');
      assert(featureIsLabel(recs[0]));
      assert(!featureIsLabel(recs[1]));
    });
  });

  describe('featureIsMarker()', function () {
    function marker(o) {
      return Object.assign({'label-text': '1', 'label-pos': 'c', icon: 'square'}, o);
    }

    it('text centred on a circle or a square', function () {
      assert(featureIsMarker(marker()));
      assert(featureIsMarker(marker({icon: 'circle', dy: 2})));
      assert(featureIsMarker(marker({'label-text': 0})));
    });

    it('not text beside its symbol, on another shape, or with no text', function () {
      assert(!featureIsMarker(marker({'label-pos': 'ne'})));
      assert(!featureIsMarker(marker({'label-pos': undefined})));
      assert(!featureIsMarker(marker({icon: 'star'})));
      assert(!featureIsMarker(marker({icon: undefined})));
      assert(!featureIsMarker(marker({'label-text': ''})));
      assert(!featureIsMarker(null));
    });

    it('one written by -labels on the command line', async function () {
      var recs = await getRecords('-labels coordinates=1,1 text=3 label-pos=c ' +
        'icon=circle icon-size=20 icon-fill=#c00 fill=#fff');
      assert(featureIsMarker(recs[0]));
    });
  });

  describe('featureIsTextLabel()', function () {
    it('every label but a marker', function () {
      assert(featureIsTextLabel({'label-text': 'Paris', icon: 'circle', 'label-pos': 'ne'}));
      assert(featureIsTextLabel({'label-text': ''}));
      assert(!featureIsTextLabel({'label-text': '1', icon: 'circle', 'label-pos': 'c'}));
      assert(!featureIsTextLabel({icon: 'star', 'label-text': undefined}));
    });
  });
});
