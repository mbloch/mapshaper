/** @requires projections */

/**
 * Robinson is the standard NYTimes world map projection.
 */

    //static public const ROBINSON:String = "Robinson";
function Robinson() {
  //Opts.inherit(this, ProjectionBase);
  this.__super__();
  
  this.FXC = 0.8487;
  this.FYC = 1.3523;
  this.C1 = 11.45915590261646417544;
  this.RC1 = 0.08726646259971647884;
  this.NODES = 18;
  this.ONEEPS = 1.000001;
  this.EPS = 1e-8;
  this.name = "Robinson";
  this.useEllipsoid = false;


  this._xArr = [
    1,  -5.67239e-12,  -7.15511e-05,  3.11028e-06,
    0.9986,  -0.000482241,  -2.4897e-05,  -1.33094e-06,
    0.9954,  -0.000831031,  -4.4861e-05,  -9.86588e-07,
    0.99,  -0.00135363,  -5.96598e-05,  3.67749e-06,
    0.9822,  -0.00167442,  -4.4975e-06,  -5.72394e-06,
    0.973,  -0.00214869,  -9.03565e-05,  1.88767e-08,
    0.96,  -0.00305084,  -9.00732e-05,  1.64869e-06,
    0.9427,  -0.00382792,  -6.53428e-05,  -2.61493e-06,
    0.9216,  -0.00467747,  -0.000104566,  4.8122e-06,
    0.8962,  -0.00536222,  -3.23834e-05,  -5.43445e-06,
    0.8679,  -0.00609364,  -0.0001139,  3.32521e-06,
    0.835,  -0.00698325,  -6.40219e-05,  9.34582e-07,
    0.7986,  -0.00755337,  -5.00038e-05,  9.35532e-07,
    0.7597,  -0.00798325,  -3.59716e-05,  -2.27604e-06,
    0.7186,  -0.00851366,  -7.0112e-05,  -8.63072e-06,
    0.6732,  -0.00986209,  -0.000199572,  1.91978e-05,
    0.6213,  -0.010418,  8.83948e-05,  6.24031e-06,
    0.5722,  -0.00906601,  0.000181999,  6.24033e-06,
    0.5322, 0.,0.,0. 

  ];

  this._yArr = [
    0,  0.0124,  3.72529e-10,  1.15484e-09,
    0.062,  0.0124001,  1.76951e-08,  -5.92321e-09,
    0.124,  0.0123998,  -7.09668e-08,  2.25753e-08,
    0.186,  0.0124008,  2.66917e-07,  -8.44523e-08,
    0.248,  0.0123971,  -9.99682e-07,  3.15569e-07,
    0.31,  0.0124108,  3.73349e-06,  -1.1779e-06,
    0.372,  0.0123598,  -1.3935e-05,  4.39588e-06,
    0.434,  0.0125501,  5.20034e-05,  -1.00051e-05,
    0.4968,  0.0123198,  -9.80735e-05,  9.22397e-06,
    0.5571,  0.0120308,  4.02857e-05,  -5.2901e-06,
    0.6176,  0.0120369,  -3.90662e-05,  7.36117e-07,
    0.6769,  0.0117015,  -2.80246e-05,  -8.54283e-07,
    0.7346,  0.0113572,  -4.08389e-05,  -5.18524e-07,
    0.7903,  0.0109099,  -4.86169e-05,  -1.0718e-06,
    0.8435,  0.0103433,  -6.46934e-05,  5.36384e-09,
    0.8936,  0.00969679,  -6.46129e-05,  -8.54894e-06,
    0.9394,  0.00840949,  -0.000192847,  -4.21023e-06,
    0.9761,  0.00616525,  -0.000256001,  -4.21021e-06,
    1., 0.,0.,0 
  ];


  this.projectLatLng = function( lat, lng, xy ) {
    lat *= this._DEG2RAD;
    lng *= this._DEG2RAD;

    var absLat = Math.abs( lat );
    var i = Math.floor( absLat * this.C1 );
    if ( i >= this.NODES ) {
      i = this.NODES - 1;
    }

    var dphi = this._RAD2DEG * (absLat - this.RC1 * i );

    var _xArr = this._xArr;
    var _yArr = this._yArr;

    var idx = i*4;
    var cx0 = _xArr[ idx ];
    var cy0 = _yArr[ idx++];
    var cx1 = _xArr[ idx ];
    var cy1 = _yArr[ idx++];
    var cx2 = _xArr[ idx ];
    var cy2 = _yArr[ idx++];
    var cx3 = _xArr[ idx ];
    var cy3 = _yArr[ idx ];
    
    var x =  ( (dphi*cx3 + cx2) * dphi + cx1 ) * dphi + cx0;
    x *= this.FXC * lng;
    
    var y = ( (dphi*cy3 + cy2) * dphi + cy1 ) * dphi  + cy0;
    y *= this.FYC;

    if ( lat < 0 ) {
      y = -y;
    }

    xy = xy || new Point();
    xy.x = x * this._R;
    xy.y = y * this._R;
    return xy;
  };

  this.unprojectXY = function(x, y, ll) {
    x /= this._R;
    y /= this._R;
    var _xArr = this._xArr;
    var _yArr = this._yArr;

    var lng = x / this.FXC;
    var lat = Math.abs( y / this.FYC );

    if ( lat >= 1. ) {
      if ( lat > this.ONEEPS ) { // error condition
        _ll.lng = _ll.lat = 0;
        return _ll;
      }
      lat = y < 0 ? -Math.PI / 2. : Math.PI / 2.;
      lng /= _xArr[ this.NODES*4 ];  // !!! differs from reference
      
    }
    else {

      var i = Math.floor( lat * this.NODES );
      while ( true ) {
        if ( _yArr[i*4] > lat ) {
          i--;
        }
        else if ( _yArr[ (i+1)*4 ] <= lat ) {
          i++;
        }
        else {
          break;
        }
      }
      
      var idx = i * 4;
      var c0 = _yArr[ idx ];
      var c1 = _yArr[ ++idx ];
      var c2 = _yArr[ ++idx ];
      var c3 = _yArr[ ++idx ];
      
      var t = 5. * (lat - c0 ) / ( _yArr[ idx  ] - c0 );
      c0 -= lat;
      while ( true ) {
        var t1 = ( c0 + t * ( c1 + t * ( c2 + t * c3 ))) / ( c1 + t * ( c2 + c2 + t * 3. * c3 ));
        
        t -= t1;
        if ( Math.abs( t1 ) < this.EPS ) {
          break;
        }        
        //#define V(C,z) (C.c0 + z * (C.c1 + z * (C.c2 + z * C.c3)))
        //#define DV(C,z) (C.c1 + z * (C.c2 + C.c2 + z * 3. * C.c3))
      }

      lat = 5 * i + t;
      if ( y < 0 ) {
        lat = -lat;
      }
      
      idx = i * 4;
      c0 = _xArr[ idx ];
      c1 = _xArr[ ++idx ];
      c2 = _xArr[ ++idx ];
      c3 = _xArr[ ++idx ];
      lng /= ( c0 + t * ( c1 + t * ( c2 + t * c3 )));
    }
    
    ll = ll || new GeoPoint();
    ll.lat = lat * this._RAD2DEG;
    ll.lng = lng * this._RAD2DEG;
    return ll;
  };
}

Opts.inherit(Robinson, ProjectionBase);
