/* @requires mapshaper-geojson, mapshaper-topojson */

var ExportControl = function(arcData, topoData, opts) {
  var filename = opts && opts.output_name || "out";
  var blobUrl;
  var el = El('#g-export-control').show();
  var anchor = el.newChild('a').attr('href', '#').node();
  var geoBtn = new SimpleButton('#g-geojson-btn').active(true).on('click', function() {
    geoBtn.active(false);
    setTimeout(exportGeoJSON, 10); // kludgy way to show button response
  });
  var shpBtn = new SimpleButton('#g-shapefile-btn').active(true).on('click', function() {
    shpBtn.active(false);
    exportZippedShapefile();
  });
  var topoBtn = new SimpleButton('#g-topojson-btn').active(true).on('click', function() {
    topoBtn.active(false);
    setTimeout(exportTopoJSON, 10);
  });

  function exportBlob(filename, blob) {
    try {
      // revoke previous download url, if any. TODO: do this when download completes (how?)
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      error("This browser doesn't support saving files.")
    }
    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function exportGeoJSON() {
    var shapes = MapShaper.convertPolygonsForJSON(arcData, topoData.shapes);
    var json = MapShaper.exportGeoJSON({shapes: shapes, type: "MultiPolygon"});
    exportBlob(filename + ".geojson", new Blob([json]));
    geoBtn.active(true);
  }

  function exportTopoJSON() {
    // export polygons; TODO: export polylines
    var polygons = {
      type: "MultiPolygon",
      name: opts.output_name || "polygons",
      shapes: MapShaper.convertPolygonsForJSON(arcData, topoData.shapes)
    };

    var json = MapShaper.exportTopoJSON({arcs: arcData.getArcTable().toArray(), objects: [polygons], bounds: opts.bounds});
    exportBlob(filename + ".topojson", new Blob([json]));
    topoBtn.active(true);
  }

  function exportZippedShapefile() {
    var data = exportShapefile(),
        shp = new Blob([data.shp]),
        shx = new Blob([data.shx]);

    function addShp(writer) {
      writer.add(filename + ".shp", new zip.BlobReader(shp), function() {
        addShx(writer);
      }, null); // last arg: onprogress
    }

    function addShx(writer) {
      writer.add(filename + ".shx", new zip.BlobReader(shx), function() {
        writer.close(function(blob) {
          exportBlob(filename + ".zip", blob)
          shpBtn.active(true);
        });
      }, null);
    }

    zip.createWriter(new zip.BlobWriter("application/zip"), addShp, error);
  }

  function exportShapefile() {
    return MapShaper.exportShp(arcData.getArcTable().export(), topoData.shapes, 5);
  }
};

MapShaper.convertPolygonsForJSON = function(arcData, shapeArr) {
  return Utils.map(shapeArr, function(shapeIds) {
    var shape = arcData.getPolygonShape(shapeIds);
    return shape.getPathGroups();
  });
};
