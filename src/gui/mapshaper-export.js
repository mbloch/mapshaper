/* @requires mapshaper-geojson, mapshaper-topojson */

var ExportControl = function(arcData, topoData, opts) {
  if (opts.geometry != 'polygon' && opts.geometry != 'polyline') {
    error("ExportControl() unexpected geometry type:", opts.geometry);
  }
  El('#g-export-control').show();
  if (typeof URL == 'undefined' || !URL.createObjectURL) {
    El('#g-export-control .g-label').text("Exporting is not supported in this browser");
    return;
  }

  var filename = opts && opts.output_name || "out",
      anchor = El('#g-export-control').newChild('a').attr('href', '#').node(),
      blobUrl;

  El('#g-export-buttons').css('display: inline');

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
      alert("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.")
      return;
    }
    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function getGeometryTypeforJSON(outputType) {
    return outputType == 'polyline' ? "MultiLineString" : "MultiPolygon";
  }

  function exportGeoJSON() {
    var shapes = MapShaper.convertShapesForJSON(arcData, topoData.shapes, opts.geometry),
        geoType = getGeometryTypeforJSON(opts.geometry),
        json = MapShaper.exportGeoJSON({shapes: shapes, type: geoType});
    exportBlob(filename + ".geojson", new Blob([json]));
    geoBtn.active(true);
  }

  function exportTopoJSON() {
    // export polygons; TODO: export polylines
    var polygons = {
      type: getGeometryTypeforJSON(opts.geometry),
      name: opts.output_name || "features",
      shapes: MapShaper.convertShapesForJSON(arcData, topoData.shapes, opts.geometry)
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
    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), addShp, error);
    } catch(e) {
      if (Utils.parseUrl(Browser.getPageUrl()).protocol == 'file') {
        alert("This browser doesn't support offline .zip file creation.");
      } else {
        alert("This browser doesn't support .zip file creation.");
      }
    }
  }

  function exportShapefile() {
    var type = opts.geometry == 'polyline' ? 3 : 5;
    return MapShaper.exportShp(arcData.getArcTable().export(), topoData.shapes, type);
  }
};

MapShaper.convertShapesForJSON = function(arcData, shapeArr, type) {
  return Utils.map(shapeArr, function(shapeIds) {
    var shape = arcData.getMultiPathShape(shapeIds);
    return type == 'polygon' ? shape.getPathGroups() : shape.getPaths();
  });
};
