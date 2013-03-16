var INK   = INK || {};
INK.$     = jQuery.noConflict(true) || NYTD.jQuery;

INK.isMobile = function(){
  return (/iphone|ipad|ipod|android|blackberry|mini|windows\sce|palm/i.test(navigator.userAgent.toLowerCase()));
};

