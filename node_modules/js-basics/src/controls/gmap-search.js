/* @requires events, browser */
/* requires jQuery on the page */

/** 
 * @param el Reference to an <$input> element or jquery selector (e.g. "#nytg-search-$input")
 *
 */
function GoogleGeocoder(el) {
  var prompt = "";
  var $input = El(el);
  var input = $input.el;
  var form = $input.parent('form');
  var busy = false;
  var _self = this;
  var _validator;
  var _formatter = function(str) {
    return str.replace(", USA", '');
  };

  input.value = ''; // in case browser pastes in cached value

  var geocoder = new google.maps.Geocoder();

  if (form) {
    Browser.addEventListener(form.el, 'submit', handleSubmit);
  }

  Browser.addEventListener(input, 'blur', function(e) {
    showPrompt();
    return false;
  });

  Browser.addEventListener(input, 'focus', function(e) { 
    hidePrompt();
  });

  /**
   * select any pre-existing text, so typing replaces it. 
   */
   /*
  $input.click(function(e) { 
    if ($input[0].value != '' && !$input.is(':focus')) {
      this.select();
    }
  });*/


  function showPrompt() {
    var el = input;
    if (prompt && (el.value == '' || el.value == prompt)) {
      el.value = prompt;
      Browser.addClass(el, 'nytg-search-prompt');
    }
  }

  function hidePrompt() {
    var el = input;
    if (prompt && el.value == prompt) {
      Browser.removeClass(el, 'nytg-search-prompt');
      el.value = '';
    }
  }

  function handleSubmit() {
    var el = input;
    var text = el.value;
    if (_validator) {
      text = _validator(text);
    }
    submit(text);
    input.blur();
    return false;
  }

  function submit(str) {
    if (!str || str == prompt || busy) {
      return;
    }
    busy = true;
    geocoder.geocode({address:str}, receiveResponse);  //geocode(request:GeocoderRequest, callback:function(Array.<GeocoderResult>, GeocoderStatus))
  };


  function receiveResponse(results, status) {
    busy = false;

    if (status != google.maps.GeocoderStatus.OK) {
      trace("[GoogleGeocoder.receiveResponse()] invalid code:", status);
      return;
    }

    var res = results[0];
    var name = _formatter(res.formatted_address);
    var ll = res.geometry.location;
    var obj = {
      placename: name,
      lat: ll.lat(),
      lng: ll.lng()
    };

    input.value = name;

    _self.dispatchEvent('geocode', obj);

  }

  this.prompt = function(p) {
    prompt = p;
    showPrompt();
    return this;
  };

  this.validator = function(f) {
    _validator = f;
    return this;
  };


  this.formatter = function(f) {
    _formatter = f;
    return this;
  };
}

Opts.inherit(GoogleGeocoder, EventDispatcher);

