/* @requires nodejs node_xmlhttprequest browser */

// var XMLHttpRequest = exports.XMLHttpRequest; // now assigned in node_xmlhttprequest
if (Node.inNode) {
  var jsdom = require('jsdom');

  // https://github.com/tmpvar/jsdom/issues/34
  //jsdom.dom.level1.core.Document.prototype._elementBuilders.script = undefined;


  jsdom.defaultDocumentFeatures = {
    FetchExternalResources   : ['script'],
    ProcessExternalResources : ['script'],
    MutationEvents           : '2.0',
    QuerySelector            : false
  };

  document = jsdom.jsdom("<html lang='en-US'><head></head><body></body></html>");
  window = document.createWindow();
  window.document = document;
  navigator = {};
  window.navigator = navigator;
}

//trace("[node-jsdom]", document.body.onload);
