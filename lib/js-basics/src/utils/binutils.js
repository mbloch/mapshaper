/* @requires core */

Utils.loadArrayBuffer = function(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    callback(xhr.response);
  };
  xhr.send();
};