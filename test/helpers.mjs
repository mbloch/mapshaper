import assert from 'assert';
import api from '../mapshaper.js';
import path from 'path';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  __dirname: __dirname,
  coordinatesAlmostEqual: coordinatesAlmostEqual,
  almostEqual: almostEqual,
  Reader: Reader,
  fixPath: fixPath
};

var utils = api.utils;

export function fixPath(p) {
  return path.join(__dirname, p);
}

function almostEqual(a, b, eps) {
  eps = eps || 1e-10;
  if (Math.abs(a - b) < eps) {
    assert(true);
  } else {
    assert.equal(a, b)
  }
};

function coordinatesAlmostEqual(a, b, eps) {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (var i=0, n=Math.max(a.length, b.length); i<n; i++) {
      coordinatesAlmostEqual(a[i], b[i], eps);
    }
  } else {
    almostEqual(a, b, eps);
  }
};

function toBuf(str) {
  return utils.createBuffer(str, 'utf8');
}

function Reader(str, chunkLen) {
  var buf = toBuf(str);
  chunkLen = chunkLen || 256;

  this.size = function() {return buf.length;};

  this.readSync = function(offs) {
    return buf.slice(offs, Math.min(chunkLen, buf.length));
  };

  this.expandBuffer = function() {
    chunkLen *= 2;
    return this;
  };
}

Reader.prototype.findString = api.internal.FileReader.prototype.findString;
