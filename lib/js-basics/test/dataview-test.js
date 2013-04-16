var api = require('../'),
  assert = require('assert');

var BinArray = api.BinArray,
    Node = api.Node,
    trace = api.trace;


describe('dataview.js', function () {

  var arr1 = [2, 1, 0, -1],
      arr2 = [],
      ab1 = new Float64Array(arr1).buffer,
      ab2 = new Int32Array(arr1).buffer,
      ab3 = new ArrayBuffer(16),
      b1, b2, b3;

  describe('Buffer', function() {

    describe('slice', function () {
      it('populate a typed array from a buffer slice', function () {
        b1 = Node.toBuffer(ab1);
        var bytes = Uint8Array(b1)
        var arr = Float64Array(bytes.buffer)
        assert.equal(4, arr.length);
      })
    })
  })

  describe('BinArray(ArrayBuffer)', function () {
    beforeEach(function() {
      b1 = ab1;
      b2 = ab2;
      b3 = ab3;
    });
    runTests();
  })

  describe('BinArray(Buffer)', function () {
    beforeEach(function() {
      b1 = Node.toBuffer(ab1);
      b2 = Node.toBuffer(ab2);
      b3 = Node.toBuffer(ab3);
    });

    runTests();
  })

  describe('BinArray static methods', function() {
    // tests
  })

  function runTests() {
    describe('#constructor()', function () {
      it('should initialize to the correct size', function () {
        var arr = new BinArray(b1);
        assert.equal(32, arr.bytesLeft());
        assert.equal(0, arr.position());
      })
    })

    describe('#readFloat64()', function () {
      it('read doubles from an array', function () {
        var arr = new BinArray(b1);
        assert.equal(2, arr.readFloat64());
        assert.equal(1, arr.readFloat64());
        assert.equal(16, arr.position());
        assert.equal(16, arr.bytesLeft());
        assert.equal(0, arr.readFloat64());
        assert.equal(-1, arr.readFloat64());
        assert.equal(0, arr.bytesLeft());
        assert.equal(32, arr.position());
      })
    })

    describe('#writeFloat64()', function () {
      it('read doubles from an array', function () {
        var arr = new BinArray(b3);
        arr.writeFloat64(3.2);
        assert.equal(3.2, arr.position(0).readFloat64());
        arr.writeFloat64(-40);
        assert.equal(-40, arr.skipBytes(-8).readFloat64());
      })
    })

    describe('#position()', function () {
      it('gets and sets read/write offset correctly', function () {
        var arr = new BinArray(b1);
        assert.equal(0, arr.position());
        assert.equal(16, arr.position(16).position());
        assert.equal(16, arr.bytesLeft());
        assert.equal(0, arr.position(0).position());
        assert.equal(32, arr.bytesLeft());
        arr.position(32);
        assert.equal(32, arr.position());
        assert.equal(0, arr.bytesLeft());
      })
    })

    describe('#readFloat64Array()', function () {
      it('should return a typed array containing a float64 subarray', function () {
        var arr = new BinArray(b1);
        arr.position(4);
        var doubles = arr.readFloat64Array(2);
        // console.log(doubles);
        assert.ok(doubles instanceof Float64Array);
        assert.equal(2, doubles.length);
        //assert.equal(1, doubles[0]);
        //assert.equal(0, doubles[1]);
      })
    })

  } // runTests()
})
