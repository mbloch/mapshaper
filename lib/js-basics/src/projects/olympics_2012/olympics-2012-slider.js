/* @requires olympics-2012 html-slider, elements */


function YearSlider(ref) {
  var width = 925;

  this.__super__(ref);
  this.css("padding:0px 0 28px 0px;");

  var years = Olympics.getYears();

  var gen = function(year, px, i) {
    var div = El('div').addClass('nytg-slider-label');
    div.css({
      position: "absolute",
      top: "0px",
      left: px + "px"
    });
    var tic = new Tic().length(4).css("top:5px;").appendTo(div);
    var ticCSS = "width:40px; margin-left: -20px; text-align:center; top:11px;";
    //var ticCSS = "width:40px; margin-left: -20px; text-align:center; top:-20px;";
    var label = new TicLabel().text(String(year)).css(ticCSS).appendTo(div);
    return div.el;
  };

  this.track.css("font-family:Arial,Helvetica,sans-serif; font-size:11px; color: #777;");
  this.track.css("border:0px; background-color:#eaeaea; border-top:1px solid #bbb;");
  this.track.padding(12).horizontal().length(width).initTics(years, gen)


  this.handle.child('img').attr('src', "http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/map2_knob.png")
    .css('margin-left:-9px; margin-top:-9px;');

  this.id(0);

  this.getYear = function() {
    return years[this.id()];
  };

}

Opts.inherit(YearSlider, Slider);

