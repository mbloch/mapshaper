import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fixPath } from './helpers';
var Dbf = api.internal.Dbf,
    Utils = api.utils;


describe('dbf-reader.js', function () {
  // "Neuchâtel Baden-Württemberg La Gruyère"

  function importRecords(path, encoding) {
    path = fixPath("data/" + path);
    var opts = encoding ? {encoding: encoding} : undefined;
    var dataset = api.internal.importFile(path, opts);
    return dataset.layers[0].data.getRecords();
  }

  describe('Duplicate fields', function() {

    it ('Rename fields to avoid duplicate names', function() {
      // renamed fields may exceed 10 characters; truncated if exported as Shapefile
      var rows = importRecords('dbf/duplicate_fields.dbf');
      var rec1 = {
        SP_ID: '2',
        geoid: '15003009703',
        rate: 0.3079,
        employed: 780,
        unemployed: 123,
        not_in_lab: 224,
        error: 0.082941522262937,
        rate_women: 0.29776,
        employed_w: 783,
        unemployed_1: 21,
        not_in_lab_1: 311,
        error_wome: 0.076490098765061
      };
      assert.deepStrictEqual(rows[1], rec1);
    })

    it ('Rename fields; asterisks in num field converted to null', function() {
      var rows = importRecords('dbf/duplicate_fields.dbf');
      var rec0 = {
        SP_ID: '1',
        geoid: '15003980600',
        rate: null,
        employed: 0,
        unemployed: 0,
        not_in_lab: 0,
        error: null,
        rate_women: null,
        employed_w: 0,
        unemployed_1: 0,
        not_in_lab_1: 0,
        error_wome: null
      };
      assert.deepStrictEqual(rows[0], rec0);
    })
  })

  describe('#importRecords() w/ user-specified encoding', function () {

    it("latin1", function() {
      assert.equal(importRecords("dbf/latin1.dbf", 'latin1')[0].NAME, "Peçeña México");
    })

    it("gbk", function() {
      assert.equal(importRecords("dbf/gbk.dbf", 'gbk')[0].NAME, "简体国语");
    })

    it("big5", function() {
      assert.equal(importRecords("dbf/big5.dbf", 'big5')[0].NAME, "繁體國語");
    })

    it("gb2312", function() {
      assert.equal(importRecords("dbf/gb2312.dbf", 'gb2312')[0].NAME, "简体国语");
    })

    it("shiftjis", function() {
      var records = importRecords("dbf/shiftjis.dbf", 'shiftjis');
      assert.equal(records[0].NAME, "ひたちなか市");
      assert.equal(records[1].NAME, "西蒲原郡弥彦村");
    })

    it("eucjp", function() {
      var records = importRecords("dbf/eucjp.dbf", 'eucjp');
      assert.equal(records[0].NAME, "ひたちなか市");
      assert.equal(records[1].NAME, "西蒲原郡弥彦村");
    })
  })

  describe('#importRecords() with .cpg file', function () {
    it("big5", function() {
      var records = importRecords("dbf/cpg/big5.dbf");
      assert.equal(records[0].NAME, '國語')
    })

    it("latin2", function() {
      var records = importRecords("dbf/cpg/latin2.dbf");
      assert.equal(records[0].NAME, 'čeština')
    })

    it("win874", function() {
      var records = importRecords("dbf/cpg/win874.dbf");
      assert.equal(records[0].NAME, 'ภาษาไทย')
    })

    it("win1251", function() {
      var records = importRecords("dbf/cpg/win1251.dbf");
      assert.equal(records[0].NAME, 'РУССКИЙ')
    })

    it("koi8r", function() {
      var records = importRecords("dbf/cpg/koi8r.dbf");
      assert.equal(records[0].NAME, 'русский')
    })

    it("shiftjis", function() {
      var records = importRecords("dbf/cpg/shiftjis.dbf");
      assert.equal(records[0].NAME, 'カタカナひらがな')
    })

    it("euckr", function() {
      var records = importRecords("dbf/cpg/euckr.dbf");
      assert.equal(records[0].NAME, '한국말')
    })

  })

  describe('#importRecords(), detect encoding', function () {

    it('Fix: latin1 not detected because of ± character', function() {
      assert.equal(importRecords("dbf/ne_10m_time_zones.dbf")[66].time_zone, "UTC±00:00");
    })

    it("latin1", function() {
      assert.equal(importRecords("dbf/latin1.dbf")[0].NAME, "Peçeña México");
    })

    it("utf8", function() {
      assert.equal(importRecords("dbf/utf8.dbf")[0].NAME, "国语國語");
    })

    /*
    // Now, there is a warning message, not an error message
    it("gbk not detected", function() {
      assert.throws(function() {
        importRecords("dbf/gbk.dbf");
      })
    })

    it("big5 not detected", function() {
      assert.throws(function() {
        importRecords("dbf/big5.dbf");
      })
    })

    it("shiftjis not detected", function() {
      assert.throws(function() {
        importRecords("dbf/shiftjis.dbf");
      })
    })

    it("Greek not detected", function() {
      assert.throws(function() {
         // this was wrongly detected as latin1 before
        importRecords("dbf/periphereies.dbf");
      })
    })
    */
  })

  describe('DbfReader()', function () {
    it('#readRow() method', function () {
      var buf = fs.readFileSync('test/data/two_states.dbf');
      var reader = new api.internal.DbfReader(buf);
      // read second row
      assert.deepEqual(reader.readRow(1), { "STATE_NAME": "Washington", "FIPS": "53", "STATE": "WA", "LAT": 47.38, "LONG": -120.0});
    })
  })

  describe('Issue #115: Invalid header terminator + misplaced EOF (geojson.io export)', function() {

    it ('Able to parse header with 0 as terminator byte', function() {
      var buf = fs.readFileSync('test/data/dbf/POLYGON.dbf');
      var reader = new api.internal.DbfReader(buf);
      assert.equal(reader.size(), 2);
      assert.equal(reader.getFields().length, 1);
      assert.equal(reader.getFields()[0], 'NAME');
    })

    it ('Fatal error if last data byte is EOF', function() {
      assert.throws(function() {
        var rows = importRecords('dbf/POLYGON.dbf');
      })
    })
  })

  describe('Issue #83: Import numbers with comma decimal separator', function() {
    it ('Parse decimal numbers correctly', function() {
      var rows = importRecords('dbf/comma_separated.dbf');
      assert.equal(rows[0].AUGSTUMS, 68.5);
    })
  })

  describe('Bug## Empty string field hangs', function () {
    it('Read table with zero-length string fields, ascii', function () {
      var rows = importRecords('three_points.dbf');
      assert.equal(rows.length, 3);
      assert.equal(rows[0].comment, '');
      assert.equal(rows[0].subregion, '');
    })

    it('Read table with zero-length string fields, latin1', function () {
      var rows = importRecords('three_points.dbf', 'latin1');
      assert.equal(rows.length, 3);
      assert.equal(rows[0].comment, '');
      assert.equal(rows[0].subregion, '');
    })
  })

})
