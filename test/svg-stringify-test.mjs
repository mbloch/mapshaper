import api from '../mapshaper.js';
import assert from 'assert';
var SVG = api.internal.svg;


describe('svg-stringfy.js', function () {

  describe('SVG.stringify()', function () {
    it('g element, no children', function () {
      var obj = {tag: 'g'};
      assert.equal(SVG.stringify(obj), '<g/>');
    })

    it('text element', function() {
      var obj = {tag: 'text', value: 'TEXAS'};
      var expect = '<text>TEXAS</text>';
      assert.equal(SVG.stringify(obj), expect);
    })

    it('text element with ampersand', function() {
      var obj = {tag: 'text', value: 'WEST BANK & GAZA'};
      var expect = '<text>WEST BANK &amp; GAZA</text>';
      assert.equal(SVG.stringify(obj), expect);
    })

    it('text element with entities', function() {
      var obj = {tag: 'text', value: 'WEST BANK &amp; GAZA'};
      var expect = '<text>WEST BANK &amp; GAZA</text>';
      assert.equal(SVG.stringify(obj), expect);
    })

    it('path element', function() {
      var obj = {tag: 'path', properties: {d: 'M 0 0 1 1'}};
      assert.equal(SVG.stringify(obj), '<path d="M 0 0 1 1"/>')
    })

    it('null and undefined properties are omitted', function() {
      var obj = {tag: 'circle', properties: {
        cx: 144, cy: 380, r: 5, stroke: undefined, fill: undefined, 'stroke-width': null
      }};
      var expect = '<circle cx="144" cy="380" r="5"/>';
      assert.equal(SVG.stringify(obj), expect);
    })

    it('group inside a group', function() {
      var obj = {
        tag: 'g',
        children: [{
          tag: 'g'
        }]
      }
      assert.equal(SVG.stringify(obj), '<g>\n<g/>\n</g>');
    });

    it('group of two circles', function() {
      var obj = {
        tag: 'g',
        properties: {id: 0},
        children: [{
          tag: 'circle',
          properties: {
            cx: 0,
            cy: 1
          }
        }, {
          tag: 'circle',
          properties: {
            cx: 1,
            cy: 0
          }
        }]
      };
      var target = '<g id="0">\n' +
        '<circle cx="0" cy="1"/>\n' +
        '<circle cx="1" cy="0"/>\n' +
        '</g>';
      assert.equal(SVG.stringify(obj), target);
    })
  })
})