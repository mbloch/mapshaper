/* @requires core, colorutils */


/**
 * Updates a ShapeLayer using a callback function.
 * @param {function(ShapeStyle,Record)} func Function for updating the ShapeStyle.
 * @param {DataTable} data DataTable containing shape attributes that match the layer's shapes.
 * @constructor
 */
 function FilteredShapeStyle(func, data) {
  ShapeStyle.call(this);

  //this.fillColor = "#ff0000";
  var _data = data;
  var _func = func;
  var _rec = _data.getRecordById(0).clone();

  this.setId = function(id) {
    _rec.id = id;
    _func(this, _rec);
  };
}





 /**
 * @constructor
 *  { fillColor, fillAlpha, strokeWeight, strokeColor, strokeAlpha }
 */
function ShapeStyle() {

  //this.fillColor = false;
  this.fillColor = null;
  this.fillAlpha = 1;
  //this.strokeColor = false;
  this.strokeColor = null;
  //this.specialFill = null;
  this.strokeAlpha = 1;
  this.strokeWeight = 1;
  this.styler = undefined;
}

ShapeStyle.prototype = {
  hasStroke:function() {
    return this.strokeWeight > 0 && this.strokeColor !== null && this.strokeAlpha != 0;
  },

  hasFill:function() {
    //var ok = this.fillColor !== false || this.specialFill !== undefined;
    var ok = !! this.fillAlpha && this.fillColor != null && this.fillColor !== false;
    return ok;
  },

  setFill:function(fc, fa) {
    this.fillColor = fc;
    this.fillAlpha = fa;
  },

  setStroke:function(sw, sc, sa) {
    this.strokeWeight = sw;
    this.strokeColor = sc;
    this.strokeAlpha = sa;
  },

  setId:function(id) {
    // stub
  },

  beginDrawing:function(ctx) {
    //ctx.beginPath();
    if (this.strokeColor !== null) {
      if (this.strokeAlpha < 1) {
        ctx.strokeStyle = getCSSColor(this.strokeColor, this.strokeAlpha);
      }
      else {
        ctx.strokeStyle = getCSSColor(this.strokeColor); // this.strokeColor;
      }

      ctx.lineWidth = this.strokeWeight;
    }

    if (this.specialFill) {
      //trace("[specialFill]");
      ctx.fillStyle = this.specialFill;
    }
    else if (!this.fillAlpha) {

    }
    else if (this.fillAlpha < 1) {
      ctx.fillStyle = getCSSColor(this.fillColor, this.fillAlpha);
    }
    else if (this.fillColor != null) {
      //ctx.fillStyle = this.fillColor;
      ctx.fillStyle = getCSSColor(this.fillColor); // this.fillColor;
    }
  }

};

