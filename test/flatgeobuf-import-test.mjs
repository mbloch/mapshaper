import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';

async function importFixture(name) {
  var path = fixPath('data/flatgeobuf/' + name);
  return api.internal.importFileAsync(path);
}

describe('flatgeobuf import', function () {
  it('imports an empty FlatGeobuf file', async function () {
    var dataset = await importFixture('empty.fgb');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, undefined);
    assert.equal(dataset.layers[0].shapes, undefined);
  });

  it('imports countries fixture from FlatGeobuf test suite', async function () {
    var dataset = await importFixture('countries.fgb');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'polygon');
    assert(dataset.layers[0].shapes.length > 0);
    assert.equal(dataset.info.flatgeobuf_crs.org, 'EPSG');
    assert.equal(dataset.info.flatgeobuf_crs.code, 4326);
    assert.equal(typeof dataset.info.flatgeobuf_crs.wkt, 'string');
    assert(dataset.info.flatgeobuf_crs.wkt.includes('GEOGCRS['));
    assert.equal(dataset.info.crs_string, 'epsg:4326');
  });

  it('imports poly00 fixture from FlatGeobuf test suite', async function () {
    var dataset = await importFixture('poly00.fgb');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'polygon');
    assert(dataset.layers[0].shapes.length > 0);
  });

  it('imports poly01 fixture from FlatGeobuf test suite', async function () {
    var dataset = await importFixture('poly01.fgb');
    assert.equal(dataset.layers.length, 1);
    assert.equal(dataset.layers[0].geometry_type, 'polygon');
    assert(dataset.layers[0].shapes.length > 0);
  });
});
