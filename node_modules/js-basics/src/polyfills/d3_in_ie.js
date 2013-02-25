

CSSStyleDeclaration.prototype.getProperty = function(a) {
  return this.getAttribute(a);
};

CSSStyleDeclaration.prototype.setProperty = function(a,b) {
  return this.setAttribute(a,b);
};

CSSStyleDeclaration.prototype.removeProperty = function(a) {
  return this.removeAttribute(a);
};