import assert from 'assert';
import { renderPoint } from '../src/svg/svg-symbols';

describe('svg-symbols.js', function () {
  describe('renderPoint()', function () {
    it('renders a circle', function() {
      var defn = {
        type: 'circle',
        fill: 'magenta',
        opacity: 0.5
      };
      var output = renderPoint({'svg-symbol': defn});
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
      var out = renderPoint({'svg-symbol': defn});
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
      var output = renderPoint({'svg-symbol': defn});
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

    it('renders a square icon', function() {
      var output = renderPoint({icon: 'square', 'icon-size': 8, fill: 'red'});
      var target = {
        tag: 'rect',
        properties: {x: -4, y: -4, width: 8, height: 8, fill: 'red'}
      };
      assert.deepEqual(output, target);
    });

    it('renders a ring icon using fill as fallback color', function() {
      var output = renderPoint({icon: 'ring', 'icon-size': 8, fill: 'red'});
      var target = {
        tag: 'circle',
        properties: {cx: 0, cy: 0, r: 3.5, fill: 'none', stroke: 'red', 'stroke-width': 1}
      };
      assert.deepEqual(output, target);
    });

    it('lets icon-color override fill', function() {
      var output = renderPoint({icon: 'circle', 'icon-size': 8, fill: 'red', 'icon-color': 'blue'});
      var target = {
        tag: 'circle',
        properties: {cx: 0, cy: 0, r: 3.5, fill: 'blue'}
      };
      assert.deepEqual(output, target);
    });

    it('applies icon-color to r circles', function() {
      var output = renderPoint({r: 4, 'icon-color': 'blue'});
      var target = {
        tag: 'circle',
        properties: {cx: 0, cy: 0, r: 4, fill: 'blue'}
      };
      assert.deepEqual(output, target);
    });

    it('renders a star icon with a default black fill', function() {
      var output = renderPoint({icon: 'star', 'icon-size': 10});
      assert.equal(output.tag, 'path');
      assert.equal(output.properties.fill, 'black');
      assert(output.properties.d.includes('M 0 -5.5'));
    });

  })
})
