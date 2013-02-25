/* @requires core, browser */

function Cat() {
  this.html = '';
}

//Opts.inherit(Str, String);

Cat.prototype.tag = function(tagName, str, cl) {
  var html = "<" + tagName + (cl && ' class="' + cl + '"' || '') + '>' + str + '</div>';
  this.html += html;
  return this;
};

Cat.tag = function(str, cl) {
  return new Cat().tag('div', str, cl);
};

Cat.prototype.div = function(str, cl) {
  return this.tag('div', str, cl);
};

Cat.prototype.span = function(str, cl) {
  return this.tag('span', str, cl);
};

Cat.div = function(str, cl) {
  return new Cat().div(str, cl);
};

Cat.span = function(str, cl) {
  return new Cat().span(str, cl);
};

Cat.prototype.toString = function() {
  return this.html;
};

Cat.prototype.appendTo = function(node) {
  if (node.childNodes.length == 0) {
    node.innerHTML = this.html;
  }
  else {
    var el = Browser.createElement('div');
    el.innerHTML = this.html;
    while(el.firstChild) {
      node.appendChild(el.firstChild);
    }
  }
}

/*
Cat.prototype.toElement = function() {
  var el = Browser.createElement('div');
  el.innerHTML = this.html;
  var num = el.childNodes.length;
  if (num == 0 || num > 1) {
    return el;
  }
  else {
    return el.firstChild;
  }
}
*/
