import api from '../mapshaper.js';
import assert from 'assert';
var svg = api.internal.svg;

describe('svg-symbols.js', function () {
  describe('renderPoint()', function () {
    it('renders a circle', function() {
      var defn = {
        type: 'circle',
        fill: 'magenta',
        opacity: 0.5
      };
      var output = svg.renderPoint({'svg-symbol': defn});
      var target = {
        tag: 'circle',
        properties: {cx: 0, cy: 0, fill: 'magenta', opacity: 0.5}
      };
      assert.deepEqual(output, target);
    });

    it('accepts pre-rendered objects', function() {
      var defn = {
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {
            r: 4
          }
        }]
      };
      var out = svg.renderPoint({'svg-symbol': defn});
      assert.deepEqual(out, defn);
    });

    it('renders a group', function() {
      var defn = {
        type: 'group',
        parts: [{
          type: 'circle',
          fill: 'magenta',
          opacity: 0.5
        }, {
          type: 'line',
          stroke: 'yellow',
          dx: 1,
          dy: -1
        }]
      };
      var output = svg.renderPoint({'svg-symbol': defn});
      var target = {
        tag: 'g',
        properties: {},
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 0, fill: 'magenta', opacity: 0.5}
        }, {
          // tag: 'line',
          tag: 'path',
          properties: {
            stroke: 'yellow',
            d: 'M 0 0 1 -1'
            // x1: 0,
            // y1: 0,
            // x2: 1,
            // y2: -1
          }
        }]};
      assert.deepEqual(output, target);
    });

  })
})
