/* @require browser, core */

/**
 * Saves a data string to a server.
 *
 * @param {string} path Output file path.
 *   /some/path/file.txt    // path relative to web root
 *   another/path/file.txt  // path relative to upload script
 * @param {string} data Contents of the file.
 */
var FileUpload = {
  save: function(path, data, opts) {
    var defUrl = "http://mbloch/mbexport/receive_file.php?path=" + path;
    opts = Opts.copyAllParams({url:defUrl}, opts);
    var xhr = new XMLHttpRequest();
    trace("FileUpload.save() xhr:", xhr, "url:", opts.url);
    xhr.open('POST', opts.url, true);
    //xhr.onload = function(e) {};
    //xhr.upload.onprogress = function(e) {};
    xhr.send(data);
  }
};

