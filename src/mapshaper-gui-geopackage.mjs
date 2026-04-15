import * as geopackage from '@ngageoint/geopackage';

if (geopackage.setSqljsWasmLocateFile) {
  geopackage.setSqljsWasmLocateFile(function(file) {
    return file;
  });
}

window.modules = window.modules || {};
window.modules['@ngageoint/geopackage'] = geopackage;
