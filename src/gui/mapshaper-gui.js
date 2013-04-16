/* @requires mapshaper-gui-lib */

if (Browser.inBrowser) {
  Browser.onload(introPage);
}

function introPage() {
  if (browserIsSupported()) {
    new ImportPanel(editorPage);
    El("#mshp-import").show();
  } else {
    El("#mshp-not-supported").show();
  }
}


function handleShp() {
  
}

function browserIsSupported() {
  return Env.inBrowser && Env.canvas && typeof 'ArrayBuffer' != 'undefined';
}


function editorPage(importData, opts) {
  trace(">>> editorPage; opts:", opts)
  var topoData = MapShaper.buildArcTopology(importData); // obj.xx, obj.yy, obj.partIds, obj.shapeIds
  
}
