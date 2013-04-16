/*  @requires browser, arrayutils, elements */

Utils.provisionalCSS = function(name, value) {
  return Utils.map(['-webkit-','-moz-','-o-','-ms-',''], function(prefix) {
    return prefix + name + ':' + value + ';';
  }).join('');
};

function Stylesheet() {
  var sheet;
  var selectors = [];
  var style = Browser.createElement('style');
  style.type = 'text/css';
  style.rel = 'stylesheet';
  style.media = 'screen';
  style.title = Utils.getUniqueName();
  Browser.appendToHead(style);  

  Utils.forEach(document.styleSheets, function(ss) {
    if (ss.title == style.title) {
      sheet = ss;
    }
  });

  this.setRule = function(selector, cssText) {
    if (sheet.insertRule) {
      sheet.insertRule(selector + " {" + cssText + "}", selectors.length);
    }
    else {
      sheet.addRule(selector, cssText, selectors.length);
    }

    var idx = Utils.indexOf(selectors, selector);
    if (idx > -1) {
      (sheet.removeRule || sheet.deleteRule).call(sheet, idx);
      selectors.splice(idx, 1);
    }

    selectors.push(selector);
    var ruleCount = sheet.rules ? sheet.rules.length : sheet.cssRules.length;
    if (selectors.length != ruleCount) error("Stylesheet rules out-of-sync");
  };
}


function CSSClass(cname) {
  if (!(this instanceof CSSClass)) {
    return new CSSClass(cname);
  }

  this.el = new El('div');
  this._className = cname;
  this._parentId = null;
}

CSSClass.prototype.parentId = function(id) {
  this._parentId = id || null;
  return this;
};

CSSClass.prototype.parent = function(el) {
  this._parentId = el.id || (el.id = Utils.getUniqueName());
  return this;
};

CSSClass.prototype.css = function() {
  this.el.css.apply(this.el, arguments);
  var selector = "." + this._className;
  if (this._parentId) {
    selector = "#" + this._parentId + " " + selector;
  }
  CSSClass.stylesheet.setRule(selector, this.el.node().style.cssText);
  return this;
};

CSSClass.stylesheet = new Stylesheet();