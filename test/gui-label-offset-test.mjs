import assert from 'assert';
import {
  getOffsetDragValues, getAnchorForCentre, getTextCentreOffset,
  getNearestPosition
} from '../src/gui/gui-label-offset';

// A label 40px wide, drawn centred on its anchor: text-anchor=middle puts the
// block's middle at dx, so its left edge is 20px to the left of the anchor.
function centred(values) {
  return Object.assign({dx: 0, dy: 0, anchor: 'middle', width: 40}, values);
}

// Where the text is drawn, given what a drag wrote: the left edge of the
// block, measured from the anchor.
function leftEdge(values, width) {
  return getTextCentreOffset(values.dx, values['text-anchor'], width) - width / 2;
}

// How far to the left of x a justification puts the text, as a fraction of its
// width -- the same table the module works from.
function anchorOffset(anchor) {
  return {start: 0, middle: 0.5, end: 1}[anchor];
}

describe('gui label offset drags', function() {

  describe('getOffsetDragValues()', function() {

    it('adds the pointer movement to the offsets the label is drawn with', function() {
      var o = getOffsetDragValues(centred({dx: 10, dy: -4}), {dx: 5, dy: 3});
      assert.equal(leftEdge(o, 40), 10 + 5 - 20);
      assert.equal(o.dy, -1);
    });

    it('rounds to a tenth of a pixel', function() {
      var o = getOffsetDragValues(centred(), {dx: 1 / 3, dy: -1 / 3});
      assert.equal(o.dx, 0.3);
      assert.equal(o.dy, -0.3);
    });

    it('justifies text dragged to the right of its anchor from the left', function() {
      assert.equal(getOffsetDragValues(centred(), {dx: 30, dy: 0})['text-anchor'],
        'start');
    });

    it('justifies text dragged to the left of its anchor from the right', function() {
      assert.equal(getOffsetDragValues(centred(), {dx: -30, dy: 0})['text-anchor'],
        'end');
    });

    it('leaves text dragged straight up or down centred', function() {
      assert.equal(getOffsetDragValues(centred(), {dx: 0, dy: -20})['text-anchor'],
        'middle');
    });

    // The point of working from the left edge: an anchor that changes mid-drag
    // would otherwise move the text by half its own width or by all of it.
    it('leaves the text where the pointer put it when the anchor changes', function() {
      var start = centred();
      var justOver = getOffsetDragValues(start, {dx: 10.5, dy: 0});
      var justUnder = getOffsetDragValues(start, {dx: 9.5, dy: 0});
      assert.equal(justOver['text-anchor'], 'start');
      assert.equal(justUnder['text-anchor'], 'middle');
      assert.equal(leftEdge(justOver, 40), -9.5);
      assert.equal(leftEdge(justUnder, 40), -10.5);
    });

    it('keeps the justification it was given when the text cannot be measured', function() {
      var o = getOffsetDragValues(centred({width: 0}), {dx: 30, dy: 0});
      assert.equal(o['text-anchor'], 'middle');
      assert.equal(o.dx, 30);
    });

    it('treats an unset justification as start', function() {
      var o = getOffsetDragValues(centred({anchor: ''}), {dx: 0, dy: 0});
      assert.equal(o['text-anchor'], 'start');
      assert.equal(o.dx, 0);
    });

    // A label-align wins over any text-anchor on the record, and the renderer
    // corrects x by the width of the block to hold it still while its lines
    // re-justify. dx is then the left edge itself, and the drag has no business
    // changing the justification.
    it('writes the left edge and leaves the justification alone on an aligned label', function() {
      var o = getOffsetDragValues(centred({dx: 20, aligned: true}), {dx: 5, dy: 0});
      assert.equal(o['text-anchor'], 'start');
      assert.equal(o.dx, 5);
    });

    it('reports where an aligned label will be drawn, which is not its dx', function() {
      var o = getOffsetDragValues(centred({dx: 20, aligned: true}), {dx: 5, dy: 0});
      assert.equal(o.x, 25);
    });

    it('reports where an unaligned label will be drawn, which is its dx', function() {
      var o = getOffsetDragValues(centred({dx: 20}), {dx: 5, dy: 0});
      assert.equal(o.x, o.dx);
    });

    // The preview writes x and the anchor onto the rendered label, so the two
    // have to describe the same placement. An aligned label keeps the anchor
    // its alignment gives it; taking the stored 'start' instead drew the text
    // half a width or a whole width to the right until the drag was released.
    it('draws an aligned label with the justification it already had', function() {
      var o = getOffsetDragValues(centred({dx: 20, aligned: true}), {dx: 5, dy: 0});
      assert.equal(o.anchor, 'middle');
      assert.equal(o['text-anchor'], 'start');
    });

    it('draws an aligned label where it was dragged to', function() {
      ['start', 'middle', 'end'].forEach(function(anchor) {
        var o = getOffsetDragValues(centred({dx: 20, anchor: anchor, aligned: true}),
          {dx: 5, dy: 0});
        // the preview's own left edge, from the pair it writes
        assert.equal(o.x - anchorOffset(o.anchor) * 40, 20 + 5 - anchorOffset(anchor) * 40);
      });
    });

    it('draws an unaligned label with the justification it writes', function() {
      var o = getOffsetDragValues(centred(), {dx: 30, dy: 0});
      assert.equal(o.anchor, o['text-anchor']);
    });
  });

  describe('getAnchorForCentre()', function() {
    it('reads the side from the centre as a fraction of the width', function() {
      assert.equal(getAnchorForCentre(9, 40), 'middle');
      assert.equal(getAnchorForCentre(-9, 40), 'middle');
      assert.equal(getAnchorForCentre(11, 40), 'start');
      assert.equal(getAnchorForCentre(-11, 40), 'end');
    });
  });

  describe('getTextCentreOffset()', function() {
    it('reads the same position from any justification', function() {
      // three ways of saying "the text's middle is 30px right of the anchor"
      assert.equal(getTextCentreOffset(30, 'middle', 40), 30);
      assert.equal(getTextCentreOffset(10, 'start', 40), 30);
      assert.equal(getTextCentreOffset(50, 'end', 40), 30);
    });

    it('takes an unmeasurable width as zero', function() {
      assert.equal(getTextCentreOffset(30, 'end', 0), 30);
    });
  });

  describe('getNearestPosition()', function() {
    var cells = [
      {name: 'nw', x: -10, y: -10},
      {name: 'n', x: 0, y: -10},
      {name: 'c', x: 0, y: 0}
    ];

    it('picks the closest candidate', function() {
      assert.equal(getNearestPosition({x: -8, y: -9}, cells), 'nw');
      assert.equal(getNearestPosition({x: 1, y: -7}, cells), 'n');
      assert.equal(getNearestPosition({x: 2, y: 2}, cells), 'c');
    });

    it('returns nothing when there are no candidates', function() {
      assert.equal(getNearestPosition({x: 0, y: 0}, []), '');
    });
  });
});
