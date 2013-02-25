/* @requires node-jsdom */

if (Node.inNode) {
  if (typeof CSSStyleDeclaration == 'undefined') {
    CSSStyleDeclaration = function() {};
  }

  CSSStyleDeclaration.prototype.getProperty = function(a) {
    return null;
  };

  CSSStyleDeclaration.prototype.setProperty = function(a,b) {
    //return this.setAttribute(a,b);
  };

  CSSStyleDeclaration.prototype.removeProperty = function(a) {
    //return this.removeAttribute(a);
  };
}
