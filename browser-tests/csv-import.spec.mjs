import { expect, test } from '@playwright/test';

// The CSV reader parses bytes using the Buffer polyfill in the browser, so
// check it there too (the GUI imports CSV files as ArrayBuffers).
test('CSV import in the browser: encodings, quoting, small chunks, type detection', async function({page}) {
  await page.goto('/');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.internal;
  });
  var results = await page.evaluate(function() {
    var internal = window.mapshaper.internal;
    function importRecords(content, opts) {
      return internal.importDelim2({content: content}, opts || {}).layers[0].data.getRecords();
    }
    function utf8(str) {
      return new TextEncoder().encode(str).buffer;
    }
    function utf16leWithBOM(str) {
      var arr = new Uint16Array(str.length + 1);
      arr[0] = 0xFEFF;
      for (var i=0; i<str.length; i++) arr[i + 1] = str.charCodeAt(i);
      return arr.buffer;
    }
    function latin1(str) {
      return Uint8Array.from(str, function(c) { return c.charCodeAt(0); }).buffer;
    }
    var csv = 'name,value,note\r\n国语,1,"a, ""b"""\r\n𝄞,2.5,"line\nbreak"\r\n';
    var target = [{name: '国语', value: 1, note: 'a, "b"'}, {name: '𝄞', value: 2.5, note: 'line\nbreak'}];
    return {
      utf8: [importRecords(utf8(csv)), target],
      utf8SmallChunks: [importRecords(utf8(csv), {chunk_size: 3}), target],
      utf16: [importRecords(utf16leWithBOM(csv), {chunk_size: 5}), target],
      string: [importRecords(csv), target],
      csvFields: [importRecords(utf8(csv), {csv_fields: ['name']}), [{name: '国语'}, {name: '𝄞'}]],
      latin1: [importRecords(latin1('a,b\n»¼ü©,è'), {encoding: 'latin1'}), [{a: '»¼ü©', b: 'è'}]],
      big5: [importRecords(internal.encodeString('a|b\r\n四|帆', 'big5'), {encoding: 'big5'}), [{a: '四', b: '帆'}]]
    };
  });
  Object.keys(results).forEach(function(name) {
    expect(results[name][0], name).toEqual(results[name][1]);
  });
});
