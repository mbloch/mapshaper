// ##Requires:
// ### jQuery.js

INK.Fixie = function(el, options){
  this.$            = INK.$;
  this.isMobile     = INK.isMobile();
  // random token for namespacing events  
  this.token        = Math.round(Math.random() * 100000);
  this.$el          = null;
  this.$container   = null;
  this.isFixed      = false;
  
  var defaults  = {
    offsetX       : 0,
    offsetY       : 0,
    preventReflow : false,
    fixieClassName  : 'ink-fixie',
    fixedClassName  : 'ink-is-fixed',
    // callbacks
    onFix         : function(){ return this; },
    onUnFix       : function(){ return this; },
    // should the element stick to the inside of its container
    constrainToContainer : true
  };
  
  if(options) this.$.extend(defaults, options);
  this.$el        = this.$(el);
  if(this.$el.length > 1) throw 'You can only instantiate one fixie at a time';
    
  this.$container = ('container' in options) ? this.$(options.container) : this.$el.parent();
  this.$.extend(this, defaults);
  
  this.init();
  return this;
};


INK.Fixie.prototype = {
  init : function(){
    this.establishLayout();
    
    if(this.isMobile === true) this.$(window).bind('orientationchange.'+this.token, this.$.proxy(this.onReflow, this));

    this.$(window).bind('resize.'+this.token, this.$.proxy(this.onReflow,this));
    this.$(window).bind('scroll.'+this.token, this.$.proxy(this.evaluate,this));
    this.$el.addClass(this.fixieClassName);
    return this;
  },
  // establish page and element dimensions, positions for viewport fixing
  establishLayout: function(){
    var left, right;
    this.containerHeight  = this.$container.height();
    this.scrollTop        = this.$el.offset().top;
    this.originalPosition = this.$el.css('position');
    this.originalTop      = this.$el.css('top');
    
    left                  = this.$el.css('left');
    this.originalLeft     = (left === 'auto') ? false : left;
    
    right                 = this.$el.css('right');
    this.originalRight    = (right === 'auto') ? false : right;
        
    this.elHeight         = this.$el.height();
    return this;
  },
    
  // Triggered during page reflows to be sure everything is calculated correctly should the page change
  onReflow: function(){
    this.containerHeight  = this.$container.height();
    this.scrollTop        = this.$el.offset().top;
    this.elHeight         = this.$el.height();
    this.evaluate();
    return this;
  },
  // just an alias for the reflow event
  reflow: function(){
    this.onReflow();
    return this;
  },
  
  // evaluate the current window state and position elements accordingly
  evaluate: function(){
    var windowScrollPosition = this.$(window).scrollTop(), 
    coords = {};
    debugger;
    // if you have scrolled to or past the element
    if(this.isFixed === false){
      if(windowScrollPosition >= this.scrollTop && windowScrollPosition+this.elHeight-this.scrollTop < this.containerHeight){
        if(this.isMobile === true || this.preventReflow === true){
          this.$el.css('-webkit-transition-duration','.3s');
          this.$el.css({ top: (windowScrollPosition - this.$container.offset().top+this.offsetY) +'px', position: 'absolute' });
        }else{
          this.$el.css({ position: 'fixed', left: this.$el.offset().left+this.offsetX+'px', top: this.offsetY+'px' })
        }

        // callbacks
        this.fix();
        return;        
      }   
    }

    if(this.isFixed === true){
      // if the current window scroll position is above the element and it is fixed to the viewport, return the element
      // to its original position
      if(windowScrollPosition <= this.scrollTop){
        coords = this.getOriginalCoordinates();
        
        this.$el.css(coords);
        this.unFix();        
        return;
      }else if(this.isMobile === true || this.preventReflow === true){
        this.$el.css('-webkit-transition-duration','.3s');
        this.$el.css({ top: (windowScrollPosition - this.$container.offset().top+this.offsetY) +'px', position: 'absolute' });
        return;
      }
      
      // if you have reached the end of the container. This is to prevent fixed position overflow
      if(windowScrollPosition + this.elHeight - this.scrollTop >= this.containerHeight && this.constrainToContainer === true){
        this.$el.css({ top: (this.containerHeight-(windowScrollPosition + this.elHeight - this.scrollTop))+'px' });
        return;
      }
    }
    return;    
  },
  // fired once the element is released from its positioning
  unFix: function(){
    this.isFixed = false;
    this.$container.removeClass(this.fixedClassName);
    this.onUnFix();
    return this;    
  },
  // fired once the element is set to fixed position
  fix: function(){
    this.isFixed = true;
    this.$container.addClass(this.fixedClassName);
    this.onFix();
    return this;
  },
  // return an object with the styles that will set the el to its original state
  getOriginalCoordinates: function(){
    var coordinates = {
      position  : this.originalPosition,
      top       : this.originalTop
    };

    if(this.originalLeft !== false){
      coordinates.left = this.originalLeft;
    }
    if(this.originalRight !== false){
      coordinates.right = this.originalRight;
    }
    return coordinates;    
  },
  
  // destroy the fixie and return it to original state
  destroy: function(){
    var coords = this.getOriginalCoordinates();
    this.$el.css(coords);    
    this.$el.removeClass(this.fixieClassName);
    this.$container.removeClass(this.fixedClassName);
    this.$(this.target).unbind('.'+this.token);    
  }
    
};