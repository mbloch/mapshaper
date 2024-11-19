require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var callBind = require('./');

var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

module.exports = function callBoundIntrinsic(name, allowMissing) {
	var intrinsic = GetIntrinsic(name, !!allowMissing);
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBind(intrinsic);
	}
	return intrinsic;
};

},{"./":4,"get-intrinsic":16}],4:[function(require,module,exports){
'use strict';

var bind = require('function-bind');
var GetIntrinsic = require('get-intrinsic');
var setFunctionLength = require('set-function-length');

var $TypeError = require('es-errors/type');
var $apply = GetIntrinsic('%Function.prototype.apply%');
var $call = GetIntrinsic('%Function.prototype.call%');
var $reflectApply = GetIntrinsic('%Reflect.apply%', true) || bind.call($call, $apply);

var $defineProperty = require('es-define-property');
var $max = GetIntrinsic('%Math.max%');

module.exports = function callBind(originalFunction) {
	if (typeof originalFunction !== 'function') {
		throw new $TypeError('a function is required');
	}
	var func = $reflectApply(bind, $call, arguments);
	return setFunctionLength(
		func,
		1 + $max(0, originalFunction.length - (arguments.length - 1)),
		true
	);
};

var applyBind = function applyBind() {
	return $reflectApply(bind, $apply, arguments);
};

if ($defineProperty) {
	$defineProperty(module.exports, 'apply', { value: applyBind });
} else {
	module.exports.apply = applyBind;
}

},{"es-define-property":6,"es-errors/type":12,"function-bind":15,"get-intrinsic":16,"set-function-length":61}],5:[function(require,module,exports){
'use strict';

var $defineProperty = require('es-define-property');

var $SyntaxError = require('es-errors/syntax');
var $TypeError = require('es-errors/type');

var gopd = require('gopd');

/** @type {import('.')} */
module.exports = function defineDataProperty(
	obj,
	property,
	value
) {
	if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
		throw new $TypeError('`obj` must be an object or a function`');
	}
	if (typeof property !== 'string' && typeof property !== 'symbol') {
		throw new $TypeError('`property` must be a string or a symbol`');
	}
	if (arguments.length > 3 && typeof arguments[3] !== 'boolean' && arguments[3] !== null) {
		throw new $TypeError('`nonEnumerable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 4 && typeof arguments[4] !== 'boolean' && arguments[4] !== null) {
		throw new $TypeError('`nonWritable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 5 && typeof arguments[5] !== 'boolean' && arguments[5] !== null) {
		throw new $TypeError('`nonConfigurable`, if provided, must be a boolean or null');
	}
	if (arguments.length > 6 && typeof arguments[6] !== 'boolean') {
		throw new $TypeError('`loose`, if provided, must be a boolean');
	}

	var nonEnumerable = arguments.length > 3 ? arguments[3] : null;
	var nonWritable = arguments.length > 4 ? arguments[4] : null;
	var nonConfigurable = arguments.length > 5 ? arguments[5] : null;
	var loose = arguments.length > 6 ? arguments[6] : false;

	/* @type {false | TypedPropertyDescriptor<unknown>} */
	var desc = !!gopd && gopd(obj, property);

	if ($defineProperty) {
		$defineProperty(obj, property, {
			configurable: nonConfigurable === null && desc ? desc.configurable : !nonConfigurable,
			enumerable: nonEnumerable === null && desc ? desc.enumerable : !nonEnumerable,
			value: value,
			writable: nonWritable === null && desc ? desc.writable : !nonWritable
		});
	} else if (loose || (!nonEnumerable && !nonWritable && !nonConfigurable)) {
		// must fall back to [[Set]], and was not explicitly asked to make non-enumerable, non-writable, or non-configurable
		obj[property] = value; // eslint-disable-line no-param-reassign
	} else {
		throw new $SyntaxError('This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.');
	}
};

},{"es-define-property":6,"es-errors/syntax":11,"es-errors/type":12,"gopd":17}],6:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

/** @type {import('.')} */
var $defineProperty = GetIntrinsic('%Object.defineProperty%', true) || false;
if ($defineProperty) {
	try {
		$defineProperty({}, 'a', { value: 1 });
	} catch (e) {
		// IE 8 has a broken defineProperty
		$defineProperty = false;
	}
}

module.exports = $defineProperty;

},{"get-intrinsic":16}],7:[function(require,module,exports){
'use strict';

/** @type {import('./eval')} */
module.exports = EvalError;

},{}],8:[function(require,module,exports){
'use strict';

/** @type {import('.')} */
module.exports = Error;

},{}],9:[function(require,module,exports){
'use strict';

/** @type {import('./range')} */
module.exports = RangeError;

},{}],10:[function(require,module,exports){
'use strict';

/** @type {import('./ref')} */
module.exports = ReferenceError;

},{}],11:[function(require,module,exports){
'use strict';

/** @type {import('./syntax')} */
module.exports = SyntaxError;

},{}],12:[function(require,module,exports){
'use strict';

/** @type {import('./type')} */
module.exports = TypeError;

},{}],13:[function(require,module,exports){
'use strict';

/** @type {import('./uri')} */
module.exports = URIError;

},{}],14:[function(require,module,exports){
'use strict';

/* eslint no-invalid-this: 1 */

var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
var toStr = Object.prototype.toString;
var max = Math.max;
var funcType = '[object Function]';

var concatty = function concatty(a, b) {
    var arr = [];

    for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
    }
    for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
    }

    return arr;
};

var slicy = function slicy(arrLike, offset) {
    var arr = [];
    for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
    }
    return arr;
};

var joiny = function (arr, joiner) {
    var str = '';
    for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
            str += joiner;
        }
    }
    return str;
};

module.exports = function bind(that) {
    var target = this;
    if (typeof target !== 'function' || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
    }
    var args = slicy(arguments, 1);

    var bound;
    var binder = function () {
        if (this instanceof bound) {
            var result = target.apply(
                this,
                concatty(args, arguments)
            );
            if (Object(result) === result) {
                return result;
            }
            return this;
        }
        return target.apply(
            that,
            concatty(args, arguments)
        );

    };

    var boundLength = max(0, target.length - args.length);
    var boundArgs = [];
    for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = '$' + i;
    }

    bound = Function('binder', 'return function (' + joiny(boundArgs, ',') + '){ return binder.apply(this,arguments); }')(binder);

    if (target.prototype) {
        var Empty = function Empty() {};
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
    }

    return bound;
};

},{}],15:[function(require,module,exports){
'use strict';

var implementation = require('./implementation');

module.exports = Function.prototype.bind || implementation;

},{"./implementation":14}],16:[function(require,module,exports){
'use strict';

var undefined;

var $Error = require('es-errors');
var $EvalError = require('es-errors/eval');
var $RangeError = require('es-errors/range');
var $ReferenceError = require('es-errors/ref');
var $SyntaxError = require('es-errors/syntax');
var $TypeError = require('es-errors/type');
var $URIError = require('es-errors/uri');

var $Function = Function;

// eslint-disable-next-line consistent-return
var getEvalledConstructor = function (expressionSyntax) {
	try {
		return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
	} catch (e) {}
};

var $gOPD = Object.getOwnPropertyDescriptor;
if ($gOPD) {
	try {
		$gOPD({}, '');
	} catch (e) {
		$gOPD = null; // this is IE 8, which has a broken gOPD
	}
}

var throwTypeError = function () {
	throw new $TypeError();
};
var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;

var hasSymbols = require('has-symbols')();
var hasProto = require('has-proto')();

var getProto = Object.getPrototypeOf || (
	hasProto
		? function (x) { return x.__proto__; } // eslint-disable-line no-proto
		: null
);

var needsEval = {};

var TypedArray = typeof Uint8Array === 'undefined' || !getProto ? undefined : getProto(Uint8Array);

var INTRINSICS = {
	__proto__: null,
	'%AggregateError%': typeof AggregateError === 'undefined' ? undefined : AggregateError,
	'%Array%': Array,
	'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined : ArrayBuffer,
	'%ArrayIteratorPrototype%': hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined,
	'%AsyncFromSyncIteratorPrototype%': undefined,
	'%AsyncFunction%': needsEval,
	'%AsyncGenerator%': needsEval,
	'%AsyncGeneratorFunction%': needsEval,
	'%AsyncIteratorPrototype%': needsEval,
	'%Atomics%': typeof Atomics === 'undefined' ? undefined : Atomics,
	'%BigInt%': typeof BigInt === 'undefined' ? undefined : BigInt,
	'%BigInt64Array%': typeof BigInt64Array === 'undefined' ? undefined : BigInt64Array,
	'%BigUint64Array%': typeof BigUint64Array === 'undefined' ? undefined : BigUint64Array,
	'%Boolean%': Boolean,
	'%DataView%': typeof DataView === 'undefined' ? undefined : DataView,
	'%Date%': Date,
	'%decodeURI%': decodeURI,
	'%decodeURIComponent%': decodeURIComponent,
	'%encodeURI%': encodeURI,
	'%encodeURIComponent%': encodeURIComponent,
	'%Error%': $Error,
	'%eval%': eval, // eslint-disable-line no-eval
	'%EvalError%': $EvalError,
	'%Float32Array%': typeof Float32Array === 'undefined' ? undefined : Float32Array,
	'%Float64Array%': typeof Float64Array === 'undefined' ? undefined : Float64Array,
	'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined : FinalizationRegistry,
	'%Function%': $Function,
	'%GeneratorFunction%': needsEval,
	'%Int8Array%': typeof Int8Array === 'undefined' ? undefined : Int8Array,
	'%Int16Array%': typeof Int16Array === 'undefined' ? undefined : Int16Array,
	'%Int32Array%': typeof Int32Array === 'undefined' ? undefined : Int32Array,
	'%isFinite%': isFinite,
	'%isNaN%': isNaN,
	'%IteratorPrototype%': hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined,
	'%JSON%': typeof JSON === 'object' ? JSON : undefined,
	'%Map%': typeof Map === 'undefined' ? undefined : Map,
	'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols || !getProto ? undefined : getProto(new Map()[Symbol.iterator]()),
	'%Math%': Math,
	'%Number%': Number,
	'%Object%': Object,
	'%parseFloat%': parseFloat,
	'%parseInt%': parseInt,
	'%Promise%': typeof Promise === 'undefined' ? undefined : Promise,
	'%Proxy%': typeof Proxy === 'undefined' ? undefined : Proxy,
	'%RangeError%': $RangeError,
	'%ReferenceError%': $ReferenceError,
	'%Reflect%': typeof Reflect === 'undefined' ? undefined : Reflect,
	'%RegExp%': RegExp,
	'%Set%': typeof Set === 'undefined' ? undefined : Set,
	'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols || !getProto ? undefined : getProto(new Set()[Symbol.iterator]()),
	'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer,
	'%String%': String,
	'%StringIteratorPrototype%': hasSymbols && getProto ? getProto(''[Symbol.iterator]()) : undefined,
	'%Symbol%': hasSymbols ? Symbol : undefined,
	'%SyntaxError%': $SyntaxError,
	'%ThrowTypeError%': ThrowTypeError,
	'%TypedArray%': TypedArray,
	'%TypeError%': $TypeError,
	'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined : Uint8Array,
	'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined : Uint8ClampedArray,
	'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined : Uint16Array,
	'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined : Uint32Array,
	'%URIError%': $URIError,
	'%WeakMap%': typeof WeakMap === 'undefined' ? undefined : WeakMap,
	'%WeakRef%': typeof WeakRef === 'undefined' ? undefined : WeakRef,
	'%WeakSet%': typeof WeakSet === 'undefined' ? undefined : WeakSet
};

if (getProto) {
	try {
		null.error; // eslint-disable-line no-unused-expressions
	} catch (e) {
		// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
		var errorProto = getProto(getProto(e));
		INTRINSICS['%Error.prototype%'] = errorProto;
	}
}

var doEval = function doEval(name) {
	var value;
	if (name === '%AsyncFunction%') {
		value = getEvalledConstructor('async function () {}');
	} else if (name === '%GeneratorFunction%') {
		value = getEvalledConstructor('function* () {}');
	} else if (name === '%AsyncGeneratorFunction%') {
		value = getEvalledConstructor('async function* () {}');
	} else if (name === '%AsyncGenerator%') {
		var fn = doEval('%AsyncGeneratorFunction%');
		if (fn) {
			value = fn.prototype;
		}
	} else if (name === '%AsyncIteratorPrototype%') {
		var gen = doEval('%AsyncGenerator%');
		if (gen && getProto) {
			value = getProto(gen.prototype);
		}
	}

	INTRINSICS[name] = value;

	return value;
};

var LEGACY_ALIASES = {
	__proto__: null,
	'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
	'%ArrayPrototype%': ['Array', 'prototype'],
	'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
	'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
	'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
	'%ArrayProto_values%': ['Array', 'prototype', 'values'],
	'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
	'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
	'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
	'%BooleanPrototype%': ['Boolean', 'prototype'],
	'%DataViewPrototype%': ['DataView', 'prototype'],
	'%DatePrototype%': ['Date', 'prototype'],
	'%ErrorPrototype%': ['Error', 'prototype'],
	'%EvalErrorPrototype%': ['EvalError', 'prototype'],
	'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
	'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
	'%FunctionPrototype%': ['Function', 'prototype'],
	'%Generator%': ['GeneratorFunction', 'prototype'],
	'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
	'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
	'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
	'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
	'%JSONParse%': ['JSON', 'parse'],
	'%JSONStringify%': ['JSON', 'stringify'],
	'%MapPrototype%': ['Map', 'prototype'],
	'%NumberPrototype%': ['Number', 'prototype'],
	'%ObjectPrototype%': ['Object', 'prototype'],
	'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
	'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
	'%PromisePrototype%': ['Promise', 'prototype'],
	'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
	'%Promise_all%': ['Promise', 'all'],
	'%Promise_reject%': ['Promise', 'reject'],
	'%Promise_resolve%': ['Promise', 'resolve'],
	'%RangeErrorPrototype%': ['RangeError', 'prototype'],
	'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
	'%RegExpPrototype%': ['RegExp', 'prototype'],
	'%SetPrototype%': ['Set', 'prototype'],
	'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
	'%StringPrototype%': ['String', 'prototype'],
	'%SymbolPrototype%': ['Symbol', 'prototype'],
	'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
	'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
	'%TypeErrorPrototype%': ['TypeError', 'prototype'],
	'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
	'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
	'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
	'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
	'%URIErrorPrototype%': ['URIError', 'prototype'],
	'%WeakMapPrototype%': ['WeakMap', 'prototype'],
	'%WeakSetPrototype%': ['WeakSet', 'prototype']
};

var bind = require('function-bind');
var hasOwn = require('hasown');
var $concat = bind.call(Function.call, Array.prototype.concat);
var $spliceApply = bind.call(Function.apply, Array.prototype.splice);
var $replace = bind.call(Function.call, String.prototype.replace);
var $strSlice = bind.call(Function.call, String.prototype.slice);
var $exec = bind.call(Function.call, RegExp.prototype.exec);

/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
var stringToPath = function stringToPath(string) {
	var first = $strSlice(string, 0, 1);
	var last = $strSlice(string, -1);
	if (first === '%' && last !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
	} else if (last === '%' && first !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
	}
	var result = [];
	$replace(string, rePropName, function (match, number, quote, subString) {
		result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
	});
	return result;
};
/* end adaptation */

var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
	var intrinsicName = name;
	var alias;
	if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
		alias = LEGACY_ALIASES[intrinsicName];
		intrinsicName = '%' + alias[0] + '%';
	}

	if (hasOwn(INTRINSICS, intrinsicName)) {
		var value = INTRINSICS[intrinsicName];
		if (value === needsEval) {
			value = doEval(intrinsicName);
		}
		if (typeof value === 'undefined' && !allowMissing) {
			throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
		}

		return {
			alias: alias,
			name: intrinsicName,
			value: value
		};
	}

	throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
};

module.exports = function GetIntrinsic(name, allowMissing) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new $TypeError('intrinsic name must be a non-empty string');
	}
	if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
		throw new $TypeError('"allowMissing" argument must be a boolean');
	}

	if ($exec(/^%?[^%]*%?$/, name) === null) {
		throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
	}
	var parts = stringToPath(name);
	var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

	var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
	var intrinsicRealName = intrinsic.name;
	var value = intrinsic.value;
	var skipFurtherCaching = false;

	var alias = intrinsic.alias;
	if (alias) {
		intrinsicBaseName = alias[0];
		$spliceApply(parts, $concat([0, 1], alias));
	}

	for (var i = 1, isOwn = true; i < parts.length; i += 1) {
		var part = parts[i];
		var first = $strSlice(part, 0, 1);
		var last = $strSlice(part, -1);
		if (
			(
				(first === '"' || first === "'" || first === '`')
				|| (last === '"' || last === "'" || last === '`')
			)
			&& first !== last
		) {
			throw new $SyntaxError('property names with quotes must have matching quotes');
		}
		if (part === 'constructor' || !isOwn) {
			skipFurtherCaching = true;
		}

		intrinsicBaseName += '.' + part;
		intrinsicRealName = '%' + intrinsicBaseName + '%';

		if (hasOwn(INTRINSICS, intrinsicRealName)) {
			value = INTRINSICS[intrinsicRealName];
		} else if (value != null) {
			if (!(part in value)) {
				if (!allowMissing) {
					throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
				}
				return void undefined;
			}
			if ($gOPD && (i + 1) >= parts.length) {
				var desc = $gOPD(value, part);
				isOwn = !!desc;

				// By convention, when a data property is converted to an accessor
				// property to emulate a data property that does not suffer from
				// the override mistake, that accessor's getter is marked with
				// an `originalValue` property. Here, when we detect this, we
				// uphold the illusion by pretending to see that original data
				// property, i.e., returning the value rather than the getter
				// itself.
				if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
					value = desc.get;
				} else {
					value = value[part];
				}
			} else {
				isOwn = hasOwn(value, part);
				value = value[part];
			}

			if (isOwn && !skipFurtherCaching) {
				INTRINSICS[intrinsicRealName] = value;
			}
		}
	}
	return value;
};

},{"es-errors":8,"es-errors/eval":7,"es-errors/range":9,"es-errors/ref":10,"es-errors/syntax":11,"es-errors/type":12,"es-errors/uri":13,"function-bind":15,"has-proto":19,"has-symbols":20,"hasown":22}],17:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);

if ($gOPD) {
	try {
		$gOPD([], 'length');
	} catch (e) {
		// IE 8 has a broken gOPD
		$gOPD = null;
	}
}

module.exports = $gOPD;

},{"get-intrinsic":16}],18:[function(require,module,exports){
'use strict';

var $defineProperty = require('es-define-property');

var hasPropertyDescriptors = function hasPropertyDescriptors() {
	return !!$defineProperty;
};

hasPropertyDescriptors.hasArrayLengthDefineBug = function hasArrayLengthDefineBug() {
	// node v0.6 has a bug where array lengths can be Set but not Defined
	if (!$defineProperty) {
		return null;
	}
	try {
		return $defineProperty([], 'length', { value: 1 }).length !== 1;
	} catch (e) {
		// In Firefox 4-22, defining length on an array throws an exception.
		return true;
	}
};

module.exports = hasPropertyDescriptors;

},{"es-define-property":6}],19:[function(require,module,exports){
'use strict';

var test = {
	__proto__: null,
	foo: {}
};

var $Object = Object;

/** @type {import('.')} */
module.exports = function hasProto() {
	// @ts-expect-error: TS errors on an inherited property for some reason
	return { __proto__: test }.foo === test.foo
		&& !(test instanceof $Object);
};

},{}],20:[function(require,module,exports){
'use strict';

var origSymbol = typeof Symbol !== 'undefined' && Symbol;
var hasSymbolSham = require('./shams');

module.exports = function hasNativeSymbols() {
	if (typeof origSymbol !== 'function') { return false; }
	if (typeof Symbol !== 'function') { return false; }
	if (typeof origSymbol('foo') !== 'symbol') { return false; }
	if (typeof Symbol('bar') !== 'symbol') { return false; }

	return hasSymbolSham();
};

},{"./shams":21}],21:[function(require,module,exports){
'use strict';

/* eslint complexity: [2, 18], max-statements: [2, 33] */
module.exports = function hasSymbols() {
	if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
	if (typeof Symbol.iterator === 'symbol') { return true; }

	var obj = {};
	var sym = Symbol('test');
	var symObj = Object(sym);
	if (typeof sym === 'string') { return false; }

	if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
	if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

	// temp disabled per https://github.com/ljharb/object.assign/issues/17
	// if (sym instanceof Symbol) { return false; }
	// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
	// if (!(symObj instanceof Symbol)) { return false; }

	// if (typeof Symbol.prototype.toString !== 'function') { return false; }
	// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

	var symVal = 42;
	obj[sym] = symVal;
	for (sym in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
	if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

	if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

	var syms = Object.getOwnPropertySymbols(obj);
	if (syms.length !== 1 || syms[0] !== sym) { return false; }

	if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

	if (typeof Object.getOwnPropertyDescriptor === 'function') {
		var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
		if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
	}

	return true;
};

},{}],22:[function(require,module,exports){
'use strict';

var call = Function.prototype.call;
var $hasOwn = Object.prototype.hasOwnProperty;
var bind = require('function-bind');

/** @type {import('.')} */
module.exports = bind.call(call, $hasOwn);

},{"function-bind":15}],23:[function(require,module,exports){
"use strict";
/**
 * A response from a web request
 */
var Response = /** @class */ (function () {
    function Response(statusCode, headers, body, url) {
        if (typeof statusCode !== 'number') {
            throw new TypeError('statusCode must be a number but was ' + typeof statusCode);
        }
        if (headers === null) {
            throw new TypeError('headers cannot be null');
        }
        if (typeof headers !== 'object') {
            throw new TypeError('headers must be an object but was ' + typeof headers);
        }
        this.statusCode = statusCode;
        var headersToLowerCase = {};
        for (var key in headers) {
            headersToLowerCase[key.toLowerCase()] = headers[key];
        }
        this.headers = headersToLowerCase;
        this.body = body;
        this.url = url;
    }
    Response.prototype.isError = function () {
        return this.statusCode === 0 || this.statusCode >= 400;
    };
    Response.prototype.getBody = function (encoding) {
        if (this.statusCode === 0) {
            var err = new Error('This request to ' +
                this.url +
                ' resulted in a status code of 0. This usually indicates some kind of network error in a browser (e.g. CORS not being set up or the DNS failing to resolve):\n' +
                this.body.toString());
            err.statusCode = this.statusCode;
            err.headers = this.headers;
            err.body = this.body;
            err.url = this.url;
            throw err;
        }
        if (this.statusCode >= 300) {
            var err = new Error('Server responded to ' +
                this.url +
                ' with status code ' +
                this.statusCode +
                ':\n' +
                this.body.toString());
            err.statusCode = this.statusCode;
            err.headers = this.headers;
            err.body = this.body;
            err.url = this.url;
            throw err;
        }
        if (!encoding || typeof this.body === 'string') {
            return this.body;
        }
        return this.body.toString(encoding);
    };
    return Response;
}());
module.exports = Response;

},{}],24:[function(require,module,exports){
"use strict";
var Buffer = require("safer-buffer").Buffer;

// Multibyte codec. In this scheme, a character is represented by 1 or more bytes.
// Our codec supports UTF-16 surrogates, extensions for GB18030 and unicode sequences.
// To save memory and loading time, we read table files only when requested.

exports._dbcs = DBCSCodec;

var UNASSIGNED = -1,
    GB18030_CODE = -2,
    SEQ_START  = -10,
    NODE_START = -1000,
    UNASSIGNED_NODE = new Array(0x100),
    DEF_CHAR = -1;

for (var i = 0; i < 0x100; i++)
    UNASSIGNED_NODE[i] = UNASSIGNED;


// Class DBCSCodec reads and initializes mapping tables.
function DBCSCodec(codecOptions, iconv) {
    this.encodingName = codecOptions.encodingName;
    if (!codecOptions)
        throw new Error("DBCS codec is called without the data.")
    if (!codecOptions.table)
        throw new Error("Encoding '" + this.encodingName + "' has no data.");

    // Load tables.
    var mappingTable = codecOptions.table();


    // Decode tables: MBCS -> Unicode.

    // decodeTables is a trie, encoded as an array of arrays of integers. Internal arrays are trie nodes and all have len = 256.
    // Trie root is decodeTables[0].
    // Values: >=  0 -> unicode character code. can be > 0xFFFF
    //         == UNASSIGNED -> unknown/unassigned sequence.
    //         == GB18030_CODE -> this is the end of a GB18030 4-byte sequence.
    //         <= NODE_START -> index of the next node in our trie to process next byte.
    //         <= SEQ_START  -> index of the start of a character code sequence, in decodeTableSeq.
    this.decodeTables = [];
    this.decodeTables[0] = UNASSIGNED_NODE.slice(0); // Create root node.

    // Sometimes a MBCS char corresponds to a sequence of unicode chars. We store them as arrays of integers here. 
    this.decodeTableSeq = [];

    // Actual mapping tables consist of chunks. Use them to fill up decode tables.
    for (var i = 0; i < mappingTable.length; i++)
        this._addDecodeChunk(mappingTable[i]);

    // Load & create GB18030 tables when needed.
    if (typeof codecOptions.gb18030 === 'function') {
        this.gb18030 = codecOptions.gb18030(); // Load GB18030 ranges.

        // Add GB18030 common decode nodes.
        var commonThirdByteNodeIdx = this.decodeTables.length;
        this.decodeTables.push(UNASSIGNED_NODE.slice(0));

        var commonFourthByteNodeIdx = this.decodeTables.length;
        this.decodeTables.push(UNASSIGNED_NODE.slice(0));

        // Fill out the tree
        var firstByteNode = this.decodeTables[0];
        for (var i = 0x81; i <= 0xFE; i++) {
            var secondByteNode = this.decodeTables[NODE_START - firstByteNode[i]];
            for (var j = 0x30; j <= 0x39; j++) {
                if (secondByteNode[j] === UNASSIGNED) {
                    secondByteNode[j] = NODE_START - commonThirdByteNodeIdx;
                } else if (secondByteNode[j] > NODE_START) {
                    throw new Error("gb18030 decode tables conflict at byte 2");
                }

                var thirdByteNode = this.decodeTables[NODE_START - secondByteNode[j]];
                for (var k = 0x81; k <= 0xFE; k++) {
                    if (thirdByteNode[k] === UNASSIGNED) {
                        thirdByteNode[k] = NODE_START - commonFourthByteNodeIdx;
                    } else if (thirdByteNode[k] === NODE_START - commonFourthByteNodeIdx) {
                        continue;
                    } else if (thirdByteNode[k] > NODE_START) {
                        throw new Error("gb18030 decode tables conflict at byte 3");
                    }

                    var fourthByteNode = this.decodeTables[NODE_START - thirdByteNode[k]];
                    for (var l = 0x30; l <= 0x39; l++) {
                        if (fourthByteNode[l] === UNASSIGNED)
                            fourthByteNode[l] = GB18030_CODE;
                    }
                }
            }
        }
    }

    this.defaultCharUnicode = iconv.defaultCharUnicode;

    
    // Encode tables: Unicode -> DBCS.

    // `encodeTable` is array mapping from unicode char to encoded char. All its values are integers for performance.
    // Because it can be sparse, it is represented as array of buckets by 256 chars each. Bucket can be null.
    // Values: >=  0 -> it is a normal char. Write the value (if <=256 then 1 byte, if <=65536 then 2 bytes, etc.).
    //         == UNASSIGNED -> no conversion found. Output a default char.
    //         <= SEQ_START  -> it's an index in encodeTableSeq, see below. The character starts a sequence.
    this.encodeTable = [];
    
    // `encodeTableSeq` is used when a sequence of unicode characters is encoded as a single code. We use a tree of
    // objects where keys correspond to characters in sequence and leafs are the encoded dbcs values. A special DEF_CHAR key
    // means end of sequence (needed when one sequence is a strict subsequence of another).
    // Objects are kept separately from encodeTable to increase performance.
    this.encodeTableSeq = [];

    // Some chars can be decoded, but need not be encoded.
    var skipEncodeChars = {};
    if (codecOptions.encodeSkipVals)
        for (var i = 0; i < codecOptions.encodeSkipVals.length; i++) {
            var val = codecOptions.encodeSkipVals[i];
            if (typeof val === 'number')
                skipEncodeChars[val] = true;
            else
                for (var j = val.from; j <= val.to; j++)
                    skipEncodeChars[j] = true;
        }
        
    // Use decode trie to recursively fill out encode tables.
    this._fillEncodeTable(0, 0, skipEncodeChars);

    // Add more encoding pairs when needed.
    if (codecOptions.encodeAdd) {
        for (var uChar in codecOptions.encodeAdd)
            if (Object.prototype.hasOwnProperty.call(codecOptions.encodeAdd, uChar))
                this._setEncodeChar(uChar.charCodeAt(0), codecOptions.encodeAdd[uChar]);
    }

    this.defCharSB  = this.encodeTable[0][iconv.defaultCharSingleByte.charCodeAt(0)];
    if (this.defCharSB === UNASSIGNED) this.defCharSB = this.encodeTable[0]['?'];
    if (this.defCharSB === UNASSIGNED) this.defCharSB = "?".charCodeAt(0);
}

DBCSCodec.prototype.encoder = DBCSEncoder;
DBCSCodec.prototype.decoder = DBCSDecoder;

// Decoder helpers
DBCSCodec.prototype._getDecodeTrieNode = function(addr) {
    var bytes = [];
    for (; addr > 0; addr >>>= 8)
        bytes.push(addr & 0xFF);
    if (bytes.length == 0)
        bytes.push(0);

    var node = this.decodeTables[0];
    for (var i = bytes.length-1; i > 0; i--) { // Traverse nodes deeper into the trie.
        var val = node[bytes[i]];

        if (val == UNASSIGNED) { // Create new node.
            node[bytes[i]] = NODE_START - this.decodeTables.length;
            this.decodeTables.push(node = UNASSIGNED_NODE.slice(0));
        }
        else if (val <= NODE_START) { // Existing node.
            node = this.decodeTables[NODE_START - val];
        }
        else
            throw new Error("Overwrite byte in " + this.encodingName + ", addr: " + addr.toString(16));
    }
    return node;
}


DBCSCodec.prototype._addDecodeChunk = function(chunk) {
    // First element of chunk is the hex mbcs code where we start.
    var curAddr = parseInt(chunk[0], 16);

    // Choose the decoding node where we'll write our chars.
    var writeTable = this._getDecodeTrieNode(curAddr);
    curAddr = curAddr & 0xFF;

    // Write all other elements of the chunk to the table.
    for (var k = 1; k < chunk.length; k++) {
        var part = chunk[k];
        if (typeof part === "string") { // String, write as-is.
            for (var l = 0; l < part.length;) {
                var code = part.charCodeAt(l++);
                if (0xD800 <= code && code < 0xDC00) { // Decode surrogate
                    var codeTrail = part.charCodeAt(l++);
                    if (0xDC00 <= codeTrail && codeTrail < 0xE000)
                        writeTable[curAddr++] = 0x10000 + (code - 0xD800) * 0x400 + (codeTrail - 0xDC00);
                    else
                        throw new Error("Incorrect surrogate pair in "  + this.encodingName + " at chunk " + chunk[0]);
                }
                else if (0x0FF0 < code && code <= 0x0FFF) { // Character sequence (our own encoding used)
                    var len = 0xFFF - code + 2;
                    var seq = [];
                    for (var m = 0; m < len; m++)
                        seq.push(part.charCodeAt(l++)); // Simple variation: don't support surrogates or subsequences in seq.

                    writeTable[curAddr++] = SEQ_START - this.decodeTableSeq.length;
                    this.decodeTableSeq.push(seq);
                }
                else
                    writeTable[curAddr++] = code; // Basic char
            }
        } 
        else if (typeof part === "number") { // Integer, meaning increasing sequence starting with prev character.
            var charCode = writeTable[curAddr - 1] + 1;
            for (var l = 0; l < part; l++)
                writeTable[curAddr++] = charCode++;
        }
        else
            throw new Error("Incorrect type '" + typeof part + "' given in "  + this.encodingName + " at chunk " + chunk[0]);
    }
    if (curAddr > 0xFF)
        throw new Error("Incorrect chunk in "  + this.encodingName + " at addr " + chunk[0] + ": too long" + curAddr);
}

// Encoder helpers
DBCSCodec.prototype._getEncodeBucket = function(uCode) {
    var high = uCode >> 8; // This could be > 0xFF because of astral characters.
    if (this.encodeTable[high] === undefined)
        this.encodeTable[high] = UNASSIGNED_NODE.slice(0); // Create bucket on demand.
    return this.encodeTable[high];
}

DBCSCodec.prototype._setEncodeChar = function(uCode, dbcsCode) {
    var bucket = this._getEncodeBucket(uCode);
    var low = uCode & 0xFF;
    if (bucket[low] <= SEQ_START)
        this.encodeTableSeq[SEQ_START-bucket[low]][DEF_CHAR] = dbcsCode; // There's already a sequence, set a single-char subsequence of it.
    else if (bucket[low] == UNASSIGNED)
        bucket[low] = dbcsCode;
}

DBCSCodec.prototype._setEncodeSequence = function(seq, dbcsCode) {
    
    // Get the root of character tree according to first character of the sequence.
    var uCode = seq[0];
    var bucket = this._getEncodeBucket(uCode);
    var low = uCode & 0xFF;

    var node;
    if (bucket[low] <= SEQ_START) {
        // There's already a sequence with  - use it.
        node = this.encodeTableSeq[SEQ_START-bucket[low]];
    }
    else {
        // There was no sequence object - allocate a new one.
        node = {};
        if (bucket[low] !== UNASSIGNED) node[DEF_CHAR] = bucket[low]; // If a char was set before - make it a single-char subsequence.
        bucket[low] = SEQ_START - this.encodeTableSeq.length;
        this.encodeTableSeq.push(node);
    }

    // Traverse the character tree, allocating new nodes as needed.
    for (var j = 1; j < seq.length-1; j++) {
        var oldVal = node[uCode];
        if (typeof oldVal === 'object')
            node = oldVal;
        else {
            node = node[uCode] = {}
            if (oldVal !== undefined)
                node[DEF_CHAR] = oldVal
        }
    }

    // Set the leaf to given dbcsCode.
    uCode = seq[seq.length-1];
    node[uCode] = dbcsCode;
}

DBCSCodec.prototype._fillEncodeTable = function(nodeIdx, prefix, skipEncodeChars) {
    var node = this.decodeTables[nodeIdx];
    var hasValues = false;
    var subNodeEmpty = {};
    for (var i = 0; i < 0x100; i++) {
        var uCode = node[i];
        var mbCode = prefix + i;
        if (skipEncodeChars[mbCode])
            continue;

        if (uCode >= 0) {
            this._setEncodeChar(uCode, mbCode);
            hasValues = true;
        } else if (uCode <= NODE_START) {
            var subNodeIdx = NODE_START - uCode;
            if (!subNodeEmpty[subNodeIdx]) {  // Skip empty subtrees (they are too large in gb18030).
                var newPrefix = (mbCode << 8) >>> 0;  // NOTE: '>>> 0' keeps 32-bit num positive.
                if (this._fillEncodeTable(subNodeIdx, newPrefix, skipEncodeChars))
                    hasValues = true;
                else
                    subNodeEmpty[subNodeIdx] = true;
            }
        } else if (uCode <= SEQ_START) {
            this._setEncodeSequence(this.decodeTableSeq[SEQ_START - uCode], mbCode);
            hasValues = true;
        }
    }
    return hasValues;
}



// == Encoder ==================================================================

function DBCSEncoder(options, codec) {
    // Encoder state
    this.leadSurrogate = -1;
    this.seqObj = undefined;
    
    // Static data
    this.encodeTable = codec.encodeTable;
    this.encodeTableSeq = codec.encodeTableSeq;
    this.defaultCharSingleByte = codec.defCharSB;
    this.gb18030 = codec.gb18030;
}

DBCSEncoder.prototype.write = function(str) {
    var newBuf = Buffer.alloc(str.length * (this.gb18030 ? 4 : 3)),
        leadSurrogate = this.leadSurrogate,
        seqObj = this.seqObj, nextChar = -1,
        i = 0, j = 0;

    while (true) {
        // 0. Get next character.
        if (nextChar === -1) {
            if (i == str.length) break;
            var uCode = str.charCodeAt(i++);
        }
        else {
            var uCode = nextChar;
            nextChar = -1;    
        }

        // 1. Handle surrogates.
        if (0xD800 <= uCode && uCode < 0xE000) { // Char is one of surrogates.
            if (uCode < 0xDC00) { // We've got lead surrogate.
                if (leadSurrogate === -1) {
                    leadSurrogate = uCode;
                    continue;
                } else {
                    leadSurrogate = uCode;
                    // Double lead surrogate found.
                    uCode = UNASSIGNED;
                }
            } else { // We've got trail surrogate.
                if (leadSurrogate !== -1) {
                    uCode = 0x10000 + (leadSurrogate - 0xD800) * 0x400 + (uCode - 0xDC00);
                    leadSurrogate = -1;
                } else {
                    // Incomplete surrogate pair - only trail surrogate found.
                    uCode = UNASSIGNED;
                }
                
            }
        }
        else if (leadSurrogate !== -1) {
            // Incomplete surrogate pair - only lead surrogate found.
            nextChar = uCode; uCode = UNASSIGNED; // Write an error, then current char.
            leadSurrogate = -1;
        }

        // 2. Convert uCode character.
        var dbcsCode = UNASSIGNED;
        if (seqObj !== undefined && uCode != UNASSIGNED) { // We are in the middle of the sequence
            var resCode = seqObj[uCode];
            if (typeof resCode === 'object') { // Sequence continues.
                seqObj = resCode;
                continue;

            } else if (typeof resCode == 'number') { // Sequence finished. Write it.
                dbcsCode = resCode;

            } else if (resCode == undefined) { // Current character is not part of the sequence.

                // Try default character for this sequence
                resCode = seqObj[DEF_CHAR];
                if (resCode !== undefined) {
                    dbcsCode = resCode; // Found. Write it.
                    nextChar = uCode; // Current character will be written too in the next iteration.

                } else {
                    // TODO: What if we have no default? (resCode == undefined)
                    // Then, we should write first char of the sequence as-is and try the rest recursively.
                    // Didn't do it for now because no encoding has this situation yet.
                    // Currently, just skip the sequence and write current char.
                }
            }
            seqObj = undefined;
        }
        else if (uCode >= 0) {  // Regular character
            var subtable = this.encodeTable[uCode >> 8];
            if (subtable !== undefined)
                dbcsCode = subtable[uCode & 0xFF];
            
            if (dbcsCode <= SEQ_START) { // Sequence start
                seqObj = this.encodeTableSeq[SEQ_START-dbcsCode];
                continue;
            }

            if (dbcsCode == UNASSIGNED && this.gb18030) {
                // Use GB18030 algorithm to find character(s) to write.
                var idx = findIdx(this.gb18030.uChars, uCode);
                if (idx != -1) {
                    var dbcsCode = this.gb18030.gbChars[idx] + (uCode - this.gb18030.uChars[idx]);
                    newBuf[j++] = 0x81 + Math.floor(dbcsCode / 12600); dbcsCode = dbcsCode % 12600;
                    newBuf[j++] = 0x30 + Math.floor(dbcsCode / 1260); dbcsCode = dbcsCode % 1260;
                    newBuf[j++] = 0x81 + Math.floor(dbcsCode / 10); dbcsCode = dbcsCode % 10;
                    newBuf[j++] = 0x30 + dbcsCode;
                    continue;
                }
            }
        }

        // 3. Write dbcsCode character.
        if (dbcsCode === UNASSIGNED)
            dbcsCode = this.defaultCharSingleByte;
        
        if (dbcsCode < 0x100) {
            newBuf[j++] = dbcsCode;
        }
        else if (dbcsCode < 0x10000) {
            newBuf[j++] = dbcsCode >> 8;   // high byte
            newBuf[j++] = dbcsCode & 0xFF; // low byte
        }
        else if (dbcsCode < 0x1000000) {
            newBuf[j++] = dbcsCode >> 16;
            newBuf[j++] = (dbcsCode >> 8) & 0xFF;
            newBuf[j++] = dbcsCode & 0xFF;
        } else {
            newBuf[j++] = dbcsCode >>> 24;
            newBuf[j++] = (dbcsCode >>> 16) & 0xFF;
            newBuf[j++] = (dbcsCode >>> 8) & 0xFF;
            newBuf[j++] = dbcsCode & 0xFF;
        }
    }

    this.seqObj = seqObj;
    this.leadSurrogate = leadSurrogate;
    return newBuf.slice(0, j);
}

DBCSEncoder.prototype.end = function() {
    if (this.leadSurrogate === -1 && this.seqObj === undefined)
        return; // All clean. Most often case.

    var newBuf = Buffer.alloc(10), j = 0;

    if (this.seqObj) { // We're in the sequence.
        var dbcsCode = this.seqObj[DEF_CHAR];
        if (dbcsCode !== undefined) { // Write beginning of the sequence.
            if (dbcsCode < 0x100) {
                newBuf[j++] = dbcsCode;
            }
            else {
                newBuf[j++] = dbcsCode >> 8;   // high byte
                newBuf[j++] = dbcsCode & 0xFF; // low byte
            }
        } else {
            // See todo above.
        }
        this.seqObj = undefined;
    }

    if (this.leadSurrogate !== -1) {
        // Incomplete surrogate pair - only lead surrogate found.
        newBuf[j++] = this.defaultCharSingleByte;
        this.leadSurrogate = -1;
    }
    
    return newBuf.slice(0, j);
}

// Export for testing
DBCSEncoder.prototype.findIdx = findIdx;


// == Decoder ==================================================================

function DBCSDecoder(options, codec) {
    // Decoder state
    this.nodeIdx = 0;
    this.prevBytes = [];

    // Static data
    this.decodeTables = codec.decodeTables;
    this.decodeTableSeq = codec.decodeTableSeq;
    this.defaultCharUnicode = codec.defaultCharUnicode;
    this.gb18030 = codec.gb18030;
}

DBCSDecoder.prototype.write = function(buf) {
    var newBuf = Buffer.alloc(buf.length*2),
        nodeIdx = this.nodeIdx, 
        prevBytes = this.prevBytes, prevOffset = this.prevBytes.length,
        seqStart = -this.prevBytes.length, // idx of the start of current parsed sequence.
        uCode;

    for (var i = 0, j = 0; i < buf.length; i++) {
        var curByte = (i >= 0) ? buf[i] : prevBytes[i + prevOffset];

        // Lookup in current trie node.
        var uCode = this.decodeTables[nodeIdx][curByte];

        if (uCode >= 0) { 
            // Normal character, just use it.
        }
        else if (uCode === UNASSIGNED) { // Unknown char.
            // TODO: Callback with seq.
            uCode = this.defaultCharUnicode.charCodeAt(0);
            i = seqStart; // Skip one byte ('i' will be incremented by the for loop) and try to parse again.
        }
        else if (uCode === GB18030_CODE) {
            if (i >= 3) {
                var ptr = (buf[i-3]-0x81)*12600 + (buf[i-2]-0x30)*1260 + (buf[i-1]-0x81)*10 + (curByte-0x30);
            } else {
                var ptr = (prevBytes[i-3+prevOffset]-0x81)*12600 + 
                          (((i-2 >= 0) ? buf[i-2] : prevBytes[i-2+prevOffset])-0x30)*1260 + 
                          (((i-1 >= 0) ? buf[i-1] : prevBytes[i-1+prevOffset])-0x81)*10 + 
                          (curByte-0x30);
            }
            var idx = findIdx(this.gb18030.gbChars, ptr);
            uCode = this.gb18030.uChars[idx] + ptr - this.gb18030.gbChars[idx];
        }
        else if (uCode <= NODE_START) { // Go to next trie node.
            nodeIdx = NODE_START - uCode;
            continue;
        }
        else if (uCode <= SEQ_START) { // Output a sequence of chars.
            var seq = this.decodeTableSeq[SEQ_START - uCode];
            for (var k = 0; k < seq.length - 1; k++) {
                uCode = seq[k];
                newBuf[j++] = uCode & 0xFF;
                newBuf[j++] = uCode >> 8;
            }
            uCode = seq[seq.length-1];
        }
        else
            throw new Error("iconv-lite internal error: invalid decoding table value " + uCode + " at " + nodeIdx + "/" + curByte);

        // Write the character to buffer, handling higher planes using surrogate pair.
        if (uCode >= 0x10000) { 
            uCode -= 0x10000;
            var uCodeLead = 0xD800 | (uCode >> 10);
            newBuf[j++] = uCodeLead & 0xFF;
            newBuf[j++] = uCodeLead >> 8;

            uCode = 0xDC00 | (uCode & 0x3FF);
        }
        newBuf[j++] = uCode & 0xFF;
        newBuf[j++] = uCode >> 8;

        // Reset trie node.
        nodeIdx = 0; seqStart = i+1;
    }

    this.nodeIdx = nodeIdx;
    this.prevBytes = (seqStart >= 0)
        ? Array.prototype.slice.call(buf, seqStart)
        : prevBytes.slice(seqStart + prevOffset).concat(Array.prototype.slice.call(buf));

    return newBuf.slice(0, j).toString('ucs2');
}

DBCSDecoder.prototype.end = function() {
    var ret = '';

    // Try to parse all remaining chars.
    while (this.prevBytes.length > 0) {
        // Skip 1 character in the buffer.
        ret += this.defaultCharUnicode;
        var bytesArr = this.prevBytes.slice(1);

        // Parse remaining as usual.
        this.prevBytes = [];
        this.nodeIdx = 0;
        if (bytesArr.length > 0)
            ret += this.write(bytesArr);
    }

    this.prevBytes = [];
    this.nodeIdx = 0;
    return ret;
}

// Binary search for GB18030. Returns largest i such that table[i] <= val.
function findIdx(table, val) {
    if (table[0] > val)
        return -1;

    var l = 0, r = table.length;
    while (l < r-1) { // always table[l] <= val < table[r]
        var mid = l + ((r-l+1) >> 1);
        if (table[mid] <= val)
            l = mid;
        else
            r = mid;
    }
    return l;
}


},{"safer-buffer":60}],25:[function(require,module,exports){
"use strict";

// Description of supported double byte encodings and aliases.
// Tables are not require()-d until they are needed to speed up library load.
// require()-s are direct to support Browserify.

module.exports = {
    
    // == Japanese/ShiftJIS ====================================================
    // All japanese encodings are based on JIS X set of standards:
    // JIS X 0201 - Single-byte encoding of ASCII + ¥ + Kana chars at 0xA1-0xDF.
    // JIS X 0208 - Main set of 6879 characters, placed in 94x94 plane, to be encoded by 2 bytes. 
    //              Has several variations in 1978, 1983, 1990 and 1997.
    // JIS X 0212 - Supplementary plane of 6067 chars in 94x94 plane. 1990. Effectively dead.
    // JIS X 0213 - Extension and modern replacement of 0208 and 0212. Total chars: 11233.
    //              2 planes, first is superset of 0208, second - revised 0212.
    //              Introduced in 2000, revised 2004. Some characters are in Unicode Plane 2 (0x2xxxx)

    // Byte encodings are:
    //  * Shift_JIS: Compatible with 0201, uses not defined chars in top half as lead bytes for double-byte
    //               encoding of 0208. Lead byte ranges: 0x81-0x9F, 0xE0-0xEF; Trail byte ranges: 0x40-0x7E, 0x80-0x9E, 0x9F-0xFC.
    //               Windows CP932 is a superset of Shift_JIS. Some companies added more chars, notably KDDI.
    //  * EUC-JP:    Up to 3 bytes per character. Used mostly on *nixes.
    //               0x00-0x7F       - lower part of 0201
    //               0x8E, 0xA1-0xDF - upper part of 0201
    //               (0xA1-0xFE)x2   - 0208 plane (94x94).
    //               0x8F, (0xA1-0xFE)x2 - 0212 plane (94x94).
    //  * JIS X 208: 7-bit, direct encoding of 0208. Byte ranges: 0x21-0x7E (94 values). Uncommon.
    //               Used as-is in ISO2022 family.
    //  * ISO2022-JP: Stateful encoding, with escape sequences to switch between ASCII, 
    //                0201-1976 Roman, 0208-1978, 0208-1983.
    //  * ISO2022-JP-1: Adds esc seq for 0212-1990.
    //  * ISO2022-JP-2: Adds esc seq for GB2313-1980, KSX1001-1992, ISO8859-1, ISO8859-7.
    //  * ISO2022-JP-3: Adds esc seq for 0201-1976 Kana set, 0213-2000 Planes 1, 2.
    //  * ISO2022-JP-2004: Adds 0213-2004 Plane 1.
    //
    // After JIS X 0213 appeared, Shift_JIS-2004, EUC-JISX0213 and ISO2022-JP-2004 followed, with just changing the planes.
    //
    // Overall, it seems that it's a mess :( http://www8.plala.or.jp/tkubota1/unicode-symbols-map2.html

    'shiftjis': {
        type: '_dbcs',
        table: function() { return require('./tables/shiftjis.json') },
        encodeAdd: {'\u00a5': 0x5C, '\u203E': 0x7E},
        encodeSkipVals: [{from: 0xED40, to: 0xF940}],
    },
    'csshiftjis': 'shiftjis',
    'mskanji': 'shiftjis',
    'sjis': 'shiftjis',
    'windows31j': 'shiftjis',
    'ms31j': 'shiftjis',
    'xsjis': 'shiftjis',
    'windows932': 'shiftjis',
    'ms932': 'shiftjis',
    '932': 'shiftjis',
    'cp932': 'shiftjis',

    'eucjp': {
        type: '_dbcs',
        table: function() { return require('./tables/eucjp.json') },
        encodeAdd: {'\u00a5': 0x5C, '\u203E': 0x7E},
    },

    // TODO: KDDI extension to Shift_JIS
    // TODO: IBM CCSID 942 = CP932, but F0-F9 custom chars and other char changes.
    // TODO: IBM CCSID 943 = Shift_JIS = CP932 with original Shift_JIS lower 128 chars.


    // == Chinese/GBK ==========================================================
    // http://en.wikipedia.org/wiki/GBK
    // We mostly implement W3C recommendation: https://www.w3.org/TR/encoding/#gbk-encoder

    // Oldest GB2312 (1981, ~7600 chars) is a subset of CP936
    'gb2312': 'cp936',
    'gb231280': 'cp936',
    'gb23121980': 'cp936',
    'csgb2312': 'cp936',
    'csiso58gb231280': 'cp936',
    'euccn': 'cp936',

    // Microsoft's CP936 is a subset and approximation of GBK.
    'windows936': 'cp936',
    'ms936': 'cp936',
    '936': 'cp936',
    'cp936': {
        type: '_dbcs',
        table: function() { return require('./tables/cp936.json') },
    },

    // GBK (~22000 chars) is an extension of CP936 that added user-mapped chars and some other.
    'gbk': {
        type: '_dbcs',
        table: function() { return require('./tables/cp936.json').concat(require('./tables/gbk-added.json')) },
    },
    'xgbk': 'gbk',
    'isoir58': 'gbk',

    // GB18030 is an algorithmic extension of GBK.
    // Main source: https://www.w3.org/TR/encoding/#gbk-encoder
    // http://icu-project.org/docs/papers/gb18030.html
    // http://source.icu-project.org/repos/icu/data/trunk/charset/data/xml/gb-18030-2000.xml
    // http://www.khngai.com/chinese/charmap/tblgbk.php?page=0
    'gb18030': {
        type: '_dbcs',
        table: function() { return require('./tables/cp936.json').concat(require('./tables/gbk-added.json')) },
        gb18030: function() { return require('./tables/gb18030-ranges.json') },
        encodeSkipVals: [0x80],
        encodeAdd: {'€': 0xA2E3},
    },

    'chinese': 'gb18030',


    // == Korean ===============================================================
    // EUC-KR, KS_C_5601 and KS X 1001 are exactly the same.
    'windows949': 'cp949',
    'ms949': 'cp949',
    '949': 'cp949',
    'cp949': {
        type: '_dbcs',
        table: function() { return require('./tables/cp949.json') },
    },

    'cseuckr': 'cp949',
    'csksc56011987': 'cp949',
    'euckr': 'cp949',
    'isoir149': 'cp949',
    'korean': 'cp949',
    'ksc56011987': 'cp949',
    'ksc56011989': 'cp949',
    'ksc5601': 'cp949',


    // == Big5/Taiwan/Hong Kong ================================================
    // There are lots of tables for Big5 and cp950. Please see the following links for history:
    // http://moztw.org/docs/big5/  http://www.haible.de/bruno/charsets/conversion-tables/Big5.html
    // Variations, in roughly number of defined chars:
    //  * Windows CP 950: Microsoft variant of Big5. Canonical: http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP950.TXT
    //  * Windows CP 951: Microsoft variant of Big5-HKSCS-2001. Seems to be never public. http://me.abelcheung.org/articles/research/what-is-cp951/
    //  * Big5-2003 (Taiwan standard) almost superset of cp950.
    //  * Unicode-at-on (UAO) / Mozilla 1.8. Falling out of use on the Web. Not supported by other browsers.
    //  * Big5-HKSCS (-2001, -2004, -2008). Hong Kong standard. 
    //    many unicode code points moved from PUA to Supplementary plane (U+2XXXX) over the years.
    //    Plus, it has 4 combining sequences.
    //    Seems that Mozilla refused to support it for 10 yrs. https://bugzilla.mozilla.org/show_bug.cgi?id=162431 https://bugzilla.mozilla.org/show_bug.cgi?id=310299
    //    because big5-hkscs is the only encoding to include astral characters in non-algorithmic way.
    //    Implementations are not consistent within browsers; sometimes labeled as just big5.
    //    MS Internet Explorer switches from big5 to big5-hkscs when a patch applied.
    //    Great discussion & recap of what's going on https://bugzilla.mozilla.org/show_bug.cgi?id=912470#c31
    //    In the encoder, it might make sense to support encoding old PUA mappings to Big5 bytes seq-s.
    //    Official spec: http://www.ogcio.gov.hk/en/business/tech_promotion/ccli/terms/doc/2003cmp_2008.txt
    //                   http://www.ogcio.gov.hk/tc/business/tech_promotion/ccli/terms/doc/hkscs-2008-big5-iso.txt
    // 
    // Current understanding of how to deal with Big5(-HKSCS) is in the Encoding Standard, http://encoding.spec.whatwg.org/#big5-encoder
    // Unicode mapping (http://www.unicode.org/Public/MAPPINGS/OBSOLETE/EASTASIA/OTHER/BIG5.TXT) is said to be wrong.

    'windows950': 'cp950',
    'ms950': 'cp950',
    '950': 'cp950',
    'cp950': {
        type: '_dbcs',
        table: function() { return require('./tables/cp950.json') },
    },

    // Big5 has many variations and is an extension of cp950. We use Encoding Standard's as a consensus.
    'big5': 'big5hkscs',
    'big5hkscs': {
        type: '_dbcs',
        table: function() { return require('./tables/cp950.json').concat(require('./tables/big5-added.json')) },
        encodeSkipVals: [
            // Although Encoding Standard says we should avoid encoding to HKSCS area (See Step 1 of
            // https://encoding.spec.whatwg.org/#index-big5-pointer), we still do it to increase compatibility with ICU.
            // But if a single unicode point can be encoded both as HKSCS and regular Big5, we prefer the latter.
            0x8e69, 0x8e6f, 0x8e7e, 0x8eab, 0x8eb4, 0x8ecd, 0x8ed0, 0x8f57, 0x8f69, 0x8f6e, 0x8fcb, 0x8ffe,
            0x906d, 0x907a, 0x90c4, 0x90dc, 0x90f1, 0x91bf, 0x92af, 0x92b0, 0x92b1, 0x92b2, 0x92d1, 0x9447, 0x94ca,
            0x95d9, 0x96fc, 0x9975, 0x9b76, 0x9b78, 0x9b7b, 0x9bc6, 0x9bde, 0x9bec, 0x9bf6, 0x9c42, 0x9c53, 0x9c62,
            0x9c68, 0x9c6b, 0x9c77, 0x9cbc, 0x9cbd, 0x9cd0, 0x9d57, 0x9d5a, 0x9dc4, 0x9def, 0x9dfb, 0x9ea9, 0x9eef,
            0x9efd, 0x9f60, 0x9fcb, 0xa077, 0xa0dc, 0xa0df, 0x8fcc, 0x92c8, 0x9644, 0x96ed,

            // Step 2 of https://encoding.spec.whatwg.org/#index-big5-pointer: Use last pointer for U+2550, U+255E, U+2561, U+256A, U+5341, or U+5345
            0xa2a4, 0xa2a5, 0xa2a7, 0xa2a6, 0xa2cc, 0xa2ce,
        ],
    },

    'cnbig5': 'big5hkscs',
    'csbig5': 'big5hkscs',
    'xxbig5': 'big5hkscs',
};

},{"./tables/big5-added.json":31,"./tables/cp936.json":32,"./tables/cp949.json":33,"./tables/cp950.json":34,"./tables/eucjp.json":35,"./tables/gb18030-ranges.json":36,"./tables/gbk-added.json":37,"./tables/shiftjis.json":38}],26:[function(require,module,exports){
"use strict";

// Update this array if you add/rename/remove files in this directory.
// We support Browserify by skipping automatic module discovery and requiring modules directly.
var modules = [
    require("./internal"),
    require("./utf32"),
    require("./utf16"),
    require("./utf7"),
    require("./sbcs-codec"),
    require("./sbcs-data"),
    require("./sbcs-data-generated"),
    require("./dbcs-codec"),
    require("./dbcs-data"),
];

// Put all encoding/alias/codec definitions to single object and export it.
for (var i = 0; i < modules.length; i++) {
    var module = modules[i];
    for (var enc in module)
        if (Object.prototype.hasOwnProperty.call(module, enc))
            exports[enc] = module[enc];
}

},{"./dbcs-codec":24,"./dbcs-data":25,"./internal":27,"./sbcs-codec":28,"./sbcs-data":30,"./sbcs-data-generated":29,"./utf16":39,"./utf32":40,"./utf7":41}],27:[function(require,module,exports){
"use strict";
var Buffer = require("safer-buffer").Buffer;

// Export Node.js internal encodings.

module.exports = {
    // Encodings
    utf8:   { type: "_internal", bomAware: true},
    cesu8:  { type: "_internal", bomAware: true},
    unicode11utf8: "utf8",

    ucs2:   { type: "_internal", bomAware: true},
    utf16le: "ucs2",

    binary: { type: "_internal" },
    base64: { type: "_internal" },
    hex:    { type: "_internal" },

    // Codec.
    _internal: InternalCodec,
};

//------------------------------------------------------------------------------

function InternalCodec(codecOptions, iconv) {
    this.enc = codecOptions.encodingName;
    this.bomAware = codecOptions.bomAware;

    if (this.enc === "base64")
        this.encoder = InternalEncoderBase64;
    else if (this.enc === "cesu8") {
        this.enc = "utf8"; // Use utf8 for decoding.
        this.encoder = InternalEncoderCesu8;

        // Add decoder for versions of Node not supporting CESU-8
        if (Buffer.from('eda0bdedb2a9', 'hex').toString() !== '💩') {
            this.decoder = InternalDecoderCesu8;
            this.defaultCharUnicode = iconv.defaultCharUnicode;
        }
    }
}

InternalCodec.prototype.encoder = InternalEncoder;
InternalCodec.prototype.decoder = InternalDecoder;

//------------------------------------------------------------------------------

// We use node.js internal decoder. Its signature is the same as ours.
var StringDecoder = require('string_decoder').StringDecoder;

if (!StringDecoder.prototype.end) // Node v0.8 doesn't have this method.
    StringDecoder.prototype.end = function() {};


function InternalDecoder(options, codec) {
    this.decoder = new StringDecoder(codec.enc);
}

InternalDecoder.prototype.write = function(buf) {
    if (!Buffer.isBuffer(buf)) {
        buf = Buffer.from(buf);
    }

    return this.decoder.write(buf);
}

InternalDecoder.prototype.end = function() {
    return this.decoder.end();
}


//------------------------------------------------------------------------------
// Encoder is mostly trivial

function InternalEncoder(options, codec) {
    this.enc = codec.enc;
}

InternalEncoder.prototype.write = function(str) {
    return Buffer.from(str, this.enc);
}

InternalEncoder.prototype.end = function() {
}


//------------------------------------------------------------------------------
// Except base64 encoder, which must keep its state.

function InternalEncoderBase64(options, codec) {
    this.prevStr = '';
}

InternalEncoderBase64.prototype.write = function(str) {
    str = this.prevStr + str;
    var completeQuads = str.length - (str.length % 4);
    this.prevStr = str.slice(completeQuads);
    str = str.slice(0, completeQuads);

    return Buffer.from(str, "base64");
}

InternalEncoderBase64.prototype.end = function() {
    return Buffer.from(this.prevStr, "base64");
}


//------------------------------------------------------------------------------
// CESU-8 encoder is also special.

function InternalEncoderCesu8(options, codec) {
}

InternalEncoderCesu8.prototype.write = function(str) {
    var buf = Buffer.alloc(str.length * 3), bufIdx = 0;
    for (var i = 0; i < str.length; i++) {
        var charCode = str.charCodeAt(i);
        // Naive implementation, but it works because CESU-8 is especially easy
        // to convert from UTF-16 (which all JS strings are encoded in).
        if (charCode < 0x80)
            buf[bufIdx++] = charCode;
        else if (charCode < 0x800) {
            buf[bufIdx++] = 0xC0 + (charCode >>> 6);
            buf[bufIdx++] = 0x80 + (charCode & 0x3f);
        }
        else { // charCode will always be < 0x10000 in javascript.
            buf[bufIdx++] = 0xE0 + (charCode >>> 12);
            buf[bufIdx++] = 0x80 + ((charCode >>> 6) & 0x3f);
            buf[bufIdx++] = 0x80 + (charCode & 0x3f);
        }
    }
    return buf.slice(0, bufIdx);
}

InternalEncoderCesu8.prototype.end = function() {
}

//------------------------------------------------------------------------------
// CESU-8 decoder is not implemented in Node v4.0+

function InternalDecoderCesu8(options, codec) {
    this.acc = 0;
    this.contBytes = 0;
    this.accBytes = 0;
    this.defaultCharUnicode = codec.defaultCharUnicode;
}

InternalDecoderCesu8.prototype.write = function(buf) {
    var acc = this.acc, contBytes = this.contBytes, accBytes = this.accBytes, 
        res = '';
    for (var i = 0; i < buf.length; i++) {
        var curByte = buf[i];
        if ((curByte & 0xC0) !== 0x80) { // Leading byte
            if (contBytes > 0) { // Previous code is invalid
                res += this.defaultCharUnicode;
                contBytes = 0;
            }

            if (curByte < 0x80) { // Single-byte code
                res += String.fromCharCode(curByte);
            } else if (curByte < 0xE0) { // Two-byte code
                acc = curByte & 0x1F;
                contBytes = 1; accBytes = 1;
            } else if (curByte < 0xF0) { // Three-byte code
                acc = curByte & 0x0F;
                contBytes = 2; accBytes = 1;
            } else { // Four or more are not supported for CESU-8.
                res += this.defaultCharUnicode;
            }
        } else { // Continuation byte
            if (contBytes > 0) { // We're waiting for it.
                acc = (acc << 6) | (curByte & 0x3f);
                contBytes--; accBytes++;
                if (contBytes === 0) {
                    // Check for overlong encoding, but support Modified UTF-8 (encoding NULL as C0 80)
                    if (accBytes === 2 && acc < 0x80 && acc > 0)
                        res += this.defaultCharUnicode;
                    else if (accBytes === 3 && acc < 0x800)
                        res += this.defaultCharUnicode;
                    else
                        // Actually add character.
                        res += String.fromCharCode(acc);
                }
            } else { // Unexpected continuation byte
                res += this.defaultCharUnicode;
            }
        }
    }
    this.acc = acc; this.contBytes = contBytes; this.accBytes = accBytes;
    return res;
}

InternalDecoderCesu8.prototype.end = function() {
    var res = 0;
    if (this.contBytes > 0)
        res += this.defaultCharUnicode;
    return res;
}

},{"safer-buffer":60,"string_decoder":63}],28:[function(require,module,exports){
"use strict";
var Buffer = require("safer-buffer").Buffer;

// Single-byte codec. Needs a 'chars' string parameter that contains 256 or 128 chars that
// correspond to encoded bytes (if 128 - then lower half is ASCII). 

exports._sbcs = SBCSCodec;
function SBCSCodec(codecOptions, iconv) {
    if (!codecOptions)
        throw new Error("SBCS codec is called without the data.")
    
    // Prepare char buffer for decoding.
    if (!codecOptions.chars || (codecOptions.chars.length !== 128 && codecOptions.chars.length !== 256))
        throw new Error("Encoding '"+codecOptions.type+"' has incorrect 'chars' (must be of len 128 or 256)");
    
    if (codecOptions.chars.length === 128) {
        var asciiString = "";
        for (var i = 0; i < 128; i++)
            asciiString += String.fromCharCode(i);
        codecOptions.chars = asciiString + codecOptions.chars;
    }

    this.decodeBuf = Buffer.from(codecOptions.chars, 'ucs2');
    
    // Encoding buffer.
    var encodeBuf = Buffer.alloc(65536, iconv.defaultCharSingleByte.charCodeAt(0));

    for (var i = 0; i < codecOptions.chars.length; i++)
        encodeBuf[codecOptions.chars.charCodeAt(i)] = i;

    this.encodeBuf = encodeBuf;
}

SBCSCodec.prototype.encoder = SBCSEncoder;
SBCSCodec.prototype.decoder = SBCSDecoder;


function SBCSEncoder(options, codec) {
    this.encodeBuf = codec.encodeBuf;
}

SBCSEncoder.prototype.write = function(str) {
    var buf = Buffer.alloc(str.length);
    for (var i = 0; i < str.length; i++)
        buf[i] = this.encodeBuf[str.charCodeAt(i)];
    
    return buf;
}

SBCSEncoder.prototype.end = function() {
}


function SBCSDecoder(options, codec) {
    this.decodeBuf = codec.decodeBuf;
}

SBCSDecoder.prototype.write = function(buf) {
    // Strings are immutable in JS -> we use ucs2 buffer to speed up computations.
    var decodeBuf = this.decodeBuf;
    var newBuf = Buffer.alloc(buf.length*2);
    var idx1 = 0, idx2 = 0;
    for (var i = 0; i < buf.length; i++) {
        idx1 = buf[i]*2; idx2 = i*2;
        newBuf[idx2] = decodeBuf[idx1];
        newBuf[idx2+1] = decodeBuf[idx1+1];
    }
    return newBuf.toString('ucs2');
}

SBCSDecoder.prototype.end = function() {
}

},{"safer-buffer":60}],29:[function(require,module,exports){
"use strict";

// Generated data for sbcs codec. Don't edit manually. Regenerate using generation/gen-sbcs.js script.
module.exports = {
  "437": "cp437",
  "737": "cp737",
  "775": "cp775",
  "850": "cp850",
  "852": "cp852",
  "855": "cp855",
  "856": "cp856",
  "857": "cp857",
  "858": "cp858",
  "860": "cp860",
  "861": "cp861",
  "862": "cp862",
  "863": "cp863",
  "864": "cp864",
  "865": "cp865",
  "866": "cp866",
  "869": "cp869",
  "874": "windows874",
  "922": "cp922",
  "1046": "cp1046",
  "1124": "cp1124",
  "1125": "cp1125",
  "1129": "cp1129",
  "1133": "cp1133",
  "1161": "cp1161",
  "1162": "cp1162",
  "1163": "cp1163",
  "1250": "windows1250",
  "1251": "windows1251",
  "1252": "windows1252",
  "1253": "windows1253",
  "1254": "windows1254",
  "1255": "windows1255",
  "1256": "windows1256",
  "1257": "windows1257",
  "1258": "windows1258",
  "28591": "iso88591",
  "28592": "iso88592",
  "28593": "iso88593",
  "28594": "iso88594",
  "28595": "iso88595",
  "28596": "iso88596",
  "28597": "iso88597",
  "28598": "iso88598",
  "28599": "iso88599",
  "28600": "iso885910",
  "28601": "iso885911",
  "28603": "iso885913",
  "28604": "iso885914",
  "28605": "iso885915",
  "28606": "iso885916",
  "windows874": {
    "type": "_sbcs",
    "chars": "€����…�����������‘’“”•–—�������� กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู����฿เแโใไๅๆ็่้๊๋์ํ๎๏๐๑๒๓๔๕๖๗๘๙๚๛����"
  },
  "win874": "windows874",
  "cp874": "windows874",
  "windows1250": {
    "type": "_sbcs",
    "chars": "€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙"
  },
  "win1250": "windows1250",
  "cp1250": "windows1250",
  "windows1251": {
    "type": "_sbcs",
    "chars": "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя"
  },
  "win1251": "windows1251",
  "cp1251": "windows1251",
  "windows1252": {
    "type": "_sbcs",
    "chars": "€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
  },
  "win1252": "windows1252",
  "cp1252": "windows1252",
  "windows1253": {
    "type": "_sbcs",
    "chars": "€�‚ƒ„…†‡�‰�‹�����‘’“”•–—�™�›���� ΅Ά£¤¥¦§¨©�«¬­®―°±²³΄µ¶·ΈΉΊ»Ό½ΎΏΐΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡ�ΣΤΥΦΧΨΩΪΫάέήίΰαβγδεζηθικλμνξοπρςστυφχψωϊϋόύώ�"
  },
  "win1253": "windows1253",
  "cp1253": "windows1253",
  "windows1254": {
    "type": "_sbcs",
    "chars": "€�‚ƒ„…†‡ˆ‰Š‹Œ����‘’“”•–—˜™š›œ��Ÿ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ"
  },
  "win1254": "windows1254",
  "cp1254": "windows1254",
  "windows1255": {
    "type": "_sbcs",
    "chars": "€�‚ƒ„…†‡ˆ‰�‹�����‘’“”•–—˜™�›���� ¡¢£₪¥¦§¨©×«¬­®¯°±²³´µ¶·¸¹÷»¼½¾¿ְֱֲֳִֵֶַָֹֺֻּֽ־ֿ׀ׁׂ׃װױײ׳״�������אבגדהוזחטיךכלםמןנסעףפץצקרשת��‎‏�"
  },
  "win1255": "windows1255",
  "cp1255": "windows1255",
  "windows1256": {
    "type": "_sbcs",
    "chars": "€پ‚ƒ„…†‡ˆ‰ٹ‹Œچژڈگ‘’“”•–—ک™ڑ›œ‌‍ں ،¢£¤¥¦§¨©ھ«¬­®¯°±²³´µ¶·¸¹؛»¼½¾؟ہءآأؤإئابةتثجحخدذرزسشصض×طظعغـفقكàلâمنهوçèéêëىيîïًٌٍَôُِ÷ّùْûü‎‏ے"
  },
  "win1256": "windows1256",
  "cp1256": "windows1256",
  "windows1257": {
    "type": "_sbcs",
    "chars": "€�‚�„…†‡�‰�‹�¨ˇ¸�‘’“”•–—�™�›�¯˛� �¢£¤�¦§Ø©Ŗ«¬­®Æ°±²³´µ¶·ø¹ŗ»¼½¾æĄĮĀĆÄÅĘĒČÉŹĖĢĶĪĻŠŃŅÓŌÕÖ×ŲŁŚŪÜŻŽßąįāćäåęēčéźėģķīļšńņóōõö÷ųłśūüżž˙"
  },
  "win1257": "windows1257",
  "cp1257": "windows1257",
  "windows1258": {
    "type": "_sbcs",
    "chars": "€�‚ƒ„…†‡ˆ‰�‹Œ����‘’“”•–—˜™�›œ��Ÿ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂĂÄÅÆÇÈÉÊË̀ÍÎÏĐÑ̉ÓÔƠÖ×ØÙÚÛÜỮßàáâăäåæçèéêë́íîïđṇ̃óôơö÷øùúûüư₫ÿ"
  },
  "win1258": "windows1258",
  "cp1258": "windows1258",
  "iso88591": {
    "type": "_sbcs",
    "chars": " ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
  },
  "cp28591": "iso88591",
  "iso88592": {
    "type": "_sbcs",
    "chars": " Ą˘Ł¤ĽŚ§¨ŠŞŤŹ­ŽŻ°ą˛ł´ľśˇ¸šşťź˝žżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙"
  },
  "cp28592": "iso88592",
  "iso88593": {
    "type": "_sbcs",
    "chars": " Ħ˘£¤�Ĥ§¨İŞĞĴ­�Ż°ħ²³´µĥ·¸ışğĵ½�żÀÁÂ�ÄĊĈÇÈÉÊËÌÍÎÏ�ÑÒÓÔĠÖ×ĜÙÚÛÜŬŜßàáâ�äċĉçèéêëìíîï�ñòóôġö÷ĝùúûüŭŝ˙"
  },
  "cp28593": "iso88593",
  "iso88594": {
    "type": "_sbcs",
    "chars": " ĄĸŖ¤ĨĻ§¨ŠĒĢŦ­Ž¯°ą˛ŗ´ĩļˇ¸šēģŧŊžŋĀÁÂÃÄÅÆĮČÉĘËĖÍÎĪĐŅŌĶÔÕÖ×ØŲÚÛÜŨŪßāáâãäåæįčéęëėíîīđņōķôõö÷øųúûüũū˙"
  },
  "cp28594": "iso88594",
  "iso88595": {
    "type": "_sbcs",
    "chars": " ЁЂЃЄЅІЇЈЉЊЋЌ­ЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя№ёђѓєѕіїјљњћќ§ўџ"
  },
  "cp28595": "iso88595",
  "iso88596": {
    "type": "_sbcs",
    "chars": " ���¤�������،­�������������؛���؟�ءآأؤإئابةتثجحخدذرزسشصضطظعغ�����ـفقكلمنهوىيًٌٍَُِّْ�������������"
  },
  "cp28596": "iso88596",
  "iso88597": {
    "type": "_sbcs",
    "chars": " ‘’£€₯¦§¨©ͺ«¬­�―°±²³΄΅Ά·ΈΉΊ»Ό½ΎΏΐΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡ�ΣΤΥΦΧΨΩΪΫάέήίΰαβγδεζηθικλμνξοπρςστυφχψωϊϋόύώ�"
  },
  "cp28597": "iso88597",
  "iso88598": {
    "type": "_sbcs",
    "chars": " �¢£¤¥¦§¨©×«¬­®¯°±²³´µ¶·¸¹÷»¼½¾��������������������������������‗אבגדהוזחטיךכלםמןנסעףפץצקרשת��‎‏�"
  },
  "cp28598": "iso88598",
  "iso88599": {
    "type": "_sbcs",
    "chars": " ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ"
  },
  "cp28599": "iso88599",
  "iso885910": {
    "type": "_sbcs",
    "chars": " ĄĒĢĪĨĶ§ĻĐŠŦŽ­ŪŊ°ąēģīĩķ·ļđšŧž―ūŋĀÁÂÃÄÅÆĮČÉĘËĖÍÎÏÐŅŌÓÔÕÖŨØŲÚÛÜÝÞßāáâãäåæįčéęëėíîïðņōóôõöũøųúûüýþĸ"
  },
  "cp28600": "iso885910",
  "iso885911": {
    "type": "_sbcs",
    "chars": " กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู����฿เแโใไๅๆ็่้๊๋์ํ๎๏๐๑๒๓๔๕๖๗๘๙๚๛����"
  },
  "cp28601": "iso885911",
  "iso885913": {
    "type": "_sbcs",
    "chars": " ”¢£¤„¦§Ø©Ŗ«¬­®Æ°±²³“µ¶·ø¹ŗ»¼½¾æĄĮĀĆÄÅĘĒČÉŹĖĢĶĪĻŠŃŅÓŌÕÖ×ŲŁŚŪÜŻŽßąįāćäåęēčéźėģķīļšńņóōõö÷ųłśūüżž’"
  },
  "cp28603": "iso885913",
  "iso885914": {
    "type": "_sbcs",
    "chars": " Ḃḃ£ĊċḊ§Ẁ©ẂḋỲ­®ŸḞḟĠġṀṁ¶ṖẁṗẃṠỳẄẅṡÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏŴÑÒÓÔÕÖṪØÙÚÛÜÝŶßàáâãäåæçèéêëìíîïŵñòóôõöṫøùúûüýŷÿ"
  },
  "cp28604": "iso885914",
  "iso885915": {
    "type": "_sbcs",
    "chars": " ¡¢£€¥Š§š©ª«¬­®¯°±²³Žµ¶·ž¹º»ŒœŸ¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
  },
  "cp28605": "iso885915",
  "iso885916": {
    "type": "_sbcs",
    "chars": " ĄąŁ€„Š§š©Ș«Ź­źŻ°±ČłŽ”¶·žčș»ŒœŸżÀÁÂĂÄĆÆÇÈÉÊËÌÍÎÏĐŃÒÓÔŐÖŚŰÙÚÛÜĘȚßàáâăäćæçèéêëìíîïđńòóôőöśűùúûüęțÿ"
  },
  "cp28606": "iso885916",
  "cp437": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm437": "cp437",
  "csibm437": "cp437",
  "cp737": {
    "type": "_sbcs",
    "chars": "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρσςτυφχψ░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀ωάέήϊίόύϋώΆΈΉΊΌΎΏ±≥≤ΪΫ÷≈°∙·√ⁿ²■ "
  },
  "ibm737": "cp737",
  "csibm737": "cp737",
  "cp775": {
    "type": "_sbcs",
    "chars": "ĆüéāäģåćłēŖŗīŹÄÅÉæÆōöĢ¢ŚśÖÜø£Ø×¤ĀĪóŻżź”¦©®¬½¼Ł«»░▒▓│┤ĄČĘĖ╣║╗╝ĮŠ┐└┴┬├─┼ŲŪ╚╔╩╦╠═╬Žąčęėįšųūž┘┌█▄▌▐▀ÓßŌŃõÕµńĶķĻļņĒŅ’­±“¾¶§÷„°∙·¹³²■ "
  },
  "ibm775": "cp775",
  "csibm775": "cp775",
  "cp850": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ "
  },
  "ibm850": "cp850",
  "csibm850": "cp850",
  "cp852": {
    "type": "_sbcs",
    "chars": "ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´­˝˛ˇ˘§÷¸°¨˙űŘř■ "
  },
  "ibm852": "cp852",
  "csibm852": "cp852",
  "cp855": {
    "type": "_sbcs",
    "chars": "ђЂѓЃёЁєЄѕЅіІїЇјЈљЉњЊћЋќЌўЎџЏюЮъЪаАбБцЦдДеЕфФгГ«»░▒▓│┤хХиИ╣║╗╝йЙ┐└┴┬├─┼кК╚╔╩╦╠═╬¤лЛмМнНоОп┘┌█▄Пя▀ЯрРсСтТуУжЖвВьЬ№­ыЫзЗшШэЭщЩчЧ§■ "
  },
  "ibm855": "cp855",
  "csibm855": "cp855",
  "cp856": {
    "type": "_sbcs",
    "chars": "אבגדהוזחטיךכלםמןנסעףפץצקרשת�£�×����������®¬½¼�«»░▒▓│┤���©╣║╗╝¢¥┐└┴┬├─┼��╚╔╩╦╠═╬¤���������┘┌█▄¦�▀������µ�������¯´­±‗¾¶§÷¸°¨·¹³²■ "
  },
  "ibm856": "cp856",
  "csibm856": "cp856",
  "cp857": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèïîıÄÅÉæÆôöòûùİÖÜø£ØŞşáíóúñÑĞğ¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ºªÊËÈ�ÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµ�×ÚÛÙìÿ¯´­±�¾¶§÷¸°¨·¹³²■ "
  },
  "ibm857": "cp857",
  "csibm857": "cp857",
  "cp858": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈ€ÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ "
  },
  "ibm858": "cp858",
  "csibm858": "cp858",
  "cp860": {
    "type": "_sbcs",
    "chars": "ÇüéâãàÁçêÊèÍÔìÃÂÉÀÈôõòÚùÌÕÜ¢£Ù₧ÓáíóúñÑªº¿Ò¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm860": "cp860",
  "csibm860": "cp860",
  "cp861": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèÐðÞÄÅÉæÆôöþûÝýÖÜø£Ø₧ƒáíóúÁÍÓÚ¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm861": "cp861",
  "csibm861": "cp861",
  "cp862": {
    "type": "_sbcs",
    "chars": "אבגדהוזחטיךכלםמןנסעףפץצקרשת¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm862": "cp862",
  "csibm862": "cp862",
  "cp863": {
    "type": "_sbcs",
    "chars": "ÇüéâÂà¶çêëèïî‗À§ÉÈÊôËÏûù¤ÔÜ¢£ÙÛƒ¦´óú¨¸³¯Î⌐¬½¼¾«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm863": "cp863",
  "csibm863": "cp863",
  "cp864": {
    "type": "_sbcs",
    "chars": "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$٪&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~°·∙√▒─│┼┤┬├┴┐┌└┘β∞φ±½¼≈«»ﻷﻸ��ﻻﻼ� ­ﺂ£¤ﺄ��ﺎﺏﺕﺙ،ﺝﺡﺥ٠١٢٣٤٥٦٧٨٩ﻑ؛ﺱﺵﺹ؟¢ﺀﺁﺃﺅﻊﺋﺍﺑﺓﺗﺛﺟﺣﺧﺩﺫﺭﺯﺳﺷﺻﺿﻁﻅﻋﻏ¦¬÷×ﻉـﻓﻗﻛﻟﻣﻧﻫﻭﻯﻳﺽﻌﻎﻍﻡﹽّﻥﻩﻬﻰﻲﻐﻕﻵﻶﻝﻙﻱ■�"
  },
  "ibm864": "cp864",
  "csibm864": "cp864",
  "cp865": {
    "type": "_sbcs",
    "chars": "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø₧ƒáíóúñÑªº¿⌐¬½¼¡«¤░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  },
  "ibm865": "cp865",
  "csibm865": "cp865",
  "cp866": {
    "type": "_sbcs",
    "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёЄєЇїЎў°∙·√№¤■ "
  },
  "ibm866": "cp866",
  "csibm866": "cp866",
  "cp869": {
    "type": "_sbcs",
    "chars": "������Ά�·¬¦‘’Έ―ΉΊΪΌ��ΎΫ©Ώ²³ά£έήίϊΐόύΑΒΓΔΕΖΗ½ΘΙ«»░▒▓│┤ΚΛΜΝ╣║╗╝ΞΟ┐└┴┬├─┼ΠΡ╚╔╩╦╠═╬ΣΤΥΦΧΨΩαβγ┘┌█▄δε▀ζηθικλμνξοπρσςτ΄­±υφχ§ψ΅°¨ωϋΰώ■ "
  },
  "ibm869": "cp869",
  "csibm869": "cp869",
  "cp922": {
    "type": "_sbcs",
    "chars": " ¡¢£¤¥¦§¨©ª«¬­®‾°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏŠÑÒÓÔÕÖ×ØÙÚÛÜÝŽßàáâãäåæçèéêëìíîïšñòóôõö÷øùúûüýžÿ"
  },
  "ibm922": "cp922",
  "csibm922": "cp922",
  "cp1046": {
    "type": "_sbcs",
    "chars": "ﺈ×÷ﹱ■│─┐┌└┘ﹹﹻﹽﹿﹷﺊﻰﻳﻲﻎﻏﻐﻶﻸﻺﻼ ¤ﺋﺑﺗﺛﺟﺣ،­ﺧﺳ٠١٢٣٤٥٦٧٨٩ﺷ؛ﺻﺿﻊ؟ﻋءآأؤإئابةتثجحخدذرزسشصضطﻇعغﻌﺂﺄﺎﻓـفقكلمنهوىيًٌٍَُِّْﻗﻛﻟﻵﻷﻹﻻﻣﻧﻬﻩ�"
  },
  "ibm1046": "cp1046",
  "csibm1046": "cp1046",
  "cp1124": {
    "type": "_sbcs",
    "chars": " ЁЂҐЄЅІЇЈЉЊЋЌ­ЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя№ёђґєѕіїјљњћќ§ўџ"
  },
  "ibm1124": "cp1124",
  "csibm1124": "cp1124",
  "cp1125": {
    "type": "_sbcs",
    "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёҐґЄєІіЇї·√№¤■ "
  },
  "ibm1125": "cp1125",
  "csibm1125": "cp1125",
  "cp1129": {
    "type": "_sbcs",
    "chars": " ¡¢£¤¥¦§œ©ª«¬­®¯°±²³Ÿµ¶·Œ¹º»¼½¾¿ÀÁÂĂÄÅÆÇÈÉÊË̀ÍÎÏĐÑ̉ÓÔƠÖ×ØÙÚÛÜỮßàáâăäåæçèéêë́íîïđṇ̃óôơö÷øùúûüư₫ÿ"
  },
  "ibm1129": "cp1129",
  "csibm1129": "cp1129",
  "cp1133": {
    "type": "_sbcs",
    "chars": " ກຂຄງຈສຊຍດຕຖທນບປຜຝພຟມຢຣລວຫອຮ���ຯະາຳິີຶືຸູຼັົຽ���ເແໂໃໄ່້໊໋໌ໍໆ�ໜໝ₭����������������໐໑໒໓໔໕໖໗໘໙��¢¬¦�"
  },
  "ibm1133": "cp1133",
  "csibm1133": "cp1133",
  "cp1161": {
    "type": "_sbcs",
    "chars": "��������������������������������่กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู้๊๋€฿เแโใไๅๆ็่้๊๋์ํ๎๏๐๑๒๓๔๕๖๗๘๙๚๛¢¬¦ "
  },
  "ibm1161": "cp1161",
  "csibm1161": "cp1161",
  "cp1162": {
    "type": "_sbcs",
    "chars": "€…‘’“”•–— กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู����฿เแโใไๅๆ็่้๊๋์ํ๎๏๐๑๒๓๔๕๖๗๘๙๚๛����"
  },
  "ibm1162": "cp1162",
  "csibm1162": "cp1162",
  "cp1163": {
    "type": "_sbcs",
    "chars": " ¡¢£€¥¦§œ©ª«¬­®¯°±²³Ÿµ¶·Œ¹º»¼½¾¿ÀÁÂĂÄÅÆÇÈÉÊË̀ÍÎÏĐÑ̉ÓÔƠÖ×ØÙÚÛÜỮßàáâăäåæçèéêë́íîïđṇ̃óôơö÷øùúûüư₫ÿ"
  },
  "ibm1163": "cp1163",
  "csibm1163": "cp1163",
  "maccroatian": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®Š™´¨≠ŽØ∞±≤≥∆µ∂∑∏š∫ªºΩžø¿¡¬√ƒ≈Ć«Č… ÀÃÕŒœĐ—“”‘’÷◊�©⁄¤‹›Æ»–·‚„‰ÂćÁčÈÍÎÏÌÓÔđÒÚÛÙıˆ˜¯πË˚¸Êæˇ"
  },
  "maccyrillic": {
    "type": "_sbcs",
    "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ†°¢£§•¶І®©™Ђђ≠Ѓѓ∞±≤≥іµ∂ЈЄєЇїЉљЊњјЅ¬√ƒ≈∆«»… ЋћЌќѕ–—“”‘’÷„ЎўЏџ№Ёёяабвгдежзийклмнопрстуфхцчшщъыьэю¤"
  },
  "macgreek": {
    "type": "_sbcs",
    "chars": "Ä¹²É³ÖÜ΅àâä΄¨çéèêë£™îï•½‰ôö¦­ùûü†ΓΔΘΛΞΠß®©ΣΪ§≠°·Α±≤≥¥ΒΕΖΗΙΚΜΦΫΨΩάΝ¬ΟΡ≈Τ«»… ΥΧΆΈœ–―“”‘’÷ΉΊΌΎέήίόΏύαβψδεφγηιξκλμνοπώρστθωςχυζϊϋΐΰ�"
  },
  "maciceland": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûüÝ°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤ÐðÞþý·‚„‰ÂÊÁËÈÍÎÏÌÓÔ�ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ"
  },
  "macroman": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ�ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ"
  },
  "macromania": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ĂŞ∞±≤≥¥µ∂∑∏π∫ªºΩăş¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›Ţţ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ�ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ"
  },
  "macthai": {
    "type": "_sbcs",
    "chars": "«»…“”�•‘’� กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู﻿​–—฿เแโใไๅๆ็่้๊๋์ํ™๏๐๑๒๓๔๕๖๗๘๙®©����"
  },
  "macturkish": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸĞğİıŞş‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ�ÒÚÛÙ�ˆ˜¯˘˙˚¸˝˛ˇ"
  },
  "macukraine": {
    "type": "_sbcs",
    "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ†°Ґ£§•¶І®©™Ђђ≠Ѓѓ∞±≤≥іµґЈЄєЇїЉљЊњјЅ¬√ƒ≈∆«»… ЋћЌќѕ–—“”‘’÷„ЎўЏџ№Ёёяабвгдежзийклмнопрстуфхцчшщъыьэю¤"
  },
  "koi8r": {
    "type": "_sbcs",
    "chars": "─│┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓⌠■∙√≈≤≥ ⌡°²·÷═║╒ё╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡Ё╢╣╤╥╦╧╨╩╪╫╬©юабцдефгхийклмнопярстужвьызшэщчъЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧЪ"
  },
  "koi8u": {
    "type": "_sbcs",
    "chars": "─│┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓⌠■∙√≈≤≥ ⌡°²·÷═║╒ёє╔ії╗╘╙╚╛ґ╝╞╟╠╡ЁЄ╣ІЇ╦╧╨╩╪Ґ╬©юабцдефгхийклмнопярстужвьызшэщчъЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧЪ"
  },
  "koi8ru": {
    "type": "_sbcs",
    "chars": "─│┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓⌠■∙√≈≤≥ ⌡°²·÷═║╒ёє╔ії╗╘╙╚╛ґў╞╟╠╡ЁЄ╣ІЇ╦╧╨╩╪ҐЎ©юабцдефгхийклмнопярстужвьызшэщчъЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧЪ"
  },
  "koi8t": {
    "type": "_sbcs",
    "chars": "қғ‚Ғ„…†‡�‰ҳ‹ҲҷҶ�Қ‘’“”•–—�™�›�����ӯӮё¤ӣ¦§���«¬­®�°±²Ё�Ӣ¶·�№�»���©юабцдефгхийклмнопярстужвьызшэщчъЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧЪ"
  },
  "armscii8": {
    "type": "_sbcs",
    "chars": " �և։)(»«—.՝,-֊…՜՛՞ԱաԲբԳգԴդԵեԶզԷէԸըԹթԺժԻիԼլԽխԾծԿկՀհՁձՂղՃճՄմՅյՆնՇշՈոՉչՊպՋջՌռՍսՎվՏտՐրՑցՒւՓփՔքՕօՖֆ՚�"
  },
  "rk1048": {
    "type": "_sbcs",
    "chars": "ЂЃ‚ѓ„…†‡€‰Љ‹ЊҚҺЏђ‘’“”•–—�™љ›њқһџ ҰұӘ¤Ө¦§Ё©Ғ«¬­®Ү°±Ііөµ¶·ё№ғ»әҢңүАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя"
  },
  "tcvn": {
    "type": "_sbcs",
    "chars": "\u0000ÚỤ\u0003ỪỬỮ\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010ỨỰỲỶỸÝỴ\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÀẢÃÁẠẶẬÈẺẼÉẸỆÌỈĨÍỊÒỎÕÓỌỘỜỞỠỚỢÙỦŨ ĂÂÊÔƠƯĐăâêôơưđẶ̀̀̉̃́àảãáạẲằẳẵắẴẮẦẨẪẤỀặầẩẫấậèỂẻẽéẹềểễếệìỉỄẾỒĩíịòỔỏõóọồổỗốộờởỡớợùỖủũúụừửữứựỳỷỹýỵỐ"
  },
  "georgianacademy": {
    "type": "_sbcs",
    "chars": "‚ƒ„…†‡ˆ‰Š‹Œ‘’“”•–—˜™š›œŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
  },
  "georgianps": {
    "type": "_sbcs",
    "chars": "‚ƒ„…†‡ˆ‰Š‹Œ‘’“”•–—˜™š›œŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿აბგდევზჱთიკლმნჲოპჟრსტჳუფქღყშჩცძწჭხჴჯჰჵæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
  },
  "pt154": {
    "type": "_sbcs",
    "chars": "ҖҒӮғ„…ҶҮҲүҠӢҢҚҺҸҗ‘’“”•–—ҳҷҡӣңқһҹ ЎўЈӨҘҰ§Ё©Ә«¬ӯ®Ҝ°ұІіҙө¶·ё№ә»јҪҫҝАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя"
  },
  "viscii": {
    "type": "_sbcs",
    "chars": "\u0000\u0001Ẳ\u0003\u0004ẴẪ\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013Ỷ\u0015\u0016\u0017\u0018Ỹ\u001a\u001b\u001c\u001dỴ\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ẠẮẰẶẤẦẨẬẼẸẾỀỂỄỆỐỒỔỖỘỢỚỜỞỊỎỌỈỦŨỤỲÕắằặấầẩậẽẹếềểễệốồổỗỠƠộờởịỰỨỪỬơớƯÀÁÂÃẢĂẳẵÈÉÊẺÌÍĨỳĐứÒÓÔạỷừửÙÚỹỵÝỡưàáâãảăữẫèéêẻìíĩỉđựòóôõỏọụùúũủýợỮ"
  },
  "iso646cn": {
    "type": "_sbcs",
    "chars": "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#¥%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}‾��������������������������������������������������������������������������������������������������������������������������������"
  },
  "iso646jp": {
    "type": "_sbcs",
    "chars": "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[¥]^_`abcdefghijklmnopqrstuvwxyz{|}‾��������������������������������������������������������������������������������������������������������������������������������"
  },
  "hproman8": {
    "type": "_sbcs",
    "chars": " ÀÂÈÊËÎÏ´ˋˆ¨˜ÙÛ₤¯Ýý°ÇçÑñ¡¿¤£¥§ƒ¢âêôûáéóúàèòùäëöüÅîØÆåíøæÄìÖÜÉïßÔÁÃãÐðÍÌÓÒÕõŠšÚŸÿÞþ·µ¶¾—¼½ªº«■»±�"
  },
  "macintosh": {
    "type": "_sbcs",
    "chars": "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ�ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ"
  },
  "ascii": {
    "type": "_sbcs",
    "chars": "��������������������������������������������������������������������������������������������������������������������������������"
  },
  "tis620": {
    "type": "_sbcs",
    "chars": "���������������������������������กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮฯะัาำิีึืฺุู����฿เแโใไๅๆ็่้๊๋์ํ๎๏๐๑๒๓๔๕๖๗๘๙๚๛����"
  }
}
},{}],30:[function(require,module,exports){
"use strict";

// Manually added data to be used by sbcs codec in addition to generated one.

module.exports = {
    // Not supported by iconv, not sure why.
    "10029": "maccenteuro",
    "maccenteuro": {
        "type": "_sbcs",
        "chars": "ÄĀāÉĄÖÜáąČäčĆćéŹźĎíďĒēĖóėôöõúĚěü†°Ę£§•¶ß®©™ę¨≠ģĮįĪ≤≥īĶ∂∑łĻļĽľĹĺŅņŃ¬√ńŇ∆«»… ňŐÕőŌ–—“”‘’÷◊ōŔŕŘ‹›řŖŗŠ‚„šŚśÁŤťÍŽžŪÓÔūŮÚůŰűŲųÝýķŻŁżĢˇ"
    },

    "808": "cp808",
    "ibm808": "cp808",
    "cp808": {
        "type": "_sbcs",
        "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёЄєЇїЎў°∙·√№€■ "
    },

    "mik": {
        "type": "_sbcs",
        "chars": "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя└┴┬├─┼╣║╚╔╩╦╠═╬┐░▒▓│┤№§╗╝┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
    },

    "cp720": {
        "type": "_sbcs",
        "chars": "\x80\x81éâ\x84à\x86çêëèïî\x8d\x8e\x8f\x90\u0651\u0652ô¤ـûùءآأؤ£إئابةتثجحخدذرزسشص«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀ضطظعغفµقكلمنهوىي≡\u064b\u064c\u064d\u064e\u064f\u0650≈°∙·√ⁿ²■\u00a0"
    },

    // Aliases of generated encodings.
    "ascii8bit": "ascii",
    "usascii": "ascii",
    "ansix34": "ascii",
    "ansix341968": "ascii",
    "ansix341986": "ascii",
    "csascii": "ascii",
    "cp367": "ascii",
    "ibm367": "ascii",
    "isoir6": "ascii",
    "iso646us": "ascii",
    "iso646irv": "ascii",
    "us": "ascii",

    "latin1": "iso88591",
    "latin2": "iso88592",
    "latin3": "iso88593",
    "latin4": "iso88594",
    "latin5": "iso88599",
    "latin6": "iso885910",
    "latin7": "iso885913",
    "latin8": "iso885914",
    "latin9": "iso885915",
    "latin10": "iso885916",

    "csisolatin1": "iso88591",
    "csisolatin2": "iso88592",
    "csisolatin3": "iso88593",
    "csisolatin4": "iso88594",
    "csisolatincyrillic": "iso88595",
    "csisolatinarabic": "iso88596",
    "csisolatingreek" : "iso88597",
    "csisolatinhebrew": "iso88598",
    "csisolatin5": "iso88599",
    "csisolatin6": "iso885910",

    "l1": "iso88591",
    "l2": "iso88592",
    "l3": "iso88593",
    "l4": "iso88594",
    "l5": "iso88599",
    "l6": "iso885910",
    "l7": "iso885913",
    "l8": "iso885914",
    "l9": "iso885915",
    "l10": "iso885916",

    "isoir14": "iso646jp",
    "isoir57": "iso646cn",
    "isoir100": "iso88591",
    "isoir101": "iso88592",
    "isoir109": "iso88593",
    "isoir110": "iso88594",
    "isoir144": "iso88595",
    "isoir127": "iso88596",
    "isoir126": "iso88597",
    "isoir138": "iso88598",
    "isoir148": "iso88599",
    "isoir157": "iso885910",
    "isoir166": "tis620",
    "isoir179": "iso885913",
    "isoir199": "iso885914",
    "isoir203": "iso885915",
    "isoir226": "iso885916",

    "cp819": "iso88591",
    "ibm819": "iso88591",

    "cyrillic": "iso88595",

    "arabic": "iso88596",
    "arabic8": "iso88596",
    "ecma114": "iso88596",
    "asmo708": "iso88596",

    "greek" : "iso88597",
    "greek8" : "iso88597",
    "ecma118" : "iso88597",
    "elot928" : "iso88597",

    "hebrew": "iso88598",
    "hebrew8": "iso88598",

    "turkish": "iso88599",
    "turkish8": "iso88599",

    "thai": "iso885911",
    "thai8": "iso885911",

    "celtic": "iso885914",
    "celtic8": "iso885914",
    "isoceltic": "iso885914",

    "tis6200": "tis620",
    "tis62025291": "tis620",
    "tis62025330": "tis620",

    "10000": "macroman",
    "10006": "macgreek",
    "10007": "maccyrillic",
    "10079": "maciceland",
    "10081": "macturkish",

    "cspc8codepage437": "cp437",
    "cspc775baltic": "cp775",
    "cspc850multilingual": "cp850",
    "cspcp852": "cp852",
    "cspc862latinhebrew": "cp862",
    "cpgr": "cp869",

    "msee": "cp1250",
    "mscyrl": "cp1251",
    "msansi": "cp1252",
    "msgreek": "cp1253",
    "msturk": "cp1254",
    "mshebr": "cp1255",
    "msarab": "cp1256",
    "winbaltrim": "cp1257",

    "cp20866": "koi8r",
    "20866": "koi8r",
    "ibm878": "koi8r",
    "cskoi8r": "koi8r",

    "cp21866": "koi8u",
    "21866": "koi8u",
    "ibm1168": "koi8u",

    "strk10482002": "rk1048",

    "tcvn5712": "tcvn",
    "tcvn57121": "tcvn",

    "gb198880": "iso646cn",
    "cn": "iso646cn",

    "csiso14jisc6220ro": "iso646jp",
    "jisc62201969ro": "iso646jp",
    "jp": "iso646jp",

    "cshproman8": "hproman8",
    "r8": "hproman8",
    "roman8": "hproman8",
    "xroman8": "hproman8",
    "ibm1051": "hproman8",

    "mac": "macintosh",
    "csmacintosh": "macintosh",
};


},{}],31:[function(require,module,exports){
module.exports=[
["8740","䏰䰲䘃䖦䕸𧉧䵷䖳𧲱䳢𧳅㮕䜶䝄䱇䱀𤊿𣘗𧍒𦺋𧃒䱗𪍑䝏䗚䲅𧱬䴇䪤䚡𦬣爥𥩔𡩣𣸆𣽡晍囻"],
["8767","綕夝𨮹㷴霴𧯯寛𡵞媤㘥𩺰嫑宷峼杮薓𩥅瑡璝㡵𡵓𣚞𦀡㻬"],
["87a1","𥣞㫵竼龗𤅡𨤍𣇪𠪊𣉞䌊蒄龖鐯䤰蘓墖靊鈘秐稲晠権袝瑌篅枂稬剏遆㓦珄𥶹瓆鿇垳䤯呌䄱𣚎堘穲𧭥讏䚮𦺈䆁𥶙箮𢒼鿈𢓁𢓉𢓌鿉蔄𣖻䂴鿊䓡𪷿拁灮鿋"],
["8840","㇀",4,"𠄌㇅𠃑𠃍㇆㇇𠃋𡿨㇈𠃊㇉㇊㇋㇌𠄎㇍㇎ĀÁǍÀĒÉĚÈŌÓǑÒ࿿Ê̄Ế࿿Ê̌ỀÊāáǎàɑēéěèīíǐìōóǒòūúǔùǖǘǚ"],
["88a1","ǜü࿿ê̄ế࿿ê̌ềêɡ⏚⏛"],
["8940","𪎩𡅅"],
["8943","攊"],
["8946","丽滝鵎釟"],
["894c","𧜵撑会伨侨兖兴农凤务动医华发变团声处备夲头学实実岚庆总斉柾栄桥济炼电纤纬纺织经统缆缷艺苏药视设询车轧轮"],
["89a1","琑糼緍楆竉刧"],
["89ab","醌碸酞肼"],
["89b0","贋胶𠧧"],
["89b5","肟黇䳍鷉鸌䰾𩷶𧀎鸊𪄳㗁"],
["89c1","溚舾甙"],
["89c5","䤑马骏龙禇𨑬𡷊𠗐𢫦两亁亀亇亿仫伷㑌侽㹈倃傈㑽㒓㒥円夅凛凼刅争剹劐匧㗇厩㕑厰㕓参吣㕭㕲㚁咓咣咴咹哐哯唘唣唨㖘唿㖥㖿嗗㗅"],
["8a40","𧶄唥"],
["8a43","𠱂𠴕𥄫喐𢳆㧬𠍁蹆𤶸𩓥䁓𨂾睺𢰸㨴䟕𨅝𦧲𤷪擝𠵼𠾴𠳕𡃴撍蹾𠺖𠰋𠽤𢲩𨉖𤓓"],
["8a64","𠵆𩩍𨃩䟴𤺧𢳂骲㩧𩗴㿭㔆𥋇𩟔𧣈𢵄鵮頕"],
["8a76","䏙𦂥撴哣𢵌𢯊𡁷㧻𡁯"],
["8aa1","𦛚𦜖𧦠擪𥁒𠱃蹨𢆡𨭌𠜱"],
["8aac","䠋𠆩㿺塳𢶍"],
["8ab2","𤗈𠓼𦂗𠽌𠶖啹䂻䎺"],
["8abb","䪴𢩦𡂝膪飵𠶜捹㧾𢝵跀嚡摼㹃"],
["8ac9","𪘁𠸉𢫏𢳉"],
["8ace","𡃈𣧂㦒㨆𨊛㕸𥹉𢃇噒𠼱𢲲𩜠㒼氽𤸻"],
["8adf","𧕴𢺋𢈈𪙛𨳍𠹺𠰴𦠜羓𡃏𢠃𢤹㗻𥇣𠺌𠾍𠺪㾓𠼰𠵇𡅏𠹌"],
["8af6","𠺫𠮩𠵈𡃀𡄽㿹𢚖搲𠾭"],
["8b40","𣏴𧘹𢯎𠵾𠵿𢱑𢱕㨘𠺘𡃇𠼮𪘲𦭐𨳒𨶙𨳊閪哌苄喹"],
["8b55","𩻃鰦骶𧝞𢷮煀腭胬尜𦕲脴㞗卟𨂽醶𠻺𠸏𠹷𠻻㗝𤷫㘉𠳖嚯𢞵𡃉𠸐𠹸𡁸𡅈𨈇𡑕𠹹𤹐𢶤婔𡀝𡀞𡃵𡃶垜𠸑"],
["8ba1","𧚔𨋍𠾵𠹻𥅾㜃𠾶𡆀𥋘𪊽𤧚𡠺𤅷𨉼墙剨㘚𥜽箲孨䠀䬬鼧䧧鰟鮍𥭴𣄽嗻㗲嚉丨夂𡯁屮靑𠂆乛亻㔾尣彑忄㣺扌攵歺氵氺灬爫丬犭𤣩罒礻糹罓𦉪㓁"],
["8bde","𦍋耂肀𦘒𦥑卝衤见𧢲讠贝钅镸长门𨸏韦页风飞饣𩠐鱼鸟黄歯龜丷𠂇阝户钢"],
["8c40","倻淾𩱳龦㷉袏𤅎灷峵䬠𥇍㕙𥴰愢𨨲辧釶熑朙玺𣊁𪄇㲋𡦀䬐磤琂冮𨜏䀉橣𪊺䈣蘏𠩯稪𩥇𨫪靕灍匤𢁾鏴盙𨧣龧矝亣俰傼丯众龨吴綋墒壐𡶶庒庙忂𢜒斋"],
["8ca1","𣏹椙橃𣱣泿"],
["8ca7","爀𤔅玌㻛𤨓嬕璹讃𥲤𥚕窓篬糃繬苸薗龩袐龪躹龫迏蕟駠鈡龬𨶹𡐿䁱䊢娚"],
["8cc9","顨杫䉶圽"],
["8cce","藖𤥻芿𧄍䲁𦵴嵻𦬕𦾾龭龮宖龯曧繛湗秊㶈䓃𣉖𢞖䎚䔶"],
["8ce6","峕𣬚諹屸㴒𣕑嵸龲煗䕘𤃬𡸣䱷㥸㑊𠆤𦱁諌侴𠈹妿腬顖𩣺弻"],
["8d40","𠮟"],
["8d42","𢇁𨥭䄂䚻𩁹㼇龳𪆵䃸㟖䛷𦱆䅼𨚲𧏿䕭㣔𥒚䕡䔛䶉䱻䵶䗪㿈𤬏㙡䓞䒽䇭崾嵈嵖㷼㠏嶤嶹㠠㠸幂庽弥徃㤈㤔㤿㥍惗愽峥㦉憷憹懏㦸戬抐拥挘㧸嚱"],
["8da1","㨃揢揻搇摚㩋擀崕嘡龟㪗斆㪽旿晓㫲暒㬢朖㭂枤栀㭘桊梄㭲㭱㭻椉楃牜楤榟榅㮼槖㯝橥橴橱檂㯬檙㯲檫檵櫔櫶殁毁毪汵沪㳋洂洆洦涁㳯涤涱渕渘温溆𨧀溻滢滚齿滨滩漤漴㵆𣽁澁澾㵪㵵熷岙㶊瀬㶑灐灔灯灿炉𠌥䏁㗱𠻘"],
["8e40","𣻗垾𦻓焾𥟠㙎榢𨯩孴穉𥣡𩓙穥穽𥦬窻窰竂竃燑𦒍䇊竚竝竪䇯咲𥰁笋筕笩𥌎𥳾箢筯莜𥮴𦱿篐萡箒箸𥴠㶭𥱥蒒篺簆簵𥳁籄粃𤢂粦晽𤕸糉糇糦籴糳糵糎"],
["8ea1","繧䔝𦹄絝𦻖璍綉綫焵綳緒𤁗𦀩緤㴓緵𡟹緥𨍭縝𦄡𦅚繮纒䌫鑬縧罀罁罇礶𦋐駡羗𦍑羣𡙡𠁨䕜𣝦䔃𨌺翺𦒉者耈耝耨耯𪂇𦳃耻耼聡𢜔䦉𦘦𣷣𦛨朥肧𨩈脇脚墰𢛶汿𦒘𤾸擧𡒊舘𡡞橓𤩥𤪕䑺舩𠬍𦩒𣵾俹𡓽蓢荢𦬊𤦧𣔰𡝳𣷸芪椛芳䇛"],
["8f40","蕋苐茚𠸖𡞴㛁𣅽𣕚艻苢茘𣺋𦶣𦬅𦮗𣗎㶿茝嗬莅䔋𦶥莬菁菓㑾𦻔橗蕚㒖𦹂𢻯葘𥯤葱㷓䓤檧葊𣲵祘蒨𦮖𦹷𦹃蓞萏莑䒠蒓蓤𥲑䉀𥳀䕃蔴嫲𦺙䔧蕳䔖枿蘖"],
["8fa1","𨘥𨘻藁𧂈蘂𡖂𧃍䕫䕪蘨㙈𡢢号𧎚虾蝱𪃸蟮𢰧螱蟚蠏噡虬桖䘏衅衆𧗠𣶹𧗤衞袜䙛袴袵揁装睷𧜏覇覊覦覩覧覼𨨥觧𧤤𧪽誜瞓釾誐𧩙竩𧬺𣾏䜓𧬸煼謌謟𥐰𥕥謿譌譍誩𤩺讐讛誯𡛟䘕衏貛𧵔𧶏貫㜥𧵓賖𧶘𧶽贒贃𡤐賛灜贑𤳉㻐起"],
["9040","趩𨀂𡀔𤦊㭼𨆼𧄌竧躭躶軃鋔輙輭𨍥𨐒辥錃𪊟𠩐辳䤪𨧞𨔽𣶻廸𣉢迹𪀔𨚼𨔁𢌥㦀𦻗逷𨔼𧪾遡𨕬𨘋邨𨜓郄𨛦邮都酧㫰醩釄粬𨤳𡺉鈎沟鉁鉢𥖹銹𨫆𣲛𨬌𥗛"],
["90a1","𠴱錬鍫𨫡𨯫炏嫃𨫢𨫥䥥鉄𨯬𨰹𨯿鍳鑛躼閅閦鐦閠濶䊹𢙺𨛘𡉼𣸮䧟氜陻隖䅬隣𦻕懚隶磵𨫠隽双䦡𦲸𠉴𦐐𩂯𩃥𤫑𡤕𣌊霱虂霶䨏䔽䖅𤫩灵孁霛靜𩇕靗孊𩇫靟鐥僐𣂷𣂼鞉鞟鞱鞾韀韒韠𥑬韮琜𩐳響韵𩐝𧥺䫑頴頳顋顦㬎𧅵㵑𠘰𤅜"],
["9140","𥜆飊颷飈飇䫿𦴧𡛓喰飡飦飬鍸餹𤨩䭲𩡗𩤅駵騌騻騐驘𥜥㛄𩂱𩯕髠髢𩬅髴䰎鬔鬭𨘀倴鬴𦦨㣃𣁽魐魀𩴾婅𡡣鮎𤉋鰂鯿鰌𩹨鷔𩾷𪆒𪆫𪃡𪄣𪇟鵾鶃𪄴鸎梈"],
["91a1","鷄𢅛𪆓𪈠𡤻𪈳鴹𪂹𪊴麐麕麞麢䴴麪麯𤍤黁㭠㧥㴝伲㞾𨰫鼂鼈䮖鐤𦶢鼗鼖鼹嚟嚊齅馸𩂋韲葿齢齩竜龎爖䮾𤥵𤦻煷𤧸𤍈𤩑玞𨯚𡣺禟𨥾𨸶鍩鏳𨩄鋬鎁鏋𨥬𤒹爗㻫睲穃烐𤑳𤏸煾𡟯炣𡢾𣖙㻇𡢅𥐯𡟸㜢𡛻𡠹㛡𡝴𡣑𥽋㜣𡛀坛𤨥𡏾𡊨"],
["9240","𡏆𡒶蔃𣚦蔃葕𤦔𧅥𣸱𥕜𣻻𧁒䓴𣛮𩦝𦼦柹㜳㰕㷧塬𡤢栐䁗𣜿𤃡𤂋𤄏𦰡哋嚞𦚱嚒𠿟𠮨𠸍鏆𨬓鎜仸儫㠙𤐶亼𠑥𠍿佋侊𥙑婨𠆫𠏋㦙𠌊𠐔㐵伩𠋀𨺳𠉵諚𠈌亘"],
["92a1","働儍侢伃𤨎𣺊佂倮偬傁俌俥偘僼兙兛兝兞湶𣖕𣸹𣺿浲𡢄𣺉冨凃𠗠䓝𠒣𠒒𠒑赺𨪜𠜎剙劤𠡳勡鍮䙺熌𤎌𠰠𤦬𡃤槑𠸝瑹㻞璙琔瑖玘䮎𤪼𤂍叐㖄爏𤃉喴𠍅响𠯆圝鉝雴鍦埝垍坿㘾壋媙𨩆𡛺𡝯𡜐娬妸銏婾嫏娒𥥆𡧳𡡡𤊕㛵洅瑃娡𥺃"],
["9340","媁𨯗𠐓鏠璌𡌃焅䥲鐈𨧻鎽㞠尞岞幞幈𡦖𡥼𣫮廍孏𡤃𡤄㜁𡢠㛝𡛾㛓脪𨩇𡶺𣑲𨦨弌弎𡤧𡞫婫𡜻孄蘔𧗽衠恾𢡠𢘫忛㺸𢖯𢖾𩂈𦽳懀𠀾𠁆𢘛憙憘恵𢲛𢴇𤛔𩅍"],
["93a1","摱𤙥𢭪㨩𢬢𣑐𩣪𢹸挷𪑛撶挱揑𤧣𢵧护𢲡搻敫楲㯴𣂎𣊭𤦉𣊫唍𣋠𡣙𩐿曎𣊉𣆳㫠䆐𥖄𨬢𥖏𡛼𥕛𥐥磮𣄃𡠪𣈴㑤𣈏𣆂𤋉暎𦴤晫䮓昰𧡰𡷫晣𣋒𣋡昞𥡲㣑𣠺𣞼㮙𣞢𣏾瓐㮖枏𤘪梶栞㯄檾㡣𣟕𤒇樳橒櫉欅𡤒攑梘橌㯗橺歗𣿀𣲚鎠鋲𨯪𨫋"],
["9440","銉𨀞𨧜鑧涥漋𤧬浧𣽿㶏渄𤀼娽渊塇洤硂焻𤌚𤉶烱牐犇犔𤞏𤜥兹𤪤𠗫瑺𣻸𣙟𤩊𤤗𥿡㼆㺱𤫟𨰣𣼵悧㻳瓌琼鎇琷䒟𦷪䕑疃㽣𤳙𤴆㽘畕癳𪗆㬙瑨𨫌𤦫𤦎㫻"],
["94a1","㷍𤩎㻿𤧅𤣳釺圲鍂𨫣𡡤僟𥈡𥇧睸𣈲眎眏睻𤚗𣞁㩞𤣰琸璛㺿𤪺𤫇䃈𤪖𦆮錇𥖁砞碍碈磒珐祙𧝁𥛣䄎禛蒖禥樭𣻺稺秴䅮𡛦䄲鈵秱𠵌𤦌𠊙𣶺𡝮㖗啫㕰㚪𠇔𠰍竢婙𢛵𥪯𥪜娍𠉛磰娪𥯆竾䇹籝籭䈑𥮳𥺼𥺦糍𤧹𡞰粎籼粮檲緜縇緓罎𦉡"],
["9540","𦅜𧭈綗𥺂䉪𦭵𠤖柖𠁎𣗏埄𦐒𦏸𤥢翝笧𠠬𥫩𥵃笌𥸎駦虅驣樜𣐿㧢𤧷𦖭騟𦖠蒀𧄧𦳑䓪脷䐂胆脉腂𦞴飃𦩂艢艥𦩑葓𦶧蘐𧈛媆䅿𡡀嬫𡢡嫤𡣘蚠蜨𣶏蠭𧐢娂"],
["95a1","衮佅袇袿裦襥襍𥚃襔𧞅𧞄𨯵𨯙𨮜𨧹㺭蒣䛵䛏㟲訽訜𩑈彍鈫𤊄旔焩烄𡡅鵭貟賩𧷜妚矃姰䍮㛔踪躧𤰉輰轊䋴汘澻𢌡䢛潹溋𡟚鯩㚵𤤯邻邗啱䤆醻鐄𨩋䁢𨫼鐧𨰝𨰻蓥訫閙閧閗閖𨴴瑅㻂𤣿𤩂𤏪㻧𣈥随𨻧𨹦𨹥㻌𤧭𤩸𣿮琒瑫㻼靁𩂰"],
["9640","桇䨝𩂓𥟟靝鍨𨦉𨰦𨬯𦎾銺嬑譩䤼珹𤈛鞛靱餸𠼦巁𨯅𤪲頟𩓚鋶𩗗釥䓀𨭐𤩧𨭤飜𨩅㼀鈪䤥萔餻饍𧬆㷽馛䭯馪驜𨭥𥣈檏騡嫾騯𩣱䮐𩥈馼䮽䮗鍽塲𡌂堢𤦸"],
["96a1","𡓨硄𢜟𣶸棅㵽鑘㤧慐𢞁𢥫愇鱏鱓鱻鰵鰐魿鯏𩸭鮟𪇵𪃾鴡䲮𤄄鸘䲰鴌𪆴𪃭𪃳𩤯鶥蒽𦸒𦿟𦮂藼䔳𦶤𦺄𦷰萠藮𦸀𣟗𦁤秢𣖜𣙀䤭𤧞㵢鏛銾鍈𠊿碹鉷鑍俤㑀遤𥕝砽硔碶硋𡝗𣇉𤥁㚚佲濚濙瀞瀞吔𤆵垻壳垊鴖埗焴㒯𤆬燫𦱀𤾗嬨𡞵𨩉"],
["9740","愌嫎娋䊼𤒈㜬䭻𨧼鎻鎸𡣖𠼝葲𦳀𡐓𤋺𢰦𤏁妔𣶷𦝁綨𦅛𦂤𤦹𤦋𨧺鋥珢㻩璴𨭣𡢟㻡𤪳櫘珳珻㻖𤨾𤪔𡟙𤩦𠎧𡐤𤧥瑈𤤖炥𤥶銄珦鍟𠓾錱𨫎𨨖鎆𨯧𥗕䤵𨪂煫"],
["97a1","𤥃𠳿嚤𠘚𠯫𠲸唂秄𡟺緾𡛂𤩐𡡒䔮鐁㜊𨫀𤦭妰𡢿𡢃𧒄媡㛢𣵛㚰鉟婹𨪁𡡢鍴㳍𠪴䪖㦊僴㵩㵌𡎜煵䋻𨈘渏𩃤䓫浗𧹏灧沯㳖𣿭𣸭渂漌㵯𠏵畑㚼㓈䚀㻚䡱姄鉮䤾轁𨰜𦯀堒埈㛖𡑒烾𤍢𤩱𢿣𡊰𢎽梹楧𡎘𣓥𧯴𣛟𨪃𣟖𣏺𤲟樚𣚭𦲷萾䓟䓎"],
["9840","𦴦𦵑𦲂𦿞漗𧄉茽𡜺菭𦲀𧁓𡟛妉媂𡞳婡婱𡤅𤇼㜭姯𡜼㛇熎鎐暚𤊥婮娫𤊓樫𣻹𧜶𤑛𤋊焝𤉙𨧡侰𦴨峂𤓎𧹍𤎽樌𤉖𡌄炦焳𤏩㶥泟勇𤩏繥姫崯㷳彜𤩝𡟟綤萦"],
["98a1","咅𣫺𣌀𠈔坾𠣕𠘙㿥𡾞𪊶瀃𩅛嵰玏糓𨩙𩐠俈翧狍猐𧫴猸猹𥛶獁獈㺩𧬘遬燵𤣲珡臶㻊県㻑沢国琙琞琟㻢㻰㻴㻺瓓㼎㽓畂畭畲疍㽼痈痜㿀癍㿗癴㿜発𤽜熈嘣覀塩䀝睃䀹条䁅㗛瞘䁪䁯属瞾矋売砘点砜䂨砹硇硑硦葈𥔵礳栃礲䄃"],
["9940","䄉禑禙辻稆込䅧窑䆲窼艹䇄竏竛䇏両筢筬筻簒簛䉠䉺类粜䊌粸䊔糭输烀𠳏総緔緐緽羮羴犟䎗耠耥笹耮耱联㷌垴炠肷胩䏭脌猪脎脒畠脔䐁㬹腖腙腚"],
["99a1","䐓堺腼膄䐥膓䐭膥埯臁臤艔䒏芦艶苊苘苿䒰荗险榊萅烵葤惣蒈䔄蒾蓡蓸蔐蔸蕒䔻蕯蕰藠䕷虲蚒蚲蛯际螋䘆䘗袮裿褤襇覑𧥧訩訸誔誴豑賔賲贜䞘塟跃䟭仮踺嗘坔蹱嗵躰䠷軎転軤軭軲辷迁迊迌逳駄䢭飠鈓䤞鈨鉘鉫銱銮銿"],
["9a40","鋣鋫鋳鋴鋽鍃鎄鎭䥅䥑麿鐗匁鐝鐭鐾䥪鑔鑹锭関䦧间阳䧥枠䨤靀䨵鞲韂噔䫤惨颹䬙飱塄餎餙冴餜餷饂饝饢䭰駅䮝騼鬏窃魩鮁鯝鯱鯴䱭鰠㝯𡯂鵉鰺"],
["9aa1","黾噐鶓鶽鷀鷼银辶鹻麬麱麽黆铜黢黱黸竈齄𠂔𠊷𠎠椚铃妬𠓗塀铁㞹𠗕𠘕𠙶𡚺块煳𠫂𠫍𠮿呪吆𠯋咞𠯻𠰻𠱓𠱥𠱼惧𠲍噺𠲵𠳝𠳭𠵯𠶲𠷈楕鰯螥𠸄𠸎𠻗𠾐𠼭𠹳尠𠾼帋𡁜𡁏𡁶朞𡁻𡂈𡂖㙇𡂿𡃓𡄯𡄻卤蒭𡋣𡍵𡌶讁𡕷𡘙𡟃𡟇乸炻𡠭𡥪"],
["9b40","𡨭𡩅𡰪𡱰𡲬𡻈拃𡻕𡼕熘桕𢁅槩㛈𢉼𢏗𢏺𢜪𢡱𢥏苽𢥧𢦓𢫕覥𢫨辠𢬎鞸𢬿顇骽𢱌"],
["9b62","𢲈𢲷𥯨𢴈𢴒𢶷𢶕𢹂𢽴𢿌𣀳𣁦𣌟𣏞徱晈暿𧩹𣕧𣗳爁𤦺矗𣘚𣜖纇𠍆墵朎"],
["9ba1","椘𣪧𧙗𥿢𣸑𣺹𧗾𢂚䣐䪸𤄙𨪚𤋮𤌍𤀻𤌴𤎖𤩅𠗊凒𠘑妟𡺨㮾𣳿𤐄𤓖垈𤙴㦛𤜯𨗨𩧉㝢𢇃譞𨭎駖𤠒𤣻𤨕爉𤫀𠱸奥𤺥𤾆𠝹軚𥀬劏圿煱𥊙𥐙𣽊𤪧喼𥑆𥑮𦭒釔㑳𥔿𧘲𥕞䜘𥕢𥕦𥟇𤤿𥡝偦㓻𣏌惞𥤃䝼𨥈𥪮𥮉𥰆𡶐垡煑澶𦄂𧰒遖𦆲𤾚譢𦐂𦑊"],
["9c40","嵛𦯷輶𦒄𡤜諪𤧶𦒈𣿯𦔒䯀𦖿𦚵𢜛鑥𥟡憕娧晉侻嚹𤔡𦛼乪𤤴陖涏𦲽㘘襷𦞙𦡮𦐑𦡞營𦣇筂𩃀𠨑𦤦鄄𦤹穅鷰𦧺騦𦨭㙟𦑩𠀡禃𦨴𦭛崬𣔙菏𦮝䛐𦲤画补𦶮墶"],
["9ca1","㜜𢖍𧁋𧇍㱔𧊀𧊅銁𢅺𧊋錰𧋦𤧐氹钟𧑐𠻸蠧裵𢤦𨑳𡞱溸𤨪𡠠㦤㚹尐秣䔿暶𩲭𩢤襃𧟌𧡘囖䃟𡘊㦡𣜯𨃨𡏅熭荦𧧝𩆨婧䲷𧂯𨦫𧧽𧨊𧬋𧵦𤅺筃祾𨀉澵𪋟樃𨌘厢𦸇鎿栶靝𨅯𨀣𦦵𡏭𣈯𨁈嶅𨰰𨂃圕頣𨥉嶫𤦈斾槕叒𤪥𣾁㰑朶𨂐𨃴𨄮𡾡𨅏"],
["9d40","𨆉𨆯𨈚𨌆𨌯𨎊㗊𨑨𨚪䣺揦𨥖砈鉕𨦸䏲𨧧䏟𨧨𨭆𨯔姸𨰉輋𨿅𩃬筑𩄐𩄼㷷𩅞𤫊运犏嚋𩓧𩗩𩖰𩖸𩜲𩣑𩥉𩥪𩧃𩨨𩬎𩵚𩶛纟𩻸𩼣䲤镇𪊓熢𪋿䶑递𪗋䶜𠲜达嗁"],
["9da1","辺𢒰边𤪓䔉繿潖檱仪㓤𨬬𧢝㜺躀𡟵𨀤𨭬𨮙𧨾𦚯㷫𧙕𣲷𥘵𥥖亚𥺁𦉘嚿𠹭踎孭𣺈𤲞揞拐𡟶𡡻攰嘭𥱊吚𥌑㷆𩶘䱽嘢嘞罉𥻘奵𣵀蝰东𠿪𠵉𣚺脗鵞贘瘻鱅癎瞹鍅吲腈苷嘥脲萘肽嗪祢噃吖𠺝㗎嘅嗱曱𨋢㘭甴嗰喺咗啲𠱁𠲖廐𥅈𠹶𢱢"],
["9e40","𠺢麫絚嗞𡁵抝靭咔賍燶酶揼掹揾啩𢭃鱲𢺳冚㓟𠶧冧呍唞唓癦踭𦢊疱肶蠄螆裇膶萜𡃁䓬猄𤜆宐茋𦢓噻𢛴𧴯𤆣𧵳𦻐𧊶酰𡇙鈈𣳼𪚩𠺬𠻹牦𡲢䝎𤿂𧿹𠿫䃺"],
["9ea1","鱝攟𢶠䣳𤟠𩵼𠿬𠸊恢𧖣𠿭"],
["9ead","𦁈𡆇熣纎鵐业丄㕷嬍沲卧㚬㧜卽㚥𤘘墚𤭮舭呋垪𥪕𠥹"],
["9ec5","㩒𢑥獴𩺬䴉鯭𣳾𩼰䱛𤾩𩖞𩿞葜𣶶𧊲𦞳𣜠挮紥𣻷𣸬㨪逈勌㹴㙺䗩𠒎癀嫰𠺶硺𧼮墧䂿噼鮋嵴癔𪐴麅䳡痹㟻愙𣃚𤏲"],
["9ef5","噝𡊩垧𤥣𩸆刴𧂮㖭汊鵼"],
["9f40","籖鬹埞𡝬屓擓𩓐𦌵𧅤蚭𠴨𦴢𤫢𠵱"],
["9f4f","凾𡼏嶎霃𡷑麁遌笟鬂峑箣扨挵髿篏鬪籾鬮籂粆鰕篼鬉鼗鰛𤤾齚啳寃俽麘俲剠㸆勑坧偖妷帒韈鶫轜呩鞴饀鞺匬愰"],
["9fa1","椬叚鰊鴂䰻陁榀傦畆𡝭駚剳"],
["9fae","酙隁酜"],
["9fb2","酑𨺗捿𦴣櫊嘑醎畺抅𠏼獏籰𥰡𣳽"],
["9fc1","𤤙盖鮝个𠳔莾衂"],
["9fc9","届槀僭坺刟巵从氱𠇲伹咜哚劚趂㗾弌㗳"],
["9fdb","歒酼龥鮗頮颴骺麨麄煺笔"],
["9fe7","毺蠘罸"],
["9feb","嘠𪙊蹷齓"],
["9ff0","跔蹏鸜踁抂𨍽踨蹵竓𤩷稾磘泪詧瘇"],
["a040","𨩚鼦泎蟖痃𪊲硓咢贌狢獱謭猂瓱賫𤪻蘯徺袠䒷"],
["a055","𡠻𦸅"],
["a058","詾𢔛"],
["a05b","惽癧髗鵄鍮鮏蟵"],
["a063","蠏賷猬霡鮰㗖犲䰇籑饊𦅙慙䰄麖慽"],
["a073","坟慯抦戹拎㩜懢厪𣏵捤栂㗒"],
["a0a1","嵗𨯂迚𨸹"],
["a0a6","僙𡵆礆匲阸𠼻䁥"],
["a0ae","矾"],
["a0b0","糂𥼚糚稭聦聣絍甅瓲覔舚朌聢𧒆聛瓰脃眤覉𦟌畓𦻑螩蟎臈螌詉貭譃眫瓸蓚㘵榲趦"],
["a0d4","覩瑨涹蟁𤀑瓧㷛煶悤憜㳑煢恷"],
["a0e2","罱𨬭牐惩䭾删㰘𣳇𥻗𧙖𥔱𡥄𡋾𩤃𦷜𧂭峁𦆭𨨏𣙷𠃮𦡆𤼎䕢嬟𦍌齐麦𦉫"],
["a3c0","␀",31,"␡"],
["c6a1","①",9,"⑴",9,"ⅰ",9,"丶丿亅亠冂冖冫勹匸卩厶夊宀巛⼳广廴彐彡攴无疒癶辵隶¨ˆヽヾゝゞ〃仝々〆〇ー［］✽ぁ",23],
["c740","す",58,"ァアィイ"],
["c7a1","ゥ",81,"А",5,"ЁЖ",4],
["c840","Л",26,"ёж",25,"⇧↸↹㇏𠃌乚𠂊刂䒑"],
["c8a1","龰冈龱𧘇"],
["c8cd","￢￤＇＂㈱№℡゛゜⺀⺄⺆⺇⺈⺊⺌⺍⺕⺜⺝⺥⺧⺪⺬⺮⺶⺼⺾⻆⻊⻌⻍⻏⻖⻗⻞⻣"],
["c8f5","ʃɐɛɔɵœøŋʊɪ"],
["f9fe","￭"],
["fa40","𠕇鋛𠗟𣿅蕌䊵珯况㙉𤥂𨧤鍄𡧛苮𣳈砼杄拟𤤳𨦪𠊠𦮳𡌅侫𢓭倈𦴩𧪄𣘀𤪱𢔓倩𠍾徤𠎀𠍇滛𠐟偽儁㑺儎顬㝃萖𤦤𠒇兠𣎴兪𠯿𢃼𠋥𢔰𠖎𣈳𡦃宂蝽𠖳𣲙冲冸"],
["faa1","鴴凉减凑㳜凓𤪦决凢卂凭菍椾𣜭彻刋刦刼劵剗劔効勅簕蕂勠蘍𦬓包𨫞啉滙𣾀𠥔𣿬匳卄𠯢泋𡜦栛珕恊㺪㣌𡛨燝䒢卭却𨚫卾卿𡖖𡘓矦厓𨪛厠厫厮玧𥝲㽙玜叁叅汉义埾叙㪫𠮏叠𣿫𢶣叶𠱷吓灹唫晗浛呭𦭓𠵴啝咏咤䞦𡜍𠻝㶴𠵍"],
["fb40","𨦼𢚘啇䳭启琗喆喩嘅𡣗𤀺䕒𤐵暳𡂴嘷曍𣊊暤暭噍噏磱囱鞇叾圀囯园𨭦㘣𡉏坆𤆥汮炋坂㚱𦱾埦𡐖堃𡑔𤍣堦𤯵塜墪㕡壠壜𡈼壻寿坃𪅐𤉸鏓㖡够梦㛃湙"],
["fba1","𡘾娤啓𡚒蔅姉𠵎𦲁𦴪𡟜姙𡟻𡞲𦶦浱𡠨𡛕姹𦹅媫婣㛦𤦩婷㜈媖瑥嫓𦾡𢕔㶅𡤑㜲𡚸広勐孶斈孼𧨎䀄䡝𠈄寕慠𡨴𥧌𠖥寳宝䴐尅𡭄尓珎尔𡲥𦬨屉䣝岅峩峯嶋𡷹𡸷崐崘嵆𡺤岺巗苼㠭𤤁𢁉𢅳芇㠶㯂帮檊幵幺𤒼𠳓厦亷廐厨𡝱帉廴𨒂"],
["fc40","廹廻㢠廼栾鐛弍𠇁弢㫞䢮𡌺强𦢈𢏐彘𢑱彣鞽𦹮彲鍀𨨶徧嶶㵟𥉐𡽪𧃸𢙨釖𠊞𨨩怱暅𡡷㥣㷇㘹垐𢞴祱㹀悞悤悳𤦂𤦏𧩓璤僡媠慤萤慂慈𦻒憁凴𠙖憇宪𣾷"],
["fca1","𢡟懓𨮝𩥝懐㤲𢦀𢣁怣慜攞掋𠄘担𡝰拕𢸍捬𤧟㨗搸揸𡎎𡟼撐澊𢸶頔𤂌𥜝擡擥鑻㩦携㩗敍漖𤨨𤨣斅敭敟𣁾斵𤥀䬷旑䃘𡠩无旣忟𣐀昘𣇷𣇸晄𣆤𣆥晋𠹵晧𥇦晳晴𡸽𣈱𨗴𣇈𥌓矅𢣷馤朂𤎜𤨡㬫槺𣟂杞杧杢𤇍𩃭柗䓩栢湐鈼栁𣏦𦶠桝"],
["fd40","𣑯槡樋𨫟楳棃𣗍椁椀㴲㨁𣘼㮀枬楡𨩊䋼椶榘㮡𠏉荣傐槹𣙙𢄪橅𣜃檝㯳枱櫈𩆜㰍欝𠤣惞欵歴𢟍溵𣫛𠎵𡥘㝀吡𣭚毡𣻼毜氷𢒋𤣱𦭑汚舦汹𣶼䓅𣶽𤆤𤤌𤤀"],
["fda1","𣳉㛥㳫𠴲鮃𣇹𢒑羏样𦴥𦶡𦷫涖浜湼漄𤥿𤂅𦹲蔳𦽴凇沜渝萮𨬡港𣸯瑓𣾂秌湏媑𣁋濸㜍澝𣸰滺𡒗𤀽䕕鏰潄潜㵎潴𩅰㴻澟𤅄濓𤂑𤅕𤀹𣿰𣾴𤄿凟𤅖𤅗𤅀𦇝灋灾炧炁烌烕烖烟䄄㷨熴熖𤉷焫煅媈煊煮岜𤍥煏鍢𤋁焬𤑚𤨧𤨢熺𨯨炽爎"],
["fe40","鑂爕夑鑃爤鍁𥘅爮牀𤥴梽牕牗㹕𣁄栍漽犂猪猫𤠣𨠫䣭𨠄猨献珏玪𠰺𦨮珉瑉𤇢𡛧𤨤昣㛅𤦷𤦍𤧻珷琕椃𤨦琹𠗃㻗瑜𢢭瑠𨺲瑇珤瑶莹瑬㜰瑴鏱樬璂䥓𤪌"],
["fea1","𤅟𤩹𨮏孆𨰃𡢞瓈𡦈甎瓩甞𨻙𡩋寗𨺬鎅畍畊畧畮𤾂㼄𤴓疎瑝疞疴瘂瘬癑癏癯癶𦏵皐臯㟸𦤑𦤎皡皥皷盌𦾟葢𥂝𥅽𡸜眞眦着撯𥈠睘𣊬瞯𨥤𨥨𡛁矴砉𡍶𤨒棊碯磇磓隥礮𥗠磗礴碱𧘌辸袄𨬫𦂃𢘜禆褀椂禀𥡗禝𧬹礼禩渪𧄦㺨秆𩄍秔"]
]

},{}],32:[function(require,module,exports){
module.exports=[
["0","\u0000",127,"€"],
["8140","丂丄丅丆丏丒丗丟丠両丣並丩丮丯丱丳丵丷丼乀乁乂乄乆乊乑乕乗乚乛乢乣乤乥乧乨乪",5,"乲乴",9,"乿",6,"亇亊"],
["8180","亐亖亗亙亜亝亞亣亪亯亰亱亴亶亷亸亹亼亽亾仈仌仏仐仒仚仛仜仠仢仦仧仩仭仮仯仱仴仸仹仺仼仾伀伂",6,"伋伌伒",4,"伜伝伡伣伨伩伬伭伮伱伳伵伷伹伻伾",4,"佄佅佇",5,"佒佔佖佡佢佦佨佪佫佭佮佱佲併佷佸佹佺佽侀侁侂侅來侇侊侌侎侐侒侓侕侖侘侙侚侜侞侟価侢"],
["8240","侤侫侭侰",4,"侶",8,"俀俁係俆俇俈俉俋俌俍俒",4,"俙俛俠俢俤俥俧俫俬俰俲俴俵俶俷俹俻俼俽俿",11],
["8280","個倎倐們倓倕倖倗倛倝倞倠倢倣値倧倫倯",10,"倻倽倿偀偁偂偄偅偆偉偊偋偍偐",4,"偖偗偘偙偛偝",7,"偦",5,"偭",8,"偸偹偺偼偽傁傂傃傄傆傇傉傊傋傌傎",20,"傤傦傪傫傭",4,"傳",6,"傼"],
["8340","傽",17,"僐",5,"僗僘僙僛",10,"僨僩僪僫僯僰僱僲僴僶",4,"僼",9,"儈"],
["8380","儉儊儌",5,"儓",13,"儢",28,"兂兇兊兌兎兏児兒兓兗兘兙兛兝",4,"兣兤兦內兩兪兯兲兺兾兿冃冄円冇冊冋冎冏冐冑冓冔冘冚冝冞冟冡冣冦",4,"冭冮冴冸冹冺冾冿凁凂凃凅凈凊凍凎凐凒",5],
["8440","凘凙凚凜凞凟凢凣凥",5,"凬凮凱凲凴凷凾刄刅刉刋刌刏刐刓刔刕刜刞刟刡刢刣別刦刧刪刬刯刱刲刴刵刼刾剄",5,"剋剎剏剒剓剕剗剘"],
["8480","剙剚剛剝剟剠剢剣剤剦剨剫剬剭剮剰剱剳",9,"剾劀劃",4,"劉",6,"劑劒劔",6,"劜劤劥劦劧劮劯劰労",9,"勀勁勂勄勅勆勈勊勌勍勎勏勑勓勔動勗務",5,"勠勡勢勣勥",10,"勱",7,"勻勼勽匁匂匃匄匇匉匊匋匌匎"],
["8540","匑匒匓匔匘匛匜匞匟匢匤匥匧匨匩匫匬匭匯",9,"匼匽區卂卄卆卋卌卍卐協単卙卛卝卥卨卪卬卭卲卶卹卻卼卽卾厀厁厃厇厈厊厎厏"],
["8580","厐",4,"厖厗厙厛厜厞厠厡厤厧厪厫厬厭厯",6,"厷厸厹厺厼厽厾叀參",4,"収叏叐叒叓叕叚叜叝叞叡叢叧叴叺叾叿吀吂吅吇吋吔吘吙吚吜吢吤吥吪吰吳吶吷吺吽吿呁呂呄呅呇呉呌呍呎呏呑呚呝",4,"呣呥呧呩",7,"呴呹呺呾呿咁咃咅咇咈咉咊咍咑咓咗咘咜咞咟咠咡"],
["8640","咢咥咮咰咲咵咶咷咹咺咼咾哃哅哊哋哖哘哛哠",4,"哫哬哯哰哱哴",5,"哻哾唀唂唃唄唅唈唊",4,"唒唓唕",5,"唜唝唞唟唡唥唦"],
["8680","唨唩唫唭唲唴唵唶唸唹唺唻唽啀啂啅啇啈啋",4,"啑啒啓啔啗",4,"啝啞啟啠啢啣啨啩啫啯",5,"啹啺啽啿喅喆喌喍喎喐喒喓喕喖喗喚喛喞喠",6,"喨",8,"喲喴営喸喺喼喿",4,"嗆嗇嗈嗊嗋嗎嗏嗐嗕嗗",4,"嗞嗠嗢嗧嗩嗭嗮嗰嗱嗴嗶嗸",4,"嗿嘂嘃嘄嘅"],
["8740","嘆嘇嘊嘋嘍嘐",7,"嘙嘚嘜嘝嘠嘡嘢嘥嘦嘨嘩嘪嘫嘮嘯嘰嘳嘵嘷嘸嘺嘼嘽嘾噀",11,"噏",4,"噕噖噚噛噝",4],
["8780","噣噥噦噧噭噮噯噰噲噳噴噵噷噸噹噺噽",7,"嚇",6,"嚐嚑嚒嚔",14,"嚤",10,"嚰",6,"嚸嚹嚺嚻嚽",12,"囋",8,"囕囖囘囙囜団囥",5,"囬囮囯囲図囶囷囸囻囼圀圁圂圅圇國",6],
["8840","園",9,"圝圞圠圡圢圤圥圦圧圫圱圲圴",4,"圼圽圿坁坃坄坅坆坈坉坋坒",4,"坘坙坢坣坥坧坬坮坰坱坲坴坵坸坹坺坽坾坿垀"],
["8880","垁垇垈垉垊垍",4,"垔",6,"垜垝垞垟垥垨垪垬垯垰垱垳垵垶垷垹",8,"埄",6,"埌埍埐埑埓埖埗埛埜埞埡埢埣埥",7,"埮埰埱埲埳埵埶執埻埼埾埿堁堃堄堅堈堉堊堌堎堏堐堒堓堔堖堗堘堚堛堜堝堟堢堣堥",4,"堫",4,"報堲堳場堶",7],
["8940","堾",5,"塅",6,"塎塏塐塒塓塕塖塗塙",4,"塟",5,"塦",4,"塭",16,"塿墂墄墆墇墈墊墋墌"],
["8980","墍",4,"墔",4,"墛墜墝墠",7,"墪",17,"墽墾墿壀壂壃壄壆",10,"壒壓壔壖",13,"壥",5,"壭壯壱売壴壵壷壸壺",7,"夃夅夆夈",4,"夎夐夑夒夓夗夘夛夝夞夠夡夢夣夦夨夬夰夲夳夵夶夻"],
["8a40","夽夾夿奀奃奅奆奊奌奍奐奒奓奙奛",4,"奡奣奤奦",12,"奵奷奺奻奼奾奿妀妅妉妋妌妎妏妐妑妔妕妘妚妛妜妝妟妠妡妢妦"],
["8a80","妧妬妭妰妱妳",5,"妺妼妽妿",6,"姇姈姉姌姍姎姏姕姖姙姛姞",4,"姤姦姧姩姪姫姭",11,"姺姼姽姾娀娂娊娋娍娎娏娐娒娔娕娖娗娙娚娛娝娞娡娢娤娦娧娨娪",6,"娳娵娷",4,"娽娾娿婁",4,"婇婈婋",9,"婖婗婘婙婛",5],
["8b40","婡婣婤婥婦婨婩婫",8,"婸婹婻婼婽婾媀",17,"媓",6,"媜",13,"媫媬"],
["8b80","媭",4,"媴媶媷媹",4,"媿嫀嫃",5,"嫊嫋嫍",4,"嫓嫕嫗嫙嫚嫛嫝嫞嫟嫢嫤嫥嫧嫨嫪嫬",4,"嫲",22,"嬊",11,"嬘",25,"嬳嬵嬶嬸",7,"孁",6],
["8c40","孈",7,"孒孖孞孠孡孧孨孫孭孮孯孲孴孶孷學孹孻孼孾孿宂宆宊宍宎宐宑宒宔宖実宧宨宩宬宭宮宯宱宲宷宺宻宼寀寁寃寈寉寊寋寍寎寏"],
["8c80","寑寔",8,"寠寢寣實寧審",4,"寯寱",6,"寽対尀専尃尅將專尋尌對導尐尒尓尗尙尛尞尟尠尡尣尦尨尩尪尫尭尮尯尰尲尳尵尶尷屃屄屆屇屌屍屒屓屔屖屗屘屚屛屜屝屟屢層屧",6,"屰屲",6,"屻屼屽屾岀岃",4,"岉岊岋岎岏岒岓岕岝",4,"岤",4],
["8d40","岪岮岯岰岲岴岶岹岺岻岼岾峀峂峃峅",5,"峌",5,"峓",5,"峚",6,"峢峣峧峩峫峬峮峯峱",9,"峼",4],
["8d80","崁崄崅崈",5,"崏",4,"崕崗崘崙崚崜崝崟",4,"崥崨崪崫崬崯",4,"崵",7,"崿",7,"嵈嵉嵍",10,"嵙嵚嵜嵞",10,"嵪嵭嵮嵰嵱嵲嵳嵵",12,"嶃",21,"嶚嶛嶜嶞嶟嶠"],
["8e40","嶡",21,"嶸",12,"巆",6,"巎",12,"巜巟巠巣巤巪巬巭"],
["8e80","巰巵巶巸",4,"巿帀帄帇帉帊帋帍帎帒帓帗帞",7,"帨",4,"帯帰帲",4,"帹帺帾帿幀幁幃幆",5,"幍",6,"幖",4,"幜幝幟幠幣",14,"幵幷幹幾庁庂広庅庈庉庌庍庎庒庘庛庝庡庢庣庤庨",4,"庮",4,"庴庺庻庼庽庿",6],
["8f40","廆廇廈廋",5,"廔廕廗廘廙廚廜",11,"廩廫",8,"廵廸廹廻廼廽弅弆弇弉弌弍弎弐弒弔弖弙弚弜弝弞弡弢弣弤"],
["8f80","弨弫弬弮弰弲",6,"弻弽弾弿彁",14,"彑彔彙彚彛彜彞彟彠彣彥彧彨彫彮彯彲彴彵彶彸彺彽彾彿徃徆徍徎徏徑従徔徖徚徛徝從徟徠徢",5,"復徫徬徯",5,"徶徸徹徺徻徾",4,"忇忈忊忋忎忓忔忕忚忛応忞忟忢忣忥忦忨忩忬忯忰忲忳忴忶忷忹忺忼怇"],
["9040","怈怉怋怌怐怑怓怗怘怚怞怟怢怣怤怬怭怮怰",4,"怶",4,"怽怾恀恄",6,"恌恎恏恑恓恔恖恗恘恛恜恞恟恠恡恥恦恮恱恲恴恵恷恾悀"],
["9080","悁悂悅悆悇悈悊悋悎悏悐悑悓悕悗悘悙悜悞悡悢悤悥悧悩悪悮悰悳悵悶悷悹悺悽",7,"惇惈惉惌",4,"惒惓惔惖惗惙惛惞惡",4,"惪惱惲惵惷惸惻",4,"愂愃愄愅愇愊愋愌愐",4,"愖愗愘愙愛愜愝愞愡愢愥愨愩愪愬",18,"慀",6],
["9140","慇慉態慍慏慐慒慓慔慖",6,"慞慟慠慡慣慤慥慦慩",6,"慱慲慳慴慶慸",18,"憌憍憏",4,"憕"],
["9180","憖",6,"憞",8,"憪憫憭",9,"憸",5,"憿懀懁懃",4,"應懌",4,"懓懕",16,"懧",13,"懶",8,"戀",5,"戇戉戓戔戙戜戝戞戠戣戦戧戨戩戫戭戯戰戱戲戵戶戸",4,"扂扄扅扆扊"],
["9240","扏扐払扖扗扙扚扜",6,"扤扥扨扱扲扴扵扷扸扺扻扽抁抂抃抅抆抇抈抋",5,"抔抙抜抝択抣抦抧抩抪抭抮抯抰抲抳抴抶抷抸抺抾拀拁"],
["9280","拃拋拏拑拕拝拞拠拡拤拪拫拰拲拵拸拹拺拻挀挃挄挅挆挊挋挌挍挏挐挒挓挔挕挗挘挙挜挦挧挩挬挭挮挰挱挳",5,"挻挼挾挿捀捁捄捇捈捊捑捒捓捔捖",7,"捠捤捥捦捨捪捫捬捯捰捲捳捴捵捸捹捼捽捾捿掁掃掄掅掆掋掍掑掓掔掕掗掙",6,"採掤掦掫掯掱掲掵掶掹掻掽掿揀"],
["9340","揁揂揃揅揇揈揊揋揌揑揓揔揕揗",6,"揟揢揤",4,"揫揬揮揯揰揱揳揵揷揹揺揻揼揾搃搄搆",4,"損搎搑搒搕",5,"搝搟搢搣搤"],
["9380","搥搧搨搩搫搮",5,"搵",4,"搻搼搾摀摂摃摉摋",6,"摓摕摖摗摙",4,"摟",7,"摨摪摫摬摮",9,"摻",6,"撃撆撈",8,"撓撔撗撘撚撛撜撝撟",4,"撥撦撧撨撪撫撯撱撲撳撴撶撹撻撽撾撿擁擃擄擆",6,"擏擑擓擔擕擖擙據"],
["9440","擛擜擝擟擠擡擣擥擧",24,"攁",7,"攊",7,"攓",4,"攙",8],
["9480","攢攣攤攦",4,"攬攭攰攱攲攳攷攺攼攽敀",4,"敆敇敊敋敍敎敐敒敓敔敗敘敚敜敟敠敡敤敥敧敨敩敪敭敮敯敱敳敵敶數",14,"斈斉斊斍斎斏斒斔斕斖斘斚斝斞斠斢斣斦斨斪斬斮斱",7,"斺斻斾斿旀旂旇旈旉旊旍旐旑旓旔旕旘",7,"旡旣旤旪旫"],
["9540","旲旳旴旵旸旹旻",4,"昁昄昅昇昈昉昋昍昐昑昒昖昗昘昚昛昜昞昡昢昣昤昦昩昪昫昬昮昰昲昳昷",4,"昽昿晀時晄",6,"晍晎晐晑晘"],
["9580","晙晛晜晝晞晠晢晣晥晧晩",4,"晱晲晳晵晸晹晻晼晽晿暀暁暃暅暆暈暉暊暋暍暎暏暐暒暓暔暕暘",4,"暞",8,"暩",4,"暯",4,"暵暶暷暸暺暻暼暽暿",25,"曚曞",7,"曧曨曪",5,"曱曵曶書曺曻曽朁朂會"],
["9640","朄朅朆朇朌朎朏朑朒朓朖朘朙朚朜朞朠",5,"朧朩朮朰朲朳朶朷朸朹朻朼朾朿杁杄杅杇杊杋杍杒杔杕杗",4,"杝杢杣杤杦杧杫杬杮東杴杶"],
["9680","杸杹杺杻杽枀枂枃枅枆枈枊枌枍枎枏枑枒枓枔枖枙枛枟枠枡枤枦枩枬枮枱枲枴枹",7,"柂柅",9,"柕柖柗柛柟柡柣柤柦柧柨柪柫柭柮柲柵",7,"柾栁栂栃栄栆栍栐栒栔栕栘",4,"栞栟栠栢",6,"栫",6,"栴栵栶栺栻栿桇桋桍桏桒桖",5],
["9740","桜桝桞桟桪桬",7,"桵桸",8,"梂梄梇",7,"梐梑梒梔梕梖梘",9,"梣梤梥梩梪梫梬梮梱梲梴梶梷梸"],
["9780","梹",6,"棁棃",5,"棊棌棎棏棐棑棓棔棖棗棙棛",4,"棡棢棤",9,"棯棲棳棴棶棷棸棻棽棾棿椀椂椃椄椆",4,"椌椏椑椓",11,"椡椢椣椥",7,"椮椯椱椲椳椵椶椷椸椺椻椼椾楀楁楃",16,"楕楖楘楙楛楜楟"],
["9840","楡楢楤楥楧楨楩楪楬業楯楰楲",4,"楺楻楽楾楿榁榃榅榊榋榌榎",5,"榖榗榙榚榝",9,"榩榪榬榮榯榰榲榳榵榶榸榹榺榼榽"],
["9880","榾榿槀槂",7,"構槍槏槑槒槓槕",5,"槜槝槞槡",11,"槮槯槰槱槳",9,"槾樀",9,"樋",11,"標",5,"樠樢",5,"権樫樬樭樮樰樲樳樴樶",6,"樿",4,"橅橆橈",7,"橑",6,"橚"],
["9940","橜",4,"橢橣橤橦",10,"橲",6,"橺橻橽橾橿檁檂檃檅",8,"檏檒",4,"檘",7,"檡",5],
["9980","檧檨檪檭",114,"欥欦欨",6],
["9a40","欯欰欱欳欴欵欶欸欻欼欽欿歀歁歂歄歅歈歊歋歍",11,"歚",7,"歨歩歫",13,"歺歽歾歿殀殅殈"],
["9a80","殌殎殏殐殑殔殕殗殘殙殜",4,"殢",7,"殫",7,"殶殸",6,"毀毃毄毆",4,"毌毎毐毑毘毚毜",4,"毢",7,"毬毭毮毰毱毲毴毶毷毸毺毻毼毾",6,"氈",4,"氎氒気氜氝氞氠氣氥氫氬氭氱氳氶氷氹氺氻氼氾氿汃汄汅汈汋",4,"汑汒汓汖汘"],
["9b40","汙汚汢汣汥汦汧汫",4,"汱汳汵汷汸決汻汼汿沀沄沇沊沋沍沎沑沒沕沖沗沘沚沜沝沞沠沢沨沬沯沰沴沵沶沷沺泀況泂泃泆泇泈泋泍泎泏泑泒泘"],
["9b80","泙泚泜泝泟泤泦泧泩泬泭泲泴泹泿洀洂洃洅洆洈洉洊洍洏洐洑洓洔洕洖洘洜洝洟",5,"洦洨洩洬洭洯洰洴洶洷洸洺洿浀浂浄浉浌浐浕浖浗浘浛浝浟浡浢浤浥浧浨浫浬浭浰浱浲浳浵浶浹浺浻浽",4,"涃涄涆涇涊涋涍涏涐涒涖",4,"涜涢涥涬涭涰涱涳涴涶涷涹",5,"淁淂淃淈淉淊"],
["9c40","淍淎淏淐淒淓淔淕淗淚淛淜淟淢淣淥淧淨淩淪淭淯淰淲淴淵淶淸淺淽",7,"渆渇済渉渋渏渒渓渕渘渙減渜渞渟渢渦渧渨渪測渮渰渱渳渵"],
["9c80","渶渷渹渻",7,"湅",7,"湏湐湑湒湕湗湙湚湜湝湞湠",10,"湬湭湯",14,"満溁溂溄溇溈溊",4,"溑",6,"溙溚溛溝溞溠溡溣溤溦溨溩溫溬溭溮溰溳溵溸溹溼溾溿滀滃滄滅滆滈滉滊滌滍滎滐滒滖滘滙滛滜滝滣滧滪",5],
["9d40","滰滱滲滳滵滶滷滸滺",7,"漃漄漅漇漈漊",4,"漐漑漒漖",9,"漡漢漣漥漦漧漨漬漮漰漲漴漵漷",6,"漿潀潁潂"],
["9d80","潃潄潅潈潉潊潌潎",9,"潙潚潛潝潟潠潡潣潤潥潧",5,"潯潰潱潳潵潶潷潹潻潽",6,"澅澆澇澊澋澏",12,"澝澞澟澠澢",4,"澨",10,"澴澵澷澸澺",5,"濁濃",5,"濊",6,"濓",10,"濟濢濣濤濥"],
["9e40","濦",7,"濰",32,"瀒",7,"瀜",6,"瀤",6],
["9e80","瀫",9,"瀶瀷瀸瀺",17,"灍灎灐",13,"灟",11,"灮灱灲灳灴灷灹灺灻災炁炂炃炄炆炇炈炋炌炍炏炐炑炓炗炘炚炛炞",12,"炰炲炴炵炶為炾炿烄烅烆烇烉烋",12,"烚"],
["9f40","烜烝烞烠烡烢烣烥烪烮烰",6,"烸烺烻烼烾",10,"焋",4,"焑焒焔焗焛",10,"焧",7,"焲焳焴"],
["9f80","焵焷",13,"煆煇煈煉煋煍煏",12,"煝煟",4,"煥煩",4,"煯煰煱煴煵煶煷煹煻煼煾",5,"熅",4,"熋熌熍熎熐熑熒熓熕熖熗熚",4,"熡",6,"熩熪熫熭",5,"熴熶熷熸熺",8,"燄",9,"燏",4],
["a040","燖",9,"燡燢燣燤燦燨",5,"燯",9,"燺",11,"爇",19],
["a080","爛爜爞",9,"爩爫爭爮爯爲爳爴爺爼爾牀",6,"牉牊牋牎牏牐牑牓牔牕牗牘牚牜牞牠牣牤牥牨牪牫牬牭牰牱牳牴牶牷牸牻牼牽犂犃犅",4,"犌犎犐犑犓",11,"犠",11,"犮犱犲犳犵犺",6,"狅狆狇狉狊狋狌狏狑狓狔狕狖狘狚狛"],
["a1a1","　、。·ˉˇ¨〃々—～‖…‘’“”〔〕〈",7,"〖〗【】±×÷∶∧∨∑∏∪∩∈∷√⊥∥∠⌒⊙∫∮≡≌≈∽∝≠≮≯≤≥∞∵∴♂♀°′″℃＄¤￠￡‰§№☆★○●◎◇◆□■△▲※→←↑↓〓"],
["a2a1","ⅰ",9],
["a2b1","⒈",19,"⑴",19,"①",9],
["a2e5","㈠",9],
["a2f1","Ⅰ",11],
["a3a1","！＂＃￥％",88,"￣"],
["a4a1","ぁ",82],
["a5a1","ァ",85],
["a6a1","Α",16,"Σ",6],
["a6c1","α",16,"σ",6],
["a6e0","︵︶︹︺︿﹀︽︾﹁﹂﹃﹄"],
["a6ee","︻︼︷︸︱"],
["a6f4","︳︴"],
["a7a1","А",5,"ЁЖ",25],
["a7d1","а",5,"ёж",25],
["a840","ˊˋ˙–―‥‵℅℉↖↗↘↙∕∟∣≒≦≧⊿═",35,"▁",6],
["a880","█",7,"▓▔▕▼▽◢◣◤◥☉⊕〒〝〞"],
["a8a1","āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüêɑ"],
["a8bd","ńň"],
["a8c0","ɡ"],
["a8c5","ㄅ",36],
["a940","〡",8,"㊣㎎㎏㎜㎝㎞㎡㏄㏎㏑㏒㏕︰￢￤"],
["a959","℡㈱"],
["a95c","‐"],
["a960","ー゛゜ヽヾ〆ゝゞ﹉",9,"﹔﹕﹖﹗﹙",8],
["a980","﹢",4,"﹨﹩﹪﹫"],
["a996","〇"],
["a9a4","─",75],
["aa40","狜狝狟狢",5,"狪狫狵狶狹狽狾狿猀猂猄",5,"猋猌猍猏猐猑猒猔猘猙猚猟猠猣猤猦猧猨猭猯猰猲猳猵猶猺猻猼猽獀",8],
["aa80","獉獊獋獌獎獏獑獓獔獕獖獘",7,"獡",10,"獮獰獱"],
["ab40","獲",11,"獿",4,"玅玆玈玊玌玍玏玐玒玓玔玕玗玘玙玚玜玝玞玠玡玣",5,"玪玬玭玱玴玵玶玸玹玼玽玾玿珁珃",4],
["ab80","珋珌珎珒",6,"珚珛珜珝珟珡珢珣珤珦珨珪珫珬珮珯珰珱珳",4],
["ac40","珸",10,"琄琇琈琋琌琍琎琑",8,"琜",5,"琣琤琧琩琫琭琯琱琲琷",4,"琽琾琿瑀瑂",11],
["ac80","瑎",6,"瑖瑘瑝瑠",12,"瑮瑯瑱",4,"瑸瑹瑺"],
["ad40","瑻瑼瑽瑿璂璄璅璆璈璉璊璌璍璏璑",10,"璝璟",7,"璪",15,"璻",12],
["ad80","瓈",9,"瓓",8,"瓝瓟瓡瓥瓧",6,"瓰瓱瓲"],
["ae40","瓳瓵瓸",6,"甀甁甂甃甅",7,"甎甐甒甔甕甖甗甛甝甞甠",4,"甦甧甪甮甴甶甹甼甽甿畁畂畃畄畆畇畉畊畍畐畑畒畓畕畖畗畘"],
["ae80","畝",7,"畧畨畩畫",6,"畳畵當畷畺",4,"疀疁疂疄疅疇"],
["af40","疈疉疊疌疍疎疐疓疕疘疛疜疞疢疦",4,"疭疶疷疺疻疿痀痁痆痋痌痎痏痐痑痓痗痙痚痜痝痟痠痡痥痩痬痭痮痯痲痳痵痶痷痸痺痻痽痾瘂瘄瘆瘇"],
["af80","瘈瘉瘋瘍瘎瘏瘑瘒瘓瘔瘖瘚瘜瘝瘞瘡瘣瘧瘨瘬瘮瘯瘱瘲瘶瘷瘹瘺瘻瘽癁療癄"],
["b040","癅",6,"癎",5,"癕癗",4,"癝癟癠癡癢癤",6,"癬癭癮癰",7,"癹発發癿皀皁皃皅皉皊皌皍皏皐皒皔皕皗皘皚皛"],
["b080","皜",7,"皥",8,"皯皰皳皵",9,"盀盁盃啊阿埃挨哎唉哀皑癌蔼矮艾碍爱隘鞍氨安俺按暗岸胺案肮昂盎凹敖熬翱袄傲奥懊澳芭捌扒叭吧笆八疤巴拔跋靶把耙坝霸罢爸白柏百摆佰败拜稗斑班搬扳般颁板版扮拌伴瓣半办绊邦帮梆榜膀绑棒磅蚌镑傍谤苞胞包褒剥"],
["b140","盄盇盉盋盌盓盕盙盚盜盝盞盠",4,"盦",7,"盰盳盵盶盷盺盻盽盿眀眂眃眅眆眊県眎",10,"眛眜眝眞眡眣眤眥眧眪眫"],
["b180","眬眮眰",4,"眹眻眽眾眿睂睄睅睆睈",7,"睒",7,"睜薄雹保堡饱宝抱报暴豹鲍爆杯碑悲卑北辈背贝钡倍狈备惫焙被奔苯本笨崩绷甭泵蹦迸逼鼻比鄙笔彼碧蓖蔽毕毙毖币庇痹闭敝弊必辟壁臂避陛鞭边编贬扁便变卞辨辩辫遍标彪膘表鳖憋别瘪彬斌濒滨宾摈兵冰柄丙秉饼炳"],
["b240","睝睞睟睠睤睧睩睪睭",11,"睺睻睼瞁瞂瞃瞆",5,"瞏瞐瞓",11,"瞡瞣瞤瞦瞨瞫瞭瞮瞯瞱瞲瞴瞶",4],
["b280","瞼瞾矀",12,"矎",8,"矘矙矚矝",4,"矤病并玻菠播拨钵波博勃搏铂箔伯帛舶脖膊渤泊驳捕卜哺补埠不布步簿部怖擦猜裁材才财睬踩采彩菜蔡餐参蚕残惭惨灿苍舱仓沧藏操糙槽曹草厕策侧册测层蹭插叉茬茶查碴搽察岔差诧拆柴豺搀掺蝉馋谗缠铲产阐颤昌猖"],
["b340","矦矨矪矯矰矱矲矴矵矷矹矺矻矼砃",5,"砊砋砎砏砐砓砕砙砛砞砠砡砢砤砨砪砫砮砯砱砲砳砵砶砽砿硁硂硃硄硆硈硉硊硋硍硏硑硓硔硘硙硚"],
["b380","硛硜硞",11,"硯",7,"硸硹硺硻硽",6,"场尝常长偿肠厂敞畅唱倡超抄钞朝嘲潮巢吵炒车扯撤掣彻澈郴臣辰尘晨忱沉陈趁衬撑称城橙成呈乘程惩澄诚承逞骋秤吃痴持匙池迟弛驰耻齿侈尺赤翅斥炽充冲虫崇宠抽酬畴踌稠愁筹仇绸瞅丑臭初出橱厨躇锄雏滁除楚"],
["b440","碄碅碆碈碊碋碏碐碒碔碕碖碙碝碞碠碢碤碦碨",7,"碵碶碷碸確碻碼碽碿磀磂磃磄磆磇磈磌磍磎磏磑磒磓磖磗磘磚",9],
["b480","磤磥磦磧磩磪磫磭",4,"磳磵磶磸磹磻",5,"礂礃礄礆",6,"础储矗搐触处揣川穿椽传船喘串疮窗幢床闯创吹炊捶锤垂春椿醇唇淳纯蠢戳绰疵茨磁雌辞慈瓷词此刺赐次聪葱囱匆从丛凑粗醋簇促蹿篡窜摧崔催脆瘁粹淬翠村存寸磋撮搓措挫错搭达答瘩打大呆歹傣戴带殆代贷袋待逮"],
["b540","礍",5,"礔",9,"礟",4,"礥",14,"礵",4,"礽礿祂祃祄祅祇祊",8,"祔祕祘祙祡祣"],
["b580","祤祦祩祪祫祬祮祰",6,"祹祻",4,"禂禃禆禇禈禉禋禌禍禎禐禑禒怠耽担丹单郸掸胆旦氮但惮淡诞弹蛋当挡党荡档刀捣蹈倒岛祷导到稻悼道盗德得的蹬灯登等瞪凳邓堤低滴迪敌笛狄涤翟嫡抵底地蒂第帝弟递缔颠掂滇碘点典靛垫电佃甸店惦奠淀殿碉叼雕凋刁掉吊钓调跌爹碟蝶迭谍叠"],
["b640","禓",6,"禛",11,"禨",10,"禴",4,"禼禿秂秄秅秇秈秊秌秎秏秐秓秔秖秗秙",5,"秠秡秢秥秨秪"],
["b680","秬秮秱",6,"秹秺秼秾秿稁稄稅稇稈稉稊稌稏",4,"稕稖稘稙稛稜丁盯叮钉顶鼎锭定订丢东冬董懂动栋侗恫冻洞兜抖斗陡豆逗痘都督毒犊独读堵睹赌杜镀肚度渡妒端短锻段断缎堆兑队对墩吨蹲敦顿囤钝盾遁掇哆多夺垛躲朵跺舵剁惰堕蛾峨鹅俄额讹娥恶厄扼遏鄂饿恩而儿耳尔饵洱二"],
["b740","稝稟稡稢稤",14,"稴稵稶稸稺稾穀",5,"穇",9,"穒",4,"穘",16],
["b780","穩",6,"穱穲穳穵穻穼穽穾窂窅窇窉窊窋窌窎窏窐窓窔窙窚窛窞窡窢贰发罚筏伐乏阀法珐藩帆番翻樊矾钒繁凡烦反返范贩犯饭泛坊芳方肪房防妨仿访纺放菲非啡飞肥匪诽吠肺废沸费芬酚吩氛分纷坟焚汾粉奋份忿愤粪丰封枫蜂峰锋风疯烽逢冯缝讽奉凤佛否夫敷肤孵扶拂辐幅氟符伏俘服"],
["b840","窣窤窧窩窪窫窮",4,"窴",10,"竀",10,"竌",9,"竗竘竚竛竜竝竡竢竤竧",5,"竮竰竱竲竳"],
["b880","竴",4,"竻竼竾笀笁笂笅笇笉笌笍笎笐笒笓笖笗笘笚笜笝笟笡笢笣笧笩笭浮涪福袱弗甫抚辅俯釜斧脯腑府腐赴副覆赋复傅付阜父腹负富讣附妇缚咐噶嘎该改概钙盖溉干甘杆柑竿肝赶感秆敢赣冈刚钢缸肛纲岗港杠篙皋高膏羔糕搞镐稿告哥歌搁戈鸽胳疙割革葛格蛤阁隔铬个各给根跟耕更庚羹"],
["b940","笯笰笲笴笵笶笷笹笻笽笿",5,"筆筈筊筍筎筓筕筗筙筜筞筟筡筣",10,"筯筰筳筴筶筸筺筼筽筿箁箂箃箄箆",6,"箎箏"],
["b980","箑箒箓箖箘箙箚箛箞箟箠箣箤箥箮箯箰箲箳箵箶箷箹",7,"篂篃範埂耿梗工攻功恭龚供躬公宫弓巩汞拱贡共钩勾沟苟狗垢构购够辜菇咕箍估沽孤姑鼓古蛊骨谷股故顾固雇刮瓜剐寡挂褂乖拐怪棺关官冠观管馆罐惯灌贯光广逛瑰规圭硅归龟闺轨鬼诡癸桂柜跪贵刽辊滚棍锅郭国果裹过哈"],
["ba40","篅篈築篊篋篍篎篏篐篒篔",4,"篛篜篞篟篠篢篣篤篧篨篩篫篬篭篯篰篲",4,"篸篹篺篻篽篿",7,"簈簉簊簍簎簐",5,"簗簘簙"],
["ba80","簚",4,"簠",5,"簨簩簫",12,"簹",5,"籂骸孩海氦亥害骇酣憨邯韩含涵寒函喊罕翰撼捍旱憾悍焊汗汉夯杭航壕嚎豪毫郝好耗号浩呵喝荷菏核禾和何合盒貉阂河涸赫褐鹤贺嘿黑痕很狠恨哼亨横衡恒轰哄烘虹鸿洪宏弘红喉侯猴吼厚候后呼乎忽瑚壶葫胡蝴狐糊湖"],
["bb40","籃",9,"籎",36,"籵",5,"籾",9],
["bb80","粈粊",6,"粓粔粖粙粚粛粠粡粣粦粧粨粩粫粬粭粯粰粴",4,"粺粻弧虎唬护互沪户花哗华猾滑画划化话槐徊怀淮坏欢环桓还缓换患唤痪豢焕涣宦幻荒慌黄磺蝗簧皇凰惶煌晃幌恍谎灰挥辉徽恢蛔回毁悔慧卉惠晦贿秽会烩汇讳诲绘荤昏婚魂浑混豁活伙火获或惑霍货祸击圾基机畸稽积箕"],
["bc40","粿糀糂糃糄糆糉糋糎",6,"糘糚糛糝糞糡",6,"糩",5,"糰",7,"糹糺糼",13,"紋",5],
["bc80","紑",14,"紡紣紤紥紦紨紩紪紬紭紮細",6,"肌饥迹激讥鸡姬绩缉吉极棘辑籍集及急疾汲即嫉级挤几脊己蓟技冀季伎祭剂悸济寄寂计记既忌际妓继纪嘉枷夹佳家加荚颊贾甲钾假稼价架驾嫁歼监坚尖笺间煎兼肩艰奸缄茧检柬碱硷拣捡简俭剪减荐槛鉴践贱见键箭件"],
["bd40","紷",54,"絯",7],
["bd80","絸",32,"健舰剑饯渐溅涧建僵姜将浆江疆蒋桨奖讲匠酱降蕉椒礁焦胶交郊浇骄娇嚼搅铰矫侥脚狡角饺缴绞剿教酵轿较叫窖揭接皆秸街阶截劫节桔杰捷睫竭洁结解姐戒藉芥界借介疥诫届巾筋斤金今津襟紧锦仅谨进靳晋禁近烬浸"],
["be40","継",12,"綧",6,"綯",42],
["be80","線",32,"尽劲荆兢茎睛晶鲸京惊精粳经井警景颈静境敬镜径痉靖竟竞净炯窘揪究纠玖韭久灸九酒厩救旧臼舅咎就疚鞠拘狙疽居驹菊局咀矩举沮聚拒据巨具距踞锯俱句惧炬剧捐鹃娟倦眷卷绢撅攫抉掘倔爵觉决诀绝均菌钧军君峻"],
["bf40","緻",62],
["bf80","縺縼",4,"繂",4,"繈",21,"俊竣浚郡骏喀咖卡咯开揩楷凯慨刊堪勘坎砍看康慷糠扛抗亢炕考拷烤靠坷苛柯棵磕颗科壳咳可渴克刻客课肯啃垦恳坑吭空恐孔控抠口扣寇枯哭窟苦酷库裤夸垮挎跨胯块筷侩快宽款匡筐狂框矿眶旷况亏盔岿窥葵奎魁傀"],
["c040","繞",35,"纃",23,"纜纝纞"],
["c080","纮纴纻纼绖绤绬绹缊缐缞缷缹缻",6,"罃罆",9,"罒罓馈愧溃坤昆捆困括扩廓阔垃拉喇蜡腊辣啦莱来赖蓝婪栏拦篮阑兰澜谰揽览懒缆烂滥琅榔狼廊郎朗浪捞劳牢老佬姥酪烙涝勒乐雷镭蕾磊累儡垒擂肋类泪棱楞冷厘梨犁黎篱狸离漓理李里鲤礼莉荔吏栗丽厉励砾历利傈例俐"],
["c140","罖罙罛罜罝罞罠罣",4,"罫罬罭罯罰罳罵罶罷罸罺罻罼罽罿羀羂",7,"羋羍羏",4,"羕",4,"羛羜羠羢羣羥羦羨",6,"羱"],
["c180","羳",4,"羺羻羾翀翂翃翄翆翇翈翉翋翍翏",4,"翖翗翙",5,"翢翣痢立粒沥隶力璃哩俩联莲连镰廉怜涟帘敛脸链恋炼练粮凉梁粱良两辆量晾亮谅撩聊僚疗燎寥辽潦了撂镣廖料列裂烈劣猎琳林磷霖临邻鳞淋凛赁吝拎玲菱零龄铃伶羚凌灵陵岭领另令溜琉榴硫馏留刘瘤流柳六龙聋咙笼窿"],
["c240","翤翧翨翪翫翬翭翯翲翴",6,"翽翾翿耂耇耈耉耊耎耏耑耓耚耛耝耞耟耡耣耤耫",5,"耲耴耹耺耼耾聀聁聄聅聇聈聉聎聏聐聑聓聕聖聗"],
["c280","聙聛",13,"聫",5,"聲",11,"隆垄拢陇楼娄搂篓漏陋芦卢颅庐炉掳卤虏鲁麓碌露路赂鹿潞禄录陆戮驴吕铝侣旅履屡缕虑氯律率滤绿峦挛孪滦卵乱掠略抡轮伦仑沦纶论萝螺罗逻锣箩骡裸落洛骆络妈麻玛码蚂马骂嘛吗埋买麦卖迈脉瞒馒蛮满蔓曼慢漫"],
["c340","聾肁肂肅肈肊肍",5,"肔肕肗肙肞肣肦肧肨肬肰肳肵肶肸肹肻胅胇",4,"胏",6,"胘胟胠胢胣胦胮胵胷胹胻胾胿脀脁脃脄脅脇脈脋"],
["c380","脌脕脗脙脛脜脝脟",12,"脭脮脰脳脴脵脷脹",4,"脿谩芒茫盲氓忙莽猫茅锚毛矛铆卯茂冒帽貌贸么玫枚梅酶霉煤没眉媒镁每美昧寐妹媚门闷们萌蒙檬盟锰猛梦孟眯醚靡糜迷谜弥米秘觅泌蜜密幂棉眠绵冕免勉娩缅面苗描瞄藐秒渺庙妙蔑灭民抿皿敏悯闽明螟鸣铭名命谬摸"],
["c440","腀",5,"腇腉腍腎腏腒腖腗腘腛",4,"腡腢腣腤腦腨腪腫腬腯腲腳腵腶腷腸膁膃",4,"膉膋膌膍膎膐膒",5,"膙膚膞",4,"膤膥"],
["c480","膧膩膫",7,"膴",5,"膼膽膾膿臄臅臇臈臉臋臍",6,"摹蘑模膜磨摩魔抹末莫墨默沫漠寞陌谋牟某拇牡亩姆母墓暮幕募慕木目睦牧穆拿哪呐钠那娜纳氖乃奶耐奈南男难囊挠脑恼闹淖呢馁内嫩能妮霓倪泥尼拟你匿腻逆溺蔫拈年碾撵捻念娘酿鸟尿捏聂孽啮镊镍涅您柠狞凝宁"],
["c540","臔",14,"臤臥臦臨臩臫臮",4,"臵",5,"臽臿舃與",4,"舎舏舑舓舕",5,"舝舠舤舥舦舧舩舮舲舺舼舽舿"],
["c580","艀艁艂艃艅艆艈艊艌艍艎艐",7,"艙艛艜艝艞艠",7,"艩拧泞牛扭钮纽脓浓农弄奴努怒女暖虐疟挪懦糯诺哦欧鸥殴藕呕偶沤啪趴爬帕怕琶拍排牌徘湃派攀潘盘磐盼畔判叛乓庞旁耪胖抛咆刨炮袍跑泡呸胚培裴赔陪配佩沛喷盆砰抨烹澎彭蓬棚硼篷膨朋鹏捧碰坯砒霹批披劈琵毗"],
["c640","艪艫艬艭艱艵艶艷艸艻艼芀芁芃芅芆芇芉芌芐芓芔芕芖芚芛芞芠芢芣芧芲芵芶芺芻芼芿苀苂苃苅苆苉苐苖苙苚苝苢苧苨苩苪苬苭苮苰苲苳苵苶苸"],
["c680","苺苼",4,"茊茋茍茐茒茓茖茘茙茝",9,"茩茪茮茰茲茷茻茽啤脾疲皮匹痞僻屁譬篇偏片骗飘漂瓢票撇瞥拼频贫品聘乒坪苹萍平凭瓶评屏坡泼颇婆破魄迫粕剖扑铺仆莆葡菩蒲埔朴圃普浦谱曝瀑期欺栖戚妻七凄漆柒沏其棋奇歧畦崎脐齐旗祈祁骑起岂乞企启契砌器气迄弃汽泣讫掐"],
["c740","茾茿荁荂荄荅荈荊",4,"荓荕",4,"荝荢荰",6,"荹荺荾",6,"莇莈莊莋莌莍莏莐莑莔莕莖莗莙莚莝莟莡",6,"莬莭莮"],
["c780","莯莵莻莾莿菂菃菄菆菈菉菋菍菎菐菑菒菓菕菗菙菚菛菞菢菣菤菦菧菨菫菬菭恰洽牵扦钎铅千迁签仟谦乾黔钱钳前潜遣浅谴堑嵌欠歉枪呛腔羌墙蔷强抢橇锹敲悄桥瞧乔侨巧鞘撬翘峭俏窍切茄且怯窃钦侵亲秦琴勤芹擒禽寝沁青轻氢倾卿清擎晴氰情顷请庆琼穷秋丘邱球求囚酋泅趋区蛆曲躯屈驱渠"],
["c840","菮華菳",4,"菺菻菼菾菿萀萂萅萇萈萉萊萐萒",5,"萙萚萛萞",5,"萩",7,"萲",5,"萹萺萻萾",7,"葇葈葉"],
["c880","葊",6,"葒",4,"葘葝葞葟葠葢葤",4,"葪葮葯葰葲葴葷葹葻葼取娶龋趣去圈颧权醛泉全痊拳犬券劝缺炔瘸却鹊榷确雀裙群然燃冉染瓤壤攘嚷让饶扰绕惹热壬仁人忍韧任认刃妊纫扔仍日戎茸蓉荣融熔溶容绒冗揉柔肉茹蠕儒孺如辱乳汝入褥软阮蕊瑞锐闰润若弱撒洒萨腮鳃塞赛三叁"],
["c940","葽",4,"蒃蒄蒅蒆蒊蒍蒏",7,"蒘蒚蒛蒝蒞蒟蒠蒢",12,"蒰蒱蒳蒵蒶蒷蒻蒼蒾蓀蓂蓃蓅蓆蓇蓈蓋蓌蓎蓏蓒蓔蓕蓗"],
["c980","蓘",4,"蓞蓡蓢蓤蓧",4,"蓭蓮蓯蓱",10,"蓽蓾蔀蔁蔂伞散桑嗓丧搔骚扫嫂瑟色涩森僧莎砂杀刹沙纱傻啥煞筛晒珊苫杉山删煽衫闪陕擅赡膳善汕扇缮墒伤商赏晌上尚裳梢捎稍烧芍勺韶少哨邵绍奢赊蛇舌舍赦摄射慑涉社设砷申呻伸身深娠绅神沈审婶甚肾慎渗声生甥牲升绳"],
["ca40","蔃",8,"蔍蔎蔏蔐蔒蔔蔕蔖蔘蔙蔛蔜蔝蔞蔠蔢",8,"蔭",9,"蔾",4,"蕄蕅蕆蕇蕋",10],
["ca80","蕗蕘蕚蕛蕜蕝蕟",4,"蕥蕦蕧蕩",8,"蕳蕵蕶蕷蕸蕼蕽蕿薀薁省盛剩胜圣师失狮施湿诗尸虱十石拾时什食蚀实识史矢使屎驶始式示士世柿事拭誓逝势是嗜噬适仕侍释饰氏市恃室视试收手首守寿授售受瘦兽蔬枢梳殊抒输叔舒淑疏书赎孰熟薯暑曙署蜀黍鼠属术述树束戍竖墅庶数漱"],
["cb40","薂薃薆薈",6,"薐",10,"薝",6,"薥薦薧薩薫薬薭薱",5,"薸薺",6,"藂",6,"藊",4,"藑藒"],
["cb80","藔藖",5,"藝",6,"藥藦藧藨藪",14,"恕刷耍摔衰甩帅栓拴霜双爽谁水睡税吮瞬顺舜说硕朔烁斯撕嘶思私司丝死肆寺嗣四伺似饲巳松耸怂颂送宋讼诵搜艘擞嗽苏酥俗素速粟僳塑溯宿诉肃酸蒜算虽隋随绥髓碎岁穗遂隧祟孙损笋蓑梭唆缩琐索锁所塌他它她塔"],
["cc40","藹藺藼藽藾蘀",4,"蘆",10,"蘒蘓蘔蘕蘗",15,"蘨蘪",13,"蘹蘺蘻蘽蘾蘿虀"],
["cc80","虁",11,"虒虓處",4,"虛虜虝號虠虡虣",7,"獭挞蹋踏胎苔抬台泰酞太态汰坍摊贪瘫滩坛檀痰潭谭谈坦毯袒碳探叹炭汤塘搪堂棠膛唐糖倘躺淌趟烫掏涛滔绦萄桃逃淘陶讨套特藤腾疼誊梯剔踢锑提题蹄啼体替嚏惕涕剃屉天添填田甜恬舔腆挑条迢眺跳贴铁帖厅听烃"],
["cd40","虭虯虰虲",6,"蚃",6,"蚎",4,"蚔蚖",5,"蚞",4,"蚥蚦蚫蚭蚮蚲蚳蚷蚸蚹蚻",4,"蛁蛂蛃蛅蛈蛌蛍蛒蛓蛕蛖蛗蛚蛜"],
["cd80","蛝蛠蛡蛢蛣蛥蛦蛧蛨蛪蛫蛬蛯蛵蛶蛷蛺蛻蛼蛽蛿蜁蜄蜅蜆蜋蜌蜎蜏蜐蜑蜔蜖汀廷停亭庭挺艇通桐酮瞳同铜彤童桶捅筒统痛偷投头透凸秃突图徒途涂屠土吐兔湍团推颓腿蜕褪退吞屯臀拖托脱鸵陀驮驼椭妥拓唾挖哇蛙洼娃瓦袜歪外豌弯湾玩顽丸烷完碗挽晚皖惋宛婉万腕汪王亡枉网往旺望忘妄威"],
["ce40","蜙蜛蜝蜟蜠蜤蜦蜧蜨蜪蜫蜬蜭蜯蜰蜲蜳蜵蜶蜸蜹蜺蜼蜽蝀",6,"蝊蝋蝍蝏蝐蝑蝒蝔蝕蝖蝘蝚",5,"蝡蝢蝦",7,"蝯蝱蝲蝳蝵"],
["ce80","蝷蝸蝹蝺蝿螀螁螄螆螇螉螊螌螎",4,"螔螕螖螘",6,"螠",4,"巍微危韦违桅围唯惟为潍维苇萎委伟伪尾纬未蔚味畏胃喂魏位渭谓尉慰卫瘟温蚊文闻纹吻稳紊问嗡翁瓮挝蜗涡窝我斡卧握沃巫呜钨乌污诬屋无芜梧吾吴毋武五捂午舞伍侮坞戊雾晤物勿务悟误昔熙析西硒矽晰嘻吸锡牺"],
["cf40","螥螦螧螩螪螮螰螱螲螴螶螷螸螹螻螼螾螿蟁",4,"蟇蟈蟉蟌",4,"蟔",6,"蟜蟝蟞蟟蟡蟢蟣蟤蟦蟧蟨蟩蟫蟬蟭蟯",9],
["cf80","蟺蟻蟼蟽蟿蠀蠁蠂蠄",5,"蠋",7,"蠔蠗蠘蠙蠚蠜",4,"蠣稀息希悉膝夕惜熄烯溪汐犀檄袭席习媳喜铣洗系隙戏细瞎虾匣霞辖暇峡侠狭下厦夏吓掀锨先仙鲜纤咸贤衔舷闲涎弦嫌显险现献县腺馅羡宪陷限线相厢镶香箱襄湘乡翔祥详想响享项巷橡像向象萧硝霄削哮嚣销消宵淆晓"],
["d040","蠤",13,"蠳",5,"蠺蠻蠽蠾蠿衁衂衃衆",5,"衎",5,"衕衖衘衚",6,"衦衧衪衭衯衱衳衴衵衶衸衹衺"],
["d080","衻衼袀袃袆袇袉袊袌袎袏袐袑袓袔袕袗",4,"袝",4,"袣袥",5,"小孝校肖啸笑效楔些歇蝎鞋协挟携邪斜胁谐写械卸蟹懈泄泻谢屑薪芯锌欣辛新忻心信衅星腥猩惺兴刑型形邢行醒幸杏性姓兄凶胸匈汹雄熊休修羞朽嗅锈秀袖绣墟戌需虚嘘须徐许蓄酗叙旭序畜恤絮婿绪续轩喧宣悬旋玄"],
["d140","袬袮袯袰袲",4,"袸袹袺袻袽袾袿裀裃裄裇裈裊裋裌裍裏裐裑裓裖裗裚",4,"裠裡裦裧裩",6,"裲裵裶裷裺裻製裿褀褁褃",5],
["d180","褉褋",4,"褑褔",4,"褜",4,"褢褣褤褦褧褨褩褬褭褮褯褱褲褳褵褷选癣眩绚靴薛学穴雪血勋熏循旬询寻驯巡殉汛训讯逊迅压押鸦鸭呀丫芽牙蚜崖衙涯雅哑亚讶焉咽阉烟淹盐严研蜒岩延言颜阎炎沿奄掩眼衍演艳堰燕厌砚雁唁彦焰宴谚验殃央鸯秧杨扬佯疡羊洋阳氧仰痒养样漾邀腰妖瑶"],
["d240","褸",8,"襂襃襅",24,"襠",5,"襧",19,"襼"],
["d280","襽襾覀覂覄覅覇",26,"摇尧遥窑谣姚咬舀药要耀椰噎耶爷野冶也页掖业叶曳腋夜液一壹医揖铱依伊衣颐夷遗移仪胰疑沂宜姨彝椅蚁倚已乙矣以艺抑易邑屹亿役臆逸肄疫亦裔意毅忆义益溢诣议谊译异翼翌绎茵荫因殷音阴姻吟银淫寅饮尹引隐"],
["d340","覢",30,"觃觍觓觔觕觗觘觙觛觝觟觠觡觢觤觧觨觩觪觬觭觮觰觱觲觴",6],
["d380","觻",4,"訁",5,"計",21,"印英樱婴鹰应缨莹萤营荧蝇迎赢盈影颖硬映哟拥佣臃痈庸雍踊蛹咏泳涌永恿勇用幽优悠忧尤由邮铀犹油游酉有友右佑釉诱又幼迂淤于盂榆虞愚舆余俞逾鱼愉渝渔隅予娱雨与屿禹宇语羽玉域芋郁吁遇喻峪御愈欲狱育誉"],
["d440","訞",31,"訿",8,"詉",21],
["d480","詟",25,"詺",6,"浴寓裕预豫驭鸳渊冤元垣袁原援辕园员圆猿源缘远苑愿怨院曰约越跃钥岳粤月悦阅耘云郧匀陨允运蕴酝晕韵孕匝砸杂栽哉灾宰载再在咱攒暂赞赃脏葬遭糟凿藻枣早澡蚤躁噪造皂灶燥责择则泽贼怎增憎曾赠扎喳渣札轧"],
["d540","誁",7,"誋",7,"誔",46],
["d580","諃",32,"铡闸眨栅榨咋乍炸诈摘斋宅窄债寨瞻毡詹粘沾盏斩辗崭展蘸栈占战站湛绽樟章彰漳张掌涨杖丈帐账仗胀瘴障招昭找沼赵照罩兆肇召遮折哲蛰辙者锗蔗这浙珍斟真甄砧臻贞针侦枕疹诊震振镇阵蒸挣睁征狰争怔整拯正政"],
["d640","諤",34,"謈",27],
["d680","謤謥謧",30,"帧症郑证芝枝支吱蜘知肢脂汁之织职直植殖执值侄址指止趾只旨纸志挚掷至致置帜峙制智秩稚质炙痔滞治窒中盅忠钟衷终种肿重仲众舟周州洲诌粥轴肘帚咒皱宙昼骤珠株蛛朱猪诸诛逐竹烛煮拄瞩嘱主著柱助蛀贮铸筑"],
["d740","譆",31,"譧",4,"譭",25],
["d780","讇",24,"讬讱讻诇诐诪谉谞住注祝驻抓爪拽专砖转撰赚篆桩庄装妆撞壮状椎锥追赘坠缀谆准捉拙卓桌琢茁酌啄着灼浊兹咨资姿滋淄孜紫仔籽滓子自渍字鬃棕踪宗综总纵邹走奏揍租足卒族祖诅阻组钻纂嘴醉最罪尊遵昨左佐柞做作坐座"],
["d840","谸",8,"豂豃豄豅豈豊豋豍",7,"豖豗豘豙豛",5,"豣",6,"豬",6,"豴豵豶豷豻",6,"貃貄貆貇"],
["d880","貈貋貍",6,"貕貖貗貙",20,"亍丌兀丐廿卅丕亘丞鬲孬噩丨禺丿匕乇夭爻卮氐囟胤馗毓睾鼗丶亟鼐乜乩亓芈孛啬嘏仄厍厝厣厥厮靥赝匚叵匦匮匾赜卦卣刂刈刎刭刳刿剀剌剞剡剜蒯剽劂劁劐劓冂罔亻仃仉仂仨仡仫仞伛仳伢佤仵伥伧伉伫佞佧攸佚佝"],
["d940","貮",62],
["d980","賭",32,"佟佗伲伽佶佴侑侉侃侏佾佻侪佼侬侔俦俨俪俅俚俣俜俑俟俸倩偌俳倬倏倮倭俾倜倌倥倨偾偃偕偈偎偬偻傥傧傩傺僖儆僭僬僦僮儇儋仝氽佘佥俎龠汆籴兮巽黉馘冁夔勹匍訇匐凫夙兕亠兖亳衮袤亵脔裒禀嬴蠃羸冫冱冽冼"],
["da40","贎",14,"贠赑赒赗赟赥赨赩赪赬赮赯赱赲赸",8,"趂趃趆趇趈趉趌",4,"趒趓趕",9,"趠趡"],
["da80","趢趤",12,"趲趶趷趹趻趽跀跁跂跅跇跈跉跊跍跐跒跓跔凇冖冢冥讠讦讧讪讴讵讷诂诃诋诏诎诒诓诔诖诘诙诜诟诠诤诨诩诮诰诳诶诹诼诿谀谂谄谇谌谏谑谒谔谕谖谙谛谘谝谟谠谡谥谧谪谫谮谯谲谳谵谶卩卺阝阢阡阱阪阽阼陂陉陔陟陧陬陲陴隈隍隗隰邗邛邝邙邬邡邴邳邶邺"],
["db40","跕跘跙跜跠跡跢跥跦跧跩跭跮跰跱跲跴跶跼跾",6,"踆踇踈踋踍踎踐踑踒踓踕",7,"踠踡踤",4,"踫踭踰踲踳踴踶踷踸踻踼踾"],
["db80","踿蹃蹅蹆蹌",4,"蹓",5,"蹚",11,"蹧蹨蹪蹫蹮蹱邸邰郏郅邾郐郄郇郓郦郢郜郗郛郫郯郾鄄鄢鄞鄣鄱鄯鄹酃酆刍奂劢劬劭劾哿勐勖勰叟燮矍廴凵凼鬯厶弁畚巯坌垩垡塾墼壅壑圩圬圪圳圹圮圯坜圻坂坩垅坫垆坼坻坨坭坶坳垭垤垌垲埏垧垴垓垠埕埘埚埙埒垸埴埯埸埤埝"],
["dc40","蹳蹵蹷",4,"蹽蹾躀躂躃躄躆躈",6,"躑躒躓躕",6,"躝躟",11,"躭躮躰躱躳",6,"躻",7],
["dc80","軃",10,"軏",21,"堋堍埽埭堀堞堙塄堠塥塬墁墉墚墀馨鼙懿艹艽艿芏芊芨芄芎芑芗芙芫芸芾芰苈苊苣芘芷芮苋苌苁芩芴芡芪芟苄苎芤苡茉苷苤茏茇苜苴苒苘茌苻苓茑茚茆茔茕苠苕茜荑荛荜茈莒茼茴茱莛荞茯荏荇荃荟荀茗荠茭茺茳荦荥"],
["dd40","軥",62],
["dd80","輤",32,"荨茛荩荬荪荭荮莰荸莳莴莠莪莓莜莅荼莶莩荽莸荻莘莞莨莺莼菁萁菥菘堇萘萋菝菽菖萜萸萑萆菔菟萏萃菸菹菪菅菀萦菰菡葜葑葚葙葳蒇蒈葺蒉葸萼葆葩葶蒌蒎萱葭蓁蓍蓐蓦蒽蓓蓊蒿蒺蓠蒡蒹蒴蒗蓥蓣蔌甍蔸蓰蔹蔟蔺"],
["de40","轅",32,"轪辀辌辒辝辠辡辢辤辥辦辧辪辬辭辮辯農辳辴辵辷辸辺辻込辿迀迃迆"],
["de80","迉",4,"迏迒迖迗迚迠迡迣迧迬迯迱迲迴迵迶迺迻迼迾迿逇逈逌逎逓逕逘蕖蔻蓿蓼蕙蕈蕨蕤蕞蕺瞢蕃蕲蕻薤薨薇薏蕹薮薜薅薹薷薰藓藁藜藿蘧蘅蘩蘖蘼廾弈夼奁耷奕奚奘匏尢尥尬尴扌扪抟抻拊拚拗拮挢拶挹捋捃掭揶捱捺掎掴捭掬掊捩掮掼揲揸揠揿揄揞揎摒揆掾摅摁搋搛搠搌搦搡摞撄摭撖"],
["df40","這逜連逤逥逧",5,"逰",4,"逷逹逺逽逿遀遃遅遆遈",4,"過達違遖遙遚遜",5,"遤遦遧適遪遫遬遯",4,"遶",6,"遾邁"],
["df80","還邅邆邇邉邊邌",4,"邒邔邖邘邚邜邞邟邠邤邥邧邨邩邫邭邲邷邼邽邿郀摺撷撸撙撺擀擐擗擤擢攉攥攮弋忒甙弑卟叱叽叩叨叻吒吖吆呋呒呓呔呖呃吡呗呙吣吲咂咔呷呱呤咚咛咄呶呦咝哐咭哂咴哒咧咦哓哔呲咣哕咻咿哌哙哚哜咩咪咤哝哏哞唛哧唠哽唔哳唢唣唏唑唧唪啧喏喵啉啭啁啕唿啐唼"],
["e040","郂郃郆郈郉郋郌郍郒郔郕郖郘郙郚郞郟郠郣郤郥郩郪郬郮郰郱郲郳郵郶郷郹郺郻郼郿鄀鄁鄃鄅",19,"鄚鄛鄜"],
["e080","鄝鄟鄠鄡鄤",10,"鄰鄲",6,"鄺",8,"酄唷啖啵啶啷唳唰啜喋嗒喃喱喹喈喁喟啾嗖喑啻嗟喽喾喔喙嗪嗷嗉嘟嗑嗫嗬嗔嗦嗝嗄嗯嗥嗲嗳嗌嗍嗨嗵嗤辔嘞嘈嘌嘁嘤嘣嗾嘀嘧嘭噘嘹噗嘬噍噢噙噜噌噔嚆噤噱噫噻噼嚅嚓嚯囔囗囝囡囵囫囹囿圄圊圉圜帏帙帔帑帱帻帼"],
["e140","酅酇酈酑酓酔酕酖酘酙酛酜酟酠酦酧酨酫酭酳酺酻酼醀",4,"醆醈醊醎醏醓",6,"醜",5,"醤",5,"醫醬醰醱醲醳醶醷醸醹醻"],
["e180","醼",10,"釈釋釐釒",9,"針",8,"帷幄幔幛幞幡岌屺岍岐岖岈岘岙岑岚岜岵岢岽岬岫岱岣峁岷峄峒峤峋峥崂崃崧崦崮崤崞崆崛嵘崾崴崽嵬嵛嵯嵝嵫嵋嵊嵩嵴嶂嶙嶝豳嶷巅彳彷徂徇徉後徕徙徜徨徭徵徼衢彡犭犰犴犷犸狃狁狎狍狒狨狯狩狲狴狷猁狳猃狺"],
["e240","釦",62],
["e280","鈥",32,"狻猗猓猡猊猞猝猕猢猹猥猬猸猱獐獍獗獠獬獯獾舛夥飧夤夂饣饧",5,"饴饷饽馀馄馇馊馍馐馑馓馔馕庀庑庋庖庥庠庹庵庾庳赓廒廑廛廨廪膺忄忉忖忏怃忮怄忡忤忾怅怆忪忭忸怙怵怦怛怏怍怩怫怊怿怡恸恹恻恺恂"],
["e340","鉆",45,"鉵",16],
["e380","銆",7,"銏",24,"恪恽悖悚悭悝悃悒悌悛惬悻悱惝惘惆惚悴愠愦愕愣惴愀愎愫慊慵憬憔憧憷懔懵忝隳闩闫闱闳闵闶闼闾阃阄阆阈阊阋阌阍阏阒阕阖阗阙阚丬爿戕氵汔汜汊沣沅沐沔沌汨汩汴汶沆沩泐泔沭泷泸泱泗沲泠泖泺泫泮沱泓泯泾"],
["e440","銨",5,"銯",24,"鋉",31],
["e480","鋩",32,"洹洧洌浃浈洇洄洙洎洫浍洮洵洚浏浒浔洳涑浯涞涠浞涓涔浜浠浼浣渚淇淅淞渎涿淠渑淦淝淙渖涫渌涮渫湮湎湫溲湟溆湓湔渲渥湄滟溱溘滠漭滢溥溧溽溻溷滗溴滏溏滂溟潢潆潇漤漕滹漯漶潋潴漪漉漩澉澍澌潸潲潼潺濑"],
["e540","錊",51,"錿",10],
["e580","鍊",31,"鍫濉澧澹澶濂濡濮濞濠濯瀚瀣瀛瀹瀵灏灞宀宄宕宓宥宸甯骞搴寤寮褰寰蹇謇辶迓迕迥迮迤迩迦迳迨逅逄逋逦逑逍逖逡逵逶逭逯遄遑遒遐遨遘遢遛暹遴遽邂邈邃邋彐彗彖彘尻咫屐屙孱屣屦羼弪弩弭艴弼鬻屮妁妃妍妩妪妣"],
["e640","鍬",34,"鎐",27],
["e680","鎬",29,"鏋鏌鏍妗姊妫妞妤姒妲妯姗妾娅娆姝娈姣姘姹娌娉娲娴娑娣娓婀婧婊婕娼婢婵胬媪媛婷婺媾嫫媲嫒嫔媸嫠嫣嫱嫖嫦嫘嫜嬉嬗嬖嬲嬷孀尕尜孚孥孳孑孓孢驵驷驸驺驿驽骀骁骅骈骊骐骒骓骖骘骛骜骝骟骠骢骣骥骧纟纡纣纥纨纩"],
["e740","鏎",7,"鏗",54],
["e780","鐎",32,"纭纰纾绀绁绂绉绋绌绐绔绗绛绠绡绨绫绮绯绱绲缍绶绺绻绾缁缂缃缇缈缋缌缏缑缒缗缙缜缛缟缡",6,"缪缫缬缭缯",4,"缵幺畿巛甾邕玎玑玮玢玟珏珂珑玷玳珀珉珈珥珙顼琊珩珧珞玺珲琏琪瑛琦琥琨琰琮琬"],
["e840","鐯",14,"鐿",43,"鑬鑭鑮鑯"],
["e880","鑰",20,"钑钖钘铇铏铓铔铚铦铻锜锠琛琚瑁瑜瑗瑕瑙瑷瑭瑾璜璎璀璁璇璋璞璨璩璐璧瓒璺韪韫韬杌杓杞杈杩枥枇杪杳枘枧杵枨枞枭枋杷杼柰栉柘栊柩枰栌柙枵柚枳柝栀柃枸柢栎柁柽栲栳桠桡桎桢桄桤梃栝桕桦桁桧桀栾桊桉栩梵梏桴桷梓桫棂楮棼椟椠棹"],
["e940","锧锳锽镃镈镋镕镚镠镮镴镵長",7,"門",42],
["e980","閫",32,"椤棰椋椁楗棣椐楱椹楠楂楝榄楫榀榘楸椴槌榇榈槎榉楦楣楹榛榧榻榫榭槔榱槁槊槟榕槠榍槿樯槭樗樘橥槲橄樾檠橐橛樵檎橹樽樨橘橼檑檐檩檗檫猷獒殁殂殇殄殒殓殍殚殛殡殪轫轭轱轲轳轵轶轸轷轹轺轼轾辁辂辄辇辋"],
["ea40","闌",27,"闬闿阇阓阘阛阞阠阣",6,"阫阬阭阯阰阷阸阹阺阾陁陃陊陎陏陑陒陓陖陗"],
["ea80","陘陙陚陜陝陞陠陣陥陦陫陭",4,"陳陸",12,"隇隉隊辍辎辏辘辚軎戋戗戛戟戢戡戥戤戬臧瓯瓴瓿甏甑甓攴旮旯旰昊昙杲昃昕昀炅曷昝昴昱昶昵耆晟晔晁晏晖晡晗晷暄暌暧暝暾曛曜曦曩贲贳贶贻贽赀赅赆赈赉赇赍赕赙觇觊觋觌觎觏觐觑牮犟牝牦牯牾牿犄犋犍犏犒挈挲掰"],
["eb40","隌階隑隒隓隕隖隚際隝",9,"隨",7,"隱隲隴隵隷隸隺隻隿雂雃雈雊雋雐雑雓雔雖",9,"雡",6,"雫"],
["eb80","雬雭雮雰雱雲雴雵雸雺電雼雽雿霂霃霅霊霋霌霐霑霒霔霕霗",4,"霝霟霠搿擘耄毪毳毽毵毹氅氇氆氍氕氘氙氚氡氩氤氪氲攵敕敫牍牒牖爰虢刖肟肜肓肼朊肽肱肫肭肴肷胧胨胩胪胛胂胄胙胍胗朐胝胫胱胴胭脍脎胲胼朕脒豚脶脞脬脘脲腈腌腓腴腙腚腱腠腩腼腽腭腧塍媵膈膂膑滕膣膪臌朦臊膻"],
["ec40","霡",8,"霫霬霮霯霱霳",4,"霺霻霼霽霿",18,"靔靕靗靘靚靜靝靟靣靤靦靧靨靪",7],
["ec80","靲靵靷",4,"靽",7,"鞆",4,"鞌鞎鞏鞐鞓鞕鞖鞗鞙",4,"臁膦欤欷欹歃歆歙飑飒飓飕飙飚殳彀毂觳斐齑斓於旆旄旃旌旎旒旖炀炜炖炝炻烀炷炫炱烨烊焐焓焖焯焱煳煜煨煅煲煊煸煺熘熳熵熨熠燠燔燧燹爝爨灬焘煦熹戾戽扃扈扉礻祀祆祉祛祜祓祚祢祗祠祯祧祺禅禊禚禧禳忑忐"],
["ed40","鞞鞟鞡鞢鞤",6,"鞬鞮鞰鞱鞳鞵",46],
["ed80","韤韥韨韮",4,"韴韷",23,"怼恝恚恧恁恙恣悫愆愍慝憩憝懋懑戆肀聿沓泶淼矶矸砀砉砗砘砑斫砭砜砝砹砺砻砟砼砥砬砣砩硎硭硖硗砦硐硇硌硪碛碓碚碇碜碡碣碲碹碥磔磙磉磬磲礅磴礓礤礞礴龛黹黻黼盱眄眍盹眇眈眚眢眙眭眦眵眸睐睑睇睃睚睨"],
["ee40","頏",62],
["ee80","顎",32,"睢睥睿瞍睽瞀瞌瞑瞟瞠瞰瞵瞽町畀畎畋畈畛畲畹疃罘罡罟詈罨罴罱罹羁罾盍盥蠲钅钆钇钋钊钌钍钏钐钔钗钕钚钛钜钣钤钫钪钭钬钯钰钲钴钶",4,"钼钽钿铄铈",6,"铐铑铒铕铖铗铙铘铛铞铟铠铢铤铥铧铨铪"],
["ef40","顯",5,"颋颎颒颕颙颣風",37,"飏飐飔飖飗飛飜飝飠",4],
["ef80","飥飦飩",30,"铩铫铮铯铳铴铵铷铹铼铽铿锃锂锆锇锉锊锍锎锏锒",4,"锘锛锝锞锟锢锪锫锩锬锱锲锴锶锷锸锼锾锿镂锵镄镅镆镉镌镎镏镒镓镔镖镗镘镙镛镞镟镝镡镢镤",8,"镯镱镲镳锺矧矬雉秕秭秣秫稆嵇稃稂稞稔"],
["f040","餈",4,"餎餏餑",28,"餯",26],
["f080","饊",9,"饖",12,"饤饦饳饸饹饻饾馂馃馉稹稷穑黏馥穰皈皎皓皙皤瓞瓠甬鸠鸢鸨",4,"鸲鸱鸶鸸鸷鸹鸺鸾鹁鹂鹄鹆鹇鹈鹉鹋鹌鹎鹑鹕鹗鹚鹛鹜鹞鹣鹦",6,"鹱鹭鹳疒疔疖疠疝疬疣疳疴疸痄疱疰痃痂痖痍痣痨痦痤痫痧瘃痱痼痿瘐瘀瘅瘌瘗瘊瘥瘘瘕瘙"],
["f140","馌馎馚",10,"馦馧馩",47],
["f180","駙",32,"瘛瘼瘢瘠癀瘭瘰瘿瘵癃瘾瘳癍癞癔癜癖癫癯翊竦穸穹窀窆窈窕窦窠窬窨窭窳衤衩衲衽衿袂袢裆袷袼裉裢裎裣裥裱褚裼裨裾裰褡褙褓褛褊褴褫褶襁襦襻疋胥皲皴矜耒耔耖耜耠耢耥耦耧耩耨耱耋耵聃聆聍聒聩聱覃顸颀颃"],
["f240","駺",62],
["f280","騹",32,"颉颌颍颏颔颚颛颞颟颡颢颥颦虍虔虬虮虿虺虼虻蚨蚍蚋蚬蚝蚧蚣蚪蚓蚩蚶蛄蚵蛎蚰蚺蚱蚯蛉蛏蚴蛩蛱蛲蛭蛳蛐蜓蛞蛴蛟蛘蛑蜃蜇蛸蜈蜊蜍蜉蜣蜻蜞蜥蜮蜚蜾蝈蜴蜱蜩蜷蜿螂蜢蝽蝾蝻蝠蝰蝌蝮螋蝓蝣蝼蝤蝙蝥螓螯螨蟒"],
["f340","驚",17,"驲骃骉骍骎骔骕骙骦骩",6,"骲骳骴骵骹骻骽骾骿髃髄髆",4,"髍髎髏髐髒體髕髖髗髙髚髛髜"],
["f380","髝髞髠髢髣髤髥髧髨髩髪髬髮髰",8,"髺髼",6,"鬄鬅鬆蟆螈螅螭螗螃螫蟥螬螵螳蟋蟓螽蟑蟀蟊蟛蟪蟠蟮蠖蠓蟾蠊蠛蠡蠹蠼缶罂罄罅舐竺竽笈笃笄笕笊笫笏筇笸笪笙笮笱笠笥笤笳笾笞筘筚筅筵筌筝筠筮筻筢筲筱箐箦箧箸箬箝箨箅箪箜箢箫箴篑篁篌篝篚篥篦篪簌篾篼簏簖簋"],
["f440","鬇鬉",5,"鬐鬑鬒鬔",10,"鬠鬡鬢鬤",10,"鬰鬱鬳",7,"鬽鬾鬿魀魆魊魋魌魎魐魒魓魕",5],
["f480","魛",32,"簟簪簦簸籁籀臾舁舂舄臬衄舡舢舣舭舯舨舫舸舻舳舴舾艄艉艋艏艚艟艨衾袅袈裘裟襞羝羟羧羯羰羲籼敉粑粝粜粞粢粲粼粽糁糇糌糍糈糅糗糨艮暨羿翎翕翥翡翦翩翮翳糸絷綦綮繇纛麸麴赳趄趔趑趱赧赭豇豉酊酐酎酏酤"],
["f540","魼",62],
["f580","鮻",32,"酢酡酰酩酯酽酾酲酴酹醌醅醐醍醑醢醣醪醭醮醯醵醴醺豕鹾趸跫踅蹙蹩趵趿趼趺跄跖跗跚跞跎跏跛跆跬跷跸跣跹跻跤踉跽踔踝踟踬踮踣踯踺蹀踹踵踽踱蹉蹁蹂蹑蹒蹊蹰蹶蹼蹯蹴躅躏躔躐躜躞豸貂貊貅貘貔斛觖觞觚觜"],
["f640","鯜",62],
["f680","鰛",32,"觥觫觯訾謦靓雩雳雯霆霁霈霏霎霪霭霰霾龀龃龅",5,"龌黾鼋鼍隹隼隽雎雒瞿雠銎銮鋈錾鍪鏊鎏鐾鑫鱿鲂鲅鲆鲇鲈稣鲋鲎鲐鲑鲒鲔鲕鲚鲛鲞",5,"鲥",4,"鲫鲭鲮鲰",7,"鲺鲻鲼鲽鳄鳅鳆鳇鳊鳋"],
["f740","鰼",62],
["f780","鱻鱽鱾鲀鲃鲄鲉鲊鲌鲏鲓鲖鲗鲘鲙鲝鲪鲬鲯鲹鲾",4,"鳈鳉鳑鳒鳚鳛鳠鳡鳌",4,"鳓鳔鳕鳗鳘鳙鳜鳝鳟鳢靼鞅鞑鞒鞔鞯鞫鞣鞲鞴骱骰骷鹘骶骺骼髁髀髅髂髋髌髑魅魃魇魉魈魍魑飨餍餮饕饔髟髡髦髯髫髻髭髹鬈鬏鬓鬟鬣麽麾縻麂麇麈麋麒鏖麝麟黛黜黝黠黟黢黩黧黥黪黯鼢鼬鼯鼹鼷鼽鼾齄"],
["f840","鳣",62],
["f880","鴢",32],
["f940","鵃",62],
["f980","鶂",32],
["fa40","鶣",62],
["fa80","鷢",32],
["fb40","鸃",27,"鸤鸧鸮鸰鸴鸻鸼鹀鹍鹐鹒鹓鹔鹖鹙鹝鹟鹠鹡鹢鹥鹮鹯鹲鹴",9,"麀"],
["fb80","麁麃麄麅麆麉麊麌",5,"麔",8,"麞麠",5,"麧麨麩麪"],
["fc40","麫",8,"麵麶麷麹麺麼麿",4,"黅黆黇黈黊黋黌黐黒黓黕黖黗黙黚點黡黣黤黦黨黫黬黭黮黰",8,"黺黽黿",6],
["fc80","鼆",4,"鼌鼏鼑鼒鼔鼕鼖鼘鼚",5,"鼡鼣",8,"鼭鼮鼰鼱"],
["fd40","鼲",4,"鼸鼺鼼鼿",4,"齅",10,"齒",38],
["fd80","齹",5,"龁龂龍",11,"龜龝龞龡",4,"郎凉秊裏隣"],
["fe40","兀嗀﨎﨏﨑﨓﨔礼﨟蘒﨡﨣﨤﨧﨨﨩"]
]

},{}],33:[function(require,module,exports){
module.exports=[
["0","\u0000",127],
["8141","갂갃갅갆갋",4,"갘갞갟갡갢갣갥",6,"갮갲갳갴"],
["8161","갵갶갷갺갻갽갾갿걁",9,"걌걎",5,"걕"],
["8181","걖걗걙걚걛걝",18,"걲걳걵걶걹걻",4,"겂겇겈겍겎겏겑겒겓겕",6,"겞겢",5,"겫겭겮겱",6,"겺겾겿곀곂곃곅곆곇곉곊곋곍",7,"곖곘",7,"곢곣곥곦곩곫곭곮곲곴곷",4,"곾곿괁괂괃괅괇",4,"괎괐괒괓"],
["8241","괔괕괖괗괙괚괛괝괞괟괡",7,"괪괫괮",5],
["8261","괶괷괹괺괻괽",6,"굆굈굊",5,"굑굒굓굕굖굗"],
["8281","굙",7,"굢굤",7,"굮굯굱굲굷굸굹굺굾궀궃",4,"궊궋궍궎궏궑",10,"궞",5,"궥",17,"궸",7,"귂귃귅귆귇귉",6,"귒귔",7,"귝귞귟귡귢귣귥",18],
["8341","귺귻귽귾긂",5,"긊긌긎",5,"긕",7],
["8361","긝",18,"긲긳긵긶긹긻긼"],
["8381","긽긾긿깂깄깇깈깉깋깏깑깒깓깕깗",4,"깞깢깣깤깦깧깪깫깭깮깯깱",6,"깺깾",5,"꺆",5,"꺍",46,"꺿껁껂껃껅",6,"껎껒",5,"껚껛껝",8],
["8441","껦껧껩껪껬껮",5,"껵껶껷껹껺껻껽",8],
["8461","꼆꼉꼊꼋꼌꼎꼏꼑",18],
["8481","꼤",7,"꼮꼯꼱꼳꼵",6,"꼾꽀꽄꽅꽆꽇꽊",5,"꽑",10,"꽞",5,"꽦",18,"꽺",5,"꾁꾂꾃꾅꾆꾇꾉",6,"꾒꾓꾔꾖",5,"꾝",26,"꾺꾻꾽꾾"],
["8541","꾿꿁",5,"꿊꿌꿏",4,"꿕",6,"꿝",4],
["8561","꿢",5,"꿪",5,"꿲꿳꿵꿶꿷꿹",6,"뀂뀃"],
["8581","뀅",6,"뀍뀎뀏뀑뀒뀓뀕",6,"뀞",9,"뀩",26,"끆끇끉끋끍끏끐끑끒끖끘끚끛끜끞",29,"끾끿낁낂낃낅",6,"낎낐낒",5,"낛낝낞낣낤"],
["8641","낥낦낧낪낰낲낶낷낹낺낻낽",6,"냆냊",5,"냒"],
["8661","냓냕냖냗냙",6,"냡냢냣냤냦",10],
["8681","냱",22,"넊넍넎넏넑넔넕넖넗넚넞",4,"넦넧넩넪넫넭",6,"넶넺",5,"녂녃녅녆녇녉",6,"녒녓녖녗녙녚녛녝녞녟녡",22,"녺녻녽녾녿놁놃",4,"놊놌놎놏놐놑놕놖놗놙놚놛놝"],
["8741","놞",9,"놩",15],
["8761","놹",18,"뇍뇎뇏뇑뇒뇓뇕"],
["8781","뇖",5,"뇞뇠",7,"뇪뇫뇭뇮뇯뇱",7,"뇺뇼뇾",5,"눆눇눉눊눍",6,"눖눘눚",5,"눡",18,"눵",6,"눽",26,"뉙뉚뉛뉝뉞뉟뉡",6,"뉪",4],
["8841","뉯",4,"뉶",5,"뉽",6,"늆늇늈늊",4],
["8861","늏늒늓늕늖늗늛",4,"늢늤늧늨늩늫늭늮늯늱늲늳늵늶늷"],
["8881","늸",15,"닊닋닍닎닏닑닓",4,"닚닜닞닟닠닡닣닧닩닪닰닱닲닶닼닽닾댂댃댅댆댇댉",6,"댒댖",5,"댝",54,"덗덙덚덝덠덡덢덣"],
["8941","덦덨덪덬덭덯덲덳덵덶덷덹",6,"뎂뎆",5,"뎍"],
["8961","뎎뎏뎑뎒뎓뎕",10,"뎢",5,"뎩뎪뎫뎭"],
["8981","뎮",21,"돆돇돉돊돍돏돑돒돓돖돘돚돜돞돟돡돢돣돥돦돧돩",18,"돽",18,"됑",6,"됙됚됛됝됞됟됡",6,"됪됬",7,"됵",15],
["8a41","둅",10,"둒둓둕둖둗둙",6,"둢둤둦"],
["8a61","둧",4,"둭",18,"뒁뒂"],
["8a81","뒃",4,"뒉",19,"뒞",5,"뒥뒦뒧뒩뒪뒫뒭",7,"뒶뒸뒺",5,"듁듂듃듅듆듇듉",6,"듑듒듓듔듖",5,"듞듟듡듢듥듧",4,"듮듰듲",5,"듹",26,"딖딗딙딚딝"],
["8b41","딞",5,"딦딫",4,"딲딳딵딶딷딹",6,"땂땆"],
["8b61","땇땈땉땊땎땏땑땒땓땕",6,"땞땢",8],
["8b81","땫",52,"떢떣떥떦떧떩떬떭떮떯떲떶",4,"떾떿뗁뗂뗃뗅",6,"뗎뗒",5,"뗙",18,"뗭",18],
["8c41","똀",15,"똒똓똕똖똗똙",4],
["8c61","똞",6,"똦",5,"똭",6,"똵",5],
["8c81","똻",12,"뙉",26,"뙥뙦뙧뙩",50,"뚞뚟뚡뚢뚣뚥",5,"뚭뚮뚯뚰뚲",16],
["8d41","뛃",16,"뛕",8],
["8d61","뛞",17,"뛱뛲뛳뛵뛶뛷뛹뛺"],
["8d81","뛻",4,"뜂뜃뜄뜆",33,"뜪뜫뜭뜮뜱",6,"뜺뜼",7,"띅띆띇띉띊띋띍",6,"띖",9,"띡띢띣띥띦띧띩",6,"띲띴띶",5,"띾띿랁랂랃랅",6,"랎랓랔랕랚랛랝랞"],
["8e41","랟랡",6,"랪랮",5,"랶랷랹",8],
["8e61","럂",4,"럈럊",19],
["8e81","럞",13,"럮럯럱럲럳럵",6,"럾렂",4,"렊렋렍렎렏렑",6,"렚렜렞",5,"렦렧렩렪렫렭",6,"렶렺",5,"롁롂롃롅",11,"롒롔",7,"롞롟롡롢롣롥",6,"롮롰롲",5,"롹롺롻롽",7],
["8f41","뢅",7,"뢎",17],
["8f61","뢠",7,"뢩",6,"뢱뢲뢳뢵뢶뢷뢹",4],
["8f81","뢾뢿룂룄룆",5,"룍룎룏룑룒룓룕",7,"룞룠룢",5,"룪룫룭룮룯룱",6,"룺룼룾",5,"뤅",18,"뤙",6,"뤡",26,"뤾뤿륁륂륃륅",6,"륍륎륐륒",5],
["9041","륚륛륝륞륟륡",6,"륪륬륮",5,"륶륷륹륺륻륽"],
["9061","륾",5,"릆릈릋릌릏",15],
["9081","릟",12,"릮릯릱릲릳릵",6,"릾맀맂",5,"맊맋맍맓",4,"맚맜맟맠맢맦맧맩맪맫맭",6,"맶맻",4,"먂",5,"먉",11,"먖",33,"먺먻먽먾먿멁멃멄멅멆"],
["9141","멇멊멌멏멐멑멒멖멗멙멚멛멝",6,"멦멪",5],
["9161","멲멳멵멶멷멹",9,"몆몈몉몊몋몍",5],
["9181","몓",20,"몪몭몮몯몱몳",4,"몺몼몾",5,"뫅뫆뫇뫉",14,"뫚",33,"뫽뫾뫿묁묂묃묅",7,"묎묐묒",5,"묙묚묛묝묞묟묡",6],
["9241","묨묪묬",7,"묷묹묺묿",4,"뭆뭈뭊뭋뭌뭎뭑뭒"],
["9261","뭓뭕뭖뭗뭙",7,"뭢뭤",7,"뭭",4],
["9281","뭲",21,"뮉뮊뮋뮍뮎뮏뮑",18,"뮥뮦뮧뮩뮪뮫뮭",6,"뮵뮶뮸",7,"믁믂믃믅믆믇믉",6,"믑믒믔",35,"믺믻믽믾밁"],
["9341","밃",4,"밊밎밐밒밓밙밚밠밡밢밣밦밨밪밫밬밮밯밲밳밵"],
["9361","밶밷밹",6,"뱂뱆뱇뱈뱊뱋뱎뱏뱑",8],
["9381","뱚뱛뱜뱞",37,"벆벇벉벊벍벏",4,"벖벘벛",4,"벢벣벥벦벩",6,"벲벶",5,"벾벿볁볂볃볅",7,"볎볒볓볔볖볗볙볚볛볝",22,"볷볹볺볻볽"],
["9441","볾",5,"봆봈봊",5,"봑봒봓봕",8],
["9461","봞",5,"봥",6,"봭",12],
["9481","봺",5,"뵁",6,"뵊뵋뵍뵎뵏뵑",6,"뵚",9,"뵥뵦뵧뵩",22,"붂붃붅붆붋",4,"붒붔붖붗붘붛붝",6,"붥",10,"붱",6,"붹",24],
["9541","뷒뷓뷖뷗뷙뷚뷛뷝",11,"뷪",5,"뷱"],
["9561","뷲뷳뷵뷶뷷뷹",6,"븁븂븄븆",5,"븎븏븑븒븓"],
["9581","븕",6,"븞븠",35,"빆빇빉빊빋빍빏",4,"빖빘빜빝빞빟빢빣빥빦빧빩빫",4,"빲빶",4,"빾빿뺁뺂뺃뺅",6,"뺎뺒",5,"뺚",13,"뺩",14],
["9641","뺸",23,"뻒뻓"],
["9661","뻕뻖뻙",6,"뻡뻢뻦",5,"뻭",8],
["9681","뻶",10,"뼂",5,"뼊",13,"뼚뼞",33,"뽂뽃뽅뽆뽇뽉",6,"뽒뽓뽔뽖",44],
["9741","뾃",16,"뾕",8],
["9761","뾞",17,"뾱",7],
["9781","뾹",11,"뿆",5,"뿎뿏뿑뿒뿓뿕",6,"뿝뿞뿠뿢",89,"쀽쀾쀿"],
["9841","쁀",16,"쁒",5,"쁙쁚쁛"],
["9861","쁝쁞쁟쁡",6,"쁪",15],
["9881","쁺",21,"삒삓삕삖삗삙",6,"삢삤삦",5,"삮삱삲삷",4,"삾샂샃샄샆샇샊샋샍샎샏샑",6,"샚샞",5,"샦샧샩샪샫샭",6,"샶샸샺",5,"섁섂섃섅섆섇섉",6,"섑섒섓섔섖",5,"섡섢섥섨섩섪섫섮"],
["9941","섲섳섴섵섷섺섻섽섾섿셁",6,"셊셎",5,"셖셗"],
["9961","셙셚셛셝",6,"셦셪",5,"셱셲셳셵셶셷셹셺셻"],
["9981","셼",8,"솆",5,"솏솑솒솓솕솗",4,"솞솠솢솣솤솦솧솪솫솭솮솯솱",11,"솾",5,"쇅쇆쇇쇉쇊쇋쇍",6,"쇕쇖쇙",6,"쇡쇢쇣쇥쇦쇧쇩",6,"쇲쇴",7,"쇾쇿숁숂숃숅",6,"숎숐숒",5,"숚숛숝숞숡숢숣"],
["9a41","숤숥숦숧숪숬숮숰숳숵",16],
["9a61","쉆쉇쉉",6,"쉒쉓쉕쉖쉗쉙",6,"쉡쉢쉣쉤쉦"],
["9a81","쉧",4,"쉮쉯쉱쉲쉳쉵",6,"쉾슀슂",5,"슊",5,"슑",6,"슙슚슜슞",5,"슦슧슩슪슫슮",5,"슶슸슺",33,"싞싟싡싢싥",5,"싮싰싲싳싴싵싷싺싽싾싿쌁",6,"쌊쌋쌎쌏"],
["9b41","쌐쌑쌒쌖쌗쌙쌚쌛쌝",6,"쌦쌧쌪",8],
["9b61","쌳",17,"썆",7],
["9b81","썎",25,"썪썫썭썮썯썱썳",4,"썺썻썾",5,"쎅쎆쎇쎉쎊쎋쎍",50,"쏁",22,"쏚"],
["9c41","쏛쏝쏞쏡쏣",4,"쏪쏫쏬쏮",5,"쏶쏷쏹",5],
["9c61","쏿",8,"쐉",6,"쐑",9],
["9c81","쐛",8,"쐥",6,"쐭쐮쐯쐱쐲쐳쐵",6,"쐾",9,"쑉",26,"쑦쑧쑩쑪쑫쑭",6,"쑶쑷쑸쑺",5,"쒁",18,"쒕",6,"쒝",12],
["9d41","쒪",13,"쒹쒺쒻쒽",8],
["9d61","쓆",25],
["9d81","쓠",8,"쓪",5,"쓲쓳쓵쓶쓷쓹쓻쓼쓽쓾씂",9,"씍씎씏씑씒씓씕",6,"씝",10,"씪씫씭씮씯씱",6,"씺씼씾",5,"앆앇앋앏앐앑앒앖앚앛앜앟앢앣앥앦앧앩",6,"앲앶",5,"앾앿얁얂얃얅얆얈얉얊얋얎얐얒얓얔"],
["9e41","얖얙얚얛얝얞얟얡",7,"얪",9,"얶"],
["9e61","얷얺얿",4,"엋엍엏엒엓엕엖엗엙",6,"엢엤엦엧"],
["9e81","엨엩엪엫엯엱엲엳엵엸엹엺엻옂옃옄옉옊옋옍옎옏옑",6,"옚옝",6,"옦옧옩옪옫옯옱옲옶옸옺옼옽옾옿왂왃왅왆왇왉",6,"왒왖",5,"왞왟왡",10,"왭왮왰왲",5,"왺왻왽왾왿욁",6,"욊욌욎",5,"욖욗욙욚욛욝",6,"욦"],
["9f41","욨욪",5,"욲욳욵욶욷욻",4,"웂웄웆",5,"웎"],
["9f61","웏웑웒웓웕",6,"웞웟웢",5,"웪웫웭웮웯웱웲"],
["9f81","웳",4,"웺웻웼웾",5,"윆윇윉윊윋윍",6,"윖윘윚",5,"윢윣윥윦윧윩",6,"윲윴윶윸윹윺윻윾윿읁읂읃읅",4,"읋읎읐읙읚읛읝읞읟읡",6,"읩읪읬",7,"읶읷읹읺읻읿잀잁잂잆잋잌잍잏잒잓잕잙잛",4,"잢잧",4,"잮잯잱잲잳잵잶잷"],
["a041","잸잹잺잻잾쟂",5,"쟊쟋쟍쟏쟑",6,"쟙쟚쟛쟜"],
["a061","쟞",5,"쟥쟦쟧쟩쟪쟫쟭",13],
["a081","쟻",4,"젂젃젅젆젇젉젋",4,"젒젔젗",4,"젞젟젡젢젣젥",6,"젮젰젲",5,"젹젺젻젽젾젿졁",6,"졊졋졎",5,"졕",26,"졲졳졵졶졷졹졻",4,"좂좄좈좉좊좎",5,"좕",7,"좞좠좢좣좤"],
["a141","좥좦좧좩",18,"좾좿죀죁"],
["a161","죂죃죅죆죇죉죊죋죍",6,"죖죘죚",5,"죢죣죥"],
["a181","죦",14,"죶",5,"죾죿줁줂줃줇",4,"줎　、。·‥…¨〃­―∥＼∼‘’“”〔〕〈",9,"±×÷≠≤≥∞∴°′″℃Å￠￡￥♂♀∠⊥⌒∂∇≡≒§※☆★○●◎◇◆□■△▲▽▼→←↑↓↔〓≪≫√∽∝∵∫∬∈∋⊆⊇⊂⊃∪∩∧∨￢"],
["a241","줐줒",5,"줙",18],
["a261","줭",6,"줵",18],
["a281","쥈",7,"쥒쥓쥕쥖쥗쥙",6,"쥢쥤",7,"쥭쥮쥯⇒⇔∀∃´～ˇ˘˝˚˙¸˛¡¿ː∮∑∏¤℉‰◁◀▷▶♤♠♡♥♧♣⊙◈▣◐◑▒▤▥▨▧▦▩♨☏☎☜☞¶†‡↕↗↙↖↘♭♩♪♬㉿㈜№㏇™㏂㏘℡€®"],
["a341","쥱쥲쥳쥵",6,"쥽",10,"즊즋즍즎즏"],
["a361","즑",6,"즚즜즞",16],
["a381","즯",16,"짂짃짅짆짉짋",4,"짒짔짗짘짛！",58,"￦］",32,"￣"],
["a441","짞짟짡짣짥짦짨짩짪짫짮짲",5,"짺짻짽짾짿쨁쨂쨃쨄"],
["a461","쨅쨆쨇쨊쨎",5,"쨕쨖쨗쨙",12],
["a481","쨦쨧쨨쨪",28,"ㄱ",93],
["a541","쩇",4,"쩎쩏쩑쩒쩓쩕",6,"쩞쩢",5,"쩩쩪"],
["a561","쩫",17,"쩾",5,"쪅쪆"],
["a581","쪇",16,"쪙",14,"ⅰ",9],
["a5b0","Ⅰ",9],
["a5c1","Α",16,"Σ",6],
["a5e1","α",16,"σ",6],
["a641","쪨",19,"쪾쪿쫁쫂쫃쫅"],
["a661","쫆",5,"쫎쫐쫒쫔쫕쫖쫗쫚",5,"쫡",6],
["a681","쫨쫩쫪쫫쫭",6,"쫵",18,"쬉쬊─│┌┐┘└├┬┤┴┼━┃┏┓┛┗┣┳┫┻╋┠┯┨┷┿┝┰┥┸╂┒┑┚┙┖┕┎┍┞┟┡┢┦┧┩┪┭┮┱┲┵┶┹┺┽┾╀╁╃",7],
["a741","쬋",4,"쬑쬒쬓쬕쬖쬗쬙",6,"쬢",7],
["a761","쬪",22,"쭂쭃쭄"],
["a781","쭅쭆쭇쭊쭋쭍쭎쭏쭑",6,"쭚쭛쭜쭞",5,"쭥",7,"㎕㎖㎗ℓ㎘㏄㎣㎤㎥㎦㎙",9,"㏊㎍㎎㎏㏏㎈㎉㏈㎧㎨㎰",9,"㎀",4,"㎺",5,"㎐",4,"Ω㏀㏁㎊㎋㎌㏖㏅㎭㎮㎯㏛㎩㎪㎫㎬㏝㏐㏓㏃㏉㏜㏆"],
["a841","쭭",10,"쭺",14],
["a861","쮉",18,"쮝",6],
["a881","쮤",19,"쮹",11,"ÆÐªĦ"],
["a8a6","Ĳ"],
["a8a8","ĿŁØŒºÞŦŊ"],
["a8b1","㉠",27,"ⓐ",25,"①",14,"½⅓⅔¼¾⅛⅜⅝⅞"],
["a941","쯅",14,"쯕",10],
["a961","쯠쯡쯢쯣쯥쯦쯨쯪",18],
["a981","쯽",14,"찎찏찑찒찓찕",6,"찞찟찠찣찤æđðħıĳĸŀłøœßþŧŋŉ㈀",27,"⒜",25,"⑴",14,"¹²³⁴ⁿ₁₂₃₄"],
["aa41","찥찦찪찫찭찯찱",6,"찺찿",4,"챆챇챉챊챋챍챎"],
["aa61","챏",4,"챖챚",5,"챡챢챣챥챧챩",6,"챱챲"],
["aa81","챳챴챶",29,"ぁ",82],
["ab41","첔첕첖첗첚첛첝첞첟첡",6,"첪첮",5,"첶첷첹"],
["ab61","첺첻첽",6,"쳆쳈쳊",5,"쳑쳒쳓쳕",5],
["ab81","쳛",8,"쳥",6,"쳭쳮쳯쳱",12,"ァ",85],
["ac41","쳾쳿촀촂",5,"촊촋촍촎촏촑",6,"촚촜촞촟촠"],
["ac61","촡촢촣촥촦촧촩촪촫촭",11,"촺",4],
["ac81","촿",28,"쵝쵞쵟А",5,"ЁЖ",25],
["acd1","а",5,"ёж",25],
["ad41","쵡쵢쵣쵥",6,"쵮쵰쵲",5,"쵹",7],
["ad61","춁",6,"춉",10,"춖춗춙춚춛춝춞춟"],
["ad81","춠춡춢춣춦춨춪",5,"춱",18,"췅"],
["ae41","췆",5,"췍췎췏췑",16],
["ae61","췢",5,"췩췪췫췭췮췯췱",6,"췺췼췾",4],
["ae81","츃츅츆츇츉츊츋츍",6,"츕츖츗츘츚",5,"츢츣츥츦츧츩츪츫"],
["af41","츬츭츮츯츲츴츶",19],
["af61","칊",13,"칚칛칝칞칢",5,"칪칬"],
["af81","칮",5,"칶칷칹칺칻칽",6,"캆캈캊",5,"캒캓캕캖캗캙"],
["b041","캚",5,"캢캦",5,"캮",12],
["b061","캻",5,"컂",19],
["b081","컖",13,"컦컧컩컪컭",6,"컶컺",5,"가각간갇갈갉갊감",7,"같",4,"갠갤갬갭갯갰갱갸갹갼걀걋걍걔걘걜거걱건걷걸걺검겁것겄겅겆겉겊겋게겐겔겜겝겟겠겡겨격겪견겯결겸겹겻겼경곁계곈곌곕곗고곡곤곧골곪곬곯곰곱곳공곶과곽관괄괆"],
["b141","켂켃켅켆켇켉",6,"켒켔켖",5,"켝켞켟켡켢켣"],
["b161","켥",6,"켮켲",5,"켹",11],
["b181","콅",14,"콖콗콙콚콛콝",6,"콦콨콪콫콬괌괍괏광괘괜괠괩괬괭괴괵괸괼굄굅굇굉교굔굘굡굣구국군굳굴굵굶굻굼굽굿궁궂궈궉권궐궜궝궤궷귀귁귄귈귐귑귓규균귤그극근귿글긁금급긋긍긔기긱긴긷길긺김깁깃깅깆깊까깍깎깐깔깖깜깝깟깠깡깥깨깩깬깰깸"],
["b241","콭콮콯콲콳콵콶콷콹",6,"쾁쾂쾃쾄쾆",5,"쾍"],
["b261","쾎",18,"쾢",5,"쾩"],
["b281","쾪",5,"쾱",18,"쿅",6,"깹깻깼깽꺄꺅꺌꺼꺽꺾껀껄껌껍껏껐껑께껙껜껨껫껭껴껸껼꼇꼈꼍꼐꼬꼭꼰꼲꼴꼼꼽꼿꽁꽂꽃꽈꽉꽐꽜꽝꽤꽥꽹꾀꾄꾈꾐꾑꾕꾜꾸꾹꾼꿀꿇꿈꿉꿋꿍꿎꿔꿜꿨꿩꿰꿱꿴꿸뀀뀁뀄뀌뀐뀔뀜뀝뀨끄끅끈끊끌끎끓끔끕끗끙"],
["b341","쿌",19,"쿢쿣쿥쿦쿧쿩"],
["b361","쿪",5,"쿲쿴쿶",5,"쿽쿾쿿퀁퀂퀃퀅",5],
["b381","퀋",5,"퀒",5,"퀙",19,"끝끼끽낀낄낌낍낏낑나낙낚난낟날낡낢남납낫",4,"낱낳내낵낸낼냄냅냇냈냉냐냑냔냘냠냥너넉넋넌널넒넓넘넙넛넜넝넣네넥넨넬넴넵넷넸넹녀녁년녈념녑녔녕녘녜녠노녹논놀놂놈놉놋농높놓놔놘놜놨뇌뇐뇔뇜뇝"],
["b441","퀮",5,"퀶퀷퀹퀺퀻퀽",6,"큆큈큊",5],
["b461","큑큒큓큕큖큗큙",6,"큡",10,"큮큯"],
["b481","큱큲큳큵",6,"큾큿킀킂",18,"뇟뇨뇩뇬뇰뇹뇻뇽누눅눈눋눌눔눕눗눙눠눴눼뉘뉜뉠뉨뉩뉴뉵뉼늄늅늉느늑는늘늙늚늠늡늣능늦늪늬늰늴니닉닌닐닒님닙닛닝닢다닥닦단닫",4,"닳담답닷",4,"닿대댁댄댈댐댑댓댔댕댜더덕덖던덛덜덞덟덤덥"],
["b541","킕",14,"킦킧킩킪킫킭",5],
["b561","킳킶킸킺",5,"탂탃탅탆탇탊",5,"탒탖",4],
["b581","탛탞탟탡탢탣탥",6,"탮탲",5,"탹",11,"덧덩덫덮데덱덴델뎀뎁뎃뎄뎅뎌뎐뎔뎠뎡뎨뎬도독돈돋돌돎돐돔돕돗동돛돝돠돤돨돼됐되된될됨됩됫됴두둑둔둘둠둡둣둥둬뒀뒈뒝뒤뒨뒬뒵뒷뒹듀듄듈듐듕드득든듣들듦듬듭듯등듸디딕딘딛딜딤딥딧딨딩딪따딱딴딸"],
["b641","턅",7,"턎",17],
["b661","턠",15,"턲턳턵턶턷턹턻턼턽턾"],
["b681","턿텂텆",5,"텎텏텑텒텓텕",6,"텞텠텢",5,"텩텪텫텭땀땁땃땄땅땋때땍땐땔땜땝땟땠땡떠떡떤떨떪떫떰떱떳떴떵떻떼떽뗀뗄뗌뗍뗏뗐뗑뗘뗬또똑똔똘똥똬똴뙈뙤뙨뚜뚝뚠뚤뚫뚬뚱뛔뛰뛴뛸뜀뜁뜅뜨뜩뜬뜯뜰뜸뜹뜻띄띈띌띔띕띠띤띨띰띱띳띵라락란랄람랍랏랐랑랒랖랗"],
["b741","텮",13,"텽",6,"톅톆톇톉톊"],
["b761","톋",20,"톢톣톥톦톧"],
["b781","톩",6,"톲톴톶톷톸톹톻톽톾톿퇁",14,"래랙랜랠램랩랫랬랭랴략랸럇량러럭런럴럼럽럿렀렁렇레렉렌렐렘렙렛렝려력련렬렴렵렷렸령례롄롑롓로록론롤롬롭롯롱롸롼뢍뢨뢰뢴뢸룀룁룃룅료룐룔룝룟룡루룩룬룰룸룹룻룽뤄뤘뤠뤼뤽륀륄륌륏륑류륙륜률륨륩"],
["b841","퇐",7,"퇙",17],
["b861","퇫",8,"퇵퇶퇷퇹",13],
["b881","툈툊",5,"툑",24,"륫륭르륵른를름릅릇릉릊릍릎리릭린릴림립릿링마막만많",4,"맘맙맛망맞맡맣매맥맨맬맴맵맷맸맹맺먀먁먈먕머먹먼멀멂멈멉멋멍멎멓메멕멘멜멤멥멧멨멩며멱면멸몃몄명몇몌모목몫몬몰몲몸몹못몽뫄뫈뫘뫙뫼"],
["b941","툪툫툮툯툱툲툳툵",6,"툾퉀퉂",5,"퉉퉊퉋퉌"],
["b961","퉍",14,"퉝",6,"퉥퉦퉧퉨"],
["b981","퉩",22,"튂튃튅튆튇튉튊튋튌묀묄묍묏묑묘묜묠묩묫무묵묶문묻물묽묾뭄뭅뭇뭉뭍뭏뭐뭔뭘뭡뭣뭬뮈뮌뮐뮤뮨뮬뮴뮷므믄믈믐믓미믹민믿밀밂밈밉밋밌밍및밑바",4,"받",4,"밤밥밧방밭배백밴밸뱀뱁뱃뱄뱅뱉뱌뱍뱐뱝버벅번벋벌벎범법벗"],
["ba41","튍튎튏튒튓튔튖",5,"튝튞튟튡튢튣튥",6,"튭"],
["ba61","튮튯튰튲",5,"튺튻튽튾틁틃",4,"틊틌",5],
["ba81","틒틓틕틖틗틙틚틛틝",6,"틦",9,"틲틳틵틶틷틹틺벙벚베벡벤벧벨벰벱벳벴벵벼벽변별볍볏볐병볕볘볜보복볶본볼봄봅봇봉봐봔봤봬뵀뵈뵉뵌뵐뵘뵙뵤뵨부북분붇불붉붊붐붑붓붕붙붚붜붤붰붸뷔뷕뷘뷜뷩뷰뷴뷸븀븃븅브븍븐블븜븝븟비빅빈빌빎빔빕빗빙빚빛빠빡빤"],
["bb41","틻",4,"팂팄팆",5,"팏팑팒팓팕팗",4,"팞팢팣"],
["bb61","팤팦팧팪팫팭팮팯팱",6,"팺팾",5,"퍆퍇퍈퍉"],
["bb81","퍊",31,"빨빪빰빱빳빴빵빻빼빽뺀뺄뺌뺍뺏뺐뺑뺘뺙뺨뻐뻑뻔뻗뻘뻠뻣뻤뻥뻬뼁뼈뼉뼘뼙뼛뼜뼝뽀뽁뽄뽈뽐뽑뽕뾔뾰뿅뿌뿍뿐뿔뿜뿟뿡쀼쁑쁘쁜쁠쁨쁩삐삑삔삘삠삡삣삥사삭삯산삳살삵삶삼삽삿샀상샅새색샌샐샘샙샛샜생샤"],
["bc41","퍪",17,"퍾퍿펁펂펃펅펆펇"],
["bc61","펈펉펊펋펎펒",5,"펚펛펝펞펟펡",6,"펪펬펮"],
["bc81","펯",4,"펵펶펷펹펺펻펽",6,"폆폇폊",5,"폑",5,"샥샨샬샴샵샷샹섀섄섈섐섕서",4,"섣설섦섧섬섭섯섰성섶세섹센셀셈셉셋셌셍셔셕션셜셤셥셧셨셩셰셴셸솅소속솎손솔솖솜솝솟송솥솨솩솬솰솽쇄쇈쇌쇔쇗쇘쇠쇤쇨쇰쇱쇳쇼쇽숀숄숌숍숏숑수숙순숟술숨숩숫숭"],
["bd41","폗폙",7,"폢폤",7,"폮폯폱폲폳폵폶폷"],
["bd61","폸폹폺폻폾퐀퐂",5,"퐉",13],
["bd81","퐗",5,"퐞",25,"숯숱숲숴쉈쉐쉑쉔쉘쉠쉥쉬쉭쉰쉴쉼쉽쉿슁슈슉슐슘슛슝스슥슨슬슭슴습슷승시식신싣실싫심십싯싱싶싸싹싻싼쌀쌈쌉쌌쌍쌓쌔쌕쌘쌜쌤쌥쌨쌩썅써썩썬썰썲썸썹썼썽쎄쎈쎌쏀쏘쏙쏜쏟쏠쏢쏨쏩쏭쏴쏵쏸쐈쐐쐤쐬쐰"],
["be41","퐸",7,"푁푂푃푅",14],
["be61","푔",7,"푝푞푟푡푢푣푥",7,"푮푰푱푲"],
["be81","푳",4,"푺푻푽푾풁풃",4,"풊풌풎",5,"풕",8,"쐴쐼쐽쑈쑤쑥쑨쑬쑴쑵쑹쒀쒔쒜쒸쒼쓩쓰쓱쓴쓸쓺쓿씀씁씌씐씔씜씨씩씬씰씸씹씻씽아악안앉않알앍앎앓암압앗았앙앝앞애액앤앨앰앱앳앴앵야약얀얄얇얌얍얏양얕얗얘얜얠얩어억언얹얻얼얽얾엄",6,"엌엎"],
["bf41","풞",10,"풪",14],
["bf61","풹",18,"퓍퓎퓏퓑퓒퓓퓕"],
["bf81","퓖",5,"퓝퓞퓠",7,"퓩퓪퓫퓭퓮퓯퓱",6,"퓹퓺퓼에엑엔엘엠엡엣엥여역엮연열엶엷염",5,"옅옆옇예옌옐옘옙옛옜오옥온올옭옮옰옳옴옵옷옹옻와왁완왈왐왑왓왔왕왜왝왠왬왯왱외왹왼욀욈욉욋욍요욕욘욜욤욥욧용우욱운울욹욺움웁웃웅워웍원월웜웝웠웡웨"],
["c041","퓾",5,"픅픆픇픉픊픋픍",6,"픖픘",5],
["c061","픞",25],
["c081","픸픹픺픻픾픿핁핂핃핅",6,"핎핐핒",5,"핚핛핝핞핟핡핢핣웩웬웰웸웹웽위윅윈윌윔윕윗윙유육윤율윰윱윳융윷으윽은을읊음읍읏응",7,"읜읠읨읫이익인일읽읾잃임입잇있잉잊잎자작잔잖잗잘잚잠잡잣잤장잦재잭잰잴잼잽잿쟀쟁쟈쟉쟌쟎쟐쟘쟝쟤쟨쟬저적전절젊"],
["c141","핤핦핧핪핬핮",5,"핶핷핹핺핻핽",6,"햆햊햋"],
["c161","햌햍햎햏햑",19,"햦햧"],
["c181","햨",31,"점접젓정젖제젝젠젤젬젭젯젱져젼졀졈졉졌졍졔조족존졸졺좀좁좃종좆좇좋좌좍좔좝좟좡좨좼좽죄죈죌죔죕죗죙죠죡죤죵주죽준줄줅줆줌줍줏중줘줬줴쥐쥑쥔쥘쥠쥡쥣쥬쥰쥴쥼즈즉즌즐즘즙즛증지직진짇질짊짐집짓"],
["c241","헊헋헍헎헏헑헓",4,"헚헜헞",5,"헦헧헩헪헫헭헮"],
["c261","헯",4,"헶헸헺",5,"혂혃혅혆혇혉",6,"혒"],
["c281","혖",5,"혝혞혟혡혢혣혥",7,"혮",9,"혺혻징짖짙짚짜짝짠짢짤짧짬짭짯짰짱째짹짼쨀쨈쨉쨋쨌쨍쨔쨘쨩쩌쩍쩐쩔쩜쩝쩟쩠쩡쩨쩽쪄쪘쪼쪽쫀쫄쫌쫍쫏쫑쫓쫘쫙쫠쫬쫴쬈쬐쬔쬘쬠쬡쭁쭈쭉쭌쭐쭘쭙쭝쭤쭸쭹쮜쮸쯔쯤쯧쯩찌찍찐찔찜찝찡찢찧차착찬찮찰참찹찻"],
["c341","혽혾혿홁홂홃홄홆홇홊홌홎홏홐홒홓홖홗홙홚홛홝",4],
["c361","홢",4,"홨홪",5,"홲홳홵",11],
["c381","횁횂횄횆",5,"횎횏횑횒횓횕",7,"횞횠횢",5,"횩횪찼창찾채책챈챌챔챕챗챘챙챠챤챦챨챰챵처척천철첨첩첫첬청체첵첸첼쳄쳅쳇쳉쳐쳔쳤쳬쳰촁초촉촌촐촘촙촛총촤촨촬촹최쵠쵤쵬쵭쵯쵱쵸춈추축춘출춤춥춧충춰췄췌췐취췬췰췸췹췻췽츄츈츌츔츙츠측츤츨츰츱츳층"],
["c441","횫횭횮횯횱",7,"횺횼",7,"훆훇훉훊훋"],
["c461","훍훎훏훐훒훓훕훖훘훚",5,"훡훢훣훥훦훧훩",4],
["c481","훮훯훱훲훳훴훶",5,"훾훿휁휂휃휅",11,"휒휓휔치칙친칟칠칡침칩칫칭카칵칸칼캄캅캇캉캐캑캔캘캠캡캣캤캥캬캭컁커컥컨컫컬컴컵컷컸컹케켁켄켈켐켑켓켕켜켠켤켬켭켯켰켱켸코콕콘콜콤콥콧콩콰콱콴콸쾀쾅쾌쾡쾨쾰쿄쿠쿡쿤쿨쿰쿱쿳쿵쿼퀀퀄퀑퀘퀭퀴퀵퀸퀼"],
["c541","휕휖휗휚휛휝휞휟휡",6,"휪휬휮",5,"휶휷휹"],
["c561","휺휻휽",6,"흅흆흈흊",5,"흒흓흕흚",4],
["c581","흟흢흤흦흧흨흪흫흭흮흯흱흲흳흵",6,"흾흿힀힂",5,"힊힋큄큅큇큉큐큔큘큠크큭큰클큼큽킁키킥킨킬킴킵킷킹타탁탄탈탉탐탑탓탔탕태택탠탤탬탭탯탰탱탸턍터턱턴털턺텀텁텃텄텅테텍텐텔템텝텟텡텨텬텼톄톈토톡톤톨톰톱톳통톺톼퇀퇘퇴퇸툇툉툐투툭툰툴툼툽툿퉁퉈퉜"],
["c641","힍힎힏힑",6,"힚힜힞",5],
["c6a1","퉤튀튁튄튈튐튑튕튜튠튤튬튱트특튼튿틀틂틈틉틋틔틘틜틤틥티틱틴틸팀팁팃팅파팍팎판팔팖팜팝팟팠팡팥패팩팬팰팸팹팻팼팽퍄퍅퍼퍽펀펄펌펍펏펐펑페펙펜펠펨펩펫펭펴편펼폄폅폈평폐폘폡폣포폭폰폴폼폽폿퐁"],
["c7a1","퐈퐝푀푄표푠푤푭푯푸푹푼푿풀풂품풉풋풍풔풩퓌퓐퓔퓜퓟퓨퓬퓰퓸퓻퓽프픈플픔픕픗피픽핀필핌핍핏핑하학한할핥함합핫항해핵핸핼햄햅햇했행햐향허헉헌헐헒험헙헛헝헤헥헨헬헴헵헷헹혀혁현혈혐협혓혔형혜혠"],
["c8a1","혤혭호혹혼홀홅홈홉홋홍홑화확환활홧황홰홱홴횃횅회획횐횔횝횟횡효횬횰횹횻후훅훈훌훑훔훗훙훠훤훨훰훵훼훽휀휄휑휘휙휜휠휨휩휫휭휴휵휸휼흄흇흉흐흑흔흖흗흘흙흠흡흣흥흩희흰흴흼흽힁히힉힌힐힘힙힛힝"],
["caa1","伽佳假價加可呵哥嘉嫁家暇架枷柯歌珂痂稼苛茄街袈訶賈跏軻迦駕刻却各恪慤殼珏脚覺角閣侃刊墾奸姦干幹懇揀杆柬桿澗癎看磵稈竿簡肝艮艱諫間乫喝曷渴碣竭葛褐蝎鞨勘坎堪嵌感憾戡敢柑橄減甘疳監瞰紺邯鑑鑒龕"],
["cba1","匣岬甲胛鉀閘剛堈姜岡崗康强彊慷江畺疆糠絳綱羌腔舡薑襁講鋼降鱇介价個凱塏愷愾慨改槪漑疥皆盖箇芥蓋豈鎧開喀客坑更粳羹醵倨去居巨拒据據擧渠炬祛距踞車遽鉅鋸乾件健巾建愆楗腱虔蹇鍵騫乞傑杰桀儉劍劒檢"],
["cca1","瞼鈐黔劫怯迲偈憩揭擊格檄激膈覡隔堅牽犬甄絹繭肩見譴遣鵑抉決潔結缺訣兼慊箝謙鉗鎌京俓倞傾儆勁勍卿坰境庚徑慶憬擎敬景暻更梗涇炅烱璟璥瓊痙硬磬竟競絅經耕耿脛莖警輕逕鏡頃頸驚鯨係啓堺契季屆悸戒桂械"],
["cda1","棨溪界癸磎稽系繫繼計誡谿階鷄古叩告呱固姑孤尻庫拷攷故敲暠枯槁沽痼皐睾稿羔考股膏苦苽菰藁蠱袴誥賈辜錮雇顧高鼓哭斛曲梏穀谷鵠困坤崑昆梱棍滾琨袞鯤汨滑骨供公共功孔工恐恭拱控攻珙空蚣貢鞏串寡戈果瓜"],
["cea1","科菓誇課跨過鍋顆廓槨藿郭串冠官寬慣棺款灌琯瓘管罐菅觀貫關館刮恝括适侊光匡壙廣曠洸炚狂珖筐胱鑛卦掛罫乖傀塊壞怪愧拐槐魁宏紘肱轟交僑咬喬嬌嶠巧攪敎校橋狡皎矯絞翹膠蕎蛟較轎郊餃驕鮫丘久九仇俱具勾"],
["cfa1","區口句咎嘔坵垢寇嶇廐懼拘救枸柩構歐毆毬求溝灸狗玖球瞿矩究絿耉臼舅舊苟衢謳購軀逑邱鉤銶駒驅鳩鷗龜國局菊鞠鞫麴君窘群裙軍郡堀屈掘窟宮弓穹窮芎躬倦券勸卷圈拳捲權淃眷厥獗蕨蹶闕机櫃潰詭軌饋句晷歸貴"],
["d0a1","鬼龜叫圭奎揆槻珪硅窺竅糾葵規赳逵閨勻均畇筠菌鈞龜橘克剋劇戟棘極隙僅劤勤懃斤根槿瑾筋芹菫覲謹近饉契今妗擒昑檎琴禁禽芩衾衿襟金錦伋及急扱汲級給亘兢矜肯企伎其冀嗜器圻基埼夔奇妓寄岐崎己幾忌技旗旣"],
["d1a1","朞期杞棋棄機欺氣汽沂淇玘琦琪璂璣畸畿碁磯祁祇祈祺箕紀綺羈耆耭肌記譏豈起錡錤飢饑騎騏驥麒緊佶吉拮桔金喫儺喇奈娜懦懶拏拿癩",5,"那樂",4,"諾酪駱亂卵暖欄煖爛蘭難鸞捏捺南嵐枏楠湳濫男藍襤拉"],
["d2a1","納臘蠟衲囊娘廊",4,"乃來內奈柰耐冷女年撚秊念恬拈捻寧寗努勞奴弩怒擄櫓爐瑙盧",5,"駑魯",10,"濃籠聾膿農惱牢磊腦賂雷尿壘",7,"嫩訥杻紐勒",5,"能菱陵尼泥匿溺多茶"],
["d3a1","丹亶但單團壇彖斷旦檀段湍短端簞緞蛋袒鄲鍛撻澾獺疸達啖坍憺擔曇淡湛潭澹痰聃膽蕁覃談譚錟沓畓答踏遝唐堂塘幢戇撞棠當糖螳黨代垈坮大對岱帶待戴擡玳臺袋貸隊黛宅德悳倒刀到圖堵塗導屠島嶋度徒悼挑掉搗桃"],
["d4a1","棹櫂淘渡滔濤燾盜睹禱稻萄覩賭跳蹈逃途道都鍍陶韜毒瀆牘犢獨督禿篤纛讀墩惇敦旽暾沌焞燉豚頓乭突仝冬凍動同憧東桐棟洞潼疼瞳童胴董銅兜斗杜枓痘竇荳讀豆逗頭屯臀芚遁遯鈍得嶝橙燈登等藤謄鄧騰喇懶拏癩羅"],
["d5a1","蘿螺裸邏樂洛烙珞絡落諾酪駱丹亂卵欄欒瀾爛蘭鸞剌辣嵐擥攬欖濫籃纜藍襤覽拉臘蠟廊朗浪狼琅瑯螂郞來崍徠萊冷掠略亮倆兩凉梁樑粮粱糧良諒輛量侶儷勵呂廬慮戾旅櫚濾礪藜蠣閭驢驪麗黎力曆歷瀝礫轢靂憐戀攣漣"],
["d6a1","煉璉練聯蓮輦連鍊冽列劣洌烈裂廉斂殮濂簾獵令伶囹寧岺嶺怜玲笭羚翎聆逞鈴零靈領齡例澧禮醴隷勞怒撈擄櫓潞瀘爐盧老蘆虜路輅露魯鷺鹵碌祿綠菉錄鹿麓論壟弄朧瀧瓏籠聾儡瀨牢磊賂賚賴雷了僚寮廖料燎療瞭聊蓼"],
["d7a1","遼鬧龍壘婁屢樓淚漏瘻累縷蔞褸鏤陋劉旒柳榴流溜瀏琉瑠留瘤硫謬類六戮陸侖倫崙淪綸輪律慄栗率隆勒肋凜凌楞稜綾菱陵俚利厘吏唎履悧李梨浬犁狸理璃異痢籬罹羸莉裏裡里釐離鯉吝潾燐璘藺躪隣鱗麟林淋琳臨霖砬"],
["d8a1","立笠粒摩瑪痲碼磨馬魔麻寞幕漠膜莫邈万卍娩巒彎慢挽晩曼滿漫灣瞞萬蔓蠻輓饅鰻唜抹末沫茉襪靺亡妄忘忙望網罔芒茫莽輞邙埋妹媒寐昧枚梅每煤罵買賣邁魅脈貊陌驀麥孟氓猛盲盟萌冪覓免冕勉棉沔眄眠綿緬面麵滅"],
["d9a1","蔑冥名命明暝椧溟皿瞑茗蓂螟酩銘鳴袂侮冒募姆帽慕摸摹暮某模母毛牟牡瑁眸矛耗芼茅謀謨貌木沐牧目睦穆鶩歿沒夢朦蒙卯墓妙廟描昴杳渺猫竗苗錨務巫憮懋戊拇撫无楙武毋無珷畝繆舞茂蕪誣貿霧鵡墨默們刎吻問文"],
["daa1","汶紊紋聞蚊門雯勿沕物味媚尾嵋彌微未梶楣渼湄眉米美薇謎迷靡黴岷悶愍憫敏旻旼民泯玟珉緡閔密蜜謐剝博拍搏撲朴樸泊珀璞箔粕縛膊舶薄迫雹駁伴半反叛拌搬攀斑槃泮潘班畔瘢盤盼磐磻礬絆般蟠返頒飯勃拔撥渤潑"],
["dba1","發跋醱鉢髮魃倣傍坊妨尨幇彷房放方旁昉枋榜滂磅紡肪膀舫芳蒡蚌訪謗邦防龐倍俳北培徘拜排杯湃焙盃背胚裴裵褙賠輩配陪伯佰帛柏栢白百魄幡樊煩燔番磻繁蕃藩飜伐筏罰閥凡帆梵氾汎泛犯範范法琺僻劈壁擘檗璧癖"],
["dca1","碧蘗闢霹便卞弁變辨辯邊別瞥鱉鼈丙倂兵屛幷昞昺柄棅炳甁病秉竝輧餠騈保堡報寶普步洑湺潽珤甫菩補褓譜輔伏僕匐卜宓復服福腹茯蔔複覆輹輻馥鰒本乶俸奉封峯峰捧棒烽熢琫縫蓬蜂逢鋒鳳不付俯傅剖副否咐埠夫婦"],
["dda1","孚孵富府復扶敷斧浮溥父符簿缶腐腑膚艀芙莩訃負賦賻赴趺部釜阜附駙鳧北分吩噴墳奔奮忿憤扮昐汾焚盆粉糞紛芬賁雰不佛弗彿拂崩朋棚硼繃鵬丕備匕匪卑妃婢庇悲憊扉批斐枇榧比毖毗毘沸泌琵痺砒碑秕秘粃緋翡肥"],
["dea1","脾臂菲蜚裨誹譬費鄙非飛鼻嚬嬪彬斌檳殯浜濱瀕牝玭貧賓頻憑氷聘騁乍事些仕伺似使俟僿史司唆嗣四士奢娑寫寺射巳師徙思捨斜斯柶査梭死沙泗渣瀉獅砂社祀祠私篩紗絲肆舍莎蓑蛇裟詐詞謝賜赦辭邪飼駟麝削數朔索"],
["dfa1","傘刪山散汕珊産疝算蒜酸霰乷撒殺煞薩三參杉森渗芟蔘衫揷澁鈒颯上傷像償商喪嘗孀尙峠常床庠廂想桑橡湘爽牀狀相祥箱翔裳觴詳象賞霜塞璽賽嗇塞穡索色牲生甥省笙墅壻嶼序庶徐恕抒捿敍暑曙書栖棲犀瑞筮絮緖署"],
["e0a1","胥舒薯西誓逝鋤黍鼠夕奭席惜昔晳析汐淅潟石碩蓆釋錫仙僊先善嬋宣扇敾旋渲煽琁瑄璇璿癬禪線繕羨腺膳船蘚蟬詵跣選銑鐥饍鮮卨屑楔泄洩渫舌薛褻設說雪齧剡暹殲纖蟾贍閃陝攝涉燮葉城姓宬性惺成星晟猩珹盛省筬"],
["e1a1","聖聲腥誠醒世勢歲洗稅笹細說貰召嘯塑宵小少巢所掃搔昭梳沼消溯瀟炤燒甦疏疎瘙笑篠簫素紹蔬蕭蘇訴逍遡邵銷韶騷俗屬束涑粟續謖贖速孫巽損蓀遜飡率宋悚松淞訟誦送頌刷殺灑碎鎖衰釗修受嗽囚垂壽嫂守岫峀帥愁"],
["e2a1","戍手授搜收數樹殊水洙漱燧狩獸琇璲瘦睡秀穗竪粹綏綬繡羞脩茱蒐蓚藪袖誰讐輸遂邃酬銖銹隋隧隨雖需須首髓鬚叔塾夙孰宿淑潚熟琡璹肅菽巡徇循恂旬栒楯橓殉洵淳珣盾瞬筍純脣舜荀蓴蕣詢諄醇錞順馴戌術述鉥崇崧"],
["e3a1","嵩瑟膝蝨濕拾習褶襲丞乘僧勝升承昇繩蠅陞侍匙嘶始媤尸屎屍市弑恃施是時枾柴猜矢示翅蒔蓍視試詩諡豕豺埴寔式息拭植殖湜熄篒蝕識軾食飾伸侁信呻娠宸愼新晨燼申神紳腎臣莘薪藎蜃訊身辛辰迅失室實悉審尋心沁"],
["e4a1","沈深瀋甚芯諶什十拾雙氏亞俄兒啞娥峨我牙芽莪蛾衙訝阿雅餓鴉鵝堊岳嶽幄惡愕握樂渥鄂鍔顎鰐齷安岸按晏案眼雁鞍顔鮟斡謁軋閼唵岩巖庵暗癌菴闇壓押狎鴨仰央怏昻殃秧鴦厓哀埃崖愛曖涯碍艾隘靄厄扼掖液縊腋額"],
["e5a1","櫻罌鶯鸚也倻冶夜惹揶椰爺耶若野弱掠略約若葯蒻藥躍亮佯兩凉壤孃恙揚攘敭暘梁楊樣洋瀁煬痒瘍禳穰糧羊良襄諒讓釀陽量養圄御於漁瘀禦語馭魚齬億憶抑檍臆偃堰彦焉言諺孼蘖俺儼嚴奄掩淹嶪業円予余勵呂女如廬"],
["e6a1","旅歟汝濾璵礖礪與艅茹輿轝閭餘驪麗黎亦力域役易曆歷疫繹譯轢逆驛嚥堧姸娟宴年延憐戀捐挻撚椽沇沿涎涓淵演漣烟然煙煉燃燕璉硏硯秊筵緣練縯聯衍軟輦蓮連鉛鍊鳶列劣咽悅涅烈熱裂說閱厭廉念捻染殮炎焰琰艶苒"],
["e7a1","簾閻髥鹽曄獵燁葉令囹塋寧嶺嶸影怜映暎楹榮永泳渶潁濚瀛瀯煐營獰玲瑛瑩瓔盈穎纓羚聆英詠迎鈴鍈零霙靈領乂倪例刈叡曳汭濊猊睿穢芮藝蘂禮裔詣譽豫醴銳隸霓預五伍俉傲午吾吳嗚塢墺奧娛寤悟惡懊敖旿晤梧汚澳"],
["e8a1","烏熬獒筽蜈誤鰲鼇屋沃獄玉鈺溫瑥瘟穩縕蘊兀壅擁瓮甕癰翁邕雍饔渦瓦窩窪臥蛙蝸訛婉完宛梡椀浣玩琓琬碗緩翫脘腕莞豌阮頑曰往旺枉汪王倭娃歪矮外嵬巍猥畏了僚僥凹堯夭妖姚寥寮尿嶢拗搖撓擾料曜樂橈燎燿瑤療"],
["e9a1","窈窯繇繞耀腰蓼蟯要謠遙遼邀饒慾欲浴縟褥辱俑傭冗勇埇墉容庸慂榕涌湧溶熔瑢用甬聳茸蓉踊鎔鏞龍于佑偶優又友右宇寓尤愚憂旴牛玗瑀盂祐禑禹紆羽芋藕虞迂遇郵釪隅雨雩勖彧旭昱栯煜稶郁頊云暈橒殞澐熉耘芸蕓"],
["eaa1","運隕雲韻蔚鬱亐熊雄元原員圓園垣媛嫄寃怨愿援沅洹湲源爰猿瑗苑袁轅遠阮院願鴛月越鉞位偉僞危圍委威尉慰暐渭爲瑋緯胃萎葦蔿蝟衛褘謂違韋魏乳侑儒兪劉唯喩孺宥幼幽庾悠惟愈愉揄攸有杻柔柚柳楡楢油洧流游溜"],
["eba1","濡猶猷琉瑜由留癒硫紐維臾萸裕誘諛諭踰蹂遊逾遺酉釉鍮類六堉戮毓肉育陸倫允奫尹崙淪潤玧胤贇輪鈗閏律慄栗率聿戎瀜絨融隆垠恩慇殷誾銀隱乙吟淫蔭陰音飮揖泣邑凝應膺鷹依倚儀宜意懿擬椅毅疑矣義艤薏蟻衣誼"],
["eca1","議醫二以伊利吏夷姨履已弛彛怡易李梨泥爾珥理異痍痢移罹而耳肄苡荑裏裡貽貳邇里離飴餌匿溺瀷益翊翌翼謚人仁刃印吝咽因姻寅引忍湮燐璘絪茵藺蚓認隣靭靷鱗麟一佚佾壹日溢逸鎰馹任壬妊姙恁林淋稔臨荏賃入卄"],
["eda1","立笠粒仍剩孕芿仔刺咨姉姿子字孜恣慈滋炙煮玆瓷疵磁紫者自茨蔗藉諮資雌作勺嚼斫昨灼炸爵綽芍酌雀鵲孱棧殘潺盞岑暫潛箴簪蠶雜丈仗匠場墻壯奬將帳庄張掌暲杖樟檣欌漿牆狀獐璋章粧腸臟臧莊葬蔣薔藏裝贓醬長"],
["eea1","障再哉在宰才材栽梓渽滓災縡裁財載齋齎爭箏諍錚佇低儲咀姐底抵杵楮樗沮渚狙猪疽箸紵苧菹著藷詛貯躇這邸雎齟勣吊嫡寂摘敵滴狄炙的積笛籍績翟荻謫賊赤跡蹟迪迹適鏑佃佺傳全典前剪塡塼奠專展廛悛戰栓殿氈澱"],
["efa1","煎琠田甸畑癲筌箋箭篆纏詮輾轉鈿銓錢鐫電顚顫餞切截折浙癤竊節絶占岾店漸点粘霑鮎點接摺蝶丁井亭停偵呈姃定幀庭廷征情挺政整旌晶晸柾楨檉正汀淀淨渟湞瀞炡玎珽町睛碇禎程穽精綎艇訂諪貞鄭酊釘鉦鋌錠霆靖"],
["f0a1","靜頂鼎制劑啼堤帝弟悌提梯濟祭第臍薺製諸蹄醍除際霽題齊俎兆凋助嘲弔彫措操早晁曺曹朝條棗槽漕潮照燥爪璪眺祖祚租稠窕粗糟組繰肇藻蚤詔調趙躁造遭釣阻雕鳥族簇足鏃存尊卒拙猝倧宗從悰慫棕淙琮種終綜縱腫"],
["f1a1","踪踵鍾鐘佐坐左座挫罪主住侏做姝胄呪周嗾奏宙州廚晝朱柱株注洲湊澍炷珠疇籌紂紬綢舟蛛註誅走躊輳週酎酒鑄駐竹粥俊儁准埈寯峻晙樽浚準濬焌畯竣蠢逡遵雋駿茁中仲衆重卽櫛楫汁葺增憎曾拯烝甑症繒蒸證贈之只"],
["f2a1","咫地址志持指摯支旨智枝枳止池沚漬知砥祉祗紙肢脂至芝芷蜘誌識贄趾遲直稙稷織職唇嗔塵振搢晉晋桭榛殄津溱珍瑨璡畛疹盡眞瞋秦縉縝臻蔯袗診賑軫辰進鎭陣陳震侄叱姪嫉帙桎瓆疾秩窒膣蛭質跌迭斟朕什執潗緝輯"],
["f3a1","鏶集徵懲澄且侘借叉嗟嵯差次此磋箚茶蹉車遮捉搾着窄錯鑿齪撰澯燦璨瓚竄簒纂粲纘讚贊鑽餐饌刹察擦札紮僭參塹慘慙懺斬站讒讖倉倡創唱娼廠彰愴敞昌昶暢槍滄漲猖瘡窓脹艙菖蒼債埰寀寨彩採砦綵菜蔡采釵冊柵策"],
["f4a1","責凄妻悽處倜刺剔尺慽戚拓擲斥滌瘠脊蹠陟隻仟千喘天川擅泉淺玔穿舛薦賤踐遷釧闡阡韆凸哲喆徹撤澈綴輟轍鐵僉尖沾添甛瞻簽籤詹諂堞妾帖捷牒疊睫諜貼輒廳晴淸聽菁請靑鯖切剃替涕滯締諦逮遞體初剿哨憔抄招梢"],
["f5a1","椒楚樵炒焦硝礁礎秒稍肖艸苕草蕉貂超酢醋醮促囑燭矗蜀觸寸忖村邨叢塚寵悤憁摠總聰蔥銃撮催崔最墜抽推椎楸樞湫皺秋芻萩諏趨追鄒酋醜錐錘鎚雛騶鰍丑畜祝竺筑築縮蓄蹙蹴軸逐春椿瑃出朮黜充忠沖蟲衝衷悴膵萃"],
["f6a1","贅取吹嘴娶就炊翠聚脆臭趣醉驟鷲側仄厠惻測層侈値嗤峙幟恥梔治淄熾痔痴癡稚穉緇緻置致蚩輜雉馳齒則勅飭親七柒漆侵寢枕沈浸琛砧針鍼蟄秤稱快他咤唾墮妥惰打拖朶楕舵陀馱駝倬卓啄坼度托拓擢晫柝濁濯琢琸託"],
["f7a1","鐸呑嘆坦彈憚歎灘炭綻誕奪脫探眈耽貪塔搭榻宕帑湯糖蕩兌台太怠態殆汰泰笞胎苔跆邰颱宅擇澤撑攄兎吐土討慟桶洞痛筒統通堆槌腿褪退頹偸套妬投透鬪慝特闖坡婆巴把播擺杷波派爬琶破罷芭跛頗判坂板版瓣販辦鈑"],
["f8a1","阪八叭捌佩唄悖敗沛浿牌狽稗覇貝彭澎烹膨愎便偏扁片篇編翩遍鞭騙貶坪平枰萍評吠嬖幣廢弊斃肺蔽閉陛佈包匍匏咆哺圃布怖抛抱捕暴泡浦疱砲胞脯苞葡蒲袍褒逋鋪飽鮑幅暴曝瀑爆輻俵剽彪慓杓標漂瓢票表豹飇飄驃"],
["f9a1","品稟楓諷豊風馮彼披疲皮被避陂匹弼必泌珌畢疋筆苾馝乏逼下何厦夏廈昰河瑕荷蝦賀遐霞鰕壑學虐謔鶴寒恨悍旱汗漢澣瀚罕翰閑閒限韓割轄函含咸啣喊檻涵緘艦銜陷鹹合哈盒蛤閤闔陜亢伉姮嫦巷恒抗杭桁沆港缸肛航"],
["faa1","行降項亥偕咳垓奚孩害懈楷海瀣蟹解該諧邂駭骸劾核倖幸杏荇行享向嚮珦鄕響餉饗香噓墟虛許憲櫶獻軒歇險驗奕爀赫革俔峴弦懸晛泫炫玄玹現眩睍絃絢縣舷衒見賢鉉顯孑穴血頁嫌俠協夾峽挾浹狹脅脇莢鋏頰亨兄刑型"],
["fba1","形泂滎瀅灐炯熒珩瑩荊螢衡逈邢鎣馨兮彗惠慧暳蕙蹊醯鞋乎互呼壕壺好岵弧戶扈昊晧毫浩淏湖滸澔濠濩灝狐琥瑚瓠皓祜糊縞胡芦葫蒿虎號蝴護豪鎬頀顥惑或酷婚昏混渾琿魂忽惚笏哄弘汞泓洪烘紅虹訌鴻化和嬅樺火畵"],
["fca1","禍禾花華話譁貨靴廓擴攫確碻穫丸喚奐宦幻患換歡晥桓渙煥環紈還驩鰥活滑猾豁闊凰幌徨恍惶愰慌晃晄榥況湟滉潢煌璜皇篁簧荒蝗遑隍黃匯回廻徊恢悔懷晦會檜淮澮灰獪繪膾茴蛔誨賄劃獲宖橫鐄哮嚆孝效斅曉梟涍淆"],
["fda1","爻肴酵驍侯候厚后吼喉嗅帿後朽煦珝逅勛勳塤壎焄熏燻薰訓暈薨喧暄煊萱卉喙毁彙徽揮暉煇諱輝麾休携烋畦虧恤譎鷸兇凶匈洶胸黑昕欣炘痕吃屹紇訖欠欽歆吸恰洽翕興僖凞喜噫囍姬嬉希憙憘戱晞曦熙熹熺犧禧稀羲詰"]
]

},{}],34:[function(require,module,exports){
module.exports=[
["0","\u0000",127],
["a140","　，、。．‧；：？！︰…‥﹐﹑﹒·﹔﹕﹖﹗｜–︱—︳╴︴﹏（）︵︶｛｝︷︸〔〕︹︺【】︻︼《》︽︾〈〉︿﹀「」﹁﹂『』﹃﹄﹙﹚"],
["a1a1","﹛﹜﹝﹞‘’“”〝〞‵′＃＆＊※§〃○●△▲◎☆★◇◆□■▽▼㊣℅¯￣＿ˍ﹉﹊﹍﹎﹋﹌﹟﹠﹡＋－×÷±√＜＞＝≦≧≠∞≒≡﹢",4,"～∩∪⊥∠∟⊿㏒㏑∫∮∵∴♀♂⊕⊙↑↓←→↖↗↙↘∥∣／"],
["a240","＼∕﹨＄￥〒￠￡％＠℃℉﹩﹪﹫㏕㎜㎝㎞㏎㎡㎎㎏㏄°兙兛兞兝兡兣嗧瓩糎▁",7,"▏▎▍▌▋▊▉┼┴┬┤├▔─│▕┌┐└┘╭"],
["a2a1","╮╰╯═╞╪╡◢◣◥◤╱╲╳０",9,"Ⅰ",9,"〡",8,"十卄卅Ａ",25,"ａ",21],
["a340","ｗｘｙｚΑ",16,"Σ",6,"α",16,"σ",6,"ㄅ",10],
["a3a1","ㄐ",25,"˙ˉˊˇˋ"],
["a3e1","€"],
["a440","一乙丁七乃九了二人儿入八几刀刁力匕十卜又三下丈上丫丸凡久么也乞于亡兀刃勺千叉口土士夕大女子孑孓寸小尢尸山川工己已巳巾干廾弋弓才"],
["a4a1","丑丐不中丰丹之尹予云井互五亢仁什仃仆仇仍今介仄元允內六兮公冗凶分切刈勻勾勿化匹午升卅卞厄友及反壬天夫太夭孔少尤尺屯巴幻廿弔引心戈戶手扎支文斗斤方日曰月木欠止歹毋比毛氏水火爪父爻片牙牛犬王丙"],
["a540","世丕且丘主乍乏乎以付仔仕他仗代令仙仞充兄冉冊冬凹出凸刊加功包匆北匝仟半卉卡占卯卮去可古右召叮叩叨叼司叵叫另只史叱台句叭叻四囚外"],
["a5a1","央失奴奶孕它尼巨巧左市布平幼弁弘弗必戊打扔扒扑斥旦朮本未末札正母民氐永汁汀氾犯玄玉瓜瓦甘生用甩田由甲申疋白皮皿目矛矢石示禾穴立丞丟乒乓乩亙交亦亥仿伉伙伊伕伍伐休伏仲件任仰仳份企伋光兇兆先全"],
["a640","共再冰列刑划刎刖劣匈匡匠印危吉吏同吊吐吁吋各向名合吃后吆吒因回囝圳地在圭圬圯圩夙多夷夸妄奸妃好她如妁字存宇守宅安寺尖屹州帆并年"],
["a6a1","式弛忙忖戎戌戍成扣扛托收早旨旬旭曲曳有朽朴朱朵次此死氖汝汗汙江池汐汕污汛汍汎灰牟牝百竹米糸缶羊羽老考而耒耳聿肉肋肌臣自至臼舌舛舟艮色艾虫血行衣西阡串亨位住佇佗佞伴佛何估佐佑伽伺伸佃佔似但佣"],
["a740","作你伯低伶余佝佈佚兌克免兵冶冷別判利刪刨劫助努劬匣即卵吝吭吞吾否呎吧呆呃吳呈呂君吩告吹吻吸吮吵吶吠吼呀吱含吟听囪困囤囫坊坑址坍"],
["a7a1","均坎圾坐坏圻壯夾妝妒妨妞妣妙妖妍妤妓妊妥孝孜孚孛完宋宏尬局屁尿尾岐岑岔岌巫希序庇床廷弄弟彤形彷役忘忌志忍忱快忸忪戒我抄抗抖技扶抉扭把扼找批扳抒扯折扮投抓抑抆改攻攸旱更束李杏材村杜杖杞杉杆杠"],
["a840","杓杗步每求汞沙沁沈沉沅沛汪決沐汰沌汨沖沒汽沃汲汾汴沆汶沍沔沘沂灶灼災灸牢牡牠狄狂玖甬甫男甸皂盯矣私秀禿究系罕肖肓肝肘肛肚育良芒"],
["a8a1","芋芍見角言谷豆豕貝赤走足身車辛辰迂迆迅迄巡邑邢邪邦那酉釆里防阮阱阪阬並乖乳事些亞享京佯依侍佳使佬供例來侃佰併侈佩佻侖佾侏侑佺兔兒兕兩具其典冽函刻券刷刺到刮制剁劾劻卒協卓卑卦卷卸卹取叔受味呵"],
["a940","咖呸咕咀呻呷咄咒咆呼咐呱呶和咚呢周咋命咎固垃坷坪坩坡坦坤坼夜奉奇奈奄奔妾妻委妹妮姑姆姐姍始姓姊妯妳姒姅孟孤季宗定官宜宙宛尚屈居"],
["a9a1","屆岷岡岸岩岫岱岳帘帚帖帕帛帑幸庚店府底庖延弦弧弩往征彿彼忝忠忽念忿怏怔怯怵怖怪怕怡性怩怫怛或戕房戾所承拉拌拄抿拂抹拒招披拓拔拋拈抨抽押拐拙拇拍抵拚抱拘拖拗拆抬拎放斧於旺昔易昌昆昂明昀昏昕昊"],
["aa40","昇服朋杭枋枕東果杳杷枇枝林杯杰板枉松析杵枚枓杼杪杲欣武歧歿氓氛泣注泳沱泌泥河沽沾沼波沫法泓沸泄油況沮泗泅泱沿治泡泛泊沬泯泜泖泠"],
["aaa1","炕炎炒炊炙爬爭爸版牧物狀狎狙狗狐玩玨玟玫玥甽疝疙疚的盂盲直知矽社祀祁秉秈空穹竺糾罔羌羋者肺肥肢肱股肫肩肴肪肯臥臾舍芳芝芙芭芽芟芹花芬芥芯芸芣芰芾芷虎虱初表軋迎返近邵邸邱邶采金長門阜陀阿阻附"],
["ab40","陂隹雨青非亟亭亮信侵侯便俠俑俏保促侶俘俟俊俗侮俐俄係俚俎俞侷兗冒冑冠剎剃削前剌剋則勇勉勃勁匍南卻厚叛咬哀咨哎哉咸咦咳哇哂咽咪品"],
["aba1","哄哈咯咫咱咻咩咧咿囿垂型垠垣垢城垮垓奕契奏奎奐姜姘姿姣姨娃姥姪姚姦威姻孩宣宦室客宥封屎屏屍屋峙峒巷帝帥帟幽庠度建弈弭彥很待徊律徇後徉怒思怠急怎怨恍恰恨恢恆恃恬恫恪恤扁拜挖按拼拭持拮拽指拱拷"],
["ac40","拯括拾拴挑挂政故斫施既春昭映昧是星昨昱昤曷柿染柱柔某柬架枯柵柩柯柄柑枴柚查枸柏柞柳枰柙柢柝柒歪殃殆段毒毗氟泉洋洲洪流津洌洱洞洗"],
["aca1","活洽派洶洛泵洹洧洸洩洮洵洎洫炫為炳炬炯炭炸炮炤爰牲牯牴狩狠狡玷珊玻玲珍珀玳甚甭畏界畎畋疫疤疥疢疣癸皆皇皈盈盆盃盅省盹相眉看盾盼眇矜砂研砌砍祆祉祈祇禹禺科秒秋穿突竿竽籽紂紅紀紉紇約紆缸美羿耄"],
["ad40","耐耍耑耶胖胥胚胃胄背胡胛胎胞胤胝致舢苧范茅苣苛苦茄若茂茉苒苗英茁苜苔苑苞苓苟苯茆虐虹虻虺衍衫要觔計訂訃貞負赴赳趴軍軌述迦迢迪迥"],
["ada1","迭迫迤迨郊郎郁郃酋酊重閂限陋陌降面革韋韭音頁風飛食首香乘亳倌倍倣俯倦倥俸倩倖倆值借倚倒們俺倀倔倨俱倡個候倘俳修倭倪俾倫倉兼冤冥冢凍凌准凋剖剜剔剛剝匪卿原厝叟哨唐唁唷哼哥哲唆哺唔哩哭員唉哮哪"],
["ae40","哦唧唇哽唏圃圄埂埔埋埃堉夏套奘奚娑娘娜娟娛娓姬娠娣娩娥娌娉孫屘宰害家宴宮宵容宸射屑展屐峭峽峻峪峨峰島崁峴差席師庫庭座弱徒徑徐恙"],
["aea1","恣恥恐恕恭恩息悄悟悚悍悔悌悅悖扇拳挈拿捎挾振捕捂捆捏捉挺捐挽挪挫挨捍捌效敉料旁旅時晉晏晃晒晌晅晁書朔朕朗校核案框桓根桂桔栩梳栗桌桑栽柴桐桀格桃株桅栓栘桁殊殉殷氣氧氨氦氤泰浪涕消涇浦浸海浙涓"],
["af40","浬涉浮浚浴浩涌涊浹涅浥涔烊烘烤烙烈烏爹特狼狹狽狸狷玆班琉珮珠珪珞畔畝畜畚留疾病症疲疳疽疼疹痂疸皋皰益盍盎眩真眠眨矩砰砧砸砝破砷"],
["afa1","砥砭砠砟砲祕祐祠祟祖神祝祗祚秤秣秧租秦秩秘窄窈站笆笑粉紡紗紋紊素索純紐紕級紜納紙紛缺罟羔翅翁耆耘耕耙耗耽耿胱脂胰脅胭胴脆胸胳脈能脊胼胯臭臬舀舐航舫舨般芻茫荒荔荊茸荐草茵茴荏茲茹茶茗荀茱茨荃"],
["b040","虔蚊蚪蚓蚤蚩蚌蚣蚜衰衷袁袂衽衹記訐討訌訕訊託訓訖訏訑豈豺豹財貢起躬軒軔軏辱送逆迷退迺迴逃追逅迸邕郡郝郢酒配酌釘針釗釜釙閃院陣陡"],
["b0a1","陛陝除陘陞隻飢馬骨高鬥鬲鬼乾偺偽停假偃偌做偉健偶偎偕偵側偷偏倏偯偭兜冕凰剪副勒務勘動匐匏匙匿區匾參曼商啪啦啄啞啡啃啊唱啖問啕唯啤唸售啜唬啣唳啁啗圈國圉域堅堊堆埠埤基堂堵執培夠奢娶婁婉婦婪婀"],
["b140","娼婢婚婆婊孰寇寅寄寂宿密尉專將屠屜屝崇崆崎崛崖崢崑崩崔崙崤崧崗巢常帶帳帷康庸庶庵庾張強彗彬彩彫得徙從徘御徠徜恿患悉悠您惋悴惦悽"],
["b1a1","情悻悵惜悼惘惕惆惟悸惚惇戚戛扈掠控捲掖探接捷捧掘措捱掩掉掃掛捫推掄授掙採掬排掏掀捻捩捨捺敝敖救教敗啟敏敘敕敔斜斛斬族旋旌旎晝晚晤晨晦晞曹勗望梁梯梢梓梵桿桶梱梧梗械梃棄梭梆梅梔條梨梟梡梂欲殺"],
["b240","毫毬氫涎涼淳淙液淡淌淤添淺清淇淋涯淑涮淞淹涸混淵淅淒渚涵淚淫淘淪深淮淨淆淄涪淬涿淦烹焉焊烽烯爽牽犁猜猛猖猓猙率琅琊球理現琍瓠瓶"],
["b2a1","瓷甜產略畦畢異疏痔痕疵痊痍皎盔盒盛眷眾眼眶眸眺硫硃硎祥票祭移窒窕笠笨笛第符笙笞笮粒粗粕絆絃統紮紹紼絀細紳組累終紲紱缽羞羚翌翎習耜聊聆脯脖脣脫脩脰脤舂舵舷舶船莎莞莘荸莢莖莽莫莒莊莓莉莠荷荻荼"],
["b340","莆莧處彪蛇蛀蚶蛄蚵蛆蛋蚱蚯蛉術袞袈被袒袖袍袋覓規訪訝訣訥許設訟訛訢豉豚販責貫貨貪貧赧赦趾趺軛軟這逍通逗連速逝逐逕逞造透逢逖逛途"],
["b3a1","部郭都酗野釵釦釣釧釭釩閉陪陵陳陸陰陴陶陷陬雀雪雩章竟頂頃魚鳥鹵鹿麥麻傢傍傅備傑傀傖傘傚最凱割剴創剩勞勝勛博厥啻喀喧啼喊喝喘喂喜喪喔喇喋喃喳單喟唾喲喚喻喬喱啾喉喫喙圍堯堪場堤堰報堡堝堠壹壺奠"],
["b440","婷媚婿媒媛媧孳孱寒富寓寐尊尋就嵌嵐崴嵇巽幅帽幀幃幾廊廁廂廄弼彭復循徨惑惡悲悶惠愜愣惺愕惰惻惴慨惱愎惶愉愀愒戟扉掣掌描揀揩揉揆揍"],
["b4a1","插揣提握揖揭揮捶援揪換摒揚揹敞敦敢散斑斐斯普晰晴晶景暑智晾晷曾替期朝棺棕棠棘棗椅棟棵森棧棹棒棲棣棋棍植椒椎棉棚楮棻款欺欽殘殖殼毯氮氯氬港游湔渡渲湧湊渠渥渣減湛湘渤湖湮渭渦湯渴湍渺測湃渝渾滋"],
["b540","溉渙湎湣湄湲湩湟焙焚焦焰無然煮焜牌犄犀猶猥猴猩琺琪琳琢琥琵琶琴琯琛琦琨甥甦畫番痢痛痣痙痘痞痠登發皖皓皴盜睏短硝硬硯稍稈程稅稀窘"],
["b5a1","窗窖童竣等策筆筐筒答筍筋筏筑粟粥絞結絨絕紫絮絲絡給絢絰絳善翔翕耋聒肅腕腔腋腑腎脹腆脾腌腓腴舒舜菩萃菸萍菠菅萋菁華菱菴著萊菰萌菌菽菲菊萸萎萄菜萇菔菟虛蛟蛙蛭蛔蛛蛤蛐蛞街裁裂袱覃視註詠評詞証詁"],
["b640","詔詛詐詆訴診訶詖象貂貯貼貳貽賁費賀貴買貶貿貸越超趁跎距跋跚跑跌跛跆軻軸軼辜逮逵週逸進逶鄂郵鄉郾酣酥量鈔鈕鈣鈉鈞鈍鈐鈇鈑閔閏開閑"],
["b6a1","間閒閎隊階隋陽隅隆隍陲隄雁雅雄集雇雯雲韌項順須飧飪飯飩飲飭馮馭黃黍黑亂傭債傲傳僅傾催傷傻傯僇剿剷剽募勦勤勢勣匯嗟嗨嗓嗦嗎嗜嗇嗑嗣嗤嗯嗚嗡嗅嗆嗥嗉園圓塞塑塘塗塚塔填塌塭塊塢塒塋奧嫁嫉嫌媾媽媼"],
["b740","媳嫂媲嵩嵯幌幹廉廈弒彙徬微愚意慈感想愛惹愁愈慎慌慄慍愾愴愧愍愆愷戡戢搓搾搞搪搭搽搬搏搜搔損搶搖搗搆敬斟新暗暉暇暈暖暄暘暍會榔業"],
["b7a1","楚楷楠楔極椰概楊楨楫楞楓楹榆楝楣楛歇歲毀殿毓毽溢溯滓溶滂源溝滇滅溥溘溼溺溫滑準溜滄滔溪溧溴煎煙煩煤煉照煜煬煦煌煥煞煆煨煖爺牒猷獅猿猾瑯瑚瑕瑟瑞瑁琿瑙瑛瑜當畸瘀痰瘁痲痱痺痿痴痳盞盟睛睫睦睞督"],
["b840","睹睪睬睜睥睨睢矮碎碰碗碘碌碉硼碑碓硿祺祿禁萬禽稜稚稠稔稟稞窟窠筷節筠筮筧粱粳粵經絹綑綁綏絛置罩罪署義羨群聖聘肆肄腱腰腸腥腮腳腫"],
["b8a1","腹腺腦舅艇蒂葷落萱葵葦葫葉葬葛萼萵葡董葩葭葆虞虜號蛹蜓蜈蜇蜀蛾蛻蜂蜃蜆蜊衙裟裔裙補裘裝裡裊裕裒覜解詫該詳試詩詰誇詼詣誠話誅詭詢詮詬詹詻訾詨豢貊貉賊資賈賄貲賃賂賅跡跟跨路跳跺跪跤跦躲較載軾輊"],
["b940","辟農運遊道遂達逼違遐遇遏過遍遑逾遁鄒鄗酬酪酩釉鈷鉗鈸鈽鉀鈾鉛鉋鉤鉑鈴鉉鉍鉅鈹鈿鉚閘隘隔隕雍雋雉雊雷電雹零靖靴靶預頑頓頊頒頌飼飴"],
["b9a1","飽飾馳馱馴髡鳩麂鼎鼓鼠僧僮僥僖僭僚僕像僑僱僎僩兢凳劃劂匱厭嗾嘀嘛嘗嗽嘔嘆嘉嘍嘎嗷嘖嘟嘈嘐嗶團圖塵塾境墓墊塹墅塽壽夥夢夤奪奩嫡嫦嫩嫗嫖嫘嫣孵寞寧寡寥實寨寢寤察對屢嶄嶇幛幣幕幗幔廓廖弊彆彰徹慇"],
["ba40","愿態慷慢慣慟慚慘慵截撇摘摔撤摸摟摺摑摧搴摭摻敲斡旗旖暢暨暝榜榨榕槁榮槓構榛榷榻榫榴槐槍榭槌榦槃榣歉歌氳漳演滾漓滴漩漾漠漬漏漂漢"],
["baa1","滿滯漆漱漸漲漣漕漫漯澈漪滬漁滲滌滷熔熙煽熊熄熒爾犒犖獄獐瑤瑣瑪瑰瑭甄疑瘧瘍瘋瘉瘓盡監瞄睽睿睡磁碟碧碳碩碣禎福禍種稱窪窩竭端管箕箋筵算箝箔箏箸箇箄粹粽精綻綰綜綽綾綠緊綴網綱綺綢綿綵綸維緒緇綬"],
["bb40","罰翠翡翟聞聚肇腐膀膏膈膊腿膂臧臺與舔舞艋蓉蒿蓆蓄蒙蒞蒲蒜蓋蒸蓀蓓蒐蒼蓑蓊蜿蜜蜻蜢蜥蜴蜘蝕蜷蜩裳褂裴裹裸製裨褚裯誦誌語誣認誡誓誤"],
["bba1","說誥誨誘誑誚誧豪貍貌賓賑賒赫趙趕跼輔輒輕輓辣遠遘遜遣遙遞遢遝遛鄙鄘鄞酵酸酷酴鉸銀銅銘銖鉻銓銜銨鉼銑閡閨閩閣閥閤隙障際雌雒需靼鞅韶頗領颯颱餃餅餌餉駁骯骰髦魁魂鳴鳶鳳麼鼻齊億儀僻僵價儂儈儉儅凜"],
["bc40","劇劈劉劍劊勰厲嘮嘻嘹嘲嘿嘴嘩噓噎噗噴嘶嘯嘰墀墟增墳墜墮墩墦奭嬉嫻嬋嫵嬌嬈寮寬審寫層履嶝嶔幢幟幡廢廚廟廝廣廠彈影德徵慶慧慮慝慕憂"],
["bca1","慼慰慫慾憧憐憫憎憬憚憤憔憮戮摩摯摹撞撲撈撐撰撥撓撕撩撒撮播撫撚撬撙撢撳敵敷數暮暫暴暱樣樟槨樁樞標槽模樓樊槳樂樅槭樑歐歎殤毅毆漿潼澄潑潦潔澆潭潛潸潮澎潺潰潤澗潘滕潯潠潟熟熬熱熨牖犛獎獗瑩璋璃"],
["bd40","瑾璀畿瘠瘩瘟瘤瘦瘡瘢皚皺盤瞎瞇瞌瞑瞋磋磅確磊碾磕碼磐稿稼穀稽稷稻窯窮箭箱範箴篆篇篁箠篌糊締練緯緻緘緬緝編緣線緞緩綞緙緲緹罵罷羯"],
["bda1","翩耦膛膜膝膠膚膘蔗蔽蔚蓮蔬蔭蔓蔑蔣蔡蔔蓬蔥蓿蔆螂蝴蝶蝠蝦蝸蝨蝙蝗蝌蝓衛衝褐複褒褓褕褊誼諒談諄誕請諸課諉諂調誰論諍誶誹諛豌豎豬賠賞賦賤賬賭賢賣賜質賡赭趟趣踫踐踝踢踏踩踟踡踞躺輝輛輟輩輦輪輜輞"],
["be40","輥適遮遨遭遷鄰鄭鄧鄱醇醉醋醃鋅銻銷鋪銬鋤鋁銳銼鋒鋇鋰銲閭閱霄霆震霉靠鞍鞋鞏頡頫頜颳養餓餒餘駝駐駟駛駑駕駒駙骷髮髯鬧魅魄魷魯鴆鴉"],
["bea1","鴃麩麾黎墨齒儒儘儔儐儕冀冪凝劑劓勳噙噫噹噩噤噸噪器噥噱噯噬噢噶壁墾壇壅奮嬝嬴學寰導彊憲憑憩憊懍憶憾懊懈戰擅擁擋撻撼據擄擇擂操撿擒擔撾整曆曉暹曄曇暸樽樸樺橙橫橘樹橄橢橡橋橇樵機橈歙歷氅濂澱澡"],
["bf40","濃澤濁澧澳激澹澶澦澠澴熾燉燐燒燈燕熹燎燙燜燃燄獨璜璣璘璟璞瓢甌甍瘴瘸瘺盧盥瞠瞞瞟瞥磨磚磬磧禦積穎穆穌穋窺篙簑築篤篛篡篩篦糕糖縊"],
["bfa1","縑縈縛縣縞縝縉縐罹羲翰翱翮耨膳膩膨臻興艘艙蕊蕙蕈蕨蕩蕃蕉蕭蕪蕞螃螟螞螢融衡褪褲褥褫褡親覦諦諺諫諱謀諜諧諮諾謁謂諷諭諳諶諼豫豭貓賴蹄踱踴蹂踹踵輻輯輸輳辨辦遵遴選遲遼遺鄴醒錠錶鋸錳錯錢鋼錫錄錚"],
["c040","錐錦錡錕錮錙閻隧隨險雕霎霑霖霍霓霏靛靜靦鞘頰頸頻頷頭頹頤餐館餞餛餡餚駭駢駱骸骼髻髭鬨鮑鴕鴣鴦鴨鴒鴛默黔龍龜優償儡儲勵嚎嚀嚐嚅嚇"],
["c0a1","嚏壕壓壑壎嬰嬪嬤孺尷屨嶼嶺嶽嶸幫彌徽應懂懇懦懋戲戴擎擊擘擠擰擦擬擱擢擭斂斃曙曖檀檔檄檢檜櫛檣橾檗檐檠歜殮毚氈濘濱濟濠濛濤濫濯澀濬濡濩濕濮濰燧營燮燦燥燭燬燴燠爵牆獰獲璩環璦璨癆療癌盪瞳瞪瞰瞬"],
["c140","瞧瞭矯磷磺磴磯礁禧禪穗窿簇簍篾篷簌篠糠糜糞糢糟糙糝縮績繆縷縲繃縫總縱繅繁縴縹繈縵縿縯罄翳翼聱聲聰聯聳臆臃膺臂臀膿膽臉膾臨舉艱薪"],
["c1a1","薄蕾薜薑薔薯薛薇薨薊虧蟀蟑螳蟒蟆螫螻螺蟈蟋褻褶襄褸褽覬謎謗謙講謊謠謝謄謐豁谿豳賺賽購賸賻趨蹉蹋蹈蹊轄輾轂轅輿避遽還邁邂邀鄹醣醞醜鍍鎂錨鍵鍊鍥鍋錘鍾鍬鍛鍰鍚鍔闊闋闌闈闆隱隸雖霜霞鞠韓顆颶餵騁"],
["c240","駿鮮鮫鮪鮭鴻鴿麋黏點黜黝黛鼾齋叢嚕嚮壙壘嬸彝懣戳擴擲擾攆擺擻擷斷曜朦檳檬櫃檻檸櫂檮檯歟歸殯瀉瀋濾瀆濺瀑瀏燻燼燾燸獷獵璧璿甕癖癘"],
["c2a1","癒瞽瞿瞻瞼礎禮穡穢穠竄竅簫簧簪簞簣簡糧織繕繞繚繡繒繙罈翹翻職聶臍臏舊藏薩藍藐藉薰薺薹薦蟯蟬蟲蟠覆覲觴謨謹謬謫豐贅蹙蹣蹦蹤蹟蹕軀轉轍邇邃邈醫醬釐鎔鎊鎖鎢鎳鎮鎬鎰鎘鎚鎗闔闖闐闕離雜雙雛雞霤鞣鞦"],
["c340","鞭韹額顏題顎顓颺餾餿餽餮馥騎髁鬃鬆魏魎魍鯊鯉鯽鯈鯀鵑鵝鵠黠鼕鼬儳嚥壞壟壢寵龐廬懲懷懶懵攀攏曠曝櫥櫝櫚櫓瀛瀟瀨瀚瀝瀕瀘爆爍牘犢獸"],
["c3a1","獺璽瓊瓣疇疆癟癡矇礙禱穫穩簾簿簸簽簷籀繫繭繹繩繪羅繳羶羹羸臘藩藝藪藕藤藥藷蟻蠅蠍蟹蟾襠襟襖襞譁譜識證譚譎譏譆譙贈贊蹼蹲躇蹶蹬蹺蹴轔轎辭邊邋醱醮鏡鏑鏟鏃鏈鏜鏝鏖鏢鏍鏘鏤鏗鏨關隴難霪霧靡韜韻類"],
["c440","願顛颼饅饉騖騙鬍鯨鯧鯖鯛鶉鵡鵲鵪鵬麒麗麓麴勸嚨嚷嚶嚴嚼壤孀孃孽寶巉懸懺攘攔攙曦朧櫬瀾瀰瀲爐獻瓏癢癥礦礪礬礫竇競籌籃籍糯糰辮繽繼"],
["c4a1","纂罌耀臚艦藻藹蘑藺蘆蘋蘇蘊蠔蠕襤覺觸議譬警譯譟譫贏贍躉躁躅躂醴釋鐘鐃鏽闡霰飄饒饑馨騫騰騷騵鰓鰍鹹麵黨鼯齟齣齡儷儸囁囀囂夔屬巍懼懾攝攜斕曩櫻欄櫺殲灌爛犧瓖瓔癩矓籐纏續羼蘗蘭蘚蠣蠢蠡蠟襪襬覽譴"],
["c540","護譽贓躊躍躋轟辯醺鐮鐳鐵鐺鐸鐲鐫闢霸霹露響顧顥饗驅驃驀騾髏魔魑鰭鰥鶯鶴鷂鶸麝黯鼙齜齦齧儼儻囈囊囉孿巔巒彎懿攤權歡灑灘玀瓤疊癮癬"],
["c5a1","禳籠籟聾聽臟襲襯觼讀贖贗躑躓轡酈鑄鑑鑒霽霾韃韁顫饕驕驍髒鬚鱉鰱鰾鰻鷓鷗鼴齬齪龔囌巖戀攣攫攪曬欐瓚竊籤籣籥纓纖纔臢蘸蘿蠱變邐邏鑣鑠鑤靨顯饜驚驛驗髓體髑鱔鱗鱖鷥麟黴囑壩攬灞癱癲矗罐羈蠶蠹衢讓讒"],
["c640","讖艷贛釀鑪靂靈靄韆顰驟鬢魘鱟鷹鷺鹼鹽鼇齷齲廳欖灣籬籮蠻觀躡釁鑲鑰顱饞髖鬣黌灤矚讚鑷韉驢驥纜讜躪釅鑽鑾鑼鱷鱸黷豔鑿鸚爨驪鬱鸛鸞籲"],
["c940","乂乜凵匚厂万丌乇亍囗兀屮彳丏冇与丮亓仂仉仈冘勼卬厹圠夃夬尐巿旡殳毌气爿丱丼仨仜仩仡仝仚刌匜卌圢圣夗夯宁宄尒尻屴屳帄庀庂忉戉扐氕"],
["c9a1","氶汃氿氻犮犰玊禸肊阞伎优伬仵伔仱伀价伈伝伂伅伢伓伄仴伒冱刓刉刐劦匢匟卍厊吇囡囟圮圪圴夼妀奼妅奻奾奷奿孖尕尥屼屺屻屾巟幵庄异弚彴忕忔忏扜扞扤扡扦扢扙扠扚扥旯旮朾朹朸朻机朿朼朳氘汆汒汜汏汊汔汋"],
["ca40","汌灱牞犴犵玎甪癿穵网艸艼芀艽艿虍襾邙邗邘邛邔阢阤阠阣佖伻佢佉体佤伾佧佒佟佁佘伭伳伿佡冏冹刜刞刡劭劮匉卣卲厎厏吰吷吪呔呅吙吜吥吘"],
["caa1","吽呏呁吨吤呇囮囧囥坁坅坌坉坋坒夆奀妦妘妠妗妎妢妐妏妧妡宎宒尨尪岍岏岈岋岉岒岊岆岓岕巠帊帎庋庉庌庈庍弅弝彸彶忒忑忐忭忨忮忳忡忤忣忺忯忷忻怀忴戺抃抌抎抏抔抇扱扻扺扰抁抈扷扽扲扴攷旰旴旳旲旵杅杇"],
["cb40","杙杕杌杈杝杍杚杋毐氙氚汸汧汫沄沋沏汱汯汩沚汭沇沕沜汦汳汥汻沎灴灺牣犿犽狃狆狁犺狅玕玗玓玔玒町甹疔疕皁礽耴肕肙肐肒肜芐芏芅芎芑芓"],
["cba1","芊芃芄豸迉辿邟邡邥邞邧邠阰阨阯阭丳侘佼侅佽侀侇佶佴侉侄佷佌侗佪侚佹侁佸侐侜侔侞侒侂侕佫佮冞冼冾刵刲刳剆刱劼匊匋匼厒厔咇呿咁咑咂咈呫呺呾呥呬呴呦咍呯呡呠咘呣呧呤囷囹坯坲坭坫坱坰坶垀坵坻坳坴坢"],
["cc40","坨坽夌奅妵妺姏姎妲姌姁妶妼姃姖妱妽姀姈妴姇孢孥宓宕屄屇岮岤岠岵岯岨岬岟岣岭岢岪岧岝岥岶岰岦帗帔帙弨弢弣弤彔徂彾彽忞忥怭怦怙怲怋"],
["cca1","怴怊怗怳怚怞怬怢怍怐怮怓怑怌怉怜戔戽抭抴拑抾抪抶拊抮抳抯抻抩抰抸攽斨斻昉旼昄昒昈旻昃昋昍昅旽昑昐曶朊枅杬枎枒杶杻枘枆构杴枍枌杺枟枑枙枃杽极杸杹枔欥殀歾毞氝沓泬泫泮泙沶泔沭泧沷泐泂沺泃泆泭泲"],
["cd40","泒泝沴沊沝沀泞泀洰泍泇沰泹泏泩泑炔炘炅炓炆炄炑炖炂炚炃牪狖狋狘狉狜狒狔狚狌狑玤玡玭玦玢玠玬玝瓝瓨甿畀甾疌疘皯盳盱盰盵矸矼矹矻矺"],
["cda1","矷祂礿秅穸穻竻籵糽耵肏肮肣肸肵肭舠芠苀芫芚芘芛芵芧芮芼芞芺芴芨芡芩苂芤苃芶芢虰虯虭虮豖迒迋迓迍迖迕迗邲邴邯邳邰阹阽阼阺陃俍俅俓侲俉俋俁俔俜俙侻侳俛俇俖侺俀侹俬剄剉勀勂匽卼厗厖厙厘咺咡咭咥哏"],
["ce40","哃茍咷咮哖咶哅哆咠呰咼咢咾呲哞咰垵垞垟垤垌垗垝垛垔垘垏垙垥垚垕壴复奓姡姞姮娀姱姝姺姽姼姶姤姲姷姛姩姳姵姠姾姴姭宨屌峐峘峌峗峋峛"],
["cea1","峞峚峉峇峊峖峓峔峏峈峆峎峟峸巹帡帢帣帠帤庰庤庢庛庣庥弇弮彖徆怷怹恔恲恞恅恓恇恉恛恌恀恂恟怤恄恘恦恮扂扃拏挍挋拵挎挃拫拹挏挌拸拶挀挓挔拺挕拻拰敁敃斪斿昶昡昲昵昜昦昢昳昫昺昝昴昹昮朏朐柁柲柈枺"],
["cf40","柜枻柸柘柀枷柅柫柤柟枵柍枳柷柶柮柣柂枹柎柧柰枲柼柆柭柌枮柦柛柺柉柊柃柪柋欨殂殄殶毖毘毠氠氡洨洴洭洟洼洿洒洊泚洳洄洙洺洚洑洀洝浂"],
["cfa1","洁洘洷洃洏浀洇洠洬洈洢洉洐炷炟炾炱炰炡炴炵炩牁牉牊牬牰牳牮狊狤狨狫狟狪狦狣玅珌珂珈珅玹玶玵玴珫玿珇玾珃珆玸珋瓬瓮甮畇畈疧疪癹盄眈眃眄眅眊盷盻盺矧矨砆砑砒砅砐砏砎砉砃砓祊祌祋祅祄秕种秏秖秎窀"],
["d040","穾竑笀笁籺籸籹籿粀粁紃紈紁罘羑羍羾耇耎耏耔耷胘胇胠胑胈胂胐胅胣胙胜胊胕胉胏胗胦胍臿舡芔苙苾苹茇苨茀苕茺苫苖苴苬苡苲苵茌苻苶苰苪"],
["d0a1","苤苠苺苳苭虷虴虼虳衁衎衧衪衩觓訄訇赲迣迡迮迠郱邽邿郕郅邾郇郋郈釔釓陔陏陑陓陊陎倞倅倇倓倢倰倛俵俴倳倷倬俶俷倗倜倠倧倵倯倱倎党冔冓凊凄凅凈凎剡剚剒剞剟剕剢勍匎厞唦哢唗唒哧哳哤唚哿唄唈哫唑唅哱"],
["d140","唊哻哷哸哠唎唃唋圁圂埌堲埕埒垺埆垽垼垸垶垿埇埐垹埁夎奊娙娖娭娮娕娏娗娊娞娳孬宧宭宬尃屖屔峬峿峮峱峷崀峹帩帨庨庮庪庬弳弰彧恝恚恧"],
["d1a1","恁悢悈悀悒悁悝悃悕悛悗悇悜悎戙扆拲挐捖挬捄捅挶捃揤挹捋捊挼挩捁挴捘捔捙挭捇挳捚捑挸捗捀捈敊敆旆旃旄旂晊晟晇晑朒朓栟栚桉栲栳栻桋桏栖栱栜栵栫栭栯桎桄栴栝栒栔栦栨栮桍栺栥栠欬欯欭欱欴歭肂殈毦毤"],
["d240","毨毣毢毧氥浺浣浤浶洍浡涒浘浢浭浯涑涍淯浿涆浞浧浠涗浰浼浟涂涘洯浨涋浾涀涄洖涃浻浽浵涐烜烓烑烝烋缹烢烗烒烞烠烔烍烅烆烇烚烎烡牂牸"],
["d2a1","牷牶猀狺狴狾狶狳狻猁珓珙珥珖玼珧珣珩珜珒珛珔珝珚珗珘珨瓞瓟瓴瓵甡畛畟疰痁疻痄痀疿疶疺皊盉眝眛眐眓眒眣眑眕眙眚眢眧砣砬砢砵砯砨砮砫砡砩砳砪砱祔祛祏祜祓祒祑秫秬秠秮秭秪秜秞秝窆窉窅窋窌窊窇竘笐"],
["d340","笄笓笅笏笈笊笎笉笒粄粑粊粌粈粍粅紞紝紑紎紘紖紓紟紒紏紌罜罡罞罠罝罛羖羒翃翂翀耖耾耹胺胲胹胵脁胻脀舁舯舥茳茭荄茙荑茥荖茿荁茦茜茢"],
["d3a1","荂荎茛茪茈茼荍茖茤茠茷茯茩荇荅荌荓茞茬荋茧荈虓虒蚢蚨蚖蚍蚑蚞蚇蚗蚆蚋蚚蚅蚥蚙蚡蚧蚕蚘蚎蚝蚐蚔衃衄衭衵衶衲袀衱衿衯袃衾衴衼訒豇豗豻貤貣赶赸趵趷趶軑軓迾迵适迿迻逄迼迶郖郠郙郚郣郟郥郘郛郗郜郤酐"],
["d440","酎酏釕釢釚陜陟隼飣髟鬯乿偰偪偡偞偠偓偋偝偲偈偍偁偛偊偢倕偅偟偩偫偣偤偆偀偮偳偗偑凐剫剭剬剮勖勓匭厜啵啶唼啍啐唴唪啑啢唶唵唰啒啅"],
["d4a1","唌唲啥啎唹啈唭唻啀啋圊圇埻堔埢埶埜埴堀埭埽堈埸堋埳埏堇埮埣埲埥埬埡堎埼堐埧堁堌埱埩埰堍堄奜婠婘婕婧婞娸娵婭婐婟婥婬婓婤婗婃婝婒婄婛婈媎娾婍娹婌婰婩婇婑婖婂婜孲孮寁寀屙崞崋崝崚崠崌崨崍崦崥崏"],
["d540","崰崒崣崟崮帾帴庱庴庹庲庳弶弸徛徖徟悊悐悆悾悰悺惓惔惏惤惙惝惈悱惛悷惊悿惃惍惀挲捥掊掂捽掽掞掭掝掗掫掎捯掇掐据掯捵掜捭掮捼掤挻掟"],
["d5a1","捸掅掁掑掍捰敓旍晥晡晛晙晜晢朘桹梇梐梜桭桮梮梫楖桯梣梬梩桵桴梲梏桷梒桼桫桲梪梀桱桾梛梖梋梠梉梤桸桻梑梌梊桽欶欳欷欸殑殏殍殎殌氪淀涫涴涳湴涬淩淢涷淶淔渀淈淠淟淖涾淥淜淝淛淴淊涽淭淰涺淕淂淏淉"],
["d640","淐淲淓淽淗淍淣涻烺焍烷焗烴焌烰焄烳焐烼烿焆焓焀烸烶焋焂焎牾牻牼牿猝猗猇猑猘猊猈狿猏猞玈珶珸珵琄琁珽琇琀珺珼珿琌琋珴琈畤畣痎痒痏"],
["d6a1","痋痌痑痐皏皉盓眹眯眭眱眲眴眳眽眥眻眵硈硒硉硍硊硌砦硅硐祤祧祩祪祣祫祡离秺秸秶秷窏窔窐笵筇笴笥笰笢笤笳笘笪笝笱笫笭笯笲笸笚笣粔粘粖粣紵紽紸紶紺絅紬紩絁絇紾紿絊紻紨罣羕羜羝羛翊翋翍翐翑翇翏翉耟"],
["d740","耞耛聇聃聈脘脥脙脛脭脟脬脞脡脕脧脝脢舑舸舳舺舴舲艴莐莣莨莍荺荳莤荴莏莁莕莙荵莔莩荽莃莌莝莛莪莋荾莥莯莈莗莰荿莦莇莮荶莚虙虖蚿蚷"],
["d7a1","蛂蛁蛅蚺蚰蛈蚹蚳蚸蛌蚴蚻蚼蛃蚽蚾衒袉袕袨袢袪袚袑袡袟袘袧袙袛袗袤袬袌袓袎覂觖觙觕訰訧訬訞谹谻豜豝豽貥赽赻赹趼跂趹趿跁軘軞軝軜軗軠軡逤逋逑逜逌逡郯郪郰郴郲郳郔郫郬郩酖酘酚酓酕釬釴釱釳釸釤釹釪"],
["d840","釫釷釨釮镺閆閈陼陭陫陱陯隿靪頄飥馗傛傕傔傞傋傣傃傌傎傝偨傜傒傂傇兟凔匒匑厤厧喑喨喥喭啷噅喢喓喈喏喵喁喣喒喤啽喌喦啿喕喡喎圌堩堷"],
["d8a1","堙堞堧堣堨埵塈堥堜堛堳堿堶堮堹堸堭堬堻奡媯媔媟婺媢媞婸媦婼媥媬媕媮娷媄媊媗媃媋媩婻婽媌媜媏媓媝寪寍寋寔寑寊寎尌尰崷嵃嵫嵁嵋崿崵嵑嵎嵕崳崺嵒崽崱嵙嵂崹嵉崸崼崲崶嵀嵅幄幁彘徦徥徫惉悹惌惢惎惄愔"],
["d940","惲愊愖愅惵愓惸惼惾惁愃愘愝愐惿愄愋扊掔掱掰揎揥揨揯揃撝揳揊揠揶揕揲揵摡揟掾揝揜揄揘揓揂揇揌揋揈揰揗揙攲敧敪敤敜敨敥斌斝斞斮旐旒"],
["d9a1","晼晬晻暀晱晹晪晲朁椌棓椄棜椪棬棪棱椏棖棷棫棤棶椓椐棳棡椇棌椈楰梴椑棯棆椔棸棐棽棼棨椋椊椗棎棈棝棞棦棴棑椆棔棩椕椥棇欹欻欿欼殔殗殙殕殽毰毲毳氰淼湆湇渟湉溈渼渽湅湢渫渿湁湝湳渜渳湋湀湑渻渃渮湞"],
["da40","湨湜湡渱渨湠湱湫渹渢渰湓湥渧湸湤湷湕湹湒湦渵渶湚焠焞焯烻焮焱焣焥焢焲焟焨焺焛牋牚犈犉犆犅犋猒猋猰猢猱猳猧猲猭猦猣猵猌琮琬琰琫琖"],
["daa1","琚琡琭琱琤琣琝琩琠琲瓻甯畯畬痧痚痡痦痝痟痤痗皕皒盚睆睇睄睍睅睊睎睋睌矞矬硠硤硥硜硭硱硪确硰硩硨硞硢祴祳祲祰稂稊稃稌稄窙竦竤筊笻筄筈筌筎筀筘筅粢粞粨粡絘絯絣絓絖絧絪絏絭絜絫絒絔絩絑絟絎缾缿罥"],
["db40","罦羢羠羡翗聑聏聐胾胔腃腊腒腏腇脽腍脺臦臮臷臸臹舄舼舽舿艵茻菏菹萣菀菨萒菧菤菼菶萐菆菈菫菣莿萁菝菥菘菿菡菋菎菖菵菉萉萏菞萑萆菂菳"],
["dba1","菕菺菇菑菪萓菃菬菮菄菻菗菢萛菛菾蛘蛢蛦蛓蛣蛚蛪蛝蛫蛜蛬蛩蛗蛨蛑衈衖衕袺裗袹袸裀袾袶袼袷袽袲褁裉覕覘覗觝觚觛詎詍訹詙詀詗詘詄詅詒詈詑詊詌詏豟貁貀貺貾貰貹貵趄趀趉跘跓跍跇跖跜跏跕跙跈跗跅軯軷軺"],
["dc40","軹軦軮軥軵軧軨軶軫軱軬軴軩逭逴逯鄆鄬鄄郿郼鄈郹郻鄁鄀鄇鄅鄃酡酤酟酢酠鈁鈊鈥鈃鈚鈦鈏鈌鈀鈒釿釽鈆鈄鈧鈂鈜鈤鈙鈗鈅鈖镻閍閌閐隇陾隈"],
["dca1","隉隃隀雂雈雃雱雰靬靰靮頇颩飫鳦黹亃亄亶傽傿僆傮僄僊傴僈僂傰僁傺傱僋僉傶傸凗剺剸剻剼嗃嗛嗌嗐嗋嗊嗝嗀嗔嗄嗩喿嗒喍嗏嗕嗢嗖嗈嗲嗍嗙嗂圔塓塨塤塏塍塉塯塕塎塝塙塥塛堽塣塱壼嫇嫄嫋媺媸媱媵媰媿嫈媻嫆"],
["dd40","媷嫀嫊媴媶嫍媹媐寖寘寙尟尳嵱嵣嵊嵥嵲嵬嵞嵨嵧嵢巰幏幎幊幍幋廅廌廆廋廇彀徯徭惷慉慊愫慅愶愲愮慆愯慏愩慀戠酨戣戥戤揅揱揫搐搒搉搠搤"],
["dda1","搳摃搟搕搘搹搷搢搣搌搦搰搨摁搵搯搊搚摀搥搧搋揧搛搮搡搎敯斒旓暆暌暕暐暋暊暙暔晸朠楦楟椸楎楢楱椿楅楪椹楂楗楙楺楈楉椵楬椳椽楥棰楸椴楩楀楯楄楶楘楁楴楌椻楋椷楜楏楑椲楒椯楻椼歆歅歃歂歈歁殛嗀毻毼"],
["de40","毹毷毸溛滖滈溏滀溟溓溔溠溱溹滆滒溽滁溞滉溷溰滍溦滏溲溾滃滜滘溙溒溎溍溤溡溿溳滐滊溗溮溣煇煔煒煣煠煁煝煢煲煸煪煡煂煘煃煋煰煟煐煓"],
["dea1","煄煍煚牏犍犌犑犐犎猼獂猻猺獀獊獉瑄瑊瑋瑒瑑瑗瑀瑏瑐瑎瑂瑆瑍瑔瓡瓿瓾瓽甝畹畷榃痯瘏瘃痷痾痼痹痸瘐痻痶痭痵痽皙皵盝睕睟睠睒睖睚睩睧睔睙睭矠碇碚碔碏碄碕碅碆碡碃硹碙碀碖硻祼禂祽祹稑稘稙稒稗稕稢稓"],
["df40","稛稐窣窢窞竫筦筤筭筴筩筲筥筳筱筰筡筸筶筣粲粴粯綈綆綀綍絿綅絺綎絻綃絼綌綔綄絽綒罭罫罧罨罬羦羥羧翛翜耡腤腠腷腜腩腛腢腲朡腞腶腧腯"],
["dfa1","腄腡舝艉艄艀艂艅蓱萿葖葶葹蒏蒍葥葑葀蒆葧萰葍葽葚葙葴葳葝蔇葞萷萺萴葺葃葸萲葅萩菙葋萯葂萭葟葰萹葎葌葒葯蓅蒎萻葇萶萳葨葾葄萫葠葔葮葐蜋蜄蛷蜌蛺蛖蛵蝍蛸蜎蜉蜁蛶蜍蜅裖裋裍裎裞裛裚裌裐覅覛觟觥觤"],
["e040","觡觠觢觜触詶誆詿詡訿詷誂誄詵誃誁詴詺谼豋豊豥豤豦貆貄貅賌赨赩趑趌趎趏趍趓趔趐趒跰跠跬跱跮跐跩跣跢跧跲跫跴輆軿輁輀輅輇輈輂輋遒逿"],
["e0a1","遄遉逽鄐鄍鄏鄑鄖鄔鄋鄎酮酯鉈鉒鈰鈺鉦鈳鉥鉞銃鈮鉊鉆鉭鉬鉏鉠鉧鉯鈶鉡鉰鈱鉔鉣鉐鉲鉎鉓鉌鉖鈲閟閜閞閛隒隓隑隗雎雺雽雸雵靳靷靸靲頏頍頎颬飶飹馯馲馰馵骭骫魛鳪鳭鳧麀黽僦僔僗僨僳僛僪僝僤僓僬僰僯僣僠"],
["e140","凘劀劁勩勫匰厬嘧嘕嘌嘒嗼嘏嘜嘁嘓嘂嗺嘝嘄嗿嗹墉塼墐墘墆墁塿塴墋塺墇墑墎塶墂墈塻墔墏壾奫嫜嫮嫥嫕嫪嫚嫭嫫嫳嫢嫠嫛嫬嫞嫝嫙嫨嫟孷寠"],
["e1a1","寣屣嶂嶀嵽嶆嵺嶁嵷嶊嶉嶈嵾嵼嶍嵹嵿幘幙幓廘廑廗廎廜廕廙廒廔彄彃彯徶愬愨慁慞慱慳慒慓慲慬憀慴慔慺慛慥愻慪慡慖戩戧戫搫摍摛摝摴摶摲摳摽摵摦撦摎撂摞摜摋摓摠摐摿搿摬摫摙摥摷敳斠暡暠暟朅朄朢榱榶槉"],
["e240","榠槎榖榰榬榼榑榙榎榧榍榩榾榯榿槄榽榤槔榹槊榚槏榳榓榪榡榞槙榗榐槂榵榥槆歊歍歋殞殟殠毃毄毾滎滵滱漃漥滸漷滻漮漉潎漙漚漧漘漻漒滭漊"],
["e2a1","漶潳滹滮漭潀漰漼漵滫漇漎潃漅滽滶漹漜滼漺漟漍漞漈漡熇熐熉熀熅熂熏煻熆熁熗牄牓犗犕犓獃獍獑獌瑢瑳瑱瑵瑲瑧瑮甀甂甃畽疐瘖瘈瘌瘕瘑瘊瘔皸瞁睼瞅瞂睮瞀睯睾瞃碲碪碴碭碨硾碫碞碥碠碬碢碤禘禊禋禖禕禔禓"],
["e340","禗禈禒禐稫穊稰稯稨稦窨窫窬竮箈箜箊箑箐箖箍箌箛箎箅箘劄箙箤箂粻粿粼粺綧綷緂綣綪緁緀緅綝緎緄緆緋緌綯綹綖綼綟綦綮綩綡緉罳翢翣翥翞"],
["e3a1","耤聝聜膉膆膃膇膍膌膋舕蒗蒤蒡蒟蒺蓎蓂蒬蒮蒫蒹蒴蓁蓍蒪蒚蒱蓐蒝蒧蒻蒢蒔蓇蓌蒛蒩蒯蒨蓖蒘蒶蓏蒠蓗蓔蓒蓛蒰蒑虡蜳蜣蜨蝫蝀蜮蜞蜡蜙蜛蝃蜬蝁蜾蝆蜠蜲蜪蜭蜼蜒蜺蜱蜵蝂蜦蜧蜸蜤蜚蜰蜑裷裧裱裲裺裾裮裼裶裻"],
["e440","裰裬裫覝覡覟覞觩觫觨誫誙誋誒誏誖谽豨豩賕賏賗趖踉踂跿踍跽踊踃踇踆踅跾踀踄輐輑輎輍鄣鄜鄠鄢鄟鄝鄚鄤鄡鄛酺酲酹酳銥銤鉶銛鉺銠銔銪銍"],
["e4a1","銦銚銫鉹銗鉿銣鋮銎銂銕銢鉽銈銡銊銆銌銙銧鉾銇銩銝銋鈭隞隡雿靘靽靺靾鞃鞀鞂靻鞄鞁靿韎韍頖颭颮餂餀餇馝馜駃馹馻馺駂馽駇骱髣髧鬾鬿魠魡魟鳱鳲鳵麧僿儃儰僸儆儇僶僾儋儌僽儊劋劌勱勯噈噂噌嘵噁噊噉噆噘"],
["e540","噚噀嘳嘽嘬嘾嘸嘪嘺圚墫墝墱墠墣墯墬墥墡壿嫿嫴嫽嫷嫶嬃嫸嬂嫹嬁嬇嬅嬏屧嶙嶗嶟嶒嶢嶓嶕嶠嶜嶡嶚嶞幩幝幠幜緳廛廞廡彉徲憋憃慹憱憰憢憉"],
["e5a1","憛憓憯憭憟憒憪憡憍慦憳戭摮摰撖撠撅撗撜撏撋撊撌撣撟摨撱撘敶敺敹敻斲斳暵暰暩暲暷暪暯樀樆樗槥槸樕槱槤樠槿槬槢樛樝槾樧槲槮樔槷槧橀樈槦槻樍槼槫樉樄樘樥樏槶樦樇槴樖歑殥殣殢殦氁氀毿氂潁漦潾澇濆澒"],
["e640","澍澉澌潢潏澅潚澖潶潬澂潕潲潒潐潗澔澓潝漀潡潫潽潧澐潓澋潩潿澕潣潷潪潻熲熯熛熰熠熚熩熵熝熥熞熤熡熪熜熧熳犘犚獘獒獞獟獠獝獛獡獚獙"],
["e6a1","獢璇璉璊璆璁瑽璅璈瑼瑹甈甇畾瘥瘞瘙瘝瘜瘣瘚瘨瘛皜皝皞皛瞍瞏瞉瞈磍碻磏磌磑磎磔磈磃磄磉禚禡禠禜禢禛歶稹窲窴窳箷篋箾箬篎箯箹篊箵糅糈糌糋緷緛緪緧緗緡縃緺緦緶緱緰緮緟罶羬羰羭翭翫翪翬翦翨聤聧膣膟"],
["e740","膞膕膢膙膗舖艏艓艒艐艎艑蔤蔻蔏蔀蔩蔎蔉蔍蔟蔊蔧蔜蓻蔫蓺蔈蔌蓴蔪蓲蔕蓷蓫蓳蓼蔒蓪蓩蔖蓾蔨蔝蔮蔂蓽蔞蓶蔱蔦蓧蓨蓰蓯蓹蔘蔠蔰蔋蔙蔯虢"],
["e7a1","蝖蝣蝤蝷蟡蝳蝘蝔蝛蝒蝡蝚蝑蝞蝭蝪蝐蝎蝟蝝蝯蝬蝺蝮蝜蝥蝏蝻蝵蝢蝧蝩衚褅褌褔褋褗褘褙褆褖褑褎褉覢覤覣觭觰觬諏諆誸諓諑諔諕誻諗誾諀諅諘諃誺誽諙谾豍貏賥賟賙賨賚賝賧趠趜趡趛踠踣踥踤踮踕踛踖踑踙踦踧"],
["e840","踔踒踘踓踜踗踚輬輤輘輚輠輣輖輗遳遰遯遧遫鄯鄫鄩鄪鄲鄦鄮醅醆醊醁醂醄醀鋐鋃鋄鋀鋙銶鋏鋱鋟鋘鋩鋗鋝鋌鋯鋂鋨鋊鋈鋎鋦鋍鋕鋉鋠鋞鋧鋑鋓"],
["e8a1","銵鋡鋆銴镼閬閫閮閰隤隢雓霅霈霂靚鞊鞎鞈韐韏頞頝頦頩頨頠頛頧颲餈飺餑餔餖餗餕駜駍駏駓駔駎駉駖駘駋駗駌骳髬髫髳髲髱魆魃魧魴魱魦魶魵魰魨魤魬鳼鳺鳽鳿鳷鴇鴀鳹鳻鴈鴅鴄麃黓鼏鼐儜儓儗儚儑凞匴叡噰噠噮"],
["e940","噳噦噣噭噲噞噷圜圛壈墽壉墿墺壂墼壆嬗嬙嬛嬡嬔嬓嬐嬖嬨嬚嬠嬞寯嶬嶱嶩嶧嶵嶰嶮嶪嶨嶲嶭嶯嶴幧幨幦幯廩廧廦廨廥彋徼憝憨憖懅憴懆懁懌憺"],
["e9a1","憿憸憌擗擖擐擏擉撽撉擃擛擳擙攳敿敼斢曈暾曀曊曋曏暽暻暺曌朣樴橦橉橧樲橨樾橝橭橶橛橑樨橚樻樿橁橪橤橐橏橔橯橩橠樼橞橖橕橍橎橆歕歔歖殧殪殫毈毇氄氃氆澭濋澣濇澼濎濈潞濄澽澞濊澨瀄澥澮澺澬澪濏澿澸"],
["ea40","澢濉澫濍澯澲澰燅燂熿熸燖燀燁燋燔燊燇燏熽燘熼燆燚燛犝犞獩獦獧獬獥獫獪瑿璚璠璔璒璕璡甋疀瘯瘭瘱瘽瘳瘼瘵瘲瘰皻盦瞚瞝瞡瞜瞛瞢瞣瞕瞙"],
["eaa1","瞗磝磩磥磪磞磣磛磡磢磭磟磠禤穄穈穇窶窸窵窱窷篞篣篧篝篕篥篚篨篹篔篪篢篜篫篘篟糒糔糗糐糑縒縡縗縌縟縠縓縎縜縕縚縢縋縏縖縍縔縥縤罃罻罼罺羱翯耪耩聬膱膦膮膹膵膫膰膬膴膲膷膧臲艕艖艗蕖蕅蕫蕍蕓蕡蕘"],
["eb40","蕀蕆蕤蕁蕢蕄蕑蕇蕣蔾蕛蕱蕎蕮蕵蕕蕧蕠薌蕦蕝蕔蕥蕬虣虥虤螛螏螗螓螒螈螁螖螘蝹螇螣螅螐螑螝螄螔螜螚螉褞褦褰褭褮褧褱褢褩褣褯褬褟觱諠"],
["eba1","諢諲諴諵諝謔諤諟諰諈諞諡諨諿諯諻貑貒貐賵賮賱賰賳赬赮趥趧踳踾踸蹀蹅踶踼踽蹁踰踿躽輶輮輵輲輹輷輴遶遹遻邆郺鄳鄵鄶醓醐醑醍醏錧錞錈錟錆錏鍺錸錼錛錣錒錁鍆錭錎錍鋋錝鋺錥錓鋹鋷錴錂錤鋿錩錹錵錪錔錌"],
["ec40","錋鋾錉錀鋻錖閼闍閾閹閺閶閿閵閽隩雔霋霒霐鞙鞗鞔韰韸頵頯頲餤餟餧餩馞駮駬駥駤駰駣駪駩駧骹骿骴骻髶髺髹髷鬳鮀鮅鮇魼魾魻鮂鮓鮒鮐魺鮕"],
["eca1","魽鮈鴥鴗鴠鴞鴔鴩鴝鴘鴢鴐鴙鴟麈麆麇麮麭黕黖黺鼒鼽儦儥儢儤儠儩勴嚓嚌嚍嚆嚄嚃噾嚂噿嚁壖壔壏壒嬭嬥嬲嬣嬬嬧嬦嬯嬮孻寱寲嶷幬幪徾徻懃憵憼懧懠懥懤懨懞擯擩擣擫擤擨斁斀斶旚曒檍檖檁檥檉檟檛檡檞檇檓檎"],
["ed40","檕檃檨檤檑橿檦檚檅檌檒歛殭氉濌澩濴濔濣濜濭濧濦濞濲濝濢濨燡燱燨燲燤燰燢獳獮獯璗璲璫璐璪璭璱璥璯甐甑甒甏疄癃癈癉癇皤盩瞵瞫瞲瞷瞶"],
["eda1","瞴瞱瞨矰磳磽礂磻磼磲礅磹磾礄禫禨穜穛穖穘穔穚窾竀竁簅簏篲簀篿篻簎篴簋篳簂簉簃簁篸篽簆篰篱簐簊糨縭縼繂縳顈縸縪繉繀繇縩繌縰縻縶繄縺罅罿罾罽翴翲耬膻臄臌臊臅臇膼臩艛艚艜薃薀薏薧薕薠薋薣蕻薤薚薞"],
["ee40","蕷蕼薉薡蕺蕸蕗薎薖薆薍薙薝薁薢薂薈薅蕹蕶薘薐薟虨螾螪螭蟅螰螬螹螵螼螮蟉蟃蟂蟌螷螯蟄蟊螴螶螿螸螽蟞螲褵褳褼褾襁襒褷襂覭覯覮觲觳謞"],
["eea1","謘謖謑謅謋謢謏謒謕謇謍謈謆謜謓謚豏豰豲豱豯貕貔賹赯蹎蹍蹓蹐蹌蹇轃轀邅遾鄸醚醢醛醙醟醡醝醠鎡鎃鎯鍤鍖鍇鍼鍘鍜鍶鍉鍐鍑鍠鍭鎏鍌鍪鍹鍗鍕鍒鍏鍱鍷鍻鍡鍞鍣鍧鎀鍎鍙闇闀闉闃闅閷隮隰隬霠霟霘霝霙鞚鞡鞜"],
["ef40","鞞鞝韕韔韱顁顄顊顉顅顃餥餫餬餪餳餲餯餭餱餰馘馣馡騂駺駴駷駹駸駶駻駽駾駼騃骾髾髽鬁髼魈鮚鮨鮞鮛鮦鮡鮥鮤鮆鮢鮠鮯鴳鵁鵧鴶鴮鴯鴱鴸鴰"],
["efa1","鵅鵂鵃鴾鴷鵀鴽翵鴭麊麉麍麰黈黚黻黿鼤鼣鼢齔龠儱儭儮嚘嚜嚗嚚嚝嚙奰嬼屩屪巀幭幮懘懟懭懮懱懪懰懫懖懩擿攄擽擸攁攃擼斔旛曚曛曘櫅檹檽櫡櫆檺檶檷櫇檴檭歞毉氋瀇瀌瀍瀁瀅瀔瀎濿瀀濻瀦濼濷瀊爁燿燹爃燽獶"],
["f040","璸瓀璵瓁璾璶璻瓂甔甓癜癤癙癐癓癗癚皦皽盬矂瞺磿礌礓礔礉礐礒礑禭禬穟簜簩簙簠簟簭簝簦簨簢簥簰繜繐繖繣繘繢繟繑繠繗繓羵羳翷翸聵臑臒"],
["f0a1","臐艟艞薴藆藀藃藂薳薵薽藇藄薿藋藎藈藅薱薶藒蘤薸薷薾虩蟧蟦蟢蟛蟫蟪蟥蟟蟳蟤蟔蟜蟓蟭蟘蟣螤蟗蟙蠁蟴蟨蟝襓襋襏襌襆襐襑襉謪謧謣謳謰謵譇謯謼謾謱謥謷謦謶謮謤謻謽謺豂豵貙貘貗賾贄贂贀蹜蹢蹠蹗蹖蹞蹥蹧"],
["f140","蹛蹚蹡蹝蹩蹔轆轇轈轋鄨鄺鄻鄾醨醥醧醯醪鎵鎌鎒鎷鎛鎝鎉鎧鎎鎪鎞鎦鎕鎈鎙鎟鎍鎱鎑鎲鎤鎨鎴鎣鎥闒闓闑隳雗雚巂雟雘雝霣霢霥鞬鞮鞨鞫鞤鞪"],
["f1a1","鞢鞥韗韙韖韘韺顐顑顒颸饁餼餺騏騋騉騍騄騑騊騅騇騆髀髜鬈鬄鬅鬩鬵魊魌魋鯇鯆鯃鮿鯁鮵鮸鯓鮶鯄鮹鮽鵜鵓鵏鵊鵛鵋鵙鵖鵌鵗鵒鵔鵟鵘鵚麎麌黟鼁鼀鼖鼥鼫鼪鼩鼨齌齕儴儵劖勷厴嚫嚭嚦嚧嚪嚬壚壝壛夒嬽嬾嬿巃幰"],
["f240","徿懻攇攐攍攉攌攎斄旞旝曞櫧櫠櫌櫑櫙櫋櫟櫜櫐櫫櫏櫍櫞歠殰氌瀙瀧瀠瀖瀫瀡瀢瀣瀩瀗瀤瀜瀪爌爊爇爂爅犥犦犤犣犡瓋瓅璷瓃甖癠矉矊矄矱礝礛"],
["f2a1","礡礜礗礞禰穧穨簳簼簹簬簻糬糪繶繵繸繰繷繯繺繲繴繨罋罊羃羆羷翽翾聸臗臕艤艡艣藫藱藭藙藡藨藚藗藬藲藸藘藟藣藜藑藰藦藯藞藢蠀蟺蠃蟶蟷蠉蠌蠋蠆蟼蠈蟿蠊蠂襢襚襛襗襡襜襘襝襙覈覷覶觶譐譈譊譀譓譖譔譋譕"],
["f340","譑譂譒譗豃豷豶貚贆贇贉趬趪趭趫蹭蹸蹳蹪蹯蹻軂轒轑轏轐轓辴酀鄿醰醭鏞鏇鏏鏂鏚鏐鏹鏬鏌鏙鎩鏦鏊鏔鏮鏣鏕鏄鏎鏀鏒鏧镽闚闛雡霩霫霬霨霦"],
["f3a1","鞳鞷鞶韝韞韟顜顙顝顗颿颽颻颾饈饇饃馦馧騚騕騥騝騤騛騢騠騧騣騞騜騔髂鬋鬊鬎鬌鬷鯪鯫鯠鯞鯤鯦鯢鯰鯔鯗鯬鯜鯙鯥鯕鯡鯚鵷鶁鶊鶄鶈鵱鶀鵸鶆鶋鶌鵽鵫鵴鵵鵰鵩鶅鵳鵻鶂鵯鵹鵿鶇鵨麔麑黀黼鼭齀齁齍齖齗齘匷嚲"],
["f440","嚵嚳壣孅巆巇廮廯忀忁懹攗攖攕攓旟曨曣曤櫳櫰櫪櫨櫹櫱櫮櫯瀼瀵瀯瀷瀴瀱灂瀸瀿瀺瀹灀瀻瀳灁爓爔犨獽獼璺皫皪皾盭矌矎矏矍矲礥礣礧礨礤礩"],
["f4a1","禲穮穬穭竷籉籈籊籇籅糮繻繾纁纀羺翿聹臛臙舋艨艩蘢藿蘁藾蘛蘀藶蘄蘉蘅蘌藽蠙蠐蠑蠗蠓蠖襣襦覹觷譠譪譝譨譣譥譧譭趮躆躈躄轙轖轗轕轘轚邍酃酁醷醵醲醳鐋鐓鏻鐠鐏鐔鏾鐕鐐鐨鐙鐍鏵鐀鏷鐇鐎鐖鐒鏺鐉鏸鐊鏿"],
["f540","鏼鐌鏶鐑鐆闞闠闟霮霯鞹鞻韽韾顠顢顣顟飁飂饐饎饙饌饋饓騲騴騱騬騪騶騩騮騸騭髇髊髆鬐鬒鬑鰋鰈鯷鰅鰒鯸鱀鰇鰎鰆鰗鰔鰉鶟鶙鶤鶝鶒鶘鶐鶛"],
["f5a1","鶠鶔鶜鶪鶗鶡鶚鶢鶨鶞鶣鶿鶩鶖鶦鶧麙麛麚黥黤黧黦鼰鼮齛齠齞齝齙龑儺儹劘劗囃嚽嚾孈孇巋巏廱懽攛欂櫼欃櫸欀灃灄灊灈灉灅灆爝爚爙獾甗癪矐礭礱礯籔籓糲纊纇纈纋纆纍罍羻耰臝蘘蘪蘦蘟蘣蘜蘙蘧蘮蘡蘠蘩蘞蘥"],
["f640","蠩蠝蠛蠠蠤蠜蠫衊襭襩襮襫觺譹譸譅譺譻贐贔趯躎躌轞轛轝酆酄酅醹鐿鐻鐶鐩鐽鐼鐰鐹鐪鐷鐬鑀鐱闥闤闣霵霺鞿韡顤飉飆飀饘饖騹騽驆驄驂驁騺"],
["f6a1","騿髍鬕鬗鬘鬖鬺魒鰫鰝鰜鰬鰣鰨鰩鰤鰡鶷鶶鶼鷁鷇鷊鷏鶾鷅鷃鶻鶵鷎鶹鶺鶬鷈鶱鶭鷌鶳鷍鶲鹺麜黫黮黭鼛鼘鼚鼱齎齥齤龒亹囆囅囋奱孋孌巕巑廲攡攠攦攢欋欈欉氍灕灖灗灒爞爟犩獿瓘瓕瓙瓗癭皭礵禴穰穱籗籜籙籛籚"],
["f740","糴糱纑罏羇臞艫蘴蘵蘳蘬蘲蘶蠬蠨蠦蠪蠥襱覿覾觻譾讄讂讆讅譿贕躕躔躚躒躐躖躗轠轢酇鑌鑐鑊鑋鑏鑇鑅鑈鑉鑆霿韣顪顩飋饔饛驎驓驔驌驏驈驊"],
["f7a1","驉驒驐髐鬙鬫鬻魖魕鱆鱈鰿鱄鰹鰳鱁鰼鰷鰴鰲鰽鰶鷛鷒鷞鷚鷋鷐鷜鷑鷟鷩鷙鷘鷖鷵鷕鷝麶黰鼵鼳鼲齂齫龕龢儽劙壨壧奲孍巘蠯彏戁戃戄攩攥斖曫欑欒欏毊灛灚爢玂玁玃癰矔籧籦纕艬蘺虀蘹蘼蘱蘻蘾蠰蠲蠮蠳襶襴襳觾"],
["f840","讌讎讋讈豅贙躘轤轣醼鑢鑕鑝鑗鑞韄韅頀驖驙鬞鬟鬠鱒鱘鱐鱊鱍鱋鱕鱙鱌鱎鷻鷷鷯鷣鷫鷸鷤鷶鷡鷮鷦鷲鷰鷢鷬鷴鷳鷨鷭黂黐黲黳鼆鼜鼸鼷鼶齃齏"],
["f8a1","齱齰齮齯囓囍孎屭攭曭曮欓灟灡灝灠爣瓛瓥矕礸禷禶籪纗羉艭虃蠸蠷蠵衋讔讕躞躟躠躝醾醽釂鑫鑨鑩雥靆靃靇韇韥驞髕魙鱣鱧鱦鱢鱞鱠鸂鷾鸇鸃鸆鸅鸀鸁鸉鷿鷽鸄麠鼞齆齴齵齶囔攮斸欘欙欗欚灢爦犪矘矙礹籩籫糶纚"],
["f940","纘纛纙臠臡虆虇虈襹襺襼襻觿讘讙躥躤躣鑮鑭鑯鑱鑳靉顲饟鱨鱮鱭鸋鸍鸐鸏鸒鸑麡黵鼉齇齸齻齺齹圞灦籯蠼趲躦釃鑴鑸鑶鑵驠鱴鱳鱱鱵鸔鸓黶鼊"],
["f9a1","龤灨灥糷虪蠾蠽蠿讞貜躩軉靋顳顴飌饡馫驤驦驧鬤鸕鸗齈戇欞爧虌躨钂钀钁驩驨鬮鸙爩虋讟钃鱹麷癵驫鱺鸝灩灪麤齾齉龘碁銹裏墻恒粧嫺╔╦╗╠╬╣╚╩╝╒╤╕╞╪╡╘╧╛╓╥╖╟╫╢╙╨╜║═╭╮╰╯▓"]
]

},{}],35:[function(require,module,exports){
module.exports=[
["0","\u0000",127],
["8ea1","｡",62],
["a1a1","　、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～∥｜…‥‘’“”（）〔〕［］｛｝〈",9,"＋－±×÷＝≠＜＞≦≧∞∴♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇"],
["a2a1","◆□■△▲▽▼※〒→←↑↓〓"],
["a2ba","∈∋⊆⊇⊂⊃∪∩"],
["a2ca","∧∨￢⇒⇔∀∃"],
["a2dc","∠⊥⌒∂∇≡≒≪≫√∽∝∵∫∬"],
["a2f2","Å‰♯♭♪†‡¶"],
["a2fe","◯"],
["a3b0","０",9],
["a3c1","Ａ",25],
["a3e1","ａ",25],
["a4a1","ぁ",82],
["a5a1","ァ",85],
["a6a1","Α",16,"Σ",6],
["a6c1","α",16,"σ",6],
["a7a1","А",5,"ЁЖ",25],
["a7d1","а",5,"ёж",25],
["a8a1","─│┌┐┘└├┬┤┴┼━┃┏┓┛┗┣┳┫┻╋┠┯┨┷┿┝┰┥┸╂"],
["ada1","①",19,"Ⅰ",9],
["adc0","㍉㌔㌢㍍㌘㌧㌃㌶㍑㍗㌍㌦㌣㌫㍊㌻㎜㎝㎞㎎㎏㏄㎡"],
["addf","㍻〝〟№㏍℡㊤",4,"㈱㈲㈹㍾㍽㍼≒≡∫∮∑√⊥∠∟⊿∵∩∪"],
["b0a1","亜唖娃阿哀愛挨姶逢葵茜穐悪握渥旭葦芦鯵梓圧斡扱宛姐虻飴絢綾鮎或粟袷安庵按暗案闇鞍杏以伊位依偉囲夷委威尉惟意慰易椅為畏異移維緯胃萎衣謂違遺医井亥域育郁磯一壱溢逸稲茨芋鰯允印咽員因姻引飲淫胤蔭"],
["b1a1","院陰隠韻吋右宇烏羽迂雨卯鵜窺丑碓臼渦嘘唄欝蔚鰻姥厩浦瓜閏噂云運雲荏餌叡営嬰影映曳栄永泳洩瑛盈穎頴英衛詠鋭液疫益駅悦謁越閲榎厭円園堰奄宴延怨掩援沿演炎焔煙燕猿縁艶苑薗遠鉛鴛塩於汚甥凹央奥往応"],
["b2a1","押旺横欧殴王翁襖鴬鴎黄岡沖荻億屋憶臆桶牡乙俺卸恩温穏音下化仮何伽価佳加可嘉夏嫁家寡科暇果架歌河火珂禍禾稼箇花苛茄荷華菓蝦課嘩貨迦過霞蚊俄峨我牙画臥芽蛾賀雅餓駕介会解回塊壊廻快怪悔恢懐戒拐改"],
["b3a1","魁晦械海灰界皆絵芥蟹開階貝凱劾外咳害崖慨概涯碍蓋街該鎧骸浬馨蛙垣柿蛎鈎劃嚇各廓拡撹格核殻獲確穫覚角赫較郭閣隔革学岳楽額顎掛笠樫橿梶鰍潟割喝恰括活渇滑葛褐轄且鰹叶椛樺鞄株兜竃蒲釜鎌噛鴨栢茅萱"],
["b4a1","粥刈苅瓦乾侃冠寒刊勘勧巻喚堪姦完官寛干幹患感慣憾換敢柑桓棺款歓汗漢澗潅環甘監看竿管簡緩缶翰肝艦莞観諌貫還鑑間閑関陥韓館舘丸含岸巌玩癌眼岩翫贋雁頑顔願企伎危喜器基奇嬉寄岐希幾忌揮机旗既期棋棄"],
["b5a1","機帰毅気汽畿祈季稀紀徽規記貴起軌輝飢騎鬼亀偽儀妓宜戯技擬欺犠疑祇義蟻誼議掬菊鞠吉吃喫桔橘詰砧杵黍却客脚虐逆丘久仇休及吸宮弓急救朽求汲泣灸球究窮笈級糾給旧牛去居巨拒拠挙渠虚許距鋸漁禦魚亨享京"],
["b6a1","供侠僑兇競共凶協匡卿叫喬境峡強彊怯恐恭挟教橋況狂狭矯胸脅興蕎郷鏡響饗驚仰凝尭暁業局曲極玉桐粁僅勤均巾錦斤欣欽琴禁禽筋緊芹菌衿襟謹近金吟銀九倶句区狗玖矩苦躯駆駈駒具愚虞喰空偶寓遇隅串櫛釧屑屈"],
["b7a1","掘窟沓靴轡窪熊隈粂栗繰桑鍬勲君薫訓群軍郡卦袈祁係傾刑兄啓圭珪型契形径恵慶慧憩掲携敬景桂渓畦稽系経継繋罫茎荊蛍計詣警軽頚鶏芸迎鯨劇戟撃激隙桁傑欠決潔穴結血訣月件倹倦健兼券剣喧圏堅嫌建憲懸拳捲"],
["b8a1","検権牽犬献研硯絹県肩見謙賢軒遣鍵険顕験鹸元原厳幻弦減源玄現絃舷言諺限乎個古呼固姑孤己庫弧戸故枯湖狐糊袴股胡菰虎誇跨鈷雇顧鼓五互伍午呉吾娯後御悟梧檎瑚碁語誤護醐乞鯉交佼侯候倖光公功効勾厚口向"],
["b9a1","后喉坑垢好孔孝宏工巧巷幸広庚康弘恒慌抗拘控攻昂晃更杭校梗構江洪浩港溝甲皇硬稿糠紅紘絞綱耕考肯肱腔膏航荒行衡講貢購郊酵鉱砿鋼閤降項香高鴻剛劫号合壕拷濠豪轟麹克刻告国穀酷鵠黒獄漉腰甑忽惚骨狛込"],
["baa1","此頃今困坤墾婚恨懇昏昆根梱混痕紺艮魂些佐叉唆嵯左差査沙瑳砂詐鎖裟坐座挫債催再最哉塞妻宰彩才採栽歳済災采犀砕砦祭斎細菜裁載際剤在材罪財冴坂阪堺榊肴咲崎埼碕鷺作削咋搾昨朔柵窄策索錯桜鮭笹匙冊刷"],
["bba1","察拶撮擦札殺薩雑皐鯖捌錆鮫皿晒三傘参山惨撒散桟燦珊産算纂蚕讃賛酸餐斬暫残仕仔伺使刺司史嗣四士始姉姿子屍市師志思指支孜斯施旨枝止死氏獅祉私糸紙紫肢脂至視詞詩試誌諮資賜雌飼歯事似侍児字寺慈持時"],
["bca1","次滋治爾璽痔磁示而耳自蒔辞汐鹿式識鴫竺軸宍雫七叱執失嫉室悉湿漆疾質実蔀篠偲柴芝屡蕊縞舎写射捨赦斜煮社紗者謝車遮蛇邪借勺尺杓灼爵酌釈錫若寂弱惹主取守手朱殊狩珠種腫趣酒首儒受呪寿授樹綬需囚収周"],
["bda1","宗就州修愁拾洲秀秋終繍習臭舟蒐衆襲讐蹴輯週酋酬集醜什住充十従戎柔汁渋獣縦重銃叔夙宿淑祝縮粛塾熟出術述俊峻春瞬竣舜駿准循旬楯殉淳準潤盾純巡遵醇順処初所暑曙渚庶緒署書薯藷諸助叙女序徐恕鋤除傷償"],
["bea1","勝匠升召哨商唱嘗奨妾娼宵将小少尚庄床廠彰承抄招掌捷昇昌昭晶松梢樟樵沼消渉湘焼焦照症省硝礁祥称章笑粧紹肖菖蒋蕉衝裳訟証詔詳象賞醤鉦鍾鐘障鞘上丈丞乗冗剰城場壌嬢常情擾条杖浄状畳穣蒸譲醸錠嘱埴飾"],
["bfa1","拭植殖燭織職色触食蝕辱尻伸信侵唇娠寝審心慎振新晋森榛浸深申疹真神秦紳臣芯薪親診身辛進針震人仁刃塵壬尋甚尽腎訊迅陣靭笥諏須酢図厨逗吹垂帥推水炊睡粋翠衰遂酔錐錘随瑞髄崇嵩数枢趨雛据杉椙菅頗雀裾"],
["c0a1","澄摺寸世瀬畝是凄制勢姓征性成政整星晴棲栖正清牲生盛精聖声製西誠誓請逝醒青静斉税脆隻席惜戚斥昔析石積籍績脊責赤跡蹟碩切拙接摂折設窃節説雪絶舌蝉仙先千占宣専尖川戦扇撰栓栴泉浅洗染潜煎煽旋穿箭線"],
["c1a1","繊羨腺舛船薦詮賎践選遷銭銑閃鮮前善漸然全禅繕膳糎噌塑岨措曾曽楚狙疏疎礎祖租粗素組蘇訴阻遡鼠僧創双叢倉喪壮奏爽宋層匝惣想捜掃挿掻操早曹巣槍槽漕燥争痩相窓糟総綜聡草荘葬蒼藻装走送遭鎗霜騒像増憎"],
["c2a1","臓蔵贈造促側則即息捉束測足速俗属賊族続卒袖其揃存孫尊損村遜他多太汰詑唾堕妥惰打柁舵楕陀駄騨体堆対耐岱帯待怠態戴替泰滞胎腿苔袋貸退逮隊黛鯛代台大第醍題鷹滝瀧卓啄宅托択拓沢濯琢託鐸濁諾茸凧蛸只"],
["c3a1","叩但達辰奪脱巽竪辿棚谷狸鱈樽誰丹単嘆坦担探旦歎淡湛炭短端箪綻耽胆蛋誕鍛団壇弾断暖檀段男談値知地弛恥智池痴稚置致蜘遅馳築畜竹筑蓄逐秩窒茶嫡着中仲宙忠抽昼柱注虫衷註酎鋳駐樗瀦猪苧著貯丁兆凋喋寵"],
["c4a1","帖帳庁弔張彫徴懲挑暢朝潮牒町眺聴脹腸蝶調諜超跳銚長頂鳥勅捗直朕沈珍賃鎮陳津墜椎槌追鎚痛通塚栂掴槻佃漬柘辻蔦綴鍔椿潰坪壷嬬紬爪吊釣鶴亭低停偵剃貞呈堤定帝底庭廷弟悌抵挺提梯汀碇禎程締艇訂諦蹄逓"],
["c5a1","邸鄭釘鼎泥摘擢敵滴的笛適鏑溺哲徹撤轍迭鉄典填天展店添纏甜貼転顛点伝殿澱田電兎吐堵塗妬屠徒斗杜渡登菟賭途都鍍砥砺努度土奴怒倒党冬凍刀唐塔塘套宕島嶋悼投搭東桃梼棟盗淘湯涛灯燈当痘祷等答筒糖統到"],
["c6a1","董蕩藤討謄豆踏逃透鐙陶頭騰闘働動同堂導憧撞洞瞳童胴萄道銅峠鴇匿得徳涜特督禿篤毒独読栃橡凸突椴届鳶苫寅酉瀞噸屯惇敦沌豚遁頓呑曇鈍奈那内乍凪薙謎灘捺鍋楢馴縄畷南楠軟難汝二尼弐迩匂賑肉虹廿日乳入"],
["c7a1","如尿韮任妊忍認濡禰祢寧葱猫熱年念捻撚燃粘乃廼之埜嚢悩濃納能脳膿農覗蚤巴把播覇杷波派琶破婆罵芭馬俳廃拝排敗杯盃牌背肺輩配倍培媒梅楳煤狽買売賠陪這蝿秤矧萩伯剥博拍柏泊白箔粕舶薄迫曝漠爆縛莫駁麦"],
["c8a1","函箱硲箸肇筈櫨幡肌畑畠八鉢溌発醗髪伐罰抜筏閥鳩噺塙蛤隼伴判半反叛帆搬斑板氾汎版犯班畔繁般藩販範釆煩頒飯挽晩番盤磐蕃蛮匪卑否妃庇彼悲扉批披斐比泌疲皮碑秘緋罷肥被誹費避非飛樋簸備尾微枇毘琵眉美"],
["c9a1","鼻柊稗匹疋髭彦膝菱肘弼必畢筆逼桧姫媛紐百謬俵彪標氷漂瓢票表評豹廟描病秒苗錨鋲蒜蛭鰭品彬斌浜瀕貧賓頻敏瓶不付埠夫婦富冨布府怖扶敷斧普浮父符腐膚芙譜負賦赴阜附侮撫武舞葡蕪部封楓風葺蕗伏副復幅服"],
["caa1","福腹複覆淵弗払沸仏物鮒分吻噴墳憤扮焚奮粉糞紛雰文聞丙併兵塀幣平弊柄並蔽閉陛米頁僻壁癖碧別瞥蔑箆偏変片篇編辺返遍便勉娩弁鞭保舗鋪圃捕歩甫補輔穂募墓慕戊暮母簿菩倣俸包呆報奉宝峰峯崩庖抱捧放方朋"],
["cba1","法泡烹砲縫胞芳萌蓬蜂褒訪豊邦鋒飽鳳鵬乏亡傍剖坊妨帽忘忙房暴望某棒冒紡肪膨謀貌貿鉾防吠頬北僕卜墨撲朴牧睦穆釦勃没殆堀幌奔本翻凡盆摩磨魔麻埋妹昧枚毎哩槙幕膜枕鮪柾鱒桝亦俣又抹末沫迄侭繭麿万慢満"],
["cca1","漫蔓味未魅巳箕岬密蜜湊蓑稔脈妙粍民眠務夢無牟矛霧鵡椋婿娘冥名命明盟迷銘鳴姪牝滅免棉綿緬面麺摸模茂妄孟毛猛盲網耗蒙儲木黙目杢勿餅尤戻籾貰問悶紋門匁也冶夜爺耶野弥矢厄役約薬訳躍靖柳薮鑓愉愈油癒"],
["cda1","諭輸唯佑優勇友宥幽悠憂揖有柚湧涌猶猷由祐裕誘遊邑郵雄融夕予余与誉輿預傭幼妖容庸揚揺擁曜楊様洋溶熔用窯羊耀葉蓉要謡踊遥陽養慾抑欲沃浴翌翼淀羅螺裸来莱頼雷洛絡落酪乱卵嵐欄濫藍蘭覧利吏履李梨理璃"],
["cea1","痢裏裡里離陸律率立葎掠略劉流溜琉留硫粒隆竜龍侶慮旅虜了亮僚両凌寮料梁涼猟療瞭稜糧良諒遼量陵領力緑倫厘林淋燐琳臨輪隣鱗麟瑠塁涙累類令伶例冷励嶺怜玲礼苓鈴隷零霊麗齢暦歴列劣烈裂廉恋憐漣煉簾練聯"],
["cfa1","蓮連錬呂魯櫓炉賂路露労婁廊弄朗楼榔浪漏牢狼篭老聾蝋郎六麓禄肋録論倭和話歪賄脇惑枠鷲亙亘鰐詫藁蕨椀湾碗腕"],
["d0a1","弌丐丕个丱丶丼丿乂乖乘亂亅豫亊舒弍于亞亟亠亢亰亳亶从仍仄仆仂仗仞仭仟价伉佚估佛佝佗佇佶侈侏侘佻佩佰侑佯來侖儘俔俟俎俘俛俑俚俐俤俥倚倨倔倪倥倅伜俶倡倩倬俾俯們倆偃假會偕偐偈做偖偬偸傀傚傅傴傲"],
["d1a1","僉僊傳僂僖僞僥僭僣僮價僵儉儁儂儖儕儔儚儡儺儷儼儻儿兀兒兌兔兢竸兩兪兮冀冂囘册冉冏冑冓冕冖冤冦冢冩冪冫决冱冲冰况冽凅凉凛几處凩凭凰凵凾刄刋刔刎刧刪刮刳刹剏剄剋剌剞剔剪剴剩剳剿剽劍劔劒剱劈劑辨"],
["d2a1","辧劬劭劼劵勁勍勗勞勣勦飭勠勳勵勸勹匆匈甸匍匐匏匕匚匣匯匱匳匸區卆卅丗卉卍凖卞卩卮夘卻卷厂厖厠厦厥厮厰厶參簒雙叟曼燮叮叨叭叺吁吽呀听吭吼吮吶吩吝呎咏呵咎呟呱呷呰咒呻咀呶咄咐咆哇咢咸咥咬哄哈咨"],
["d3a1","咫哂咤咾咼哘哥哦唏唔哽哮哭哺哢唹啀啣啌售啜啅啖啗唸唳啝喙喀咯喊喟啻啾喘喞單啼喃喩喇喨嗚嗅嗟嗄嗜嗤嗔嘔嗷嘖嗾嗽嘛嗹噎噐營嘴嘶嘲嘸噫噤嘯噬噪嚆嚀嚊嚠嚔嚏嚥嚮嚶嚴囂嚼囁囃囀囈囎囑囓囗囮囹圀囿圄圉"],
["d4a1","圈國圍圓團圖嗇圜圦圷圸坎圻址坏坩埀垈坡坿垉垓垠垳垤垪垰埃埆埔埒埓堊埖埣堋堙堝塲堡塢塋塰毀塒堽塹墅墹墟墫墺壞墻墸墮壅壓壑壗壙壘壥壜壤壟壯壺壹壻壼壽夂夊夐夛梦夥夬夭夲夸夾竒奕奐奎奚奘奢奠奧奬奩"],
["d5a1","奸妁妝佞侫妣妲姆姨姜妍姙姚娥娟娑娜娉娚婀婬婉娵娶婢婪媚媼媾嫋嫂媽嫣嫗嫦嫩嫖嫺嫻嬌嬋嬖嬲嫐嬪嬶嬾孃孅孀孑孕孚孛孥孩孰孳孵學斈孺宀它宦宸寃寇寉寔寐寤實寢寞寥寫寰寶寳尅將專對尓尠尢尨尸尹屁屆屎屓"],
["d6a1","屐屏孱屬屮乢屶屹岌岑岔妛岫岻岶岼岷峅岾峇峙峩峽峺峭嶌峪崋崕崗嵜崟崛崑崔崢崚崙崘嵌嵒嵎嵋嵬嵳嵶嶇嶄嶂嶢嶝嶬嶮嶽嶐嶷嶼巉巍巓巒巖巛巫已巵帋帚帙帑帛帶帷幄幃幀幎幗幔幟幢幤幇幵并幺麼广庠廁廂廈廐廏"],
["d7a1","廖廣廝廚廛廢廡廨廩廬廱廳廰廴廸廾弃弉彝彜弋弑弖弩弭弸彁彈彌彎弯彑彖彗彙彡彭彳彷徃徂彿徊很徑徇從徙徘徠徨徭徼忖忻忤忸忱忝悳忿怡恠怙怐怩怎怱怛怕怫怦怏怺恚恁恪恷恟恊恆恍恣恃恤恂恬恫恙悁悍惧悃悚"],
["d8a1","悄悛悖悗悒悧悋惡悸惠惓悴忰悽惆悵惘慍愕愆惶惷愀惴惺愃愡惻惱愍愎慇愾愨愧慊愿愼愬愴愽慂慄慳慷慘慙慚慫慴慯慥慱慟慝慓慵憙憖憇憬憔憚憊憑憫憮懌懊應懷懈懃懆憺懋罹懍懦懣懶懺懴懿懽懼懾戀戈戉戍戌戔戛"],
["d9a1","戞戡截戮戰戲戳扁扎扞扣扛扠扨扼抂抉找抒抓抖拔抃抔拗拑抻拏拿拆擔拈拜拌拊拂拇抛拉挌拮拱挧挂挈拯拵捐挾捍搜捏掖掎掀掫捶掣掏掉掟掵捫捩掾揩揀揆揣揉插揶揄搖搴搆搓搦搶攝搗搨搏摧摯摶摎攪撕撓撥撩撈撼"],
["daa1","據擒擅擇撻擘擂擱擧舉擠擡抬擣擯攬擶擴擲擺攀擽攘攜攅攤攣攫攴攵攷收攸畋效敖敕敍敘敞敝敲數斂斃變斛斟斫斷旃旆旁旄旌旒旛旙无旡旱杲昊昃旻杳昵昶昴昜晏晄晉晁晞晝晤晧晨晟晢晰暃暈暎暉暄暘暝曁暹曉暾暼"],
["dba1","曄暸曖曚曠昿曦曩曰曵曷朏朖朞朦朧霸朮朿朶杁朸朷杆杞杠杙杣杤枉杰枩杼杪枌枋枦枡枅枷柯枴柬枳柩枸柤柞柝柢柮枹柎柆柧檜栞框栩桀桍栲桎梳栫桙档桷桿梟梏梭梔條梛梃檮梹桴梵梠梺椏梍桾椁棊椈棘椢椦棡椌棍"],
["dca1","棔棧棕椶椒椄棗棣椥棹棠棯椨椪椚椣椡棆楹楷楜楸楫楔楾楮椹楴椽楙椰楡楞楝榁楪榲榮槐榿槁槓榾槎寨槊槝榻槃榧樮榑榠榜榕榴槞槨樂樛槿權槹槲槧樅榱樞槭樔槫樊樒櫁樣樓橄樌橲樶橸橇橢橙橦橈樸樢檐檍檠檄檢檣"],
["dda1","檗蘗檻櫃櫂檸檳檬櫞櫑櫟檪櫚櫪櫻欅蘖櫺欒欖鬱欟欸欷盜欹飮歇歃歉歐歙歔歛歟歡歸歹歿殀殄殃殍殘殕殞殤殪殫殯殲殱殳殷殼毆毋毓毟毬毫毳毯麾氈氓气氛氤氣汞汕汢汪沂沍沚沁沛汾汨汳沒沐泄泱泓沽泗泅泝沮沱沾"],
["dea1","沺泛泯泙泪洟衍洶洫洽洸洙洵洳洒洌浣涓浤浚浹浙涎涕濤涅淹渕渊涵淇淦涸淆淬淞淌淨淒淅淺淙淤淕淪淮渭湮渮渙湲湟渾渣湫渫湶湍渟湃渺湎渤滿渝游溂溪溘滉溷滓溽溯滄溲滔滕溏溥滂溟潁漑灌滬滸滾漿滲漱滯漲滌"],
["dfa1","漾漓滷澆潺潸澁澀潯潛濳潭澂潼潘澎澑濂潦澳澣澡澤澹濆澪濟濕濬濔濘濱濮濛瀉瀋濺瀑瀁瀏濾瀛瀚潴瀝瀘瀟瀰瀾瀲灑灣炙炒炯烱炬炸炳炮烟烋烝烙焉烽焜焙煥煕熈煦煢煌煖煬熏燻熄熕熨熬燗熹熾燒燉燔燎燠燬燧燵燼"],
["e0a1","燹燿爍爐爛爨爭爬爰爲爻爼爿牀牆牋牘牴牾犂犁犇犒犖犢犧犹犲狃狆狄狎狒狢狠狡狹狷倏猗猊猜猖猝猴猯猩猥猾獎獏默獗獪獨獰獸獵獻獺珈玳珎玻珀珥珮珞璢琅瑯琥珸琲琺瑕琿瑟瑙瑁瑜瑩瑰瑣瑪瑶瑾璋璞璧瓊瓏瓔珱"],
["e1a1","瓠瓣瓧瓩瓮瓲瓰瓱瓸瓷甄甃甅甌甎甍甕甓甞甦甬甼畄畍畊畉畛畆畚畩畤畧畫畭畸當疆疇畴疊疉疂疔疚疝疥疣痂疳痃疵疽疸疼疱痍痊痒痙痣痞痾痿痼瘁痰痺痲痳瘋瘍瘉瘟瘧瘠瘡瘢瘤瘴瘰瘻癇癈癆癜癘癡癢癨癩癪癧癬癰"],
["e2a1","癲癶癸發皀皃皈皋皎皖皓皙皚皰皴皸皹皺盂盍盖盒盞盡盥盧盪蘯盻眈眇眄眩眤眞眥眦眛眷眸睇睚睨睫睛睥睿睾睹瞎瞋瞑瞠瞞瞰瞶瞹瞿瞼瞽瞻矇矍矗矚矜矣矮矼砌砒礦砠礪硅碎硴碆硼碚碌碣碵碪碯磑磆磋磔碾碼磅磊磬"],
["e3a1","磧磚磽磴礇礒礑礙礬礫祀祠祗祟祚祕祓祺祿禊禝禧齋禪禮禳禹禺秉秕秧秬秡秣稈稍稘稙稠稟禀稱稻稾稷穃穗穉穡穢穩龝穰穹穽窈窗窕窘窖窩竈窰窶竅竄窿邃竇竊竍竏竕竓站竚竝竡竢竦竭竰笂笏笊笆笳笘笙笞笵笨笶筐"],
["e4a1","筺笄筍笋筌筅筵筥筴筧筰筱筬筮箝箘箟箍箜箚箋箒箏筝箙篋篁篌篏箴篆篝篩簑簔篦篥籠簀簇簓篳篷簗簍篶簣簧簪簟簷簫簽籌籃籔籏籀籐籘籟籤籖籥籬籵粃粐粤粭粢粫粡粨粳粲粱粮粹粽糀糅糂糘糒糜糢鬻糯糲糴糶糺紆"],
["e5a1","紂紜紕紊絅絋紮紲紿紵絆絳絖絎絲絨絮絏絣經綉絛綏絽綛綺綮綣綵緇綽綫總綢綯緜綸綟綰緘緝緤緞緻緲緡縅縊縣縡縒縱縟縉縋縢繆繦縻縵縹繃縷縲縺繧繝繖繞繙繚繹繪繩繼繻纃緕繽辮繿纈纉續纒纐纓纔纖纎纛纜缸缺"],
["e6a1","罅罌罍罎罐网罕罔罘罟罠罨罩罧罸羂羆羃羈羇羌羔羞羝羚羣羯羲羹羮羶羸譱翅翆翊翕翔翡翦翩翳翹飜耆耄耋耒耘耙耜耡耨耿耻聊聆聒聘聚聟聢聨聳聲聰聶聹聽聿肄肆肅肛肓肚肭冐肬胛胥胙胝胄胚胖脉胯胱脛脩脣脯腋"],
["e7a1","隋腆脾腓腑胼腱腮腥腦腴膃膈膊膀膂膠膕膤膣腟膓膩膰膵膾膸膽臀臂膺臉臍臑臙臘臈臚臟臠臧臺臻臾舁舂舅與舊舍舐舖舩舫舸舳艀艙艘艝艚艟艤艢艨艪艫舮艱艷艸艾芍芒芫芟芻芬苡苣苟苒苴苳苺莓范苻苹苞茆苜茉苙"],
["e8a1","茵茴茖茲茱荀茹荐荅茯茫茗茘莅莚莪莟莢莖茣莎莇莊荼莵荳荵莠莉莨菴萓菫菎菽萃菘萋菁菷萇菠菲萍萢萠莽萸蔆菻葭萪萼蕚蒄葷葫蒭葮蒂葩葆萬葯葹萵蓊葢蒹蒿蒟蓙蓍蒻蓚蓐蓁蓆蓖蒡蔡蓿蓴蔗蔘蔬蔟蔕蔔蓼蕀蕣蕘蕈"],
["e9a1","蕁蘂蕋蕕薀薤薈薑薊薨蕭薔薛藪薇薜蕷蕾薐藉薺藏薹藐藕藝藥藜藹蘊蘓蘋藾藺蘆蘢蘚蘰蘿虍乕虔號虧虱蚓蚣蚩蚪蚋蚌蚶蚯蛄蛆蚰蛉蠣蚫蛔蛞蛩蛬蛟蛛蛯蜒蜆蜈蜀蜃蛻蜑蜉蜍蛹蜊蜴蜿蜷蜻蜥蜩蜚蝠蝟蝸蝌蝎蝴蝗蝨蝮蝙"],
["eaa1","蝓蝣蝪蠅螢螟螂螯蟋螽蟀蟐雖螫蟄螳蟇蟆螻蟯蟲蟠蠏蠍蟾蟶蟷蠎蟒蠑蠖蠕蠢蠡蠱蠶蠹蠧蠻衄衂衒衙衞衢衫袁衾袞衵衽袵衲袂袗袒袮袙袢袍袤袰袿袱裃裄裔裘裙裝裹褂裼裴裨裲褄褌褊褓襃褞褥褪褫襁襄褻褶褸襌褝襠襞"],
["eba1","襦襤襭襪襯襴襷襾覃覈覊覓覘覡覩覦覬覯覲覺覽覿觀觚觜觝觧觴觸訃訖訐訌訛訝訥訶詁詛詒詆詈詼詭詬詢誅誂誄誨誡誑誥誦誚誣諄諍諂諚諫諳諧諤諱謔諠諢諷諞諛謌謇謚諡謖謐謗謠謳鞫謦謫謾謨譁譌譏譎證譖譛譚譫"],
["eca1","譟譬譯譴譽讀讌讎讒讓讖讙讚谺豁谿豈豌豎豐豕豢豬豸豺貂貉貅貊貍貎貔豼貘戝貭貪貽貲貳貮貶賈賁賤賣賚賽賺賻贄贅贊贇贏贍贐齎贓賍贔贖赧赭赱赳趁趙跂趾趺跏跚跖跌跛跋跪跫跟跣跼踈踉跿踝踞踐踟蹂踵踰踴蹊"],
["eda1","蹇蹉蹌蹐蹈蹙蹤蹠踪蹣蹕蹶蹲蹼躁躇躅躄躋躊躓躑躔躙躪躡躬躰軆躱躾軅軈軋軛軣軼軻軫軾輊輅輕輒輙輓輜輟輛輌輦輳輻輹轅轂輾轌轉轆轎轗轜轢轣轤辜辟辣辭辯辷迚迥迢迪迯邇迴逅迹迺逑逕逡逍逞逖逋逧逶逵逹迸"],
["eea1","遏遐遑遒逎遉逾遖遘遞遨遯遶隨遲邂遽邁邀邊邉邏邨邯邱邵郢郤扈郛鄂鄒鄙鄲鄰酊酖酘酣酥酩酳酲醋醉醂醢醫醯醪醵醴醺釀釁釉釋釐釖釟釡釛釼釵釶鈞釿鈔鈬鈕鈑鉞鉗鉅鉉鉤鉈銕鈿鉋鉐銜銖銓銛鉚鋏銹銷鋩錏鋺鍄錮"],
["efa1","錙錢錚錣錺錵錻鍜鍠鍼鍮鍖鎰鎬鎭鎔鎹鏖鏗鏨鏥鏘鏃鏝鏐鏈鏤鐚鐔鐓鐃鐇鐐鐶鐫鐵鐡鐺鑁鑒鑄鑛鑠鑢鑞鑪鈩鑰鑵鑷鑽鑚鑼鑾钁鑿閂閇閊閔閖閘閙閠閨閧閭閼閻閹閾闊濶闃闍闌闕闔闖關闡闥闢阡阨阮阯陂陌陏陋陷陜陞"],
["f0a1","陝陟陦陲陬隍隘隕隗險隧隱隲隰隴隶隸隹雎雋雉雍襍雜霍雕雹霄霆霈霓霎霑霏霖霙霤霪霰霹霽霾靄靆靈靂靉靜靠靤靦靨勒靫靱靹鞅靼鞁靺鞆鞋鞏鞐鞜鞨鞦鞣鞳鞴韃韆韈韋韜韭齏韲竟韶韵頏頌頸頤頡頷頽顆顏顋顫顯顰"],
["f1a1","顱顴顳颪颯颱颶飄飃飆飩飫餃餉餒餔餘餡餝餞餤餠餬餮餽餾饂饉饅饐饋饑饒饌饕馗馘馥馭馮馼駟駛駝駘駑駭駮駱駲駻駸騁騏騅駢騙騫騷驅驂驀驃騾驕驍驛驗驟驢驥驤驩驫驪骭骰骼髀髏髑髓體髞髟髢髣髦髯髫髮髴髱髷"],
["f2a1","髻鬆鬘鬚鬟鬢鬣鬥鬧鬨鬩鬪鬮鬯鬲魄魃魏魍魎魑魘魴鮓鮃鮑鮖鮗鮟鮠鮨鮴鯀鯊鮹鯆鯏鯑鯒鯣鯢鯤鯔鯡鰺鯲鯱鯰鰕鰔鰉鰓鰌鰆鰈鰒鰊鰄鰮鰛鰥鰤鰡鰰鱇鰲鱆鰾鱚鱠鱧鱶鱸鳧鳬鳰鴉鴈鳫鴃鴆鴪鴦鶯鴣鴟鵄鴕鴒鵁鴿鴾鵆鵈"],
["f3a1","鵝鵞鵤鵑鵐鵙鵲鶉鶇鶫鵯鵺鶚鶤鶩鶲鷄鷁鶻鶸鶺鷆鷏鷂鷙鷓鷸鷦鷭鷯鷽鸚鸛鸞鹵鹹鹽麁麈麋麌麒麕麑麝麥麩麸麪麭靡黌黎黏黐黔黜點黝黠黥黨黯黴黶黷黹黻黼黽鼇鼈皷鼕鼡鼬鼾齊齒齔齣齟齠齡齦齧齬齪齷齲齶龕龜龠"],
["f4a1","堯槇遙瑤凜熙"],
["f9a1","纊褜鍈銈蓜俉炻昱棈鋹曻彅丨仡仼伀伃伹佖侒侊侚侔俍偀倢俿倞偆偰偂傔僴僘兊兤冝冾凬刕劜劦勀勛匀匇匤卲厓厲叝﨎咜咊咩哿喆坙坥垬埈埇﨏塚增墲夋奓奛奝奣妤妺孖寀甯寘寬尞岦岺峵崧嵓﨑嵂嵭嶸嶹巐弡弴彧德"],
["faa1","忞恝悅悊惞惕愠惲愑愷愰憘戓抦揵摠撝擎敎昀昕昻昉昮昞昤晥晗晙晴晳暙暠暲暿曺朎朗杦枻桒柀栁桄棏﨓楨﨔榘槢樰橫橆橳橾櫢櫤毖氿汜沆汯泚洄涇浯涖涬淏淸淲淼渹湜渧渼溿澈澵濵瀅瀇瀨炅炫焏焄煜煆煇凞燁燾犱"],
["fba1","犾猤猪獷玽珉珖珣珒琇珵琦琪琩琮瑢璉璟甁畯皂皜皞皛皦益睆劯砡硎硤硺礰礼神祥禔福禛竑竧靖竫箞精絈絜綷綠緖繒罇羡羽茁荢荿菇菶葈蒴蕓蕙蕫﨟薰蘒﨡蠇裵訒訷詹誧誾諟諸諶譓譿賰賴贒赶﨣軏﨤逸遧郞都鄕鄧釚"],
["fca1","釗釞釭釮釤釥鈆鈐鈊鈺鉀鈼鉎鉙鉑鈹鉧銧鉷鉸鋧鋗鋙鋐﨧鋕鋠鋓錥錡鋻﨨錞鋿錝錂鍰鍗鎤鏆鏞鏸鐱鑅鑈閒隆﨩隝隯霳霻靃靍靏靑靕顗顥飯飼餧館馞驎髙髜魵魲鮏鮱鮻鰀鵰鵫鶴鸙黑"],
["fcf1","ⅰ",9,"￢￤＇＂"],
["8fa2af","˘ˇ¸˙˝¯˛˚～΄΅"],
["8fa2c2","¡¦¿"],
["8fa2eb","ºª©®™¤№"],
["8fa6e1","ΆΈΉΊΪ"],
["8fa6e7","Ό"],
["8fa6e9","ΎΫ"],
["8fa6ec","Ώ"],
["8fa6f1","άέήίϊΐόςύϋΰώ"],
["8fa7c2","Ђ",10,"ЎЏ"],
["8fa7f2","ђ",10,"ўџ"],
["8fa9a1","ÆĐ"],
["8fa9a4","Ħ"],
["8fa9a6","Ĳ"],
["8fa9a8","ŁĿ"],
["8fa9ab","ŊØŒ"],
["8fa9af","ŦÞ"],
["8fa9c1","æđðħıĳĸłŀŉŋøœßŧþ"],
["8faaa1","ÁÀÄÂĂǍĀĄÅÃĆĈČÇĊĎÉÈËÊĚĖĒĘ"],
["8faaba","ĜĞĢĠĤÍÌÏÎǏİĪĮĨĴĶĹĽĻŃŇŅÑÓÒÖÔǑŐŌÕŔŘŖŚŜŠŞŤŢÚÙÜÛŬǓŰŪŲŮŨǗǛǙǕŴÝŸŶŹŽŻ"],
["8faba1","áàäâăǎāąåãćĉčçċďéèëêěėēęǵĝğ"],
["8fabbd","ġĥíìïîǐ"],
["8fabc5","īįĩĵķĺľļńňņñóòöôǒőōõŕřŗśŝšşťţúùüûŭǔűūųůũǘǜǚǖŵýÿŷźžż"],
["8fb0a1","丂丄丅丌丒丟丣两丨丫丮丯丰丵乀乁乄乇乑乚乜乣乨乩乴乵乹乿亍亖亗亝亯亹仃仐仚仛仠仡仢仨仯仱仳仵份仾仿伀伂伃伈伋伌伒伕伖众伙伮伱你伳伵伷伹伻伾佀佂佈佉佋佌佒佔佖佘佟佣佪佬佮佱佷佸佹佺佽佾侁侂侄"],
["8fb1a1","侅侉侊侌侎侐侒侓侔侗侙侚侞侟侲侷侹侻侼侽侾俀俁俅俆俈俉俋俌俍俏俒俜俠俢俰俲俼俽俿倀倁倄倇倊倌倎倐倓倗倘倛倜倝倞倢倧倮倰倲倳倵偀偁偂偅偆偊偌偎偑偒偓偗偙偟偠偢偣偦偧偪偭偰偱倻傁傃傄傆傊傎傏傐"],
["8fb2a1","傒傓傔傖傛傜傞",4,"傪傯傰傹傺傽僀僃僄僇僌僎僐僓僔僘僜僝僟僢僤僦僨僩僯僱僶僺僾儃儆儇儈儋儌儍儎僲儐儗儙儛儜儝儞儣儧儨儬儭儯儱儳儴儵儸儹兂兊兏兓兕兗兘兟兤兦兾冃冄冋冎冘冝冡冣冭冸冺冼冾冿凂"],
["8fb3a1","凈减凑凒凓凕凘凞凢凥凮凲凳凴凷刁刂刅划刓刕刖刘刢刨刱刲刵刼剅剉剕剗剘剚剜剟剠剡剦剮剷剸剹劀劂劅劊劌劓劕劖劗劘劚劜劤劥劦劧劯劰劶劷劸劺劻劽勀勄勆勈勌勏勑勔勖勛勜勡勥勨勩勪勬勰勱勴勶勷匀匃匊匋"],
["8fb4a1","匌匑匓匘匛匜匞匟匥匧匨匩匫匬匭匰匲匵匼匽匾卂卌卋卙卛卡卣卥卬卭卲卹卾厃厇厈厎厓厔厙厝厡厤厪厫厯厲厴厵厷厸厺厽叀叅叏叒叓叕叚叝叞叠另叧叵吂吓吚吡吧吨吪启吱吴吵呃呄呇呍呏呞呢呤呦呧呩呫呭呮呴呿"],
["8fb5a1","咁咃咅咈咉咍咑咕咖咜咟咡咦咧咩咪咭咮咱咷咹咺咻咿哆哊响哎哠哪哬哯哶哼哾哿唀唁唅唈唉唌唍唎唕唪唫唲唵唶唻唼唽啁啇啉啊啍啐啑啘啚啛啞啠啡啤啦啿喁喂喆喈喎喏喑喒喓喔喗喣喤喭喲喿嗁嗃嗆嗉嗋嗌嗎嗑嗒"],
["8fb6a1","嗓嗗嗘嗛嗞嗢嗩嗶嗿嘅嘈嘊嘍",5,"嘙嘬嘰嘳嘵嘷嘹嘻嘼嘽嘿噀噁噃噄噆噉噋噍噏噔噞噠噡噢噣噦噩噭噯噱噲噵嚄嚅嚈嚋嚌嚕嚙嚚嚝嚞嚟嚦嚧嚨嚩嚫嚬嚭嚱嚳嚷嚾囅囉囊囋囏囐囌囍囙囜囝囟囡囤",4,"囱囫园"],
["8fb7a1","囶囷圁圂圇圊圌圑圕圚圛圝圠圢圣圤圥圩圪圬圮圯圳圴圽圾圿坅坆坌坍坒坢坥坧坨坫坭",4,"坳坴坵坷坹坺坻坼坾垁垃垌垔垗垙垚垜垝垞垟垡垕垧垨垩垬垸垽埇埈埌埏埕埝埞埤埦埧埩埭埰埵埶埸埽埾埿堃堄堈堉埡"],
["8fb8a1","堌堍堛堞堟堠堦堧堭堲堹堿塉塌塍塏塐塕塟塡塤塧塨塸塼塿墀墁墇墈墉墊墌墍墏墐墔墖墝墠墡墢墦墩墱墲壄墼壂壈壍壎壐壒壔壖壚壝壡壢壩壳夅夆夋夌夒夓夔虁夝夡夣夤夨夯夰夳夵夶夿奃奆奒奓奙奛奝奞奟奡奣奫奭"],
["8fb9a1","奯奲奵奶她奻奼妋妌妎妒妕妗妟妤妧妭妮妯妰妳妷妺妼姁姃姄姈姊姍姒姝姞姟姣姤姧姮姯姱姲姴姷娀娄娌娍娎娒娓娞娣娤娧娨娪娭娰婄婅婇婈婌婐婕婞婣婥婧婭婷婺婻婾媋媐媓媖媙媜媞媟媠媢媧媬媱媲媳媵媸媺媻媿"],
["8fbaa1","嫄嫆嫈嫏嫚嫜嫠嫥嫪嫮嫵嫶嫽嬀嬁嬈嬗嬴嬙嬛嬝嬡嬥嬭嬸孁孋孌孒孖孞孨孮孯孼孽孾孿宁宄宆宊宎宐宑宓宔宖宨宩宬宭宯宱宲宷宺宼寀寁寍寏寖",4,"寠寯寱寴寽尌尗尞尟尣尦尩尫尬尮尰尲尵尶屙屚屜屢屣屧屨屩"],
["8fbba1","屭屰屴屵屺屻屼屽岇岈岊岏岒岝岟岠岢岣岦岪岲岴岵岺峉峋峒峝峗峮峱峲峴崁崆崍崒崫崣崤崦崧崱崴崹崽崿嵂嵃嵆嵈嵕嵑嵙嵊嵟嵠嵡嵢嵤嵪嵭嵰嵹嵺嵾嵿嶁嶃嶈嶊嶒嶓嶔嶕嶙嶛嶟嶠嶧嶫嶰嶴嶸嶹巃巇巋巐巎巘巙巠巤"],
["8fbca1","巩巸巹帀帇帍帒帔帕帘帟帠帮帨帲帵帾幋幐幉幑幖幘幛幜幞幨幪",4,"幰庀庋庎庢庤庥庨庪庬庱庳庽庾庿廆廌廋廎廑廒廔廕廜廞廥廫异弆弇弈弎弙弜弝弡弢弣弤弨弫弬弮弰弴弶弻弽弿彀彄彅彇彍彐彔彘彛彠彣彤彧"],
["8fbda1","彯彲彴彵彸彺彽彾徉徍徏徖徜徝徢徧徫徤徬徯徰徱徸忄忇忈忉忋忐",4,"忞忡忢忨忩忪忬忭忮忯忲忳忶忺忼怇怊怍怓怔怗怘怚怟怤怭怳怵恀恇恈恉恌恑恔恖恗恝恡恧恱恾恿悂悆悈悊悎悑悓悕悘悝悞悢悤悥您悰悱悷"],
["8fbea1","悻悾惂惄惈惉惊惋惎惏惔惕惙惛惝惞惢惥惲惵惸惼惽愂愇愊愌愐",4,"愖愗愙愜愞愢愪愫愰愱愵愶愷愹慁慅慆慉慞慠慬慲慸慻慼慿憀憁憃憄憋憍憒憓憗憘憜憝憟憠憥憨憪憭憸憹憼懀懁懂懎懏懕懜懝懞懟懡懢懧懩懥"],
["8fbfa1","懬懭懯戁戃戄戇戓戕戜戠戢戣戧戩戫戹戽扂扃扄扆扌扐扑扒扔扖扚扜扤扭扯扳扺扽抍抎抏抐抦抨抳抶抷抺抾抿拄拎拕拖拚拪拲拴拼拽挃挄挊挋挍挐挓挖挘挩挪挭挵挶挹挼捁捂捃捄捆捊捋捎捒捓捔捘捛捥捦捬捭捱捴捵"],
["8fc0a1","捸捼捽捿掂掄掇掊掐掔掕掙掚掞掤掦掭掮掯掽揁揅揈揎揑揓揔揕揜揠揥揪揬揲揳揵揸揹搉搊搐搒搔搘搞搠搢搤搥搩搪搯搰搵搽搿摋摏摑摒摓摔摚摛摜摝摟摠摡摣摭摳摴摻摽撅撇撏撐撑撘撙撛撝撟撡撣撦撨撬撳撽撾撿"],
["8fc1a1","擄擉擊擋擌擎擐擑擕擗擤擥擩擪擭擰擵擷擻擿攁攄攈攉攊攏攓攔攖攙攛攞攟攢攦攩攮攱攺攼攽敃敇敉敐敒敔敟敠敧敫敺敽斁斅斊斒斕斘斝斠斣斦斮斲斳斴斿旂旈旉旎旐旔旖旘旟旰旲旴旵旹旾旿昀昄昈昉昍昑昒昕昖昝"],
["8fc2a1","昞昡昢昣昤昦昩昪昫昬昮昰昱昳昹昷晀晅晆晊晌晑晎晗晘晙晛晜晠晡曻晪晫晬晾晳晵晿晷晸晹晻暀晼暋暌暍暐暒暙暚暛暜暟暠暤暭暱暲暵暻暿曀曂曃曈曌曎曏曔曛曟曨曫曬曮曺朅朇朎朓朙朜朠朢朳朾杅杇杈杌杔杕杝"],
["8fc3a1","杦杬杮杴杶杻极构枎枏枑枓枖枘枙枛枰枱枲枵枻枼枽柹柀柂柃柅柈柉柒柗柙柜柡柦柰柲柶柷桒栔栙栝栟栨栧栬栭栯栰栱栳栻栿桄桅桊桌桕桗桘桛桫桮",4,"桵桹桺桻桼梂梄梆梈梖梘梚梜梡梣梥梩梪梮梲梻棅棈棌棏"],
["8fc4a1","棐棑棓棖棙棜棝棥棨棪棫棬棭棰棱棵棶棻棼棽椆椉椊椐椑椓椖椗椱椳椵椸椻楂楅楉楎楗楛楣楤楥楦楨楩楬楰楱楲楺楻楿榀榍榒榖榘榡榥榦榨榫榭榯榷榸榺榼槅槈槑槖槗槢槥槮槯槱槳槵槾樀樁樃樏樑樕樚樝樠樤樨樰樲"],
["8fc5a1","樴樷樻樾樿橅橆橉橊橎橐橑橒橕橖橛橤橧橪橱橳橾檁檃檆檇檉檋檑檛檝檞檟檥檫檯檰檱檴檽檾檿櫆櫉櫈櫌櫐櫔櫕櫖櫜櫝櫤櫧櫬櫰櫱櫲櫼櫽欂欃欆欇欉欏欐欑欗欛欞欤欨欫欬欯欵欶欻欿歆歊歍歒歖歘歝歠歧歫歮歰歵歽"],
["8fc6a1","歾殂殅殗殛殟殠殢殣殨殩殬殭殮殰殸殹殽殾毃毄毉毌毖毚毡毣毦毧毮毱毷毹毿氂氄氅氉氍氎氐氒氙氟氦氧氨氬氮氳氵氶氺氻氿汊汋汍汏汒汔汙汛汜汫汭汯汴汶汸汹汻沅沆沇沉沔沕沗沘沜沟沰沲沴泂泆泍泏泐泑泒泔泖"],
["8fc7a1","泚泜泠泧泩泫泬泮泲泴洄洇洊洎洏洑洓洚洦洧洨汧洮洯洱洹洼洿浗浞浟浡浥浧浯浰浼涂涇涑涒涔涖涗涘涪涬涴涷涹涽涿淄淈淊淎淏淖淛淝淟淠淢淥淩淯淰淴淶淼渀渄渞渢渧渲渶渹渻渼湄湅湈湉湋湏湑湒湓湔湗湜湝湞"],
["8fc8a1","湢湣湨湳湻湽溍溓溙溠溧溭溮溱溳溻溿滀滁滃滇滈滊滍滎滏滫滭滮滹滻滽漄漈漊漌漍漖漘漚漛漦漩漪漯漰漳漶漻漼漭潏潑潒潓潗潙潚潝潞潡潢潨潬潽潾澃澇澈澋澌澍澐澒澓澔澖澚澟澠澥澦澧澨澮澯澰澵澶澼濅濇濈濊"],
["8fc9a1","濚濞濨濩濰濵濹濼濽瀀瀅瀆瀇瀍瀗瀠瀣瀯瀴瀷瀹瀼灃灄灈灉灊灋灔灕灝灞灎灤灥灬灮灵灶灾炁炅炆炔",4,"炛炤炫炰炱炴炷烊烑烓烔烕烖烘烜烤烺焃",4,"焋焌焏焞焠焫焭焯焰焱焸煁煅煆煇煊煋煐煒煗煚煜煞煠"],
["8fcaa1","煨煹熀熅熇熌熒熚熛熠熢熯熰熲熳熺熿燀燁燄燋燌燓燖燙燚燜燸燾爀爇爈爉爓爗爚爝爟爤爫爯爴爸爹牁牂牃牅牎牏牐牓牕牖牚牜牞牠牣牨牫牮牯牱牷牸牻牼牿犄犉犍犎犓犛犨犭犮犱犴犾狁狇狉狌狕狖狘狟狥狳狴狺狻"],
["8fcba1","狾猂猄猅猇猋猍猒猓猘猙猞猢猤猧猨猬猱猲猵猺猻猽獃獍獐獒獖獘獝獞獟獠獦獧獩獫獬獮獯獱獷獹獼玀玁玃玅玆玎玐玓玕玗玘玜玞玟玠玢玥玦玪玫玭玵玷玹玼玽玿珅珆珉珋珌珏珒珓珖珙珝珡珣珦珧珩珴珵珷珹珺珻珽"],
["8fcca1","珿琀琁琄琇琊琑琚琛琤琦琨",9,"琹瑀瑃瑄瑆瑇瑋瑍瑑瑒瑗瑝瑢瑦瑧瑨瑫瑭瑮瑱瑲璀璁璅璆璇璉璏璐璑璒璘璙璚璜璟璠璡璣璦璨璩璪璫璮璯璱璲璵璹璻璿瓈瓉瓌瓐瓓瓘瓚瓛瓞瓟瓤瓨瓪瓫瓯瓴瓺瓻瓼瓿甆"],
["8fcda1","甒甖甗甠甡甤甧甩甪甯甶甹甽甾甿畀畃畇畈畎畐畒畗畞畟畡畯畱畹",5,"疁疅疐疒疓疕疙疜疢疤疴疺疿痀痁痄痆痌痎痏痗痜痟痠痡痤痧痬痮痯痱痹瘀瘂瘃瘄瘇瘈瘊瘌瘏瘒瘓瘕瘖瘙瘛瘜瘝瘞瘣瘥瘦瘩瘭瘲瘳瘵瘸瘹"],
["8fcea1","瘺瘼癊癀癁癃癄癅癉癋癕癙癟癤癥癭癮癯癱癴皁皅皌皍皕皛皜皝皟皠皢",6,"皪皭皽盁盅盉盋盌盎盔盙盠盦盨盬盰盱盶盹盼眀眆眊眎眒眔眕眗眙眚眜眢眨眭眮眯眴眵眶眹眽眾睂睅睆睊睍睎睏睒睖睗睜睞睟睠睢"],
["8fcfa1","睤睧睪睬睰睲睳睴睺睽瞀瞄瞌瞍瞔瞕瞖瞚瞟瞢瞧瞪瞮瞯瞱瞵瞾矃矉矑矒矕矙矞矟矠矤矦矪矬矰矱矴矸矻砅砆砉砍砎砑砝砡砢砣砭砮砰砵砷硃硄硇硈硌硎硒硜硞硠硡硣硤硨硪确硺硾碊碏碔碘碡碝碞碟碤碨碬碭碰碱碲碳"],
["8fd0a1","碻碽碿磇磈磉磌磎磒磓磕磖磤磛磟磠磡磦磪磲磳礀磶磷磺磻磿礆礌礐礚礜礞礟礠礥礧礩礭礱礴礵礻礽礿祄祅祆祊祋祏祑祔祘祛祜祧祩祫祲祹祻祼祾禋禌禑禓禔禕禖禘禛禜禡禨禩禫禯禱禴禸离秂秄秇秈秊秏秔秖秚秝秞"],
["8fd1a1","秠秢秥秪秫秭秱秸秼稂稃稇稉稊稌稑稕稛稞稡稧稫稭稯稰稴稵稸稹稺穄穅穇穈穌穕穖穙穜穝穟穠穥穧穪穭穵穸穾窀窂窅窆窊窋窐窑窔窞窠窣窬窳窵窹窻窼竆竉竌竎竑竛竨竩竫竬竱竴竻竽竾笇笔笟笣笧笩笪笫笭笮笯笰"],
["8fd2a1","笱笴笽笿筀筁筇筎筕筠筤筦筩筪筭筯筲筳筷箄箉箎箐箑箖箛箞箠箥箬箯箰箲箵箶箺箻箼箽篂篅篈篊篔篖篗篙篚篛篨篪篲篴篵篸篹篺篼篾簁簂簃簄簆簉簋簌簎簏簙簛簠簥簦簨簬簱簳簴簶簹簺籆籊籕籑籒籓籙",5],
["8fd3a1","籡籣籧籩籭籮籰籲籹籼籽粆粇粏粔粞粠粦粰粶粷粺粻粼粿糄糇糈糉糍糏糓糔糕糗糙糚糝糦糩糫糵紃紇紈紉紏紑紒紓紖紝紞紣紦紪紭紱紼紽紾絀絁絇絈絍絑絓絗絙絚絜絝絥絧絪絰絸絺絻絿綁綂綃綅綆綈綋綌綍綑綖綗綝"],
["8fd4a1","綞綦綧綪綳綶綷綹緂",4,"緌緍緎緗緙縀緢緥緦緪緫緭緱緵緶緹緺縈縐縑縕縗縜縝縠縧縨縬縭縯縳縶縿繄繅繇繎繐繒繘繟繡繢繥繫繮繯繳繸繾纁纆纇纊纍纑纕纘纚纝纞缼缻缽缾缿罃罄罇罏罒罓罛罜罝罡罣罤罥罦罭"],
["8fd5a1","罱罽罾罿羀羋羍羏羐羑羖羗羜羡羢羦羪羭羴羼羿翀翃翈翎翏翛翟翣翥翨翬翮翯翲翺翽翾翿耇耈耊耍耎耏耑耓耔耖耝耞耟耠耤耦耬耮耰耴耵耷耹耺耼耾聀聄聠聤聦聭聱聵肁肈肎肜肞肦肧肫肸肹胈胍胏胒胔胕胗胘胠胭胮"],
["8fd6a1","胰胲胳胶胹胺胾脃脋脖脗脘脜脞脠脤脧脬脰脵脺脼腅腇腊腌腒腗腠腡腧腨腩腭腯腷膁膐膄膅膆膋膎膖膘膛膞膢膮膲膴膻臋臃臅臊臎臏臕臗臛臝臞臡臤臫臬臰臱臲臵臶臸臹臽臿舀舃舏舓舔舙舚舝舡舢舨舲舴舺艃艄艅艆"],
["8fd7a1","艋艎艏艑艖艜艠艣艧艭艴艻艽艿芀芁芃芄芇芉芊芎芑芔芖芘芚芛芠芡芣芤芧芨芩芪芮芰芲芴芷芺芼芾芿苆苐苕苚苠苢苤苨苪苭苯苶苷苽苾茀茁茇茈茊茋荔茛茝茞茟茡茢茬茭茮茰茳茷茺茼茽荂荃荄荇荍荎荑荕荖荗荰荸"],
["8fd8a1","荽荿莀莂莄莆莍莒莔莕莘莙莛莜莝莦莧莩莬莾莿菀菇菉菏菐菑菔菝荓菨菪菶菸菹菼萁萆萊萏萑萕萙莭萯萹葅葇葈葊葍葏葑葒葖葘葙葚葜葠葤葥葧葪葰葳葴葶葸葼葽蒁蒅蒒蒓蒕蒞蒦蒨蒩蒪蒯蒱蒴蒺蒽蒾蓀蓂蓇蓈蓌蓏蓓"],
["8fd9a1","蓜蓧蓪蓯蓰蓱蓲蓷蔲蓺蓻蓽蔂蔃蔇蔌蔎蔐蔜蔞蔢蔣蔤蔥蔧蔪蔫蔯蔳蔴蔶蔿蕆蕏",4,"蕖蕙蕜",6,"蕤蕫蕯蕹蕺蕻蕽蕿薁薅薆薉薋薌薏薓薘薝薟薠薢薥薧薴薶薷薸薼薽薾薿藂藇藊藋藎薭藘藚藟藠藦藨藭藳藶藼"],
["8fdaa1","藿蘀蘄蘅蘍蘎蘐蘑蘒蘘蘙蘛蘞蘡蘧蘩蘶蘸蘺蘼蘽虀虂虆虒虓虖虗虘虙虝虠",4,"虩虬虯虵虶虷虺蚍蚑蚖蚘蚚蚜蚡蚦蚧蚨蚭蚱蚳蚴蚵蚷蚸蚹蚿蛀蛁蛃蛅蛑蛒蛕蛗蛚蛜蛠蛣蛥蛧蚈蛺蛼蛽蜄蜅蜇蜋蜎蜏蜐蜓蜔蜙蜞蜟蜡蜣"],
["8fdba1","蜨蜮蜯蜱蜲蜹蜺蜼蜽蜾蝀蝃蝅蝍蝘蝝蝡蝤蝥蝯蝱蝲蝻螃",6,"螋螌螐螓螕螗螘螙螞螠螣螧螬螭螮螱螵螾螿蟁蟈蟉蟊蟎蟕蟖蟙蟚蟜蟟蟢蟣蟤蟪蟫蟭蟱蟳蟸蟺蟿蠁蠃蠆蠉蠊蠋蠐蠙蠒蠓蠔蠘蠚蠛蠜蠞蠟蠨蠭蠮蠰蠲蠵"],
["8fdca1","蠺蠼衁衃衅衈衉衊衋衎衑衕衖衘衚衜衟衠衤衩衱衹衻袀袘袚袛袜袟袠袨袪袺袽袾裀裊",4,"裑裒裓裛裞裧裯裰裱裵裷褁褆褍褎褏褕褖褘褙褚褜褠褦褧褨褰褱褲褵褹褺褾襀襂襅襆襉襏襒襗襚襛襜襡襢襣襫襮襰襳襵襺"],
["8fdda1","襻襼襽覉覍覐覔覕覛覜覟覠覥覰覴覵覶覷覼觔",4,"觥觩觫觭觱觳觶觹觽觿訄訅訇訏訑訒訔訕訞訠訢訤訦訫訬訯訵訷訽訾詀詃詅詇詉詍詎詓詖詗詘詜詝詡詥詧詵詶詷詹詺詻詾詿誀誃誆誋誏誐誒誖誗誙誟誧誩誮誯誳"],
["8fdea1","誶誷誻誾諃諆諈諉諊諑諓諔諕諗諝諟諬諰諴諵諶諼諿謅謆謋謑謜謞謟謊謭謰謷謼譂",4,"譈譒譓譔譙譍譞譣譭譶譸譹譼譾讁讄讅讋讍讏讔讕讜讞讟谸谹谽谾豅豇豉豋豏豑豓豔豗豘豛豝豙豣豤豦豨豩豭豳豵豶豻豾貆"],
["8fdfa1","貇貋貐貒貓貙貛貜貤貹貺賅賆賉賋賏賖賕賙賝賡賨賬賯賰賲賵賷賸賾賿贁贃贉贒贗贛赥赩赬赮赿趂趄趈趍趐趑趕趞趟趠趦趫趬趯趲趵趷趹趻跀跅跆跇跈跊跎跑跔跕跗跙跤跥跧跬跰趼跱跲跴跽踁踄踅踆踋踑踔踖踠踡踢"],
["8fe0a1","踣踦踧踱踳踶踷踸踹踽蹀蹁蹋蹍蹎蹏蹔蹛蹜蹝蹞蹡蹢蹩蹬蹭蹯蹰蹱蹹蹺蹻躂躃躉躐躒躕躚躛躝躞躢躧躩躭躮躳躵躺躻軀軁軃軄軇軏軑軔軜軨軮軰軱軷軹軺軭輀輂輇輈輏輐輖輗輘輞輠輡輣輥輧輨輬輭輮輴輵輶輷輺轀轁"],
["8fe1a1","轃轇轏轑",4,"轘轝轞轥辝辠辡辤辥辦辵辶辸达迀迁迆迊迋迍运迒迓迕迠迣迤迨迮迱迵迶迻迾适逄逈逌逘逛逨逩逯逪逬逭逳逴逷逿遃遄遌遛遝遢遦遧遬遰遴遹邅邈邋邌邎邐邕邗邘邙邛邠邡邢邥邰邲邳邴邶邽郌邾郃"],
["8fe2a1","郄郅郇郈郕郗郘郙郜郝郟郥郒郶郫郯郰郴郾郿鄀鄄鄅鄆鄈鄍鄐鄔鄖鄗鄘鄚鄜鄞鄠鄥鄢鄣鄧鄩鄮鄯鄱鄴鄶鄷鄹鄺鄼鄽酃酇酈酏酓酗酙酚酛酡酤酧酭酴酹酺酻醁醃醅醆醊醎醑醓醔醕醘醞醡醦醨醬醭醮醰醱醲醳醶醻醼醽醿"],
["8fe3a1","釂釃釅釓釔釗釙釚釞釤釥釩釪釬",5,"釷釹釻釽鈀鈁鈄鈅鈆鈇鈉鈊鈌鈐鈒鈓鈖鈘鈜鈝鈣鈤鈥鈦鈨鈮鈯鈰鈳鈵鈶鈸鈹鈺鈼鈾鉀鉂鉃鉆鉇鉊鉍鉎鉏鉑鉘鉙鉜鉝鉠鉡鉥鉧鉨鉩鉮鉯鉰鉵",4,"鉻鉼鉽鉿銈銉銊銍銎銒銗"],
["8fe4a1","銙銟銠銤銥銧銨銫銯銲銶銸銺銻銼銽銿",4,"鋅鋆鋇鋈鋋鋌鋍鋎鋐鋓鋕鋗鋘鋙鋜鋝鋟鋠鋡鋣鋥鋧鋨鋬鋮鋰鋹鋻鋿錀錂錈錍錑錔錕錜錝錞錟錡錤錥錧錩錪錳錴錶錷鍇鍈鍉鍐鍑鍒鍕鍗鍘鍚鍞鍤鍥鍧鍩鍪鍭鍯鍰鍱鍳鍴鍶"],
["8fe5a1","鍺鍽鍿鎀鎁鎂鎈鎊鎋鎍鎏鎒鎕鎘鎛鎞鎡鎣鎤鎦鎨鎫鎴鎵鎶鎺鎩鏁鏄鏅鏆鏇鏉",4,"鏓鏙鏜鏞鏟鏢鏦鏧鏹鏷鏸鏺鏻鏽鐁鐂鐄鐈鐉鐍鐎鐏鐕鐖鐗鐟鐮鐯鐱鐲鐳鐴鐻鐿鐽鑃鑅鑈鑊鑌鑕鑙鑜鑟鑡鑣鑨鑫鑭鑮鑯鑱鑲钄钃镸镹"],
["8fe6a1","镾閄閈閌閍閎閝閞閟閡閦閩閫閬閴閶閺閽閿闆闈闉闋闐闑闒闓闙闚闝闞闟闠闤闦阝阞阢阤阥阦阬阱阳阷阸阹阺阼阽陁陒陔陖陗陘陡陮陴陻陼陾陿隁隂隃隄隉隑隖隚隝隟隤隥隦隩隮隯隳隺雊雒嶲雘雚雝雞雟雩雯雱雺霂"],
["8fe7a1","霃霅霉霚霛霝霡霢霣霨霱霳靁靃靊靎靏靕靗靘靚靛靣靧靪靮靳靶靷靸靻靽靿鞀鞉鞕鞖鞗鞙鞚鞞鞟鞢鞬鞮鞱鞲鞵鞶鞸鞹鞺鞼鞾鞿韁韄韅韇韉韊韌韍韎韐韑韔韗韘韙韝韞韠韛韡韤韯韱韴韷韸韺頇頊頙頍頎頔頖頜頞頠頣頦"],
["8fe8a1","頫頮頯頰頲頳頵頥頾顄顇顊顑顒顓顖顗顙顚顢顣顥顦顪顬颫颭颮颰颴颷颸颺颻颿飂飅飈飌飡飣飥飦飧飪飳飶餂餇餈餑餕餖餗餚餛餜餟餢餦餧餫餱",4,"餹餺餻餼饀饁饆饇饈饍饎饔饘饙饛饜饞饟饠馛馝馟馦馰馱馲馵"],
["8fe9a1","馹馺馽馿駃駉駓駔駙駚駜駞駧駪駫駬駰駴駵駹駽駾騂騃騄騋騌騐騑騖騞騠騢騣騤騧騭騮騳騵騶騸驇驁驄驊驋驌驎驑驔驖驝骪骬骮骯骲骴骵骶骹骻骾骿髁髃髆髈髎髐髒髕髖髗髛髜髠髤髥髧髩髬髲髳髵髹髺髽髿",4],
["8feaa1","鬄鬅鬈鬉鬋鬌鬍鬎鬐鬒鬖鬙鬛鬜鬠鬦鬫鬭鬳鬴鬵鬷鬹鬺鬽魈魋魌魕魖魗魛魞魡魣魥魦魨魪",4,"魳魵魷魸魹魿鮀鮄鮅鮆鮇鮉鮊鮋鮍鮏鮐鮔鮚鮝鮞鮦鮧鮩鮬鮰鮱鮲鮷鮸鮻鮼鮾鮿鯁鯇鯈鯎鯐鯗鯘鯝鯟鯥鯧鯪鯫鯯鯳鯷鯸"],
["8feba1","鯹鯺鯽鯿鰀鰂鰋鰏鰑鰖鰘鰙鰚鰜鰞鰢鰣鰦",4,"鰱鰵鰶鰷鰽鱁鱃鱄鱅鱉鱊鱎鱏鱐鱓鱔鱖鱘鱛鱝鱞鱟鱣鱩鱪鱜鱫鱨鱮鱰鱲鱵鱷鱻鳦鳲鳷鳹鴋鴂鴑鴗鴘鴜鴝鴞鴯鴰鴲鴳鴴鴺鴼鵅鴽鵂鵃鵇鵊鵓鵔鵟鵣鵢鵥鵩鵪鵫鵰鵶鵷鵻"],
["8feca1","鵼鵾鶃鶄鶆鶊鶍鶎鶒鶓鶕鶖鶗鶘鶡鶪鶬鶮鶱鶵鶹鶼鶿鷃鷇鷉鷊鷔鷕鷖鷗鷚鷞鷟鷠鷥鷧鷩鷫鷮鷰鷳鷴鷾鸊鸂鸇鸎鸐鸑鸒鸕鸖鸙鸜鸝鹺鹻鹼麀麂麃麄麅麇麎麏麖麘麛麞麤麨麬麮麯麰麳麴麵黆黈黋黕黟黤黧黬黭黮黰黱黲黵"],
["8feda1","黸黿鼂鼃鼉鼏鼐鼑鼒鼔鼖鼗鼙鼚鼛鼟鼢鼦鼪鼫鼯鼱鼲鼴鼷鼹鼺鼼鼽鼿齁齃",4,"齓齕齖齗齘齚齝齞齨齩齭",4,"齳齵齺齽龏龐龑龒龔龖龗龞龡龢龣龥"]
]

},{}],36:[function(require,module,exports){
module.exports={"uChars":[128,165,169,178,184,216,226,235,238,244,248,251,253,258,276,284,300,325,329,334,364,463,465,467,469,471,473,475,477,506,594,610,712,716,730,930,938,962,970,1026,1104,1106,8209,8215,8218,8222,8231,8241,8244,8246,8252,8365,8452,8454,8458,8471,8482,8556,8570,8596,8602,8713,8720,8722,8726,8731,8737,8740,8742,8748,8751,8760,8766,8777,8781,8787,8802,8808,8816,8854,8858,8870,8896,8979,9322,9372,9548,9588,9616,9622,9634,9652,9662,9672,9676,9680,9702,9735,9738,9793,9795,11906,11909,11913,11917,11928,11944,11947,11951,11956,11960,11964,11979,12284,12292,12312,12319,12330,12351,12436,12447,12535,12543,12586,12842,12850,12964,13200,13215,13218,13253,13263,13267,13270,13384,13428,13727,13839,13851,14617,14703,14801,14816,14964,15183,15471,15585,16471,16736,17208,17325,17330,17374,17623,17997,18018,18212,18218,18301,18318,18760,18811,18814,18820,18823,18844,18848,18872,19576,19620,19738,19887,40870,59244,59336,59367,59413,59417,59423,59431,59437,59443,59452,59460,59478,59493,63789,63866,63894,63976,63986,64016,64018,64021,64025,64034,64037,64042,65074,65093,65107,65112,65127,65132,65375,65510,65536],"gbChars":[0,36,38,45,50,81,89,95,96,100,103,104,105,109,126,133,148,172,175,179,208,306,307,308,309,310,311,312,313,341,428,443,544,545,558,741,742,749,750,805,819,820,7922,7924,7925,7927,7934,7943,7944,7945,7950,8062,8148,8149,8152,8164,8174,8236,8240,8262,8264,8374,8380,8381,8384,8388,8390,8392,8393,8394,8396,8401,8406,8416,8419,8424,8437,8439,8445,8482,8485,8496,8521,8603,8936,8946,9046,9050,9063,9066,9076,9092,9100,9108,9111,9113,9131,9162,9164,9218,9219,11329,11331,11334,11336,11346,11361,11363,11366,11370,11372,11375,11389,11682,11686,11687,11692,11694,11714,11716,11723,11725,11730,11736,11982,11989,12102,12336,12348,12350,12384,12393,12395,12397,12510,12553,12851,12962,12973,13738,13823,13919,13933,14080,14298,14585,14698,15583,15847,16318,16434,16438,16481,16729,17102,17122,17315,17320,17402,17418,17859,17909,17911,17915,17916,17936,17939,17961,18664,18703,18814,18962,19043,33469,33470,33471,33484,33485,33490,33497,33501,33505,33513,33520,33536,33550,37845,37921,37948,38029,38038,38064,38065,38066,38069,38075,38076,38078,39108,39109,39113,39114,39115,39116,39265,39394,189000]}
},{}],37:[function(require,module,exports){
module.exports=[
["a140","",62],
["a180","",32],
["a240","",62],
["a280","",32],
["a2ab","",5],
["a2e3","€"],
["a2ef",""],
["a2fd",""],
["a340","",62],
["a380","",31,"　"],
["a440","",62],
["a480","",32],
["a4f4","",10],
["a540","",62],
["a580","",32],
["a5f7","",7],
["a640","",62],
["a680","",32],
["a6b9","",7],
["a6d9","",6],
["a6ec",""],
["a6f3",""],
["a6f6","",8],
["a740","",62],
["a780","",32],
["a7c2","",14],
["a7f2","",12],
["a896","",10],
["a8bc","ḿ"],
["a8bf","ǹ"],
["a8c1",""],
["a8ea","",20],
["a958",""],
["a95b",""],
["a95d",""],
["a989","〾⿰",11],
["a997","",12],
["a9f0","",14],
["aaa1","",93],
["aba1","",93],
["aca1","",93],
["ada1","",93],
["aea1","",93],
["afa1","",93],
["d7fa","",4],
["f8a1","",93],
["f9a1","",93],
["faa1","",93],
["fba1","",93],
["fca1","",93],
["fda1","",93],
["fe50","⺁⺄㑳㑇⺈⺋㖞㘚㘎⺌⺗㥮㤘㧏㧟㩳㧐㭎㱮㳠⺧⺪䁖䅟⺮䌷⺳⺶⺷䎱䎬⺻䏝䓖䙡䙌"],
["fe80","䜣䜩䝼䞍⻊䥇䥺䥽䦂䦃䦅䦆䦟䦛䦷䦶䲣䲟䲠䲡䱷䲢䴓",6,"䶮",93],
["8135f437",""]
]

},{}],38:[function(require,module,exports){
module.exports=[
["0","\u0000",128],
["a1","｡",62],
["8140","　、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～∥｜…‥‘’“”（）〔〕［］｛｝〈",9,"＋－±×"],
["8180","÷＝≠＜＞≦≧∞∴♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇◆□■△▲▽▼※〒→←↑↓〓"],
["81b8","∈∋⊆⊇⊂⊃∪∩"],
["81c8","∧∨￢⇒⇔∀∃"],
["81da","∠⊥⌒∂∇≡≒≪≫√∽∝∵∫∬"],
["81f0","Å‰♯♭♪†‡¶"],
["81fc","◯"],
["824f","０",9],
["8260","Ａ",25],
["8281","ａ",25],
["829f","ぁ",82],
["8340","ァ",62],
["8380","ム",22],
["839f","Α",16,"Σ",6],
["83bf","α",16,"σ",6],
["8440","А",5,"ЁЖ",25],
["8470","а",5,"ёж",7],
["8480","о",17],
["849f","─│┌┐┘└├┬┤┴┼━┃┏┓┛┗┣┳┫┻╋┠┯┨┷┿┝┰┥┸╂"],
["8740","①",19,"Ⅰ",9],
["875f","㍉㌔㌢㍍㌘㌧㌃㌶㍑㍗㌍㌦㌣㌫㍊㌻㎜㎝㎞㎎㎏㏄㎡"],
["877e","㍻"],
["8780","〝〟№㏍℡㊤",4,"㈱㈲㈹㍾㍽㍼≒≡∫∮∑√⊥∠∟⊿∵∩∪"],
["889f","亜唖娃阿哀愛挨姶逢葵茜穐悪握渥旭葦芦鯵梓圧斡扱宛姐虻飴絢綾鮎或粟袷安庵按暗案闇鞍杏以伊位依偉囲夷委威尉惟意慰易椅為畏異移維緯胃萎衣謂違遺医井亥域育郁磯一壱溢逸稲茨芋鰯允印咽員因姻引飲淫胤蔭"],
["8940","院陰隠韻吋右宇烏羽迂雨卯鵜窺丑碓臼渦嘘唄欝蔚鰻姥厩浦瓜閏噂云運雲荏餌叡営嬰影映曳栄永泳洩瑛盈穎頴英衛詠鋭液疫益駅悦謁越閲榎厭円"],
["8980","園堰奄宴延怨掩援沿演炎焔煙燕猿縁艶苑薗遠鉛鴛塩於汚甥凹央奥往応押旺横欧殴王翁襖鴬鴎黄岡沖荻億屋憶臆桶牡乙俺卸恩温穏音下化仮何伽価佳加可嘉夏嫁家寡科暇果架歌河火珂禍禾稼箇花苛茄荷華菓蝦課嘩貨迦過霞蚊俄峨我牙画臥芽蛾賀雅餓駕介会解回塊壊廻快怪悔恢懐戒拐改"],
["8a40","魁晦械海灰界皆絵芥蟹開階貝凱劾外咳害崖慨概涯碍蓋街該鎧骸浬馨蛙垣柿蛎鈎劃嚇各廓拡撹格核殻獲確穫覚角赫較郭閣隔革学岳楽額顎掛笠樫"],
["8a80","橿梶鰍潟割喝恰括活渇滑葛褐轄且鰹叶椛樺鞄株兜竃蒲釜鎌噛鴨栢茅萱粥刈苅瓦乾侃冠寒刊勘勧巻喚堪姦完官寛干幹患感慣憾換敢柑桓棺款歓汗漢澗潅環甘監看竿管簡緩缶翰肝艦莞観諌貫還鑑間閑関陥韓館舘丸含岸巌玩癌眼岩翫贋雁頑顔願企伎危喜器基奇嬉寄岐希幾忌揮机旗既期棋棄"],
["8b40","機帰毅気汽畿祈季稀紀徽規記貴起軌輝飢騎鬼亀偽儀妓宜戯技擬欺犠疑祇義蟻誼議掬菊鞠吉吃喫桔橘詰砧杵黍却客脚虐逆丘久仇休及吸宮弓急救"],
["8b80","朽求汲泣灸球究窮笈級糾給旧牛去居巨拒拠挙渠虚許距鋸漁禦魚亨享京供侠僑兇競共凶協匡卿叫喬境峡強彊怯恐恭挟教橋況狂狭矯胸脅興蕎郷鏡響饗驚仰凝尭暁業局曲極玉桐粁僅勤均巾錦斤欣欽琴禁禽筋緊芹菌衿襟謹近金吟銀九倶句区狗玖矩苦躯駆駈駒具愚虞喰空偶寓遇隅串櫛釧屑屈"],
["8c40","掘窟沓靴轡窪熊隈粂栗繰桑鍬勲君薫訓群軍郡卦袈祁係傾刑兄啓圭珪型契形径恵慶慧憩掲携敬景桂渓畦稽系経継繋罫茎荊蛍計詣警軽頚鶏芸迎鯨"],
["8c80","劇戟撃激隙桁傑欠決潔穴結血訣月件倹倦健兼券剣喧圏堅嫌建憲懸拳捲検権牽犬献研硯絹県肩見謙賢軒遣鍵険顕験鹸元原厳幻弦減源玄現絃舷言諺限乎個古呼固姑孤己庫弧戸故枯湖狐糊袴股胡菰虎誇跨鈷雇顧鼓五互伍午呉吾娯後御悟梧檎瑚碁語誤護醐乞鯉交佼侯候倖光公功効勾厚口向"],
["8d40","后喉坑垢好孔孝宏工巧巷幸広庚康弘恒慌抗拘控攻昂晃更杭校梗構江洪浩港溝甲皇硬稿糠紅紘絞綱耕考肯肱腔膏航荒行衡講貢購郊酵鉱砿鋼閤降"],
["8d80","項香高鴻剛劫号合壕拷濠豪轟麹克刻告国穀酷鵠黒獄漉腰甑忽惚骨狛込此頃今困坤墾婚恨懇昏昆根梱混痕紺艮魂些佐叉唆嵯左差査沙瑳砂詐鎖裟坐座挫債催再最哉塞妻宰彩才採栽歳済災采犀砕砦祭斎細菜裁載際剤在材罪財冴坂阪堺榊肴咲崎埼碕鷺作削咋搾昨朔柵窄策索錯桜鮭笹匙冊刷"],
["8e40","察拶撮擦札殺薩雑皐鯖捌錆鮫皿晒三傘参山惨撒散桟燦珊産算纂蚕讃賛酸餐斬暫残仕仔伺使刺司史嗣四士始姉姿子屍市師志思指支孜斯施旨枝止"],
["8e80","死氏獅祉私糸紙紫肢脂至視詞詩試誌諮資賜雌飼歯事似侍児字寺慈持時次滋治爾璽痔磁示而耳自蒔辞汐鹿式識鴫竺軸宍雫七叱執失嫉室悉湿漆疾質実蔀篠偲柴芝屡蕊縞舎写射捨赦斜煮社紗者謝車遮蛇邪借勺尺杓灼爵酌釈錫若寂弱惹主取守手朱殊狩珠種腫趣酒首儒受呪寿授樹綬需囚収周"],
["8f40","宗就州修愁拾洲秀秋終繍習臭舟蒐衆襲讐蹴輯週酋酬集醜什住充十従戎柔汁渋獣縦重銃叔夙宿淑祝縮粛塾熟出術述俊峻春瞬竣舜駿准循旬楯殉淳"],
["8f80","準潤盾純巡遵醇順処初所暑曙渚庶緒署書薯藷諸助叙女序徐恕鋤除傷償勝匠升召哨商唱嘗奨妾娼宵将小少尚庄床廠彰承抄招掌捷昇昌昭晶松梢樟樵沼消渉湘焼焦照症省硝礁祥称章笑粧紹肖菖蒋蕉衝裳訟証詔詳象賞醤鉦鍾鐘障鞘上丈丞乗冗剰城場壌嬢常情擾条杖浄状畳穣蒸譲醸錠嘱埴飾"],
["9040","拭植殖燭織職色触食蝕辱尻伸信侵唇娠寝審心慎振新晋森榛浸深申疹真神秦紳臣芯薪親診身辛進針震人仁刃塵壬尋甚尽腎訊迅陣靭笥諏須酢図厨"],
["9080","逗吹垂帥推水炊睡粋翠衰遂酔錐錘随瑞髄崇嵩数枢趨雛据杉椙菅頗雀裾澄摺寸世瀬畝是凄制勢姓征性成政整星晴棲栖正清牲生盛精聖声製西誠誓請逝醒青静斉税脆隻席惜戚斥昔析石積籍績脊責赤跡蹟碩切拙接摂折設窃節説雪絶舌蝉仙先千占宣専尖川戦扇撰栓栴泉浅洗染潜煎煽旋穿箭線"],
["9140","繊羨腺舛船薦詮賎践選遷銭銑閃鮮前善漸然全禅繕膳糎噌塑岨措曾曽楚狙疏疎礎祖租粗素組蘇訴阻遡鼠僧創双叢倉喪壮奏爽宋層匝惣想捜掃挿掻"],
["9180","操早曹巣槍槽漕燥争痩相窓糟総綜聡草荘葬蒼藻装走送遭鎗霜騒像増憎臓蔵贈造促側則即息捉束測足速俗属賊族続卒袖其揃存孫尊損村遜他多太汰詑唾堕妥惰打柁舵楕陀駄騨体堆対耐岱帯待怠態戴替泰滞胎腿苔袋貸退逮隊黛鯛代台大第醍題鷹滝瀧卓啄宅托択拓沢濯琢託鐸濁諾茸凧蛸只"],
["9240","叩但達辰奪脱巽竪辿棚谷狸鱈樽誰丹単嘆坦担探旦歎淡湛炭短端箪綻耽胆蛋誕鍛団壇弾断暖檀段男談値知地弛恥智池痴稚置致蜘遅馳築畜竹筑蓄"],
["9280","逐秩窒茶嫡着中仲宙忠抽昼柱注虫衷註酎鋳駐樗瀦猪苧著貯丁兆凋喋寵帖帳庁弔張彫徴懲挑暢朝潮牒町眺聴脹腸蝶調諜超跳銚長頂鳥勅捗直朕沈珍賃鎮陳津墜椎槌追鎚痛通塚栂掴槻佃漬柘辻蔦綴鍔椿潰坪壷嬬紬爪吊釣鶴亭低停偵剃貞呈堤定帝底庭廷弟悌抵挺提梯汀碇禎程締艇訂諦蹄逓"],
["9340","邸鄭釘鼎泥摘擢敵滴的笛適鏑溺哲徹撤轍迭鉄典填天展店添纏甜貼転顛点伝殿澱田電兎吐堵塗妬屠徒斗杜渡登菟賭途都鍍砥砺努度土奴怒倒党冬"],
["9380","凍刀唐塔塘套宕島嶋悼投搭東桃梼棟盗淘湯涛灯燈当痘祷等答筒糖統到董蕩藤討謄豆踏逃透鐙陶頭騰闘働動同堂導憧撞洞瞳童胴萄道銅峠鴇匿得徳涜特督禿篤毒独読栃橡凸突椴届鳶苫寅酉瀞噸屯惇敦沌豚遁頓呑曇鈍奈那内乍凪薙謎灘捺鍋楢馴縄畷南楠軟難汝二尼弐迩匂賑肉虹廿日乳入"],
["9440","如尿韮任妊忍認濡禰祢寧葱猫熱年念捻撚燃粘乃廼之埜嚢悩濃納能脳膿農覗蚤巴把播覇杷波派琶破婆罵芭馬俳廃拝排敗杯盃牌背肺輩配倍培媒梅"],
["9480","楳煤狽買売賠陪這蝿秤矧萩伯剥博拍柏泊白箔粕舶薄迫曝漠爆縛莫駁麦函箱硲箸肇筈櫨幡肌畑畠八鉢溌発醗髪伐罰抜筏閥鳩噺塙蛤隼伴判半反叛帆搬斑板氾汎版犯班畔繁般藩販範釆煩頒飯挽晩番盤磐蕃蛮匪卑否妃庇彼悲扉批披斐比泌疲皮碑秘緋罷肥被誹費避非飛樋簸備尾微枇毘琵眉美"],
["9540","鼻柊稗匹疋髭彦膝菱肘弼必畢筆逼桧姫媛紐百謬俵彪標氷漂瓢票表評豹廟描病秒苗錨鋲蒜蛭鰭品彬斌浜瀕貧賓頻敏瓶不付埠夫婦富冨布府怖扶敷"],
["9580","斧普浮父符腐膚芙譜負賦赴阜附侮撫武舞葡蕪部封楓風葺蕗伏副復幅服福腹複覆淵弗払沸仏物鮒分吻噴墳憤扮焚奮粉糞紛雰文聞丙併兵塀幣平弊柄並蔽閉陛米頁僻壁癖碧別瞥蔑箆偏変片篇編辺返遍便勉娩弁鞭保舗鋪圃捕歩甫補輔穂募墓慕戊暮母簿菩倣俸包呆報奉宝峰峯崩庖抱捧放方朋"],
["9640","法泡烹砲縫胞芳萌蓬蜂褒訪豊邦鋒飽鳳鵬乏亡傍剖坊妨帽忘忙房暴望某棒冒紡肪膨謀貌貿鉾防吠頬北僕卜墨撲朴牧睦穆釦勃没殆堀幌奔本翻凡盆"],
["9680","摩磨魔麻埋妹昧枚毎哩槙幕膜枕鮪柾鱒桝亦俣又抹末沫迄侭繭麿万慢満漫蔓味未魅巳箕岬密蜜湊蓑稔脈妙粍民眠務夢無牟矛霧鵡椋婿娘冥名命明盟迷銘鳴姪牝滅免棉綿緬面麺摸模茂妄孟毛猛盲網耗蒙儲木黙目杢勿餅尤戻籾貰問悶紋門匁也冶夜爺耶野弥矢厄役約薬訳躍靖柳薮鑓愉愈油癒"],
["9740","諭輸唯佑優勇友宥幽悠憂揖有柚湧涌猶猷由祐裕誘遊邑郵雄融夕予余与誉輿預傭幼妖容庸揚揺擁曜楊様洋溶熔用窯羊耀葉蓉要謡踊遥陽養慾抑欲"],
["9780","沃浴翌翼淀羅螺裸来莱頼雷洛絡落酪乱卵嵐欄濫藍蘭覧利吏履李梨理璃痢裏裡里離陸律率立葎掠略劉流溜琉留硫粒隆竜龍侶慮旅虜了亮僚両凌寮料梁涼猟療瞭稜糧良諒遼量陵領力緑倫厘林淋燐琳臨輪隣鱗麟瑠塁涙累類令伶例冷励嶺怜玲礼苓鈴隷零霊麗齢暦歴列劣烈裂廉恋憐漣煉簾練聯"],
["9840","蓮連錬呂魯櫓炉賂路露労婁廊弄朗楼榔浪漏牢狼篭老聾蝋郎六麓禄肋録論倭和話歪賄脇惑枠鷲亙亘鰐詫藁蕨椀湾碗腕"],
["989f","弌丐丕个丱丶丼丿乂乖乘亂亅豫亊舒弍于亞亟亠亢亰亳亶从仍仄仆仂仗仞仭仟价伉佚估佛佝佗佇佶侈侏侘佻佩佰侑佯來侖儘俔俟俎俘俛俑俚俐俤俥倚倨倔倪倥倅伜俶倡倩倬俾俯們倆偃假會偕偐偈做偖偬偸傀傚傅傴傲"],
["9940","僉僊傳僂僖僞僥僭僣僮價僵儉儁儂儖儕儔儚儡儺儷儼儻儿兀兒兌兔兢竸兩兪兮冀冂囘册冉冏冑冓冕冖冤冦冢冩冪冫决冱冲冰况冽凅凉凛几處凩凭"],
["9980","凰凵凾刄刋刔刎刧刪刮刳刹剏剄剋剌剞剔剪剴剩剳剿剽劍劔劒剱劈劑辨辧劬劭劼劵勁勍勗勞勣勦飭勠勳勵勸勹匆匈甸匍匐匏匕匚匣匯匱匳匸區卆卅丗卉卍凖卞卩卮夘卻卷厂厖厠厦厥厮厰厶參簒雙叟曼燮叮叨叭叺吁吽呀听吭吼吮吶吩吝呎咏呵咎呟呱呷呰咒呻咀呶咄咐咆哇咢咸咥咬哄哈咨"],
["9a40","咫哂咤咾咼哘哥哦唏唔哽哮哭哺哢唹啀啣啌售啜啅啖啗唸唳啝喙喀咯喊喟啻啾喘喞單啼喃喩喇喨嗚嗅嗟嗄嗜嗤嗔嘔嗷嘖嗾嗽嘛嗹噎噐營嘴嘶嘲嘸"],
["9a80","噫噤嘯噬噪嚆嚀嚊嚠嚔嚏嚥嚮嚶嚴囂嚼囁囃囀囈囎囑囓囗囮囹圀囿圄圉圈國圍圓團圖嗇圜圦圷圸坎圻址坏坩埀垈坡坿垉垓垠垳垤垪垰埃埆埔埒埓堊埖埣堋堙堝塲堡塢塋塰毀塒堽塹墅墹墟墫墺壞墻墸墮壅壓壑壗壙壘壥壜壤壟壯壺壹壻壼壽夂夊夐夛梦夥夬夭夲夸夾竒奕奐奎奚奘奢奠奧奬奩"],
["9b40","奸妁妝佞侫妣妲姆姨姜妍姙姚娥娟娑娜娉娚婀婬婉娵娶婢婪媚媼媾嫋嫂媽嫣嫗嫦嫩嫖嫺嫻嬌嬋嬖嬲嫐嬪嬶嬾孃孅孀孑孕孚孛孥孩孰孳孵學斈孺宀"],
["9b80","它宦宸寃寇寉寔寐寤實寢寞寥寫寰寶寳尅將專對尓尠尢尨尸尹屁屆屎屓屐屏孱屬屮乢屶屹岌岑岔妛岫岻岶岼岷峅岾峇峙峩峽峺峭嶌峪崋崕崗嵜崟崛崑崔崢崚崙崘嵌嵒嵎嵋嵬嵳嵶嶇嶄嶂嶢嶝嶬嶮嶽嶐嶷嶼巉巍巓巒巖巛巫已巵帋帚帙帑帛帶帷幄幃幀幎幗幔幟幢幤幇幵并幺麼广庠廁廂廈廐廏"],
["9c40","廖廣廝廚廛廢廡廨廩廬廱廳廰廴廸廾弃弉彝彜弋弑弖弩弭弸彁彈彌彎弯彑彖彗彙彡彭彳彷徃徂彿徊很徑徇從徙徘徠徨徭徼忖忻忤忸忱忝悳忿怡恠"],
["9c80","怙怐怩怎怱怛怕怫怦怏怺恚恁恪恷恟恊恆恍恣恃恤恂恬恫恙悁悍惧悃悚悄悛悖悗悒悧悋惡悸惠惓悴忰悽惆悵惘慍愕愆惶惷愀惴惺愃愡惻惱愍愎慇愾愨愧慊愿愼愬愴愽慂慄慳慷慘慙慚慫慴慯慥慱慟慝慓慵憙憖憇憬憔憚憊憑憫憮懌懊應懷懈懃懆憺懋罹懍懦懣懶懺懴懿懽懼懾戀戈戉戍戌戔戛"],
["9d40","戞戡截戮戰戲戳扁扎扞扣扛扠扨扼抂抉找抒抓抖拔抃抔拗拑抻拏拿拆擔拈拜拌拊拂拇抛拉挌拮拱挧挂挈拯拵捐挾捍搜捏掖掎掀掫捶掣掏掉掟掵捫"],
["9d80","捩掾揩揀揆揣揉插揶揄搖搴搆搓搦搶攝搗搨搏摧摯摶摎攪撕撓撥撩撈撼據擒擅擇撻擘擂擱擧舉擠擡抬擣擯攬擶擴擲擺攀擽攘攜攅攤攣攫攴攵攷收攸畋效敖敕敍敘敞敝敲數斂斃變斛斟斫斷旃旆旁旄旌旒旛旙无旡旱杲昊昃旻杳昵昶昴昜晏晄晉晁晞晝晤晧晨晟晢晰暃暈暎暉暄暘暝曁暹曉暾暼"],
["9e40","曄暸曖曚曠昿曦曩曰曵曷朏朖朞朦朧霸朮朿朶杁朸朷杆杞杠杙杣杤枉杰枩杼杪枌枋枦枡枅枷柯枴柬枳柩枸柤柞柝柢柮枹柎柆柧檜栞框栩桀桍栲桎"],
["9e80","梳栫桙档桷桿梟梏梭梔條梛梃檮梹桴梵梠梺椏梍桾椁棊椈棘椢椦棡椌棍棔棧棕椶椒椄棗棣椥棹棠棯椨椪椚椣椡棆楹楷楜楸楫楔楾楮椹楴椽楙椰楡楞楝榁楪榲榮槐榿槁槓榾槎寨槊槝榻槃榧樮榑榠榜榕榴槞槨樂樛槿權槹槲槧樅榱樞槭樔槫樊樒櫁樣樓橄樌橲樶橸橇橢橙橦橈樸樢檐檍檠檄檢檣"],
["9f40","檗蘗檻櫃櫂檸檳檬櫞櫑櫟檪櫚櫪櫻欅蘖櫺欒欖鬱欟欸欷盜欹飮歇歃歉歐歙歔歛歟歡歸歹歿殀殄殃殍殘殕殞殤殪殫殯殲殱殳殷殼毆毋毓毟毬毫毳毯"],
["9f80","麾氈氓气氛氤氣汞汕汢汪沂沍沚沁沛汾汨汳沒沐泄泱泓沽泗泅泝沮沱沾沺泛泯泙泪洟衍洶洫洽洸洙洵洳洒洌浣涓浤浚浹浙涎涕濤涅淹渕渊涵淇淦涸淆淬淞淌淨淒淅淺淙淤淕淪淮渭湮渮渙湲湟渾渣湫渫湶湍渟湃渺湎渤滿渝游溂溪溘滉溷滓溽溯滄溲滔滕溏溥滂溟潁漑灌滬滸滾漿滲漱滯漲滌"],
["e040","漾漓滷澆潺潸澁澀潯潛濳潭澂潼潘澎澑濂潦澳澣澡澤澹濆澪濟濕濬濔濘濱濮濛瀉瀋濺瀑瀁瀏濾瀛瀚潴瀝瀘瀟瀰瀾瀲灑灣炙炒炯烱炬炸炳炮烟烋烝"],
["e080","烙焉烽焜焙煥煕熈煦煢煌煖煬熏燻熄熕熨熬燗熹熾燒燉燔燎燠燬燧燵燼燹燿爍爐爛爨爭爬爰爲爻爼爿牀牆牋牘牴牾犂犁犇犒犖犢犧犹犲狃狆狄狎狒狢狠狡狹狷倏猗猊猜猖猝猴猯猩猥猾獎獏默獗獪獨獰獸獵獻獺珈玳珎玻珀珥珮珞璢琅瑯琥珸琲琺瑕琿瑟瑙瑁瑜瑩瑰瑣瑪瑶瑾璋璞璧瓊瓏瓔珱"],
["e140","瓠瓣瓧瓩瓮瓲瓰瓱瓸瓷甄甃甅甌甎甍甕甓甞甦甬甼畄畍畊畉畛畆畚畩畤畧畫畭畸當疆疇畴疊疉疂疔疚疝疥疣痂疳痃疵疽疸疼疱痍痊痒痙痣痞痾痿"],
["e180","痼瘁痰痺痲痳瘋瘍瘉瘟瘧瘠瘡瘢瘤瘴瘰瘻癇癈癆癜癘癡癢癨癩癪癧癬癰癲癶癸發皀皃皈皋皎皖皓皙皚皰皴皸皹皺盂盍盖盒盞盡盥盧盪蘯盻眈眇眄眩眤眞眥眦眛眷眸睇睚睨睫睛睥睿睾睹瞎瞋瞑瞠瞞瞰瞶瞹瞿瞼瞽瞻矇矍矗矚矜矣矮矼砌砒礦砠礪硅碎硴碆硼碚碌碣碵碪碯磑磆磋磔碾碼磅磊磬"],
["e240","磧磚磽磴礇礒礑礙礬礫祀祠祗祟祚祕祓祺祿禊禝禧齋禪禮禳禹禺秉秕秧秬秡秣稈稍稘稙稠稟禀稱稻稾稷穃穗穉穡穢穩龝穰穹穽窈窗窕窘窖窩竈窰"],
["e280","窶竅竄窿邃竇竊竍竏竕竓站竚竝竡竢竦竭竰笂笏笊笆笳笘笙笞笵笨笶筐筺笄筍笋筌筅筵筥筴筧筰筱筬筮箝箘箟箍箜箚箋箒箏筝箙篋篁篌篏箴篆篝篩簑簔篦篥籠簀簇簓篳篷簗簍篶簣簧簪簟簷簫簽籌籃籔籏籀籐籘籟籤籖籥籬籵粃粐粤粭粢粫粡粨粳粲粱粮粹粽糀糅糂糘糒糜糢鬻糯糲糴糶糺紆"],
["e340","紂紜紕紊絅絋紮紲紿紵絆絳絖絎絲絨絮絏絣經綉絛綏絽綛綺綮綣綵緇綽綫總綢綯緜綸綟綰緘緝緤緞緻緲緡縅縊縣縡縒縱縟縉縋縢繆繦縻縵縹繃縷"],
["e380","縲縺繧繝繖繞繙繚繹繪繩繼繻纃緕繽辮繿纈纉續纒纐纓纔纖纎纛纜缸缺罅罌罍罎罐网罕罔罘罟罠罨罩罧罸羂羆羃羈羇羌羔羞羝羚羣羯羲羹羮羶羸譱翅翆翊翕翔翡翦翩翳翹飜耆耄耋耒耘耙耜耡耨耿耻聊聆聒聘聚聟聢聨聳聲聰聶聹聽聿肄肆肅肛肓肚肭冐肬胛胥胙胝胄胚胖脉胯胱脛脩脣脯腋"],
["e440","隋腆脾腓腑胼腱腮腥腦腴膃膈膊膀膂膠膕膤膣腟膓膩膰膵膾膸膽臀臂膺臉臍臑臙臘臈臚臟臠臧臺臻臾舁舂舅與舊舍舐舖舩舫舸舳艀艙艘艝艚艟艤"],
["e480","艢艨艪艫舮艱艷艸艾芍芒芫芟芻芬苡苣苟苒苴苳苺莓范苻苹苞茆苜茉苙茵茴茖茲茱荀茹荐荅茯茫茗茘莅莚莪莟莢莖茣莎莇莊荼莵荳荵莠莉莨菴萓菫菎菽萃菘萋菁菷萇菠菲萍萢萠莽萸蔆菻葭萪萼蕚蒄葷葫蒭葮蒂葩葆萬葯葹萵蓊葢蒹蒿蒟蓙蓍蒻蓚蓐蓁蓆蓖蒡蔡蓿蓴蔗蔘蔬蔟蔕蔔蓼蕀蕣蕘蕈"],
["e540","蕁蘂蕋蕕薀薤薈薑薊薨蕭薔薛藪薇薜蕷蕾薐藉薺藏薹藐藕藝藥藜藹蘊蘓蘋藾藺蘆蘢蘚蘰蘿虍乕虔號虧虱蚓蚣蚩蚪蚋蚌蚶蚯蛄蛆蚰蛉蠣蚫蛔蛞蛩蛬"],
["e580","蛟蛛蛯蜒蜆蜈蜀蜃蛻蜑蜉蜍蛹蜊蜴蜿蜷蜻蜥蜩蜚蝠蝟蝸蝌蝎蝴蝗蝨蝮蝙蝓蝣蝪蠅螢螟螂螯蟋螽蟀蟐雖螫蟄螳蟇蟆螻蟯蟲蟠蠏蠍蟾蟶蟷蠎蟒蠑蠖蠕蠢蠡蠱蠶蠹蠧蠻衄衂衒衙衞衢衫袁衾袞衵衽袵衲袂袗袒袮袙袢袍袤袰袿袱裃裄裔裘裙裝裹褂裼裴裨裲褄褌褊褓襃褞褥褪褫襁襄褻褶褸襌褝襠襞"],
["e640","襦襤襭襪襯襴襷襾覃覈覊覓覘覡覩覦覬覯覲覺覽覿觀觚觜觝觧觴觸訃訖訐訌訛訝訥訶詁詛詒詆詈詼詭詬詢誅誂誄誨誡誑誥誦誚誣諄諍諂諚諫諳諧"],
["e680","諤諱謔諠諢諷諞諛謌謇謚諡謖謐謗謠謳鞫謦謫謾謨譁譌譏譎證譖譛譚譫譟譬譯譴譽讀讌讎讒讓讖讙讚谺豁谿豈豌豎豐豕豢豬豸豺貂貉貅貊貍貎貔豼貘戝貭貪貽貲貳貮貶賈賁賤賣賚賽賺賻贄贅贊贇贏贍贐齎贓賍贔贖赧赭赱赳趁趙跂趾趺跏跚跖跌跛跋跪跫跟跣跼踈踉跿踝踞踐踟蹂踵踰踴蹊"],
["e740","蹇蹉蹌蹐蹈蹙蹤蹠踪蹣蹕蹶蹲蹼躁躇躅躄躋躊躓躑躔躙躪躡躬躰軆躱躾軅軈軋軛軣軼軻軫軾輊輅輕輒輙輓輜輟輛輌輦輳輻輹轅轂輾轌轉轆轎轗轜"],
["e780","轢轣轤辜辟辣辭辯辷迚迥迢迪迯邇迴逅迹迺逑逕逡逍逞逖逋逧逶逵逹迸遏遐遑遒逎遉逾遖遘遞遨遯遶隨遲邂遽邁邀邊邉邏邨邯邱邵郢郤扈郛鄂鄒鄙鄲鄰酊酖酘酣酥酩酳酲醋醉醂醢醫醯醪醵醴醺釀釁釉釋釐釖釟釡釛釼釵釶鈞釿鈔鈬鈕鈑鉞鉗鉅鉉鉤鉈銕鈿鉋鉐銜銖銓銛鉚鋏銹銷鋩錏鋺鍄錮"],
["e840","錙錢錚錣錺錵錻鍜鍠鍼鍮鍖鎰鎬鎭鎔鎹鏖鏗鏨鏥鏘鏃鏝鏐鏈鏤鐚鐔鐓鐃鐇鐐鐶鐫鐵鐡鐺鑁鑒鑄鑛鑠鑢鑞鑪鈩鑰鑵鑷鑽鑚鑼鑾钁鑿閂閇閊閔閖閘閙"],
["e880","閠閨閧閭閼閻閹閾闊濶闃闍闌闕闔闖關闡闥闢阡阨阮阯陂陌陏陋陷陜陞陝陟陦陲陬隍隘隕隗險隧隱隲隰隴隶隸隹雎雋雉雍襍雜霍雕雹霄霆霈霓霎霑霏霖霙霤霪霰霹霽霾靄靆靈靂靉靜靠靤靦靨勒靫靱靹鞅靼鞁靺鞆鞋鞏鞐鞜鞨鞦鞣鞳鞴韃韆韈韋韜韭齏韲竟韶韵頏頌頸頤頡頷頽顆顏顋顫顯顰"],
["e940","顱顴顳颪颯颱颶飄飃飆飩飫餃餉餒餔餘餡餝餞餤餠餬餮餽餾饂饉饅饐饋饑饒饌饕馗馘馥馭馮馼駟駛駝駘駑駭駮駱駲駻駸騁騏騅駢騙騫騷驅驂驀驃"],
["e980","騾驕驍驛驗驟驢驥驤驩驫驪骭骰骼髀髏髑髓體髞髟髢髣髦髯髫髮髴髱髷髻鬆鬘鬚鬟鬢鬣鬥鬧鬨鬩鬪鬮鬯鬲魄魃魏魍魎魑魘魴鮓鮃鮑鮖鮗鮟鮠鮨鮴鯀鯊鮹鯆鯏鯑鯒鯣鯢鯤鯔鯡鰺鯲鯱鯰鰕鰔鰉鰓鰌鰆鰈鰒鰊鰄鰮鰛鰥鰤鰡鰰鱇鰲鱆鰾鱚鱠鱧鱶鱸鳧鳬鳰鴉鴈鳫鴃鴆鴪鴦鶯鴣鴟鵄鴕鴒鵁鴿鴾鵆鵈"],
["ea40","鵝鵞鵤鵑鵐鵙鵲鶉鶇鶫鵯鵺鶚鶤鶩鶲鷄鷁鶻鶸鶺鷆鷏鷂鷙鷓鷸鷦鷭鷯鷽鸚鸛鸞鹵鹹鹽麁麈麋麌麒麕麑麝麥麩麸麪麭靡黌黎黏黐黔黜點黝黠黥黨黯"],
["ea80","黴黶黷黹黻黼黽鼇鼈皷鼕鼡鼬鼾齊齒齔齣齟齠齡齦齧齬齪齷齲齶龕龜龠堯槇遙瑤凜熙"],
["ed40","纊褜鍈銈蓜俉炻昱棈鋹曻彅丨仡仼伀伃伹佖侒侊侚侔俍偀倢俿倞偆偰偂傔僴僘兊兤冝冾凬刕劜劦勀勛匀匇匤卲厓厲叝﨎咜咊咩哿喆坙坥垬埈埇﨏"],
["ed80","塚增墲夋奓奛奝奣妤妺孖寀甯寘寬尞岦岺峵崧嵓﨑嵂嵭嶸嶹巐弡弴彧德忞恝悅悊惞惕愠惲愑愷愰憘戓抦揵摠撝擎敎昀昕昻昉昮昞昤晥晗晙晴晳暙暠暲暿曺朎朗杦枻桒柀栁桄棏﨓楨﨔榘槢樰橫橆橳橾櫢櫤毖氿汜沆汯泚洄涇浯涖涬淏淸淲淼渹湜渧渼溿澈澵濵瀅瀇瀨炅炫焏焄煜煆煇凞燁燾犱"],
["ee40","犾猤猪獷玽珉珖珣珒琇珵琦琪琩琮瑢璉璟甁畯皂皜皞皛皦益睆劯砡硎硤硺礰礼神祥禔福禛竑竧靖竫箞精絈絜綷綠緖繒罇羡羽茁荢荿菇菶葈蒴蕓蕙"],
["ee80","蕫﨟薰蘒﨡蠇裵訒訷詹誧誾諟諸諶譓譿賰賴贒赶﨣軏﨤逸遧郞都鄕鄧釚釗釞釭釮釤釥鈆鈐鈊鈺鉀鈼鉎鉙鉑鈹鉧銧鉷鉸鋧鋗鋙鋐﨧鋕鋠鋓錥錡鋻﨨錞鋿錝錂鍰鍗鎤鏆鏞鏸鐱鑅鑈閒隆﨩隝隯霳霻靃靍靏靑靕顗顥飯飼餧館馞驎髙髜魵魲鮏鮱鮻鰀鵰鵫鶴鸙黑"],
["eeef","ⅰ",9,"￢￤＇＂"],
["f040","",62],
["f080","",124],
["f140","",62],
["f180","",124],
["f240","",62],
["f280","",124],
["f340","",62],
["f380","",124],
["f440","",62],
["f480","",124],
["f540","",62],
["f580","",124],
["f640","",62],
["f680","",124],
["f740","",62],
["f780","",124],
["f840","",62],
["f880","",124],
["f940",""],
["fa40","ⅰ",9,"Ⅰ",9,"￢￤＇＂㈱№℡∵纊褜鍈銈蓜俉炻昱棈鋹曻彅丨仡仼伀伃伹佖侒侊侚侔俍偀倢俿倞偆偰偂傔僴僘兊"],
["fa80","兤冝冾凬刕劜劦勀勛匀匇匤卲厓厲叝﨎咜咊咩哿喆坙坥垬埈埇﨏塚增墲夋奓奛奝奣妤妺孖寀甯寘寬尞岦岺峵崧嵓﨑嵂嵭嶸嶹巐弡弴彧德忞恝悅悊惞惕愠惲愑愷愰憘戓抦揵摠撝擎敎昀昕昻昉昮昞昤晥晗晙晴晳暙暠暲暿曺朎朗杦枻桒柀栁桄棏﨓楨﨔榘槢樰橫橆橳橾櫢櫤毖氿汜沆汯泚洄涇浯"],
["fb40","涖涬淏淸淲淼渹湜渧渼溿澈澵濵瀅瀇瀨炅炫焏焄煜煆煇凞燁燾犱犾猤猪獷玽珉珖珣珒琇珵琦琪琩琮瑢璉璟甁畯皂皜皞皛皦益睆劯砡硎硤硺礰礼神"],
["fb80","祥禔福禛竑竧靖竫箞精絈絜綷綠緖繒罇羡羽茁荢荿菇菶葈蒴蕓蕙蕫﨟薰蘒﨡蠇裵訒訷詹誧誾諟諸諶譓譿賰賴贒赶﨣軏﨤逸遧郞都鄕鄧釚釗釞釭釮釤釥鈆鈐鈊鈺鉀鈼鉎鉙鉑鈹鉧銧鉷鉸鋧鋗鋙鋐﨧鋕鋠鋓錥錡鋻﨨錞鋿錝錂鍰鍗鎤鏆鏞鏸鐱鑅鑈閒隆﨩隝隯霳霻靃靍靏靑靕顗顥飯飼餧館馞驎髙"],
["fc40","髜魵魲鮏鮱鮻鰀鵰鵫鶴鸙黑"]
]

},{}],39:[function(require,module,exports){
"use strict";
var Buffer = require("safer-buffer").Buffer;

// Note: UTF16-LE (or UCS2) codec is Node.js native. See encodings/internal.js

// == UTF16-BE codec. ==========================================================

exports.utf16be = Utf16BECodec;
function Utf16BECodec() {
}

Utf16BECodec.prototype.encoder = Utf16BEEncoder;
Utf16BECodec.prototype.decoder = Utf16BEDecoder;
Utf16BECodec.prototype.bomAware = true;


// -- Encoding

function Utf16BEEncoder() {
}

Utf16BEEncoder.prototype.write = function(str) {
    var buf = Buffer.from(str, 'ucs2');
    for (var i = 0; i < buf.length; i += 2) {
        var tmp = buf[i]; buf[i] = buf[i+1]; buf[i+1] = tmp;
    }
    return buf;
}

Utf16BEEncoder.prototype.end = function() {
}


// -- Decoding

function Utf16BEDecoder() {
    this.overflowByte = -1;
}

Utf16BEDecoder.prototype.write = function(buf) {
    if (buf.length == 0)
        return '';

    var buf2 = Buffer.alloc(buf.length + 1),
        i = 0, j = 0;

    if (this.overflowByte !== -1) {
        buf2[0] = buf[0];
        buf2[1] = this.overflowByte;
        i = 1; j = 2;
    }

    for (; i < buf.length-1; i += 2, j+= 2) {
        buf2[j] = buf[i+1];
        buf2[j+1] = buf[i];
    }

    this.overflowByte = (i == buf.length-1) ? buf[buf.length-1] : -1;

    return buf2.slice(0, j).toString('ucs2');
}

Utf16BEDecoder.prototype.end = function() {
    this.overflowByte = -1;
}


// == UTF-16 codec =============================================================
// Decoder chooses automatically from UTF-16LE and UTF-16BE using BOM and space-based heuristic.
// Defaults to UTF-16LE, as it's prevalent and default in Node.
// http://en.wikipedia.org/wiki/UTF-16 and http://encoding.spec.whatwg.org/#utf-16le
// Decoder default can be changed: iconv.decode(buf, 'utf16', {defaultEncoding: 'utf-16be'});

// Encoder uses UTF-16LE and prepends BOM (which can be overridden with addBOM: false).

exports.utf16 = Utf16Codec;
function Utf16Codec(codecOptions, iconv) {
    this.iconv = iconv;
}

Utf16Codec.prototype.encoder = Utf16Encoder;
Utf16Codec.prototype.decoder = Utf16Decoder;


// -- Encoding (pass-through)

function Utf16Encoder(options, codec) {
    options = options || {};
    if (options.addBOM === undefined)
        options.addBOM = true;
    this.encoder = codec.iconv.getEncoder('utf-16le', options);
}

Utf16Encoder.prototype.write = function(str) {
    return this.encoder.write(str);
}

Utf16Encoder.prototype.end = function() {
    return this.encoder.end();
}


// -- Decoding

function Utf16Decoder(options, codec) {
    this.decoder = null;
    this.initialBufs = [];
    this.initialBufsLen = 0;

    this.options = options || {};
    this.iconv = codec.iconv;
}

Utf16Decoder.prototype.write = function(buf) {
    if (!this.decoder) {
        // Codec is not chosen yet. Accumulate initial bytes.
        this.initialBufs.push(buf);
        this.initialBufsLen += buf.length;
        
        if (this.initialBufsLen < 16) // We need more bytes to use space heuristic (see below)
            return '';

        // We have enough bytes -> detect endianness.
        var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
        this.decoder = this.iconv.getDecoder(encoding, this.options);

        var resStr = '';
        for (var i = 0; i < this.initialBufs.length; i++)
            resStr += this.decoder.write(this.initialBufs[i]);

        this.initialBufs.length = this.initialBufsLen = 0;
        return resStr;
    }

    return this.decoder.write(buf);
}

Utf16Decoder.prototype.end = function() {
    if (!this.decoder) {
        var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
        this.decoder = this.iconv.getDecoder(encoding, this.options);

        var resStr = '';
        for (var i = 0; i < this.initialBufs.length; i++)
            resStr += this.decoder.write(this.initialBufs[i]);

        var trail = this.decoder.end();
        if (trail)
            resStr += trail;

        this.initialBufs.length = this.initialBufsLen = 0;
        return resStr;
    }
    return this.decoder.end();
}

function detectEncoding(bufs, defaultEncoding) {
    var b = [];
    var charsProcessed = 0;
    var asciiCharsLE = 0, asciiCharsBE = 0; // Number of ASCII chars when decoded as LE or BE.

    outer_loop:
    for (var i = 0; i < bufs.length; i++) {
        var buf = bufs[i];
        for (var j = 0; j < buf.length; j++) {
            b.push(buf[j]);
            if (b.length === 2) {
                if (charsProcessed === 0) {
                    // Check BOM first.
                    if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
                    if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
                }

                if (b[0] === 0 && b[1] !== 0) asciiCharsBE++;
                if (b[0] !== 0 && b[1] === 0) asciiCharsLE++;

                b.length = 0;
                charsProcessed++;

                if (charsProcessed >= 100) {
                    break outer_loop;
                }
            }
        }
    }

    // Make decisions.
    // Most of the time, the content has ASCII chars (U+00**), but the opposite (U+**00) is uncommon.
    // So, we count ASCII as if it was LE or BE, and decide from that.
    if (asciiCharsBE > asciiCharsLE) return 'utf-16be';
    if (asciiCharsBE < asciiCharsLE) return 'utf-16le';

    // Couldn't decide (likely all zeros or not enough data).
    return defaultEncoding || 'utf-16le';
}



},{"safer-buffer":60}],40:[function(require,module,exports){
'use strict';

var Buffer = require('safer-buffer').Buffer;

// == UTF32-LE/BE codec. ==========================================================

exports._utf32 = Utf32Codec;

function Utf32Codec(codecOptions, iconv) {
    this.iconv = iconv;
    this.bomAware = true;
    this.isLE = codecOptions.isLE;
}

exports.utf32le = { type: '_utf32', isLE: true };
exports.utf32be = { type: '_utf32', isLE: false };

// Aliases
exports.ucs4le = 'utf32le';
exports.ucs4be = 'utf32be';

Utf32Codec.prototype.encoder = Utf32Encoder;
Utf32Codec.prototype.decoder = Utf32Decoder;

// -- Encoding

function Utf32Encoder(options, codec) {
    this.isLE = codec.isLE;
    this.highSurrogate = 0;
}

Utf32Encoder.prototype.write = function(str) {
    var src = Buffer.from(str, 'ucs2');
    var dst = Buffer.alloc(src.length * 2);
    var write32 = this.isLE ? dst.writeUInt32LE : dst.writeUInt32BE;
    var offset = 0;

    for (var i = 0; i < src.length; i += 2) {
        var code = src.readUInt16LE(i);
        var isHighSurrogate = (0xD800 <= code && code < 0xDC00);
        var isLowSurrogate = (0xDC00 <= code && code < 0xE000);

        if (this.highSurrogate) {
            if (isHighSurrogate || !isLowSurrogate) {
                // There shouldn't be two high surrogates in a row, nor a high surrogate which isn't followed by a low
                // surrogate. If this happens, keep the pending high surrogate as a stand-alone semi-invalid character
                // (technically wrong, but expected by some applications, like Windows file names).
                write32.call(dst, this.highSurrogate, offset);
                offset += 4;
            }
            else {
                // Create 32-bit value from high and low surrogates;
                var codepoint = (((this.highSurrogate - 0xD800) << 10) | (code - 0xDC00)) + 0x10000;

                write32.call(dst, codepoint, offset);
                offset += 4;
                this.highSurrogate = 0;

                continue;
            }
        }

        if (isHighSurrogate)
            this.highSurrogate = code;
        else {
            // Even if the current character is a low surrogate, with no previous high surrogate, we'll
            // encode it as a semi-invalid stand-alone character for the same reasons expressed above for
            // unpaired high surrogates.
            write32.call(dst, code, offset);
            offset += 4;
            this.highSurrogate = 0;
        }
    }

    if (offset < dst.length)
        dst = dst.slice(0, offset);

    return dst;
};

Utf32Encoder.prototype.end = function() {
    // Treat any leftover high surrogate as a semi-valid independent character.
    if (!this.highSurrogate)
        return;

    var buf = Buffer.alloc(4);

    if (this.isLE)
        buf.writeUInt32LE(this.highSurrogate, 0);
    else
        buf.writeUInt32BE(this.highSurrogate, 0);

    this.highSurrogate = 0;

    return buf;
};

// -- Decoding

function Utf32Decoder(options, codec) {
    this.isLE = codec.isLE;
    this.badChar = codec.iconv.defaultCharUnicode.charCodeAt(0);
    this.overflow = [];
}

Utf32Decoder.prototype.write = function(src) {
    if (src.length === 0)
        return '';

    var i = 0;
    var codepoint = 0;
    var dst = Buffer.alloc(src.length + 4);
    var offset = 0;
    var isLE = this.isLE;
    var overflow = this.overflow;
    var badChar = this.badChar;

    if (overflow.length > 0) {
        for (; i < src.length && overflow.length < 4; i++)
            overflow.push(src[i]);
        
        if (overflow.length === 4) {
            // NOTE: codepoint is a signed int32 and can be negative.
            // NOTE: We copied this block from below to help V8 optimize it (it works with array, not buffer).
            if (isLE) {
                codepoint = overflow[i] | (overflow[i+1] << 8) | (overflow[i+2] << 16) | (overflow[i+3] << 24);
            } else {
                codepoint = overflow[i+3] | (overflow[i+2] << 8) | (overflow[i+1] << 16) | (overflow[i] << 24);
            }
            overflow.length = 0;

            offset = _writeCodepoint(dst, offset, codepoint, badChar);
        }
    }

    // Main loop. Should be as optimized as possible.
    for (; i < src.length - 3; i += 4) {
        // NOTE: codepoint is a signed int32 and can be negative.
        if (isLE) {
            codepoint = src[i] | (src[i+1] << 8) | (src[i+2] << 16) | (src[i+3] << 24);
        } else {
            codepoint = src[i+3] | (src[i+2] << 8) | (src[i+1] << 16) | (src[i] << 24);
        }
        offset = _writeCodepoint(dst, offset, codepoint, badChar);
    }

    // Keep overflowing bytes.
    for (; i < src.length; i++) {
        overflow.push(src[i]);
    }

    return dst.slice(0, offset).toString('ucs2');
};

function _writeCodepoint(dst, offset, codepoint, badChar) {
    // NOTE: codepoint is signed int32 and can be negative. We keep it that way to help V8 with optimizations.
    if (codepoint < 0 || codepoint > 0x10FFFF) {
        // Not a valid Unicode codepoint
        codepoint = badChar;
    } 

    // Ephemeral Planes: Write high surrogate.
    if (codepoint >= 0x10000) {
        codepoint -= 0x10000;

        var high = 0xD800 | (codepoint >> 10);
        dst[offset++] = high & 0xff;
        dst[offset++] = high >> 8;

        // Low surrogate is written below.
        var codepoint = 0xDC00 | (codepoint & 0x3FF);
    }

    // Write BMP char or low surrogate.
    dst[offset++] = codepoint & 0xff;
    dst[offset++] = codepoint >> 8;

    return offset;
};

Utf32Decoder.prototype.end = function() {
    this.overflow.length = 0;
};

// == UTF-32 Auto codec =============================================================
// Decoder chooses automatically from UTF-32LE and UTF-32BE using BOM and space-based heuristic.
// Defaults to UTF-32LE. http://en.wikipedia.org/wiki/UTF-32
// Encoder/decoder default can be changed: iconv.decode(buf, 'utf32', {defaultEncoding: 'utf-32be'});

// Encoder prepends BOM (which can be overridden with (addBOM: false}).

exports.utf32 = Utf32AutoCodec;
exports.ucs4 = 'utf32';

function Utf32AutoCodec(options, iconv) {
    this.iconv = iconv;
}

Utf32AutoCodec.prototype.encoder = Utf32AutoEncoder;
Utf32AutoCodec.prototype.decoder = Utf32AutoDecoder;

// -- Encoding

function Utf32AutoEncoder(options, codec) {
    options = options || {};

    if (options.addBOM === undefined)
        options.addBOM = true;

    this.encoder = codec.iconv.getEncoder(options.defaultEncoding || 'utf-32le', options);
}

Utf32AutoEncoder.prototype.write = function(str) {
    return this.encoder.write(str);
};

Utf32AutoEncoder.prototype.end = function() {
    return this.encoder.end();
};

// -- Decoding

function Utf32AutoDecoder(options, codec) {
    this.decoder = null;
    this.initialBufs = [];
    this.initialBufsLen = 0;
    this.options = options || {};
    this.iconv = codec.iconv;
}

Utf32AutoDecoder.prototype.write = function(buf) {
    if (!this.decoder) { 
        // Codec is not chosen yet. Accumulate initial bytes.
        this.initialBufs.push(buf);
        this.initialBufsLen += buf.length;

        if (this.initialBufsLen < 32) // We need more bytes to use space heuristic (see below)
            return '';

        // We have enough bytes -> detect endianness.
        var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
        this.decoder = this.iconv.getDecoder(encoding, this.options);

        var resStr = '';
        for (var i = 0; i < this.initialBufs.length; i++)
            resStr += this.decoder.write(this.initialBufs[i]);

        this.initialBufs.length = this.initialBufsLen = 0;
        return resStr;
    }

    return this.decoder.write(buf);
};

Utf32AutoDecoder.prototype.end = function() {
    if (!this.decoder) {
        var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
        this.decoder = this.iconv.getDecoder(encoding, this.options);

        var resStr = '';
        for (var i = 0; i < this.initialBufs.length; i++)
            resStr += this.decoder.write(this.initialBufs[i]);

        var trail = this.decoder.end();
        if (trail)
            resStr += trail;

        this.initialBufs.length = this.initialBufsLen = 0;
        return resStr;
    }

    return this.decoder.end();
};

function detectEncoding(bufs, defaultEncoding) {
    var b = [];
    var charsProcessed = 0;
    var invalidLE = 0, invalidBE = 0;   // Number of invalid chars when decoded as LE or BE.
    var bmpCharsLE = 0, bmpCharsBE = 0; // Number of BMP chars when decoded as LE or BE.

    outer_loop:
    for (var i = 0; i < bufs.length; i++) {
        var buf = bufs[i];
        for (var j = 0; j < buf.length; j++) {
            b.push(buf[j]);
            if (b.length === 4) {
                if (charsProcessed === 0) {
                    // Check BOM first.
                    if (b[0] === 0xFF && b[1] === 0xFE && b[2] === 0 && b[3] === 0) {
                        return 'utf-32le';
                    }
                    if (b[0] === 0 && b[1] === 0 && b[2] === 0xFE && b[3] === 0xFF) {
                        return 'utf-32be';
                    }
                }

                if (b[0] !== 0 || b[1] > 0x10) invalidBE++;
                if (b[3] !== 0 || b[2] > 0x10) invalidLE++;

                if (b[0] === 0 && b[1] === 0 && (b[2] !== 0 || b[3] !== 0)) bmpCharsBE++;
                if ((b[0] !== 0 || b[1] !== 0) && b[2] === 0 && b[3] === 0) bmpCharsLE++;

                b.length = 0;
                charsProcessed++;

                if (charsProcessed >= 100) {
                    break outer_loop;
                }
            }
        }
    }

    // Make decisions.
    if (bmpCharsBE - invalidBE > bmpCharsLE - invalidLE)  return 'utf-32be';
    if (bmpCharsBE - invalidBE < bmpCharsLE - invalidLE)  return 'utf-32le';

    // Couldn't decide (likely all zeros or not enough data).
    return defaultEncoding || 'utf-32le';
}

},{"safer-buffer":60}],41:[function(require,module,exports){
"use strict";
var Buffer = require("safer-buffer").Buffer;

// UTF-7 codec, according to https://tools.ietf.org/html/rfc2152
// See also below a UTF-7-IMAP codec, according to http://tools.ietf.org/html/rfc3501#section-5.1.3

exports.utf7 = Utf7Codec;
exports.unicode11utf7 = 'utf7'; // Alias UNICODE-1-1-UTF-7
function Utf7Codec(codecOptions, iconv) {
    this.iconv = iconv;
};

Utf7Codec.prototype.encoder = Utf7Encoder;
Utf7Codec.prototype.decoder = Utf7Decoder;
Utf7Codec.prototype.bomAware = true;


// -- Encoding

var nonDirectChars = /[^A-Za-z0-9'\(\),-\.\/:\? \n\r\t]+/g;

function Utf7Encoder(options, codec) {
    this.iconv = codec.iconv;
}

Utf7Encoder.prototype.write = function(str) {
    // Naive implementation.
    // Non-direct chars are encoded as "+<base64>-"; single "+" char is encoded as "+-".
    return Buffer.from(str.replace(nonDirectChars, function(chunk) {
        return "+" + (chunk === '+' ? '' : 
            this.iconv.encode(chunk, 'utf16-be').toString('base64').replace(/=+$/, '')) 
            + "-";
    }.bind(this)));
}

Utf7Encoder.prototype.end = function() {
}


// -- Decoding

function Utf7Decoder(options, codec) {
    this.iconv = codec.iconv;
    this.inBase64 = false;
    this.base64Accum = '';
}

var base64Regex = /[A-Za-z0-9\/+]/;
var base64Chars = [];
for (var i = 0; i < 256; i++)
    base64Chars[i] = base64Regex.test(String.fromCharCode(i));

var plusChar = '+'.charCodeAt(0), 
    minusChar = '-'.charCodeAt(0),
    andChar = '&'.charCodeAt(0);

Utf7Decoder.prototype.write = function(buf) {
    var res = "", lastI = 0,
        inBase64 = this.inBase64,
        base64Accum = this.base64Accum;

    // The decoder is more involved as we must handle chunks in stream.

    for (var i = 0; i < buf.length; i++) {
        if (!inBase64) { // We're in direct mode.
            // Write direct chars until '+'
            if (buf[i] == plusChar) {
                res += this.iconv.decode(buf.slice(lastI, i), "ascii"); // Write direct chars.
                lastI = i+1;
                inBase64 = true;
            }
        } else { // We decode base64.
            if (!base64Chars[buf[i]]) { // Base64 ended.
                if (i == lastI && buf[i] == minusChar) {// "+-" -> "+"
                    res += "+";
                } else {
                    var b64str = base64Accum + this.iconv.decode(buf.slice(lastI, i), "ascii");
                    res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
                }

                if (buf[i] != minusChar) // Minus is absorbed after base64.
                    i--;

                lastI = i+1;
                inBase64 = false;
                base64Accum = '';
            }
        }
    }

    if (!inBase64) {
        res += this.iconv.decode(buf.slice(lastI), "ascii"); // Write direct chars.
    } else {
        var b64str = base64Accum + this.iconv.decode(buf.slice(lastI), "ascii");

        var canBeDecoded = b64str.length - (b64str.length % 8); // Minimal chunk: 2 quads -> 2x3 bytes -> 3 chars.
        base64Accum = b64str.slice(canBeDecoded); // The rest will be decoded in future.
        b64str = b64str.slice(0, canBeDecoded);

        res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
    }

    this.inBase64 = inBase64;
    this.base64Accum = base64Accum;

    return res;
}

Utf7Decoder.prototype.end = function() {
    var res = "";
    if (this.inBase64 && this.base64Accum.length > 0)
        res = this.iconv.decode(Buffer.from(this.base64Accum, 'base64'), "utf16-be");

    this.inBase64 = false;
    this.base64Accum = '';
    return res;
}


// UTF-7-IMAP codec.
// RFC3501 Sec. 5.1.3 Modified UTF-7 (http://tools.ietf.org/html/rfc3501#section-5.1.3)
// Differences:
//  * Base64 part is started by "&" instead of "+"
//  * Direct characters are 0x20-0x7E, except "&" (0x26)
//  * In Base64, "," is used instead of "/"
//  * Base64 must not be used to represent direct characters.
//  * No implicit shift back from Base64 (should always end with '-')
//  * String must end in non-shifted position.
//  * "-&" while in base64 is not allowed.


exports.utf7imap = Utf7IMAPCodec;
function Utf7IMAPCodec(codecOptions, iconv) {
    this.iconv = iconv;
};

Utf7IMAPCodec.prototype.encoder = Utf7IMAPEncoder;
Utf7IMAPCodec.prototype.decoder = Utf7IMAPDecoder;
Utf7IMAPCodec.prototype.bomAware = true;


// -- Encoding

function Utf7IMAPEncoder(options, codec) {
    this.iconv = codec.iconv;
    this.inBase64 = false;
    this.base64Accum = Buffer.alloc(6);
    this.base64AccumIdx = 0;
}

Utf7IMAPEncoder.prototype.write = function(str) {
    var inBase64 = this.inBase64,
        base64Accum = this.base64Accum,
        base64AccumIdx = this.base64AccumIdx,
        buf = Buffer.alloc(str.length*5 + 10), bufIdx = 0;

    for (var i = 0; i < str.length; i++) {
        var uChar = str.charCodeAt(i);
        if (0x20 <= uChar && uChar <= 0x7E) { // Direct character or '&'.
            if (inBase64) {
                if (base64AccumIdx > 0) {
                    bufIdx += buf.write(base64Accum.slice(0, base64AccumIdx).toString('base64').replace(/\//g, ',').replace(/=+$/, ''), bufIdx);
                    base64AccumIdx = 0;
                }

                buf[bufIdx++] = minusChar; // Write '-', then go to direct mode.
                inBase64 = false;
            }

            if (!inBase64) {
                buf[bufIdx++] = uChar; // Write direct character

                if (uChar === andChar)  // Ampersand -> '&-'
                    buf[bufIdx++] = minusChar;
            }

        } else { // Non-direct character
            if (!inBase64) {
                buf[bufIdx++] = andChar; // Write '&', then go to base64 mode.
                inBase64 = true;
            }
            if (inBase64) {
                base64Accum[base64AccumIdx++] = uChar >> 8;
                base64Accum[base64AccumIdx++] = uChar & 0xFF;

                if (base64AccumIdx == base64Accum.length) {
                    bufIdx += buf.write(base64Accum.toString('base64').replace(/\//g, ','), bufIdx);
                    base64AccumIdx = 0;
                }
            }
        }
    }

    this.inBase64 = inBase64;
    this.base64AccumIdx = base64AccumIdx;

    return buf.slice(0, bufIdx);
}

Utf7IMAPEncoder.prototype.end = function() {
    var buf = Buffer.alloc(10), bufIdx = 0;
    if (this.inBase64) {
        if (this.base64AccumIdx > 0) {
            bufIdx += buf.write(this.base64Accum.slice(0, this.base64AccumIdx).toString('base64').replace(/\//g, ',').replace(/=+$/, ''), bufIdx);
            this.base64AccumIdx = 0;
        }

        buf[bufIdx++] = minusChar; // Write '-', then go to direct mode.
        this.inBase64 = false;
    }

    return buf.slice(0, bufIdx);
}


// -- Decoding

function Utf7IMAPDecoder(options, codec) {
    this.iconv = codec.iconv;
    this.inBase64 = false;
    this.base64Accum = '';
}

var base64IMAPChars = base64Chars.slice();
base64IMAPChars[','.charCodeAt(0)] = true;

Utf7IMAPDecoder.prototype.write = function(buf) {
    var res = "", lastI = 0,
        inBase64 = this.inBase64,
        base64Accum = this.base64Accum;

    // The decoder is more involved as we must handle chunks in stream.
    // It is forgiving, closer to standard UTF-7 (for example, '-' is optional at the end).

    for (var i = 0; i < buf.length; i++) {
        if (!inBase64) { // We're in direct mode.
            // Write direct chars until '&'
            if (buf[i] == andChar) {
                res += this.iconv.decode(buf.slice(lastI, i), "ascii"); // Write direct chars.
                lastI = i+1;
                inBase64 = true;
            }
        } else { // We decode base64.
            if (!base64IMAPChars[buf[i]]) { // Base64 ended.
                if (i == lastI && buf[i] == minusChar) { // "&-" -> "&"
                    res += "&";
                } else {
                    var b64str = base64Accum + this.iconv.decode(buf.slice(lastI, i), "ascii").replace(/,/g, '/');
                    res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
                }

                if (buf[i] != minusChar) // Minus may be absorbed after base64.
                    i--;

                lastI = i+1;
                inBase64 = false;
                base64Accum = '';
            }
        }
    }

    if (!inBase64) {
        res += this.iconv.decode(buf.slice(lastI), "ascii"); // Write direct chars.
    } else {
        var b64str = base64Accum + this.iconv.decode(buf.slice(lastI), "ascii").replace(/,/g, '/');

        var canBeDecoded = b64str.length - (b64str.length % 8); // Minimal chunk: 2 quads -> 2x3 bytes -> 3 chars.
        base64Accum = b64str.slice(canBeDecoded); // The rest will be decoded in future.
        b64str = b64str.slice(0, canBeDecoded);

        res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
    }

    this.inBase64 = inBase64;
    this.base64Accum = base64Accum;

    return res;
}

Utf7IMAPDecoder.prototype.end = function() {
    var res = "";
    if (this.inBase64 && this.base64Accum.length > 0)
        res = this.iconv.decode(Buffer.from(this.base64Accum, 'base64'), "utf16-be");

    this.inBase64 = false;
    this.base64Accum = '';
    return res;
}



},{"safer-buffer":60}],42:[function(require,module,exports){
"use strict";

var BOMChar = '\uFEFF';

exports.PrependBOM = PrependBOMWrapper
function PrependBOMWrapper(encoder, options) {
    this.encoder = encoder;
    this.addBOM = true;
}

PrependBOMWrapper.prototype.write = function(str) {
    if (this.addBOM) {
        str = BOMChar + str;
        this.addBOM = false;
    }

    return this.encoder.write(str);
}

PrependBOMWrapper.prototype.end = function() {
    return this.encoder.end();
}


//------------------------------------------------------------------------------

exports.StripBOM = StripBOMWrapper;
function StripBOMWrapper(decoder, options) {
    this.decoder = decoder;
    this.pass = false;
    this.options = options || {};
}

StripBOMWrapper.prototype.write = function(buf) {
    var res = this.decoder.write(buf);
    if (this.pass || !res)
        return res;

    if (res[0] === BOMChar) {
        res = res.slice(1);
        if (typeof this.options.stripBOM === 'function')
            this.options.stripBOM();
    }

    this.pass = true;
    return res;
}

StripBOMWrapper.prototype.end = function() {
    return this.decoder.end();
}


},{}],43:[function(require,module,exports){
"use strict";

var Buffer = require("safer-buffer").Buffer;

// NOTE: Due to 'stream' module being pretty large (~100Kb, significant in browser environments), 
// we opt to dependency-inject it instead of creating a hard dependency.
module.exports = function(stream_module) {
    var Transform = stream_module.Transform;

    // == Encoder stream =======================================================

    function IconvLiteEncoderStream(conv, options) {
        this.conv = conv;
        options = options || {};
        options.decodeStrings = false; // We accept only strings, so we don't need to decode them.
        Transform.call(this, options);
    }

    IconvLiteEncoderStream.prototype = Object.create(Transform.prototype, {
        constructor: { value: IconvLiteEncoderStream }
    });

    IconvLiteEncoderStream.prototype._transform = function(chunk, encoding, done) {
        if (typeof chunk != 'string')
            return done(new Error("Iconv encoding stream needs strings as its input."));
        try {
            var res = this.conv.write(chunk);
            if (res && res.length) this.push(res);
            done();
        }
        catch (e) {
            done(e);
        }
    }

    IconvLiteEncoderStream.prototype._flush = function(done) {
        try {
            var res = this.conv.end();
            if (res && res.length) this.push(res);
            done();
        }
        catch (e) {
            done(e);
        }
    }

    IconvLiteEncoderStream.prototype.collect = function(cb) {
        var chunks = [];
        this.on('error', cb);
        this.on('data', function(chunk) { chunks.push(chunk); });
        this.on('end', function() {
            cb(null, Buffer.concat(chunks));
        });
        return this;
    }


    // == Decoder stream =======================================================

    function IconvLiteDecoderStream(conv, options) {
        this.conv = conv;
        options = options || {};
        options.encoding = this.encoding = 'utf8'; // We output strings.
        Transform.call(this, options);
    }

    IconvLiteDecoderStream.prototype = Object.create(Transform.prototype, {
        constructor: { value: IconvLiteDecoderStream }
    });

    IconvLiteDecoderStream.prototype._transform = function(chunk, encoding, done) {
        if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array))
            return done(new Error("Iconv decoding stream needs buffers as its input."));
        try {
            var res = this.conv.write(chunk);
            if (res && res.length) this.push(res, this.encoding);
            done();
        }
        catch (e) {
            done(e);
        }
    }

    IconvLiteDecoderStream.prototype._flush = function(done) {
        try {
            var res = this.conv.end();
            if (res && res.length) this.push(res, this.encoding);                
            done();
        }
        catch (e) {
            done(e);
        }
    }

    IconvLiteDecoderStream.prototype.collect = function(cb) {
        var res = '';
        this.on('error', cb);
        this.on('data', function(chunk) { res += chunk; });
        this.on('end', function() {
            cb(null, res);
        });
        return this;
    }

    return {
        IconvLiteEncoderStream: IconvLiteEncoderStream,
        IconvLiteDecoderStream: IconvLiteDecoderStream,
    };
};

},{"safer-buffer":60}],44:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],45:[function(require,module,exports){
(function (global){(function (){
var hasMap = typeof Map === 'function' && Map.prototype;
var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, 'size') : null;
var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === 'function' ? mapSizeDescriptor.get : null;
var mapForEach = hasMap && Map.prototype.forEach;
var hasSet = typeof Set === 'function' && Set.prototype;
var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, 'size') : null;
var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === 'function' ? setSizeDescriptor.get : null;
var setForEach = hasSet && Set.prototype.forEach;
var hasWeakMap = typeof WeakMap === 'function' && WeakMap.prototype;
var weakMapHas = hasWeakMap ? WeakMap.prototype.has : null;
var hasWeakSet = typeof WeakSet === 'function' && WeakSet.prototype;
var weakSetHas = hasWeakSet ? WeakSet.prototype.has : null;
var hasWeakRef = typeof WeakRef === 'function' && WeakRef.prototype;
var weakRefDeref = hasWeakRef ? WeakRef.prototype.deref : null;
var booleanValueOf = Boolean.prototype.valueOf;
var objectToString = Object.prototype.toString;
var functionToString = Function.prototype.toString;
var $match = String.prototype.match;
var $slice = String.prototype.slice;
var $replace = String.prototype.replace;
var $toUpperCase = String.prototype.toUpperCase;
var $toLowerCase = String.prototype.toLowerCase;
var $test = RegExp.prototype.test;
var $concat = Array.prototype.concat;
var $join = Array.prototype.join;
var $arrSlice = Array.prototype.slice;
var $floor = Math.floor;
var bigIntValueOf = typeof BigInt === 'function' ? BigInt.prototype.valueOf : null;
var gOPS = Object.getOwnPropertySymbols;
var symToString = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? Symbol.prototype.toString : null;
var hasShammedSymbols = typeof Symbol === 'function' && typeof Symbol.iterator === 'object';
// ie, `has-tostringtag/shams
var toStringTag = typeof Symbol === 'function' && Symbol.toStringTag && (typeof Symbol.toStringTag === hasShammedSymbols ? 'object' : 'symbol')
    ? Symbol.toStringTag
    : null;
var isEnumerable = Object.prototype.propertyIsEnumerable;

var gPO = (typeof Reflect === 'function' ? Reflect.getPrototypeOf : Object.getPrototypeOf) || (
    [].__proto__ === Array.prototype // eslint-disable-line no-proto
        ? function (O) {
            return O.__proto__; // eslint-disable-line no-proto
        }
        : null
);

function addNumericSeparator(num, str) {
    if (
        num === Infinity
        || num === -Infinity
        || num !== num
        || (num && num > -1000 && num < 1000)
        || $test.call(/e/, str)
    ) {
        return str;
    }
    var sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
    if (typeof num === 'number') {
        var int = num < 0 ? -$floor(-num) : $floor(num); // trunc(num)
        if (int !== num) {
            var intStr = String(int);
            var dec = $slice.call(str, intStr.length + 1);
            return $replace.call(intStr, sepRegex, '$&_') + '.' + $replace.call($replace.call(dec, /([0-9]{3})/g, '$&_'), /_$/, '');
        }
    }
    return $replace.call(str, sepRegex, '$&_');
}

var utilInspect = require('./util.inspect');
var inspectCustom = utilInspect.custom;
var inspectSymbol = isSymbol(inspectCustom) ? inspectCustom : null;

module.exports = function inspect_(obj, options, depth, seen) {
    var opts = options || {};

    if (has(opts, 'quoteStyle') && (opts.quoteStyle !== 'single' && opts.quoteStyle !== 'double')) {
        throw new TypeError('option "quoteStyle" must be "single" or "double"');
    }
    if (
        has(opts, 'maxStringLength') && (typeof opts.maxStringLength === 'number'
            ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity
            : opts.maxStringLength !== null
        )
    ) {
        throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
    }
    var customInspect = has(opts, 'customInspect') ? opts.customInspect : true;
    if (typeof customInspect !== 'boolean' && customInspect !== 'symbol') {
        throw new TypeError('option "customInspect", if provided, must be `true`, `false`, or `\'symbol\'`');
    }

    if (
        has(opts, 'indent')
        && opts.indent !== null
        && opts.indent !== '\t'
        && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)
    ) {
        throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
    }
    if (has(opts, 'numericSeparator') && typeof opts.numericSeparator !== 'boolean') {
        throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
    }
    var numericSeparator = opts.numericSeparator;

    if (typeof obj === 'undefined') {
        return 'undefined';
    }
    if (obj === null) {
        return 'null';
    }
    if (typeof obj === 'boolean') {
        return obj ? 'true' : 'false';
    }

    if (typeof obj === 'string') {
        return inspectString(obj, opts);
    }
    if (typeof obj === 'number') {
        if (obj === 0) {
            return Infinity / obj > 0 ? '0' : '-0';
        }
        var str = String(obj);
        return numericSeparator ? addNumericSeparator(obj, str) : str;
    }
    if (typeof obj === 'bigint') {
        var bigIntStr = String(obj) + 'n';
        return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
    }

    var maxDepth = typeof opts.depth === 'undefined' ? 5 : opts.depth;
    if (typeof depth === 'undefined') { depth = 0; }
    if (depth >= maxDepth && maxDepth > 0 && typeof obj === 'object') {
        return isArray(obj) ? '[Array]' : '[Object]';
    }

    var indent = getIndent(opts, depth);

    if (typeof seen === 'undefined') {
        seen = [];
    } else if (indexOf(seen, obj) >= 0) {
        return '[Circular]';
    }

    function inspect(value, from, noIndent) {
        if (from) {
            seen = $arrSlice.call(seen);
            seen.push(from);
        }
        if (noIndent) {
            var newOpts = {
                depth: opts.depth
            };
            if (has(opts, 'quoteStyle')) {
                newOpts.quoteStyle = opts.quoteStyle;
            }
            return inspect_(value, newOpts, depth + 1, seen);
        }
        return inspect_(value, opts, depth + 1, seen);
    }

    if (typeof obj === 'function' && !isRegExp(obj)) { // in older engines, regexes are callable
        var name = nameOf(obj);
        var keys = arrObjKeys(obj, inspect);
        return '[Function' + (name ? ': ' + name : ' (anonymous)') + ']' + (keys.length > 0 ? ' { ' + $join.call(keys, ', ') + ' }' : '');
    }
    if (isSymbol(obj)) {
        var symString = hasShammedSymbols ? $replace.call(String(obj), /^(Symbol\(.*\))_[^)]*$/, '$1') : symToString.call(obj);
        return typeof obj === 'object' && !hasShammedSymbols ? markBoxed(symString) : symString;
    }
    if (isElement(obj)) {
        var s = '<' + $toLowerCase.call(String(obj.nodeName));
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
            s += ' ' + attrs[i].name + '=' + wrapQuotes(quote(attrs[i].value), 'double', opts);
        }
        s += '>';
        if (obj.childNodes && obj.childNodes.length) { s += '...'; }
        s += '</' + $toLowerCase.call(String(obj.nodeName)) + '>';
        return s;
    }
    if (isArray(obj)) {
        if (obj.length === 0) { return '[]'; }
        var xs = arrObjKeys(obj, inspect);
        if (indent && !singleLineValues(xs)) {
            return '[' + indentedJoin(xs, indent) + ']';
        }
        return '[ ' + $join.call(xs, ', ') + ' ]';
    }
    if (isError(obj)) {
        var parts = arrObjKeys(obj, inspect);
        if (!('cause' in Error.prototype) && 'cause' in obj && !isEnumerable.call(obj, 'cause')) {
            return '{ [' + String(obj) + '] ' + $join.call($concat.call('[cause]: ' + inspect(obj.cause), parts), ', ') + ' }';
        }
        if (parts.length === 0) { return '[' + String(obj) + ']'; }
        return '{ [' + String(obj) + '] ' + $join.call(parts, ', ') + ' }';
    }
    if (typeof obj === 'object' && customInspect) {
        if (inspectSymbol && typeof obj[inspectSymbol] === 'function' && utilInspect) {
            return utilInspect(obj, { depth: maxDepth - depth });
        } else if (customInspect !== 'symbol' && typeof obj.inspect === 'function') {
            return obj.inspect();
        }
    }
    if (isMap(obj)) {
        var mapParts = [];
        if (mapForEach) {
            mapForEach.call(obj, function (value, key) {
                mapParts.push(inspect(key, obj, true) + ' => ' + inspect(value, obj));
            });
        }
        return collectionOf('Map', mapSize.call(obj), mapParts, indent);
    }
    if (isSet(obj)) {
        var setParts = [];
        if (setForEach) {
            setForEach.call(obj, function (value) {
                setParts.push(inspect(value, obj));
            });
        }
        return collectionOf('Set', setSize.call(obj), setParts, indent);
    }
    if (isWeakMap(obj)) {
        return weakCollectionOf('WeakMap');
    }
    if (isWeakSet(obj)) {
        return weakCollectionOf('WeakSet');
    }
    if (isWeakRef(obj)) {
        return weakCollectionOf('WeakRef');
    }
    if (isNumber(obj)) {
        return markBoxed(inspect(Number(obj)));
    }
    if (isBigInt(obj)) {
        return markBoxed(inspect(bigIntValueOf.call(obj)));
    }
    if (isBoolean(obj)) {
        return markBoxed(booleanValueOf.call(obj));
    }
    if (isString(obj)) {
        return markBoxed(inspect(String(obj)));
    }
    // note: in IE 8, sometimes `global !== window` but both are the prototypes of each other
    /* eslint-env browser */
    if (typeof window !== 'undefined' && obj === window) {
        return '{ [object Window] }';
    }
    if (obj === global) {
        return '{ [object globalThis] }';
    }
    if (!isDate(obj) && !isRegExp(obj)) {
        var ys = arrObjKeys(obj, inspect);
        var isPlainObject = gPO ? gPO(obj) === Object.prototype : obj instanceof Object || obj.constructor === Object;
        var protoTag = obj instanceof Object ? '' : 'null prototype';
        var stringTag = !isPlainObject && toStringTag && Object(obj) === obj && toStringTag in obj ? $slice.call(toStr(obj), 8, -1) : protoTag ? 'Object' : '';
        var constructorTag = isPlainObject || typeof obj.constructor !== 'function' ? '' : obj.constructor.name ? obj.constructor.name + ' ' : '';
        var tag = constructorTag + (stringTag || protoTag ? '[' + $join.call($concat.call([], stringTag || [], protoTag || []), ': ') + '] ' : '');
        if (ys.length === 0) { return tag + '{}'; }
        if (indent) {
            return tag + '{' + indentedJoin(ys, indent) + '}';
        }
        return tag + '{ ' + $join.call(ys, ', ') + ' }';
    }
    return String(obj);
};

function wrapQuotes(s, defaultStyle, opts) {
    var quoteChar = (opts.quoteStyle || defaultStyle) === 'double' ? '"' : "'";
    return quoteChar + s + quoteChar;
}

function quote(s) {
    return $replace.call(String(s), /"/g, '&quot;');
}

function isArray(obj) { return toStr(obj) === '[object Array]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isDate(obj) { return toStr(obj) === '[object Date]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isRegExp(obj) { return toStr(obj) === '[object RegExp]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isError(obj) { return toStr(obj) === '[object Error]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isString(obj) { return toStr(obj) === '[object String]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isNumber(obj) { return toStr(obj) === '[object Number]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isBoolean(obj) { return toStr(obj) === '[object Boolean]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }

// Symbol and BigInt do have Symbol.toStringTag by spec, so that can't be used to eliminate false positives
function isSymbol(obj) {
    if (hasShammedSymbols) {
        return obj && typeof obj === 'object' && obj instanceof Symbol;
    }
    if (typeof obj === 'symbol') {
        return true;
    }
    if (!obj || typeof obj !== 'object' || !symToString) {
        return false;
    }
    try {
        symToString.call(obj);
        return true;
    } catch (e) {}
    return false;
}

function isBigInt(obj) {
    if (!obj || typeof obj !== 'object' || !bigIntValueOf) {
        return false;
    }
    try {
        bigIntValueOf.call(obj);
        return true;
    } catch (e) {}
    return false;
}

var hasOwn = Object.prototype.hasOwnProperty || function (key) { return key in this; };
function has(obj, key) {
    return hasOwn.call(obj, key);
}

function toStr(obj) {
    return objectToString.call(obj);
}

function nameOf(f) {
    if (f.name) { return f.name; }
    var m = $match.call(functionToString.call(f), /^function\s*([\w$]+)/);
    if (m) { return m[1]; }
    return null;
}

function indexOf(xs, x) {
    if (xs.indexOf) { return xs.indexOf(x); }
    for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) { return i; }
    }
    return -1;
}

function isMap(x) {
    if (!mapSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        mapSize.call(x);
        try {
            setSize.call(x);
        } catch (s) {
            return true;
        }
        return x instanceof Map; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakMap(x) {
    if (!weakMapHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakMapHas.call(x, weakMapHas);
        try {
            weakSetHas.call(x, weakSetHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakMap; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakRef(x) {
    if (!weakRefDeref || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakRefDeref.call(x);
        return true;
    } catch (e) {}
    return false;
}

function isSet(x) {
    if (!setSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        setSize.call(x);
        try {
            mapSize.call(x);
        } catch (m) {
            return true;
        }
        return x instanceof Set; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakSet(x) {
    if (!weakSetHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakSetHas.call(x, weakSetHas);
        try {
            weakMapHas.call(x, weakMapHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakSet; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isElement(x) {
    if (!x || typeof x !== 'object') { return false; }
    if (typeof HTMLElement !== 'undefined' && x instanceof HTMLElement) {
        return true;
    }
    return typeof x.nodeName === 'string' && typeof x.getAttribute === 'function';
}

function inspectString(str, opts) {
    if (str.length > opts.maxStringLength) {
        var remaining = str.length - opts.maxStringLength;
        var trailer = '... ' + remaining + ' more character' + (remaining > 1 ? 's' : '');
        return inspectString($slice.call(str, 0, opts.maxStringLength), opts) + trailer;
    }
    // eslint-disable-next-line no-control-regex
    var s = $replace.call($replace.call(str, /(['\\])/g, '\\$1'), /[\x00-\x1f]/g, lowbyte);
    return wrapQuotes(s, 'single', opts);
}

function lowbyte(c) {
    var n = c.charCodeAt(0);
    var x = {
        8: 'b',
        9: 't',
        10: 'n',
        12: 'f',
        13: 'r'
    }[n];
    if (x) { return '\\' + x; }
    return '\\x' + (n < 0x10 ? '0' : '') + $toUpperCase.call(n.toString(16));
}

function markBoxed(str) {
    return 'Object(' + str + ')';
}

function weakCollectionOf(type) {
    return type + ' { ? }';
}

function collectionOf(type, size, entries, indent) {
    var joinedEntries = indent ? indentedJoin(entries, indent) : $join.call(entries, ', ');
    return type + ' (' + size + ') {' + joinedEntries + '}';
}

function singleLineValues(xs) {
    for (var i = 0; i < xs.length; i++) {
        if (indexOf(xs[i], '\n') >= 0) {
            return false;
        }
    }
    return true;
}

function getIndent(opts, depth) {
    var baseIndent;
    if (opts.indent === '\t') {
        baseIndent = '\t';
    } else if (typeof opts.indent === 'number' && opts.indent > 0) {
        baseIndent = $join.call(Array(opts.indent + 1), ' ');
    } else {
        return null;
    }
    return {
        base: baseIndent,
        prev: $join.call(Array(depth + 1), baseIndent)
    };
}

function indentedJoin(xs, indent) {
    if (xs.length === 0) { return ''; }
    var lineJoiner = '\n' + indent.prev + indent.base;
    return lineJoiner + $join.call(xs, ',' + lineJoiner) + '\n' + indent.prev;
}

function arrObjKeys(obj, inspect) {
    var isArr = isArray(obj);
    var xs = [];
    if (isArr) {
        xs.length = obj.length;
        for (var i = 0; i < obj.length; i++) {
            xs[i] = has(obj, i) ? inspect(obj[i], obj) : '';
        }
    }
    var syms = typeof gOPS === 'function' ? gOPS(obj) : [];
    var symMap;
    if (hasShammedSymbols) {
        symMap = {};
        for (var k = 0; k < syms.length; k++) {
            symMap['$' + syms[k]] = syms[k];
        }
    }

    for (var key in obj) { // eslint-disable-line no-restricted-syntax
        if (!has(obj, key)) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (isArr && String(Number(key)) === key && key < obj.length) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (hasShammedSymbols && symMap['$' + key] instanceof Symbol) {
            // this is to prevent shammed Symbols, which are stored as strings, from being included in the string key section
            continue; // eslint-disable-line no-restricted-syntax, no-continue
        } else if ($test.call(/[^\w$]/, key)) {
            xs.push(inspect(key, obj) + ': ' + inspect(obj[key], obj));
        } else {
            xs.push(key + ': ' + inspect(obj[key], obj));
        }
    }
    if (typeof gOPS === 'function') {
        for (var j = 0; j < syms.length; j++) {
            if (isEnumerable.call(obj, syms[j])) {
                xs.push('[' + inspect(syms[j]) + ']: ' + inspect(obj[syms[j]], obj));
            }
        }
    }
    return xs;
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./util.inspect":2}],46:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],47:[function(require,module,exports){
'use strict';

var replace = String.prototype.replace;
var percentTwenties = /%20/g;

var Format = {
    RFC1738: 'RFC1738',
    RFC3986: 'RFC3986'
};

module.exports = {
    'default': Format.RFC3986,
    formatters: {
        RFC1738: function (value) {
            return replace.call(value, percentTwenties, '+');
        },
        RFC3986: function (value) {
            return String(value);
        }
    },
    RFC1738: Format.RFC1738,
    RFC3986: Format.RFC3986
};

},{}],48:[function(require,module,exports){
'use strict';

var stringify = require('./stringify');
var parse = require('./parse');
var formats = require('./formats');

module.exports = {
    formats: formats,
    parse: parse,
    stringify: stringify
};

},{"./formats":47,"./parse":49,"./stringify":50}],49:[function(require,module,exports){
'use strict';

var utils = require('./utils');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var defaults = {
    allowDots: false,
    allowEmptyArrays: false,
    allowPrototypes: false,
    allowSparse: false,
    arrayLimit: 20,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
    decodeDotInKeys: true,
    decoder: utils.decode,
    delimiter: '&',
    depth: 5,
    duplicates: 'combine',
    ignoreQueryPrefix: false,
    interpretNumericEntities: false,
    parameterLimit: 1000,
    parseArrays: true,
    plainObjects: false,
    strictNullHandling: false
};

var interpretNumericEntities = function (str) {
    return str.replace(/&#(\d+);/g, function ($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
    });
};

var parseArrayValue = function (val, options) {
    if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
        return val.split(',');
    }

    return val;
};

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
var isoSentinel = 'utf8=%26%2310003%3B'; // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
var charsetSentinel = 'utf8=%E2%9C%93'; // encodeURIComponent('✓')

var parseValues = function parseQueryStringValues(str, options) {
    var obj = { __proto__: null };

    var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    var limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    var parts = cleanStr.split(options.delimiter, limit);
    var skipIndex = -1; // Keep track of where the utf8 sentinel was found
    var i;

    var charset = options.charset;
    if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
            if (parts[i].indexOf('utf8=') === 0) {
                if (parts[i] === charsetSentinel) {
                    charset = 'utf-8';
                } else if (parts[i] === isoSentinel) {
                    charset = 'iso-8859-1';
                }
                skipIndex = i;
                i = parts.length; // The eslint settings do not allow break;
            }
        }
    }

    for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
            continue;
        }
        var part = parts[i];

        var bracketEqualsPos = part.indexOf(']=');
        var pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        var key, val;
        if (pos === -1) {
            key = options.decoder(part, defaults.decoder, charset, 'key');
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key');
            val = utils.maybeMap(
                parseArrayValue(part.slice(pos + 1), options),
                function (encodedVal) {
                    return options.decoder(encodedVal, defaults.decoder, charset, 'value');
                }
            );
        }

        if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
            val = interpretNumericEntities(val);
        }

        if (part.indexOf('[]=') > -1) {
            val = isArray(val) ? [val] : val;
        }

        var existing = has.call(obj, key);
        if (existing && options.duplicates === 'combine') {
            obj[key] = utils.combine(obj[key], val);
        } else if (!existing || options.duplicates === 'last') {
            obj[key] = val;
        }
    }

    return obj;
};

var parseObject = function (chain, val, options, valuesParsed) {
    var leaf = valuesParsed ? val : parseArrayValue(val, options);

    for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];

        if (root === '[]' && options.parseArrays) {
            obj = options.allowEmptyArrays && leaf === '' ? [] : [].concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            var cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            var decodedRoot = options.decodeDotInKeys ? cleanRoot.replace(/%2E/g, '.') : cleanRoot;
            var index = parseInt(decodedRoot, 10);
            if (!options.parseArrays && decodedRoot === '') {
                obj = { 0: leaf };
            } else if (
                !isNaN(index)
                && root !== decodedRoot
                && String(index) === decodedRoot
                && index >= 0
                && (options.parseArrays && index <= options.arrayLimit)
            ) {
                obj = [];
                obj[index] = leaf;
            } else if (decodedRoot !== '__proto__') {
                obj[decodedRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
};

var parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var brackets = /(\[[^[\]]*])/;
    var child = /(\[[^[\]]*])/g;

    // Get the parent

    var segment = options.depth > 0 && brackets.exec(key);
    var parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    var keys = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options, valuesParsed);
};

var normalizeParseOptions = function normalizeParseOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
        throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided');
    }

    if (typeof opts.decodeDotInKeys !== 'undefined' && typeof opts.decodeDotInKeys !== 'boolean') {
        throw new TypeError('`decodeDotInKeys` option can only be `true` or `false`, when provided');
    }

    if (opts.decoder !== null && typeof opts.decoder !== 'undefined' && typeof opts.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    var charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset;

    var duplicates = typeof opts.duplicates === 'undefined' ? defaults.duplicates : opts.duplicates;

    if (duplicates !== 'combine' && duplicates !== 'first' && duplicates !== 'last') {
        throw new TypeError('The duplicates option must be either combine, first, or last');
    }

    var allowDots = typeof opts.allowDots === 'undefined' ? opts.decodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;

    return {
        allowDots: allowDots,
        allowEmptyArrays: typeof opts.allowEmptyArrays === 'boolean' ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
        allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
        decodeDotInKeys: typeof opts.decodeDotInKeys === 'boolean' ? opts.decodeDotInKeys : defaults.decodeDotInKeys,
        decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === 'string' || utils.isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: (typeof opts.depth === 'number' || opts.depth === false) ? +opts.depth : defaults.depth,
        duplicates: duplicates,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities: typeof opts.interpretNumericEntities === 'boolean' ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (str, opts) {
    var options = normalizeParseOptions(opts);

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options, typeof str === 'string');
        obj = utils.merge(obj, newObj, options);
    }

    if (options.allowSparse === true) {
        return obj;
    }

    return utils.compact(obj);
};

},{"./utils":51}],50:[function(require,module,exports){
'use strict';

var getSideChannel = require('side-channel');
var utils = require('./utils');
var formats = require('./formats');
var has = Object.prototype.hasOwnProperty;

var arrayPrefixGenerators = {
    brackets: function brackets(prefix) {
        return prefix + '[]';
    },
    comma: 'comma',
    indices: function indices(prefix, key) {
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix) {
        return prefix;
    }
};

var isArray = Array.isArray;
var push = Array.prototype.push;
var pushToArray = function (arr, valueOrArray) {
    push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray]);
};

var toISO = Date.prototype.toISOString;

var defaultFormat = formats['default'];
var defaults = {
    addQueryPrefix: false,
    allowDots: false,
    allowEmptyArrays: false,
    arrayFormat: 'indices',
    charset: 'utf-8',
    charsetSentinel: false,
    delimiter: '&',
    encode: true,
    encodeDotInKeys: false,
    encoder: utils.encode,
    encodeValuesOnly: false,
    format: defaultFormat,
    formatter: formats.formatters[defaultFormat],
    // deprecated
    indices: false,
    serializeDate: function serializeDate(date) {
        return toISO.call(date);
    },
    skipNulls: false,
    strictNullHandling: false
};

var isNonNullishPrimitive = function isNonNullishPrimitive(v) {
    return typeof v === 'string'
        || typeof v === 'number'
        || typeof v === 'boolean'
        || typeof v === 'symbol'
        || typeof v === 'bigint';
};

var sentinel = {};

var stringify = function stringify(
    object,
    prefix,
    generateArrayPrefix,
    commaRoundTrip,
    allowEmptyArrays,
    strictNullHandling,
    skipNulls,
    encodeDotInKeys,
    encoder,
    filter,
    sort,
    allowDots,
    serializeDate,
    format,
    formatter,
    encodeValuesOnly,
    charset,
    sideChannel
) {
    var obj = object;

    var tmpSc = sideChannel;
    var step = 0;
    var findFlag = false;
    while ((tmpSc = tmpSc.get(sentinel)) !== void undefined && !findFlag) {
        // Where object last appeared in the ref tree
        var pos = tmpSc.get(object);
        step += 1;
        if (typeof pos !== 'undefined') {
            if (pos === step) {
                throw new RangeError('Cyclic object value');
            } else {
                findFlag = true; // Break while
            }
        }
        if (typeof tmpSc.get(sentinel) === 'undefined') {
            step = 0;
        }
    }

    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = serializeDate(obj);
    } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
        obj = utils.maybeMap(obj, function (value) {
            if (value instanceof Date) {
                return serializeDate(value);
            }
            return value;
        });
    }

    if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, 'key', format) : prefix;
        }

        obj = '';
    }

    if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
        if (encoder) {
            var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, 'key', format);
            return [formatter(keyValue) + '=' + formatter(encoder(obj, defaults.encoder, charset, 'value', format))];
        }
        return [formatter(prefix) + '=' + formatter(String(obj))];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys;
    if (generateArrayPrefix === 'comma' && isArray(obj)) {
        // we need to join elements in
        if (encodeValuesOnly && encoder) {
            obj = utils.maybeMap(obj, encoder);
        }
        objKeys = [{ value: obj.length > 0 ? obj.join(',') || null : void undefined }];
    } else if (isArray(filter)) {
        objKeys = filter;
    } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    var encodedPrefix = encodeDotInKeys ? prefix.replace(/\./g, '%2E') : prefix;

    var adjustedPrefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encodedPrefix + '[]' : encodedPrefix;

    if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
        return adjustedPrefix + '[]';
    }

    for (var j = 0; j < objKeys.length; ++j) {
        var key = objKeys[j];
        var value = typeof key === 'object' && typeof key.value !== 'undefined' ? key.value : obj[key];

        if (skipNulls && value === null) {
            continue;
        }

        var encodedKey = allowDots && encodeDotInKeys ? key.replace(/\./g, '%2E') : key;
        var keyPrefix = isArray(obj)
            ? typeof generateArrayPrefix === 'function' ? generateArrayPrefix(adjustedPrefix, encodedKey) : adjustedPrefix
            : adjustedPrefix + (allowDots ? '.' + encodedKey : '[' + encodedKey + ']');

        sideChannel.set(object, step);
        var valueSideChannel = getSideChannel();
        valueSideChannel.set(sentinel, sideChannel);
        pushToArray(values, stringify(
            value,
            keyPrefix,
            generateArrayPrefix,
            commaRoundTrip,
            allowEmptyArrays,
            strictNullHandling,
            skipNulls,
            encodeDotInKeys,
            generateArrayPrefix === 'comma' && encodeValuesOnly && isArray(obj) ? null : encoder,
            filter,
            sort,
            allowDots,
            serializeDate,
            format,
            formatter,
            encodeValuesOnly,
            charset,
            valueSideChannel
        ));
    }

    return values;
};

var normalizeStringifyOptions = function normalizeStringifyOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
        throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided');
    }

    if (typeof opts.encodeDotInKeys !== 'undefined' && typeof opts.encodeDotInKeys !== 'boolean') {
        throw new TypeError('`encodeDotInKeys` option can only be `true` or `false`, when provided');
    }

    if (opts.encoder !== null && typeof opts.encoder !== 'undefined' && typeof opts.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    var charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }

    var format = formats['default'];
    if (typeof opts.format !== 'undefined') {
        if (!has.call(formats.formatters, opts.format)) {
            throw new TypeError('Unknown format option provided.');
        }
        format = opts.format;
    }
    var formatter = formats.formatters[format];

    var filter = defaults.filter;
    if (typeof opts.filter === 'function' || isArray(opts.filter)) {
        filter = opts.filter;
    }

    var arrayFormat;
    if (opts.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = opts.arrayFormat;
    } else if ('indices' in opts) {
        arrayFormat = opts.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = defaults.arrayFormat;
    }

    if ('commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
        throw new TypeError('`commaRoundTrip` must be a boolean, or absent');
    }

    var allowDots = typeof opts.allowDots === 'undefined' ? opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;

    return {
        addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
        allowDots: allowDots,
        allowEmptyArrays: typeof opts.allowEmptyArrays === 'boolean' ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
        arrayFormat: arrayFormat,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        commaRoundTrip: opts.commaRoundTrip,
        delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
        encodeDotInKeys: typeof opts.encodeDotInKeys === 'boolean' ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
        encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
        encodeValuesOnly: typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter: filter,
        format: format,
        formatter: formatter,
        serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
        sort: typeof opts.sort === 'function' ? opts.sort : null,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (object, opts) {
    var obj = object;
    var options = normalizeStringifyOptions(opts);

    var objKeys;
    var filter;

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
    }

    var keys = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    var generateArrayPrefix = arrayPrefixGenerators[options.arrayFormat];
    var commaRoundTrip = generateArrayPrefix === 'comma' && options.commaRoundTrip;

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (options.sort) {
        objKeys.sort(options.sort);
    }

    var sideChannel = getSideChannel();
    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (options.skipNulls && obj[key] === null) {
            continue;
        }
        pushToArray(keys, stringify(
            obj[key],
            key,
            generateArrayPrefix,
            commaRoundTrip,
            options.allowEmptyArrays,
            options.strictNullHandling,
            options.skipNulls,
            options.encodeDotInKeys,
            options.encode ? options.encoder : null,
            options.filter,
            options.sort,
            options.allowDots,
            options.serializeDate,
            options.format,
            options.formatter,
            options.encodeValuesOnly,
            options.charset,
            sideChannel
        ));
    }

    var joined = keys.join(options.delimiter);
    var prefix = options.addQueryPrefix === true ? '?' : '';

    if (options.charsetSentinel) {
        if (options.charset === 'iso-8859-1') {
            // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
            prefix += 'utf8=%26%2310003%3B&';
        } else {
            // encodeURIComponent('✓')
            prefix += 'utf8=%E2%9C%93&';
        }
    }

    return joined.length > 0 ? prefix + joined : '';
};

},{"./formats":47,"./utils":51,"side-channel":62}],51:[function(require,module,exports){
'use strict';

var formats = require('./formats');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var hexTable = (function () {
    var array = [];
    for (var i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
}());

var compactQueue = function compactQueue(queue) {
    while (queue.length > 1) {
        var item = queue.pop();
        var obj = item.obj[item.prop];

        if (isArray(obj)) {
            var compacted = [];

            for (var j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }
};

var arrayToObject = function arrayToObject(source, options) {
    var obj = options && options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

var merge = function merge(target, source, options) {
    /* eslint no-param-reassign: 0 */
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (isArray(target) && !isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (isArray(target) && isArray(source)) {
        source.forEach(function (item, i) {
            if (has.call(target, i)) {
                var targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

var assign = function assignSingleSource(target, source) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
};

var decode = function (str, decoder, charset) {
    var strWithoutPlus = str.replace(/\+/g, ' ');
    if (charset === 'iso-8859-1') {
        // unescape never throws, no try...catch needed:
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
    }
    // utf-8
    try {
        return decodeURIComponent(strWithoutPlus);
    } catch (e) {
        return strWithoutPlus;
    }
};

var encode = function encode(str, defaultEncoder, charset, kind, format) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    } else if (typeof str !== 'string') {
        string = String(str);
    }

    if (charset === 'iso-8859-1') {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D // -
            || c === 0x2E // .
            || c === 0x5F // _
            || c === 0x7E // ~
            || (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // a-z
            || (c >= 0x61 && c <= 0x7A) // A-Z
            || (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        /* eslint operator-linebreak: [2, "before"] */
        out += hexTable[0xF0 | (c >> 18)]
            + hexTable[0x80 | ((c >> 12) & 0x3F)]
            + hexTable[0x80 | ((c >> 6) & 0x3F)]
            + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

var compact = function compact(value) {
    var queue = [{ obj: { o: value }, prop: 'o' }];
    var refs = [];

    for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    compactQueue(queue);

    return value;
};

var isRegExp = function isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

var isBuffer = function isBuffer(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

var combine = function combine(a, b) {
    return [].concat(a, b);
};

var maybeMap = function maybeMap(val, fn) {
    if (isArray(val)) {
        var mapped = [];
        for (var i = 0; i < val.length; i += 1) {
            mapped.push(fn(val[i]));
        }
        return mapped;
    }
    return fn(val);
};

module.exports = {
    arrayToObject: arrayToObject,
    assign: assign,
    combine: combine,
    compact: compact,
    decode: decode,
    encode: encode,
    isBuffer: isBuffer,
    isRegExp: isRegExp,
    maybeMap: maybeMap,
    merge: merge
};

},{"./formats":47}],52:[function(require,module,exports){
var slice = Array.prototype.slice;

function dashify(method, file) {
  return function(path) {
    var argv = arguments;
    if (path == "-") (argv = slice.call(argv)).splice(0, 1, file);
    return method.apply(null, argv);
  };
}

exports.readFile = dashify(require("./read-file"), "/dev/stdin");
exports.readFileSync = dashify(require("./read-file-sync"), "/dev/stdin");
exports.writeFile = dashify(require("./write-file"), "/dev/stdout");
exports.writeFileSync = dashify(require("./write-file-sync"), "/dev/stdout");

},{"./read-file":56,"./read-file-sync":55,"./write-file":58,"./write-file-sync":57}],53:[function(require,module,exports){
(function (Buffer){(function (){
module.exports = function(options) {
  if (options) {
    if (typeof options === "string") return encoding(options);
    if (options.encoding !== null) return encoding(options.encoding);
  }
  return identity();
};

function identity() {
  var chunks = [];
  return {
    push: function(chunk) { chunks.push(chunk); },
    value: function() { return Buffer.concat(chunks); }
  };
}

function encoding(encoding) {
  var chunks = [];
  return {
    push: function(chunk) { chunks.push(chunk); },
    value: function() { return Buffer.concat(chunks).toString(encoding); }
  };
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"buffer":"buffer"}],54:[function(require,module,exports){
(function (Buffer){(function (){
module.exports = function(data, options) {
  return typeof data === "string"
      ? new Buffer(data, typeof options === "string" ? options
          : options && options.encoding !== null ? options.encoding
          : "utf8")
      : data;
};

}).call(this)}).call(this,require("buffer").Buffer)
},{"buffer":"buffer"}],55:[function(require,module,exports){
(function (Buffer){(function (){
var fs = require("fs"),
    decode = require("./decode");

module.exports = function(filename, options) {
  if (fs.statSync(filename).isFile()) {
    return fs.readFileSync(filename, options);
  } else {
    var fd = fs.openSync(filename, options && options.flag || "r"),
        decoder = decode(options);

    while (true) { // eslint-disable-line no-constant-condition
      try {
        var buffer = new Buffer(bufferSize),
            bytesRead = fs.readSync(fd, buffer, 0, bufferSize);
      } catch (e) {
        if (e.code === "EOF") break;
        fs.closeSync(fd);
        throw e;
      }
      if (bytesRead === 0) break;
      decoder.push(buffer.slice(0, bytesRead));
    }

    fs.closeSync(fd);
    return decoder.value();
  }
};

var bufferSize = 1 << 16;

}).call(this)}).call(this,require("buffer").Buffer)
},{"./decode":53,"buffer":"buffer","fs":"fs"}],56:[function(require,module,exports){
(function (process){(function (){
var fs = require("fs"),
    decode = require("./decode");

module.exports = function(path, options, callback) {
  if (arguments.length < 3) callback = options, options = null;

  switch (path) {
    case "/dev/stdin": return readStream(process.stdin, options, callback);
  }

  fs.stat(path, function(error, stat) {
    if (error) return callback(error);
    if (stat.isFile()) return fs.readFile(path, options, callback);
    readStream(fs.createReadStream(path, options ? {flags: options.flag || "r"} : {}), options, callback); // N.B. flag / flags
  });
};

function readStream(stream, options, callback) {
  var decoder = decode(options);
  stream.on("error", callback);
  stream.on("data", function(d) { decoder.push(d); });
  stream.on("end", function() { callback(null, decoder.value()); });
}

}).call(this)}).call(this,require('_process'))
},{"./decode":53,"_process":46,"fs":"fs"}],57:[function(require,module,exports){
var fs = require("fs"),
    encode = require("./encode");

module.exports = function(filename, data, options) {
  var stat;

  try {
    stat = fs.statSync(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (!stat || stat.isFile()) {
    fs.writeFileSync(filename, data, options);
  } else {
    var fd = fs.openSync(filename, options && options.flag || "w"),
        bytesWritten = 0,
        bytesTotal = (data = encode(data, options)).length;

    while (bytesWritten < bytesTotal) {
      try {
        bytesWritten += fs.writeSync(fd, data, bytesWritten, bytesTotal - bytesWritten, null);
      } catch (error) {
        if (error.code === "EPIPE") break; // ignore broken pipe, e.g., | head
        fs.closeSync(fd);
        throw error;
      }
    }

    fs.closeSync(fd);
  }
};

},{"./encode":54,"fs":"fs"}],58:[function(require,module,exports){
(function (process){(function (){
var fs = require("fs"),
    encode = require("./encode");

module.exports = function(path, data, options, callback) {
  if (arguments.length < 4) callback = options, options = null;

  switch (path) {
    case "/dev/stdout": return writeStream(process.stdout, "write", data, options, callback);
    case "/dev/stderr": return writeStream(process.stderr, "write", data, options, callback);
  }

  fs.stat(path, function(error, stat) {
    if (error && error.code !== "ENOENT") return callback(error);
    if (stat && stat.isFile()) return fs.writeFile(path, data, options, callback);
    writeStream(fs.createWriteStream(path, options ? {flags: options.flag || "w"} : {}), "end", data, options, callback); // N.B. flag / flags
  });
};

function writeStream(stream, send, data, options, callback) {
  stream.on("error", function(error) { callback(error.code === "EPIPE" ? null : error); }); // ignore broken pipe, e.g., | head
  stream[send](encode(data, options), function(error) { callback(error && error.code === "EPIPE" ? null : error); });
}

}).call(this)}).call(this,require('_process'))
},{"./encode":54,"_process":46,"fs":"fs"}],59:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":"buffer"}],60:[function(require,module,exports){
(function (process){(function (){
/* eslint-disable node/no-deprecated-api */

'use strict'

var buffer = require('buffer')
var Buffer = buffer.Buffer

var safer = {}

var key

for (key in buffer) {
  if (!buffer.hasOwnProperty(key)) continue
  if (key === 'SlowBuffer' || key === 'Buffer') continue
  safer[key] = buffer[key]
}

var Safer = safer.Buffer = {}
for (key in Buffer) {
  if (!Buffer.hasOwnProperty(key)) continue
  if (key === 'allocUnsafe' || key === 'allocUnsafeSlow') continue
  Safer[key] = Buffer[key]
}

safer.Buffer.prototype = Buffer.prototype

if (!Safer.from || Safer.from === Uint8Array.from) {
  Safer.from = function (value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('The "value" argument must not be of type number. Received type ' + typeof value)
    }
    if (value && typeof value.length === 'undefined') {
      throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type ' + typeof value)
    }
    return Buffer(value, encodingOrOffset, length)
  }
}

if (!Safer.alloc) {
  Safer.alloc = function (size, fill, encoding) {
    if (typeof size !== 'number') {
      throw new TypeError('The "size" argument must be of type number. Received type ' + typeof size)
    }
    if (size < 0 || size >= 2 * (1 << 30)) {
      throw new RangeError('The value "' + size + '" is invalid for option "size"')
    }
    var buf = Buffer(size)
    if (!fill || fill.length === 0) {
      buf.fill(0)
    } else if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
    return buf
  }
}

if (!safer.kStringMaxLength) {
  try {
    safer.kStringMaxLength = process.binding('buffer').kStringMaxLength
  } catch (e) {
    // we can't determine kStringMaxLength in environments where process.binding
    // is unsupported, so let's not set it
  }
}

if (!safer.constants) {
  safer.constants = {
    MAX_LENGTH: safer.kMaxLength
  }
  if (safer.kStringMaxLength) {
    safer.constants.MAX_STRING_LENGTH = safer.kStringMaxLength
  }
}

module.exports = safer

}).call(this)}).call(this,require('_process'))
},{"_process":46,"buffer":"buffer"}],61:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');
var define = require('define-data-property');
var hasDescriptors = require('has-property-descriptors')();
var gOPD = require('gopd');

var $TypeError = require('es-errors/type');
var $floor = GetIntrinsic('%Math.floor%');

/** @typedef {(...args: unknown[]) => unknown} Func */

/** @type {<T extends Func = Func>(fn: T, length: number, loose?: boolean) => T} */
module.exports = function setFunctionLength(fn, length) {
	if (typeof fn !== 'function') {
		throw new $TypeError('`fn` is not a function');
	}
	if (typeof length !== 'number' || length < 0 || length > 0xFFFFFFFF || $floor(length) !== length) {
		throw new $TypeError('`length` must be a positive 32-bit integer');
	}

	var loose = arguments.length > 2 && !!arguments[2];

	var functionLengthIsConfigurable = true;
	var functionLengthIsWritable = true;
	if ('length' in fn && gOPD) {
		var desc = gOPD(fn, 'length');
		if (desc && !desc.configurable) {
			functionLengthIsConfigurable = false;
		}
		if (desc && !desc.writable) {
			functionLengthIsWritable = false;
		}
	}

	if (functionLengthIsConfigurable || functionLengthIsWritable || !loose) {
		if (hasDescriptors) {
			define(/** @type {Parameters<define>[0]} */ (fn), 'length', length, true, true);
		} else {
			define(/** @type {Parameters<define>[0]} */ (fn), 'length', length);
		}
	}
	return fn;
};

},{"define-data-property":5,"es-errors/type":12,"get-intrinsic":16,"gopd":17,"has-property-descriptors":18}],62:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');
var callBound = require('call-bind/callBound');
var inspect = require('object-inspect');

var $TypeError = require('es-errors/type');
var $WeakMap = GetIntrinsic('%WeakMap%', true);
var $Map = GetIntrinsic('%Map%', true);

var $weakMapGet = callBound('WeakMap.prototype.get', true);
var $weakMapSet = callBound('WeakMap.prototype.set', true);
var $weakMapHas = callBound('WeakMap.prototype.has', true);
var $mapGet = callBound('Map.prototype.get', true);
var $mapSet = callBound('Map.prototype.set', true);
var $mapHas = callBound('Map.prototype.has', true);

/*
* This function traverses the list returning the node corresponding to the given key.
*
* That node is also moved to the head of the list, so that if it's accessed again we don't need to traverse the whole list. By doing so, all the recently used nodes can be accessed relatively quickly.
*/
/** @type {import('.').listGetNode} */
var listGetNode = function (list, key) { // eslint-disable-line consistent-return
	/** @type {typeof list | NonNullable<(typeof list)['next']>} */
	var prev = list;
	/** @type {(typeof list)['next']} */
	var curr;
	for (; (curr = prev.next) !== null; prev = curr) {
		if (curr.key === key) {
			prev.next = curr.next;
			// eslint-disable-next-line no-extra-parens
			curr.next = /** @type {NonNullable<typeof list.next>} */ (list.next);
			list.next = curr; // eslint-disable-line no-param-reassign
			return curr;
		}
	}
};

/** @type {import('.').listGet} */
var listGet = function (objects, key) {
	var node = listGetNode(objects, key);
	return node && node.value;
};
/** @type {import('.').listSet} */
var listSet = function (objects, key, value) {
	var node = listGetNode(objects, key);
	if (node) {
		node.value = value;
	} else {
		// Prepend the new node to the beginning of the list
		objects.next = /** @type {import('.').ListNode<typeof value>} */ ({ // eslint-disable-line no-param-reassign, no-extra-parens
			key: key,
			next: objects.next,
			value: value
		});
	}
};
/** @type {import('.').listHas} */
var listHas = function (objects, key) {
	return !!listGetNode(objects, key);
};

/** @type {import('.')} */
module.exports = function getSideChannel() {
	/** @type {WeakMap<object, unknown>} */ var $wm;
	/** @type {Map<object, unknown>} */ var $m;
	/** @type {import('.').RootNode<unknown>} */ var $o;

	/** @type {import('.').Channel} */
	var channel = {
		assert: function (key) {
			if (!channel.has(key)) {
				throw new $TypeError('Side channel does not contain ' + inspect(key));
			}
		},
		get: function (key) { // eslint-disable-line consistent-return
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapGet($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapGet($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listGet($o, key);
				}
			}
		},
		has: function (key) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapHas($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapHas($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listHas($o, key);
				}
			}
			return false;
		},
		set: function (key, value) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if (!$wm) {
					$wm = new $WeakMap();
				}
				$weakMapSet($wm, key, value);
			} else if ($Map) {
				if (!$m) {
					$m = new $Map();
				}
				$mapSet($m, key, value);
			} else {
				if (!$o) {
					// Initialize the linked list as an empty node, so that we don't have to special-case handling of the first node: we can always refer to it as (previous node).next, instead of something like (list).head
					$o = { key: {}, next: null };
				}
				listSet($o, key, value);
			}
		}
	};
	return channel;
};

},{"call-bind/callBound":3,"es-errors/type":12,"get-intrinsic":16,"object-inspect":45}],63:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":59}],64:[function(require,module,exports){
"use strict";
exports.__esModule = true;
var qs_1 = require("qs");
function handleQs(url, query) {
    var _a = url.split('?'), start = _a[0], part2 = _a[1];
    var qs = (part2 || '').split('#')[0];
    var end = part2 && part2.split('#').length > 1 ? '#' + part2.split('#')[1] : '';
    var baseQs = qs_1.parse(qs);
    for (var i in query) {
        baseQs[i] = query[i];
    }
    qs = qs_1.stringify(baseQs);
    if (qs !== '') {
        qs = '?' + qs;
    }
    return start + qs + end;
}
exports["default"] = handleQs;

},{"qs":48}],"@placemarkio/tokml":[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * @typedef {import('unist').Node} Node
 * @typedef {import('unist').Parent} Parent
 * @typedef {import('unist').Literal} Literal
 * @typedef {Object.<string, unknown>} Props
 * @typedef {Array.<Node>|string} ChildrenOrValue
 *
 * @typedef {(<T extends string, P extends Record<string, unknown>, C extends Node[]>(type: T, props: P, children: C) => {type: T, children: C} & P)} BuildParentWithProps
 * @typedef {(<T extends string, P extends Record<string, unknown>>(type: T, props: P, value: string) => {type: T, value: string} & P)} BuildLiteralWithProps
 * @typedef {(<T extends string, P extends Record<string, unknown>>(type: T, props: P) => {type: T} & P)} BuildVoidWithProps
 * @typedef {(<T extends string, C extends Node[]>(type: T, children: C) => {type: T, children: C})} BuildParent
 * @typedef {(<T extends string>(type: T, value: string) => {type: T, value: string})} BuildLiteral
 * @typedef {(<T extends string>(type: T) => {type: T})} BuildVoid
 */

var u = /**
 * @type {BuildVoid & BuildVoidWithProps & BuildLiteral & BuildLiteralWithProps & BuildParent & BuildParentWithProps}
 */ (
  /**
   * @param {string} type Type of node
   * @param {Props|ChildrenOrValue} [props] Additional properties for node (or `children` or `value`)
   * @param {ChildrenOrValue} [value] `children` or `value` of node
   * @returns {Node}
   */
  function (type, props, value) {
    /** @type {Node} */
    var node = {type: String(type)};

    if (
      (value === undefined || value === null) &&
      (typeof props === 'string' || Array.isArray(props))
    ) {
      value = props;
    } else {
      Object.assign(node, props);
    }

    if (Array.isArray(value)) {
      node.children = value;
    } else if (value !== undefined && value !== null) {
      node.value = String(value);
    }

    return node
  }
);

/**
 * @typedef {import('xast').Root} Root
 * @typedef {import('xast').Element} Element
 * @typedef {Root['children'][number]} Child
 * @typedef {Child|Root} Node
 * @typedef {Root|Element} XResult
 * @typedef {string|number|boolean|null|undefined} XValue
 * @typedef {{[attribute: string]: XValue}} XAttributes Attributes to support JS primitive types
 *
 * @typedef {string|number|null|undefined} XPrimitiveChild
 * @typedef {Array.<Node|XPrimitiveChild>} XArrayChild
 * @typedef {Node|XPrimitiveChild|XArrayChild} XChild
 * @typedef {import('./jsx-classic').Element} x.JSX.Element
 * @typedef {import('./jsx-classic').IntrinsicAttributes} x.JSX.IntrinsicAttributes
 * @typedef {import('./jsx-classic').IntrinsicElements} x.JSX.IntrinsicElements
 * @typedef {import('./jsx-classic').ElementChildrenAttribute} x.JSX.ElementChildrenAttribute
 */

/**
 * Create XML trees in xast.
 *
 * @param name Qualified name. Case sensitive and can contain a namespace prefix (such as `rdf:RDF`). Pass `null|undefined` to build a root.
 * @param attributes Map of attributes. Nullish (null or undefined) or NaN values are ignored, other values (strings, booleans) are cast to strings.
 * @param children (Lists of) child nodes. When strings are encountered, they are mapped to Text nodes.
 */
const x =
  /**
   * @type {{
   *   (): Root
   *   (name: null|undefined, ...children: XChild[]): Root
   *   (name: string, attributes: XAttributes, ...children: XChild[]): Element
   *   (name: string, ...children: XChild[]): Element
   * }}
   */
  (
    /**
     * Hyperscript compatible DSL for creating virtual xast trees.
     *
     * @param {string|null} [name]
     * @param {XAttributes|XChild} [attributes]
     * @param {XChild[]} children
     * @returns {XResult}
     */
    function (name, attributes, ...children) {
      var index = -1;
      /** @type {XResult} */
      var node;
      /** @type {string} */
      var key;

      if (name === undefined || name === null) {
        node = {type: 'root', children: []};
        // @ts-ignore Root builder doesn’t accept attributes.
        children.unshift(attributes);
      } else if (typeof name === 'string') {
        node = {type: 'element', name, attributes: {}, children: []};

        if (isAttributes(attributes)) {
          for (key in attributes) {
            // Ignore nullish and NaN values.
            if (
              attributes[key] !== undefined &&
              attributes[key] !== null &&
              (typeof attributes[key] !== 'number' ||
                !Number.isNaN(attributes[key]))
            ) {
              // @ts-ignore Pretty sure we just set it.
              node.attributes[key] = String(attributes[key]);
            }
          }
        } else {
          children.unshift(attributes);
        }
      } else {
        throw new TypeError('Expected element name, got `' + name + '`')
      }

      // Handle children.
      while (++index < children.length) {
        addChild(node.children, children[index]);
      }

      return node
    }
  );

/**
 * @param {Array.<Child>} nodes
 * @param {XChild} value
 */
function addChild(nodes, value) {
  var index = -1;

  if (value === undefined || value === null) ; else if (typeof value === 'string' || typeof value === 'number') {
    nodes.push({type: 'text', value: String(value)});
  } else if (Array.isArray(value)) {
    while (++index < value.length) {
      addChild(nodes, value[index]);
    }
  } else if (typeof value === 'object' && 'type' in value) {
    if (value.type === 'root') {
      addChild(nodes, value.children);
    } else {
      nodes.push(value);
    }
  } else {
    throw new TypeError('Expected node, nodes, string, got `' + value + '`')
  }
}

/**
 * @param {XAttributes|XChild} value
 * @returns {value is XAttributes}
 */
function isAttributes(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }

  return true
}

/**
 * @typedef {import('./index.js').Parent} Parent
 * @typedef {import('./index.js').Context} Context
 * @typedef {import('./index.js').Child} Child
 */

/**
 * Serialize all children of `parent`.
 *
 * @param {Parent} parent
 * @param {Context} ctx
 * @returns {string}
 *
 */
function all(parent, ctx) {
  /** @type {Array.<Child>} */
  var children = (parent && parent.children) || [];
  var index = -1;
  /** @type {Array.<string>} */
  var results = [];

  while (++index < children.length) {
    results[index] = one(children[index], ctx);
  }

  return results.join('')
}

/**
 * @typedef {Object} CoreOptions
 * @property {string[]} [subset=[]]
 *   Whether to only escape the given subset of characters.
 * @property {boolean} [escapeOnly=false]
 *   Whether to only escape possibly dangerous characters.
 *   Those characters are `"`, `&`, `'`, `<`, `>`, and `` ` ``.
 *
 * @typedef {Object} FormatOptions
 * @property {(code: number, next: number, options: CoreWithFormatOptions) => string} format
 *   Format strategy.
 *
 * @typedef {CoreOptions & FormatOptions & import('./util/format-smart.js').FormatSmartOptions} CoreWithFormatOptions
 */

/**
 * Encode certain characters in `value`.
 *
 * @param {string} value
 * @param {CoreWithFormatOptions} options
 * @returns {string}
 */
function core(value, options) {
  value = value.replace(
    options.subset ? charactersToExpression(options.subset) : /["&'<>`]/g,
    basic
  );

  if (options.subset || options.escapeOnly) {
    return value
  }

  return (
    value
      // Surrogate pairs.
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, surrogate)
      // BMP control characters (C0 except for LF, CR, SP; DEL; and some more
      // non-ASCII ones).
      .replace(
        // eslint-disable-next-line no-control-regex, unicorn/no-hex-escape
        /[\x01-\t\v\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g,
        basic
      )
  )

  /**
   * @param {string} pair
   * @param {number} index
   * @param {string} all
   */
  function surrogate(pair, index, all) {
    return options.format(
      (pair.charCodeAt(0) - 0xd800) * 0x400 +
        pair.charCodeAt(1) -
        0xdc00 +
        0x10000,
      all.charCodeAt(index + 2),
      options
    )
  }

  /**
   * @param {string} character
   * @param {number} index
   * @param {string} all
   */
  function basic(character, index, all) {
    return options.format(
      character.charCodeAt(0),
      all.charCodeAt(index + 1),
      options
    )
  }
}

/**
 * @param {string[]} subset
 * @returns {RegExp}
 */
function charactersToExpression(subset) {
  /** @type {string[]} */
  const groups = [];
  let index = -1;

  while (++index < subset.length) {
    groups.push(subset[index].replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'));
  }

  return new RegExp('(?:' + groups.join('|') + ')', 'g')
}

/**
 * The smallest way to encode a character.
 *
 * @param {number} code
 * @returns {string}
 */
function formatBasic(code) {
  return '&#x' + code.toString(16).toUpperCase() + ';'
}

/**
 * @typedef {import('./core.js').CoreOptions & import('./util/format-smart.js').FormatSmartOptions} Options
 * @typedef {import('./core.js').CoreOptions} LightOptions
 */

/**
 * Encode special characters in `value` as hexadecimals.
 *
 * @param {string} value
 *   Value to encode.
 * @param {LightOptions} [options]
 *   Configuration.
 * @returns {string}
 *   Encoded value.
 */
function stringifyEntitiesLight(value, options) {
  return core(value, Object.assign({format: formatBasic}, options))
}

var noncharacter = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Escape a string.
 *
 * @param {string} value
 * @param {Array.<string>} subset
 * @param {RegExp} [unsafe]
 * @returns {string}
 */
function escape(value, subset, unsafe) {
  var result = clean(value);

  return unsafe ? result.replace(unsafe, encode) : encode(result)

  /**
   * @param {string} $0
   * @returns {string}
   */
  function encode($0) {
    return stringifyEntitiesLight($0, {subset})
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function clean(value) {
  return String(value || '').replace(noncharacter, '')
}

var subset$3 = ['\t', '\n', ' ', '"', '&', "'", '/', '<', '=', '>'];

/**
 * Serialize a node name.
 *
 * @param {string} value
 * @returns {string}
 */
function name(value) {
  return escape(value, subset$3)
}

/**
 * Count how often a character (or substring) is used in a string.
 *
 * @param {string} value
 *   Value to search in.
 * @param {string} character
 *   Character (or substring) to look for.
 * @return {number}
 *   Number of times `character` occurred in `value`.
 */
function ccount(value, character) {
  const source = String(value);

  if (typeof character !== 'string') {
    throw new TypeError('Expected character')
  }

  let count = 0;
  let index = source.indexOf(character);

  while (index !== -1) {
    count++;
    index = source.indexOf(character, index + character.length);
  }

  return count
}

/**
 * @typedef {import('./index.js').Context} Context
 */

/**
 * Serialize an attribute value.
 *
 * @param {string} value
 * @param {Context} ctx
 * @returns {string}
 */
function value(value, ctx) {
  var primary = ctx.quote;
  var secondary = ctx.alternative;
  var result = String(value);
  var quote =
    secondary && ccount(result, primary) > ccount(result, secondary)
      ? secondary
      : primary;

  return quote + escape(result, ['<', '&', quote]) + quote
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Element} Element
 * @typedef {import('./index.js').Attributes} Attributes
 */

var own$1 = {}.hasOwnProperty;

/**
 * Serialize an element.
 *
 * @type {Handle}
 * @param {Element} node
 */
function element(node, ctx) {
  var nodeName = name(node.name);
  var content = all(node, ctx);
  /** @type {Attributes} */
  var attributes = node.attributes || {};
  var close = content ? false : ctx.close;
  /** @type {Array.<string>} */
  var attrs = [];
  /** @type {string} */
  var key;
  /** @type {Attributes[keyof Attributes]} */
  var result;

  for (key in attributes) {
    if (own$1.call(attributes, key)) {
      result = attributes[key];

      if (result !== null && result !== undefined) {
        attrs.push(name(key) + '=' + value(result, ctx));
      }
    }
  }

  return (
    '<' +
    nodeName +
    (attrs.length === 0 ? '' : ' ' + attrs.join(' ')) +
    (close ? (ctx.tight ? '' : ' ') + '/' : '') +
    '>' +
    content +
    (close ? '' : '</' + nodeName + '>')
  )
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Text} Text
 */

var subset$2 = ['&', '<'];

/**
 * Serialize a text.
 *
 * @type {Handle}
 * @param {Text} node
 */
function text(node) {
  return escape(node.value, subset$2)
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Comment} Comment
 */

/**
 * Serialize a comment.
 *
 * @type {Handle}
 * @param {Comment} node
 */
function comment(node) {
  return '<!--' + escape(node.value, ['-']) + '-->'
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Doctype} Doctype
 */

/**
 * Serialize a doctype.
 *
 * @type {Handle}
 * @param {Doctype} node
 */
function doctype(node, ctx) {
  var nodeName = name(node.name);
  var pub = node.public;
  var sys = node.system;
  var result = '<!DOCTYPE';

  if (nodeName !== '') {
    result += ' ' + nodeName;
  }

  if (pub !== null && pub !== undefined && pub !== '') {
    result += ' PUBLIC ' + value(pub, ctx);
  } else if (sys !== null && sys !== undefined && sys !== '') {
    result += ' SYSTEM';
  }

  if (sys !== null && sys !== undefined && sys !== '') {
    result += ' ' + value(sys, ctx);
  }

  return result + '>'
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Instruction} Instruction
 */

var unsafe$1 = /\?>/g;
var subset$1 = ['>'];

/**
 * Serialize an instruction.
 *
 * @type {Handle}
 * @param {Instruction} node
 */
function instruction(node) {
  var nodeName = name(node.name) || 'x';
  var result = escape(node.value, subset$1, unsafe$1);
  return '<?' + nodeName + (result ? ' ' + result : '') + '?>'
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Cdata} Cdata
 */

var unsafe = /]]>/g;
var subset = ['>'];

/**
 * Serialize a CDATA section.
 *
 * @type {Handle}
 * @param {Cdata} node
 */
function cdata(node) {
  return '<![CDATA[' + escape(node.value, subset, unsafe) + ']]>'
}

/**
 * @typedef {import('./index.js').Handle} Handle
 * @typedef {import('./index.js').Raw} Raw
 */

/**
 * Serialize a (non-standard) raw.
 *
 * @type {Handle}
 * @param {Raw} node
 */
function raw(node, ctx) {
  // @ts-ignore Looks like a text.
  return ctx.dangerous ? node.value : text(node)
}

/**
 * @typedef {import('./index.js').Handle} Handle
 */

var own = {}.hasOwnProperty;

var handlers = {
  root: all,
  element,
  text,
  comment,
  doctype,
  instruction,
  cdata,
  raw
};

/**
 * Serialize a node.
 *
 * @type {Handle}
 */
function one(node, ctx) {
  var type = node && node.type;

  if (!type) {
    throw new Error('Expected node, not `' + node + '`')
  }

  if (!own.call(handlers, type)) {
    throw new Error('Cannot compile unknown node `' + type + '`')
  }

  // @ts-ignore Hush, it works.
  return handlers[type](node, ctx)
}

/**
 * @typedef {import('xast').Root} Root
 * @typedef {import('xast').Element} Element
 * @typedef {import('xast').Cdata} Cdata
 * @typedef {import('xast').Comment} Comment
 * @typedef {import('xast').Doctype} Doctype
 * @typedef {import('xast').Instruction} Instruction
 * @typedef {import('xast').Text} Text
 * @typedef {import('xast').Literal & {type: 'raw'}} Raw
 * @typedef {Root|Element} Parent
 * @typedef {import('xast').Attributes} Attributes
 * @typedef {Root['children'][number]} Child
 * @typedef {Child|Root} Node
 *
 * @typedef {'"'|"'"} Quote
 *
 * @typedef Options
 * @property {Quote} [quote='"'] Preferred quote to use
 * @property {boolean} [quoteSmart=false] Use the other quote if that results in
 *   less bytes
 * @property {boolean} [closeEmptyElements=false] Close elements without any
 *   content with slash (/) on the opening tag instead of an end tag:
 *   `<circle />` instead of `<circle></circle>`.
 *   See `tightClose` to control whether a space is used before the slash.
 * @property {boolean} [tightClose=false] Do not use an extra space when closing
 *    self-closing elements: `<circle/>` instead of `<circle />`.
 * @property {boolean} [allowDangerousXml=false] Allow `raw` nodes and insert
 *   them as raw XML. When falsey, encodes `raw` nodes.
 *   Only set this if you completely trust the content!
 *
 * @typedef Context
 * @property {Quote} quote
 * @property {Quote} alternative
 * @property {boolean} close
 * @property {boolean} tight
 * @property {boolean} dangerous
 *
 * @callback Handle
 * @param {Node} node
 * @param {Context} context
 * @returns {string}
 */

/**
 * Serialize the given xast tree (or list of nodes).
 *
 * @param {Node|Array.<Node>} node
 * @param {Options} [options]
 * @returns {string}
 */
function toXml(node, options = {}) {
  var quote = options.quote || '"';
  /** @type {Quote} */
  var alternative = quote === '"' ? "'" : '"';
  var smart = options.quoteSmart;
  /** @type {Node} */
  // @ts-ignore Assume no `root` in `node`.
  var value = Array.isArray(node) ? {type: 'root', children: node} : node;

  if (quote !== '"' && quote !== "'") {
    throw new Error('Invalid quote `' + quote + '`, expected `\'` or `"`')
  }

  return one(value, {
    dangerous: options.allowDangerousXml,
    close: options.closeEmptyElements,
    tight: options.tightClose,
    quote,
    alternative: smart ? alternative : null
  })
}

const BR = u('text', '\n');
const TAB = u('text', '  ');
/**
 * Convert nested folder structure to KML. This expects
 * input that follows the same patterns as [toGeoJSON](https://github.com/placemark/togeojson)'s
 * kmlWithFolders method: a tree of folders and features,
 * starting with a root element.
 */
function foldersToKML(root) {
    return toXml(u('root', [
        x('kml', { xmlns: 'http://www.opengis.net/kml/2.2' }, x('Document', root.children.flatMap((child) => convertChild(child)))),
    ]));
}
/**
 * Convert a GeoJSON FeatureCollection to a string of
 * KML data.
 */
function toKML(featureCollection) {
    return toXml(u('root', [
        x('kml', { xmlns: 'http://www.opengis.net/kml/2.2' }, x('Document', featureCollection.features.flatMap((feature) => convertFeature(feature)))),
    ]));
}
function convertChild(child) {
    switch (child.type) {
        case 'Feature':
            return convertFeature(child);
        case 'folder':
            return convertFolder(child);
    }
}
function convertFolder(folder) {
    const id = ['string', 'number'].includes(typeof folder.meta.id)
        ? {
            id: String(folder.meta.id),
        }
        : {};
    return [
        BR,
        x('Folder', id, [
            BR,
            ...folderMeta(folder.meta),
            BR,
            TAB,
            ...folder.children.flatMap((child) => convertChild(child)),
        ]),
    ];
}
const META_PROPERTIES = [
    'address',
    'description',
    'name',
    'open',
    'visibility',
    'phoneNumber',
];
function folderMeta(meta) {
    return META_PROPERTIES.filter((p) => meta[p] !== undefined).map((p) => {
        return x(p, [u('text', String(meta[p]))]);
    });
}
function convertFeature(feature) {
    const { id } = feature;
    const idMember = ['string', 'number'].includes(typeof id)
        ? {
            id: id,
        }
        : {};
    return [
        BR,
        x('Placemark', idMember, [
            BR,
            ...propertiesToTags(feature.properties),
            BR,
            TAB,
            ...(feature.geometry ? [convertGeometry(feature.geometry)] : []),
        ]),
    ];
}
function join(position) {
    return `${position[0]},${position[1]}`;
}
function coord1(coordinates) {
    return x('coordinates', [u('text', join(coordinates))]);
}
function coord2(coordinates) {
    return x('coordinates', [u('text', coordinates.map(join).join('\n'))]);
}
function toString(value) {
    switch (typeof value) {
        case 'string': {
            return value;
        }
        case 'boolean':
        case 'number': {
            return String(value);
        }
        case 'object': {
            try {
                return JSON.stringify(value);
            }
            catch (e) {
                return '';
            }
        }
    }
    return '';
}
function maybeCData(value) {
    if (value &&
        typeof value === 'object' &&
        '@type' in value &&
        value['@type'] === 'html' &&
        'value' in value &&
        typeof value.value === 'string') {
        return u('cdata', value.value);
    }
    return toString(value);
}
function propertiesToTags(properties) {
    if (!properties)
        return [];
    const { name, description, visibility, ...otherProperties } = properties;
    return [
        name && x('name', [u('text', toString(name))]),
        description && x('description', [u('text', maybeCData(description))]),
        visibility !== undefined &&
            x('visibility', [u('text', visibility ? '1' : '0')]),
        x('ExtendedData', Object.entries(otherProperties).flatMap(([name, value]) => [
            BR,
            TAB,
            x('Data', { name: name }, [
                x('value', [
                    u('text', typeof value === 'string' ? value : JSON.stringify(value)),
                ]),
            ]),
        ])),
    ].filter(Boolean);
}
const linearRing = (ring) => x('LinearRing', [coord2(ring)]);
function convertMultiPoint(geometry) {
    return x('MultiGeometry', geometry.coordinates.flatMap((coordinates) => [
        BR,
        convertGeometry({
            type: 'Point',
            coordinates,
        }),
    ]));
}
function convertMultiLineString(geometry) {
    return x('MultiGeometry', geometry.coordinates.flatMap((coordinates) => [
        BR,
        convertGeometry({
            type: 'LineString',
            coordinates,
        }),
    ]));
}
function convertMultiPolygon(geometry) {
    return x('MultiGeometry', geometry.coordinates.flatMap((coordinates) => [
        BR,
        convertGeometry({
            type: 'Polygon',
            coordinates,
        }),
    ]));
}
function convertPolygon(geometry) {
    const [outerBoundary, ...innerRings] = geometry.coordinates;
    return x('Polygon', [
        BR,
        x('outerBoundaryIs', [BR, TAB, linearRing(outerBoundary)]),
        ...innerRings.flatMap((innerRing) => [
            BR,
            x('innerBoundaryIs', [BR, TAB, linearRing(innerRing)]),
        ]),
    ]);
}
function convertGeometry(geometry) {
    switch (geometry.type) {
        case 'Point':
            return x('Point', [coord1(geometry.coordinates)]);
        case 'MultiPoint':
            return convertMultiPoint(geometry);
        case 'LineString':
            return x('LineString', [coord2(geometry.coordinates)]);
        case 'MultiLineString':
            return convertMultiLineString(geometry);
        case 'Polygon':
            return convertPolygon(geometry);
        case 'MultiPolygon':
            return convertMultiPolygon(geometry);
        case 'GeometryCollection':
            return x('MultiGeometry', geometry.geometries.flatMap((geometry) => [
                BR,
                convertGeometry(geometry),
            ]));
    }
}

exports.foldersToKML = foldersToKML;
exports.toKML = toKML;


},{}],"@tmcw/togeojson":[function(require,module,exports){
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((t="undefined"!=typeof globalThis?globalThis:t||self).toGeoJSON={})}(this,(function(t){"use strict";function e(t,e){return Array.from(t.getElementsByTagName(e))}function n(t){return"#"===t[0]?t:`#${t}`}function o(t){return t?.normalize(),t&&t.textContent||""}function r(t,e,n){const o=t.getElementsByTagName(e),r=o.length?o[0]:null;return r&&n&&n(r),r}function i(t,e,n){const o={};if(!t)return o;const r=t.getElementsByTagName(e),i=r.length?r[0]:null;return i&&n?n(i,o):o}function s(t,e,n){const i=o(r(t,e));return i&&n&&n(i)||{}}function c(t,e,n){const i=parseFloat(o(r(t,e)));if(!isNaN(i))return i&&n&&n(i)||{}}function a(t,e,n){const i=parseFloat(o(r(t,e)));if(!isNaN(i))return i&&n&&n(i),i}function l(t,e){const n={};for(const o of e)s(t,o,(t=>{n[o]=t}));return n}function u(t){return 1===t?.nodeType}function f(t){return i(t,"line",(t=>Object.assign({},s(t,"color",(t=>({stroke:`#${t}`}))),c(t,"opacity",(t=>({"stroke-opacity":t}))),c(t,"width",(t=>({"stroke-width":96*t/25.4}))))))}function p(t){let e=[];if(null===t)return e;for(const n of Array.from(t.childNodes)){if(!u(n))continue;const t=g(n.nodeName);if("gpxtpx:TrackPointExtension"===t)e=e.concat(p(n));else{const r=o(n);e.push([t,d(r)])}}return e}function g(t){return["heart","gpxtpx:hr","hr"].includes(t)?"heart":t}function d(t){const e=parseFloat(t);return isNaN(e)?t:e}function h(t){const e=[parseFloat(t.getAttribute("lon")||""),parseFloat(t.getAttribute("lat")||"")];if(isNaN(e[0])||isNaN(e[1]))return null;a(t,"ele",(t=>{e.push(t)}));const n=r(t,"time");return{coordinates:e,time:n?o(n):null,extendedValues:p(r(t,"extensions"))}}function m(t){const n=l(t,["name","cmt","desc","type","time","keywords"]),r=Array.from(t.getElementsByTagNameNS("http://www.garmin.com/xmlschemas/GpxExtensions/v3","*"));for(const e of r)e.parentNode?.parentNode===t&&(n[e.tagName.replace(":","_")]=o(e));const i=e(t,"link");return i.length&&(n.links=i.map((t=>Object.assign({href:t.getAttribute("href")},l(t,["text","type"]))))),n}function y(t,n){const o=e(t,n),r=[],i=[],s={};for(let t=0;t<o.length;t++){const e=h(o[t]);if(e){r.push(e.coordinates),e.time&&i.push(e.time);for(const[n,r]of e.extendedValues){const e="heart"===n?n:n.replace("gpxtpx:","")+"s";s[e]||(s[e]=Array(o.length).fill(null)),s[e][t]=r}}}if(!(r.length<2))return{line:r,times:i,extendedValues:s}}function b(t){const e=y(t,"rtept");if(e)return{type:"Feature",properties:Object.assign({_gpxType:"rte"},m(t),f(r(t,"extensions"))),geometry:{type:"LineString",coordinates:e.line}}}function N(t){const n=e(t,"trkseg"),o=[],i=[],s=[];for(const t of n){const e=y(t,"trkpt");e&&(s.push(e),e.times&&e.times.length&&i.push(e.times))}if(0===s.length)return null;const c=s.length>1,a=Object.assign({_gpxType:"trk"},m(t),f(r(t,"extensions")),i.length?{coordinateProperties:{times:c?i:i[0]}}:{});for(const t of s){o.push(t.line),a.coordinateProperties||(a.coordinateProperties={});const e=a.coordinateProperties,n=Object.entries(t.extendedValues);for(let t=0;t<n.length;t++){const[o,r]=n[t];c?(e[o]||(e[o]=s.map((t=>new Array(t.line.length).fill(null)))),e[o][t]=r):e[o]=r}}return{type:"Feature",properties:a,geometry:c?{type:"MultiLineString",coordinates:o}:{type:"LineString",coordinates:o[0]}}}function x(t){const e=Object.assign(m(t),l(t,["sym"])),n=h(t);return n?{type:"Feature",properties:e,geometry:{type:"Point",coordinates:n.coordinates}}:null}function*k(t){for(const n of e(t,"trk")){const t=N(n);t&&(yield t)}for(const n of e(t,"rte")){const t=b(n);t&&(yield t)}for(const n of e(t,"wpt")){const t=x(n);t&&(yield t)}}const A=[["heartRate","heartRates"],["Cadence","cadences"],["Speed","speeds"],["Watts","watts"]],S=[["TotalTimeSeconds","totalTimeSeconds"],["DistanceMeters","distanceMeters"],["MaximumSpeed","maxSpeed"],["AverageHeartRateBpm","avgHeartRate"],["MaximumHeartRateBpm","maxHeartRate"],["AvgSpeed","avgSpeed"],["AvgWatts","avgWatts"],["MaxWatts","maxWatts"]];function v(t,e){const n=[];for(const[i,s]of e){let e=r(t,i);if(!e){const n=t.getElementsByTagNameNS("http://www.garmin.com/xmlschemas/ActivityExtension/v2",i);n.length&&(e=n[0])}const c=parseFloat(o(e));isNaN(c)||n.push([s,c])}return n}function T(t){const e=[a(t,"LongitudeDegrees"),a(t,"LatitudeDegrees")];if(void 0===e[0]||isNaN(e[0])||void 0===e[1]||isNaN(e[1]))return null;const n=r(t,"HeartRateBpm"),i=o(r(t,"Time"));return r(t,"AltitudeMeters",(t=>{const n=parseFloat(o(t));isNaN(n)||e.push(n)})),{coordinates:e,time:i||null,heartRate:n?parseFloat(o(n)):null,extensions:v(t,A)}}function F(t){const n=e(t,"Trackpoint"),o=[],r=[],i=[];if(n.length<2)return null;const s={},c={extendedProperties:s};for(let t=0;t<n.length;t++){const e=T(n[t]);if(null===e)continue;o.push(e.coordinates);const{time:c,heartRate:a,extensions:l}=e;c&&r.push(c),a&&i.push(a);for(const[e,o]of l)s[e]||(s[e]=Array(n.length).fill(null)),s[e][t]=o}return o.length<2?null:Object.assign(c,{line:o,times:r,heartRates:i})}function P(t){const n=e(t,"Track"),r=[],s=[],c=[],a=[];let l;const u=Object.assign(Object.fromEntries(v(t,S)),i(t,"Name",(t=>({name:o(t)}))));for(const t of n)l=F(t),l&&(r.push(l.line),l.times.length&&s.push(l.times),l.heartRates.length&&c.push(l.heartRates),a.push(l.extendedProperties));for(let t=0;t<a.length;t++){const e=a[t];for(const o in e)1===n.length?l&&(u[o]=l.extendedProperties[o]):(u[o]||(u[o]=r.map((t=>Array(t.length).fill(null)))),u[o][t]=e[o])}return 0===r.length?null:((s.length||c.length)&&(u.coordinateProperties=Object.assign(s.length?{times:1===r.length?s[0]:s}:{},c.length?{heart:1===r.length?c[0]:c}:{})),{type:"Feature",properties:u,geometry:1===r.length?{type:"LineString",coordinates:r[0]}:{type:"MultiLineString",coordinates:r}})}function*O(t){for(const n of e(t,"Lap")){const t=P(n);t&&(yield t)}for(const n of e(t,"Courses")){const t=P(n);t&&(yield t)}}function w(t,e){const n={},o="stroke"==e||"fill"===e?e:e+"-color";return"#"===t[0]&&(t=t.substring(1)),6===t.length||3===t.length?n[o]="#"+t:8===t.length&&(n[e+"-opacity"]=parseInt(t.substring(0,2),16)/255,n[o]="#"+t.substring(6,8)+t.substring(4,6)+t.substring(2,4)),n}function M(t,e,n){const o={};return a(t,e,(t=>{o[n]=t})),o}function j(t,e){return i(t,"color",(t=>w(o(t),e)))}function L(t){return i(t,"Icon",((t,e)=>(s(t,"href",(t=>{e.icon=t})),e)))}function R(t){return Object.assign({},function(t){return i(t,"PolyStyle",((t,e)=>Object.assign(e,i(t,"color",(t=>w(o(t),"fill"))),s(t,"fill",(t=>{if("0"===t)return{"fill-opacity":0}})),s(t,"outline",(t=>{if("0"===t)return{"stroke-opacity":0}})))))}(t),function(t){return i(t,"LineStyle",(t=>Object.assign(j(t,"stroke"),M(t,"width","stroke-width"))))}(t),function(t){return i(t,"LabelStyle",(t=>Object.assign(j(t,"label"),M(t,"scale","label-scale"))))}(t),function(t){return i(t,"IconStyle",(t=>Object.assign(j(t,"icon"),M(t,"scale","icon-scale"),M(t,"heading","icon-heading"),i(t,"hotSpot",(t=>{const e=parseFloat(t.getAttribute("x")||""),n=parseFloat(t.getAttribute("y")||""),o=t.getAttribute("xunits")||"",r=t.getAttribute("yunits")||"";return isNaN(e)||isNaN(n)?{}:{"icon-offset":[e,n],"icon-offset-units":[o,r]}})),L(t))))}(t))}const B=t=>Number(t),E={string:t=>t,int:B,uint:B,short:B,ushort:B,float:B,double:B,bool:t=>Boolean(t)};function G(t,n){return i(t,"ExtendedData",((t,i)=>{for(const n of e(t,"Data"))i[n.getAttribute("name")||""]=o(r(n,"value"));for(const r of e(t,"SimpleData")){const t=r.getAttribute("name")||"",e=n[t]||E.string;i[t]=e(o(r))}return i}))}function C(t){const e=r(t,"description");for(const t of Array.from(e?.childNodes||[]))if(4===t.nodeType)return{description:{"@type":"html",value:o(t)}};return{}}function D(t){return i(t,"TimeSpan",(t=>({timespan:{begin:o(r(t,"begin")),end:o(r(t,"end"))}})))}function W(t){return i(t,"TimeStamp",(t=>({timestamp:o(r(t,"when"))})))}function H(t,e){return s(t,"styleUrl",(t=>(t=n(t),e[t]?Object.assign({styleUrl:t},e[t]):{styleUrl:t})))}const _=/\s*/g,I=/^\s*|\s*$/g,U=/\s+/;function V(t){return t.replace(_,"").split(",").map(parseFloat).filter((t=>!isNaN(t))).slice(0,3)}function $(t){return t.replace(I,"").split(U).map(V).filter((t=>t.length>=2))}function q(t){let n=e(t,"coord");var r,i,s;0===n.length&&(r=t,i="coord",s="*",n=Array.from(r.getElementsByTagNameNS(s,i)));const c=n.map((t=>o(t).split(" ").map(parseFloat)));return 0===c.length?null:{geometry:c.length>2?{type:"LineString",coordinates:c}:{type:"Point",coordinates:c[0]},times:e(t,"when").map((t=>o(t)))}}function z(t){if(0===t.length)return t;const e=t[0],n=t[t.length-1];let o=!0;for(let t=0;t<Math.max(e.length,n.length);t++)if(e[t]!==n[t]){o=!1;break}return o?t:t.concat([t[0]])}function J(t){return o(r(t,"coordinates"))}function Q(t){let n=[],o=[];for(let r=0;r<t.childNodes.length;r++){const i=t.childNodes.item(r);if(u(i))switch(i.tagName){case"MultiGeometry":case"MultiTrack":case"gx:MultiTrack":{const t=Q(i);n=n.concat(t.geometries),o=o.concat(t.coordTimes);break}case"Point":{const t=V(J(i));t.length>=2&&n.push({type:"Point",coordinates:t});break}case"LinearRing":case"LineString":{const t=$(J(i));t.length>=2&&n.push({type:"LineString",coordinates:t});break}case"Polygon":{const t=[];for(const n of e(i,"LinearRing")){const e=z($(J(n)));e.length>=4&&t.push(e)}t.length&&n.push({type:"Polygon",coordinates:t});break}case"Track":case"gx:Track":{const t=q(i);if(!t)break;const{times:e,geometry:r}=t;n.push(r),e.length&&o.push(e);break}}}return{geometries:n,coordTimes:o}}function K(t){return 0===t.length?null:1===t.length?t[0]:{type:"GeometryCollection",geometries:t}}function X(t,e,n){const{coordTimes:o,geometries:r}=Q(t),i={type:"Feature",geometry:K(r),properties:Object.assign(l(t,["name","address","visibility","open","phoneNumber","description"]),C(t),H(t,e),R(t),G(t,n),D(t),W(t),o.length?{coordinateProperties:{times:1===o.length?o[0]:o}}:{})};void 0!==i.properties?.visibility&&(i.properties.visibility="0"!==i.properties.visibility);const s=t.getAttribute("id");return null!==s&&""!==s&&(i.id=s),i}function Y(t){if(r(t,"gx:LatLonQuad")){return{type:"Polygon",coordinates:[z($(J(t)))]}}return function(t){const e=r(t,"LatLonBox");if(e){const t=a(e,"north"),n=a(e,"west"),o=a(e,"east"),r=a(e,"south"),i=a(e,"rotation");if("number"==typeof t&&"number"==typeof r&&"number"==typeof n&&"number"==typeof o){const e=[n,r,o,t];let s=[[[n,t],[o,t],[o,r],[n,r],[n,t]]];return"number"==typeof i&&(s=function(t,e,n){const o=[(t[0]+t[2])/2,(t[1]+t[3])/2];return[e[0].map((t=>{const e=t[1]-o[1],r=t[0]-o[0],i=Math.sqrt(Math.pow(e,2)+Math.pow(r,2)),s=Math.atan2(e,r)-n*Z;return[o[0]+Math.cos(s)*i,o[1]+Math.sin(s)*i]}))]}(e,s,i)),{type:"Polygon",coordinates:s}}}return null}(t)}const Z=Math.PI/180;function tt(t,e,n){const o={type:"Feature",geometry:Y(t),properties:Object.assign({"@geometry-type":"groundoverlay"},l(t,["name","address","visibility","open","phoneNumber","description"]),C(t),H(t,e),R(t),L(t),G(t,n),D(t),W(t))};void 0!==o.properties?.visibility&&(o.properties.visibility="0"!==o.properties.visibility);const r=t.getAttribute("id");return null!==r&&""!==r&&(o.id=r),o}function et(t){let e=t.getAttribute("id");const o=t.parentNode;return!e&&u(o)&&"CascadingStyle"===o.localName&&(e=o.getAttribute("kml:id")||o.getAttribute("id")),n(e||"")}function nt(t){const o={};for(const n of e(t,"Style"))o[et(n)]=R(n);for(const r of e(t,"StyleMap")){const t=n(r.getAttribute("id")||"");s(r,"styleUrl",(e=>{e=n(e),o[e]&&(o[t]=o[e])}))}return o}function ot(t){const n={};for(const o of e(t,"SimpleField"))n[o.getAttribute("name")||""]=E[o.getAttribute("type")||""]||E.string;return n}const rt=["name","visibility","open","address","description","phoneNumber","visibility"];function*it(t){const n=nt(t),o=ot(t);for(const r of e(t,"Placemark")){const t=X(r,n,o);t&&(yield t)}for(const r of e(t,"GroundOverlay")){const t=tt(r,n,o);t&&(yield t)}}t.gpx=function(t){return{type:"FeatureCollection",features:Array.from(k(t))}},t.gpxGen=k,t.kml=function(t){return{type:"FeatureCollection",features:Array.from(it(t))}},t.kmlGen=it,t.kmlWithFolders=function(t){const e=nt(t),n=ot(t),r={type:"root",children:[]};return function t(r,i){if(u(r))switch(r.tagName){case"GroundOverlay":{const t=tt(r,e,n);t&&i.children.push(t);break}case"Placemark":{const t=X(r,e,n);t&&i.children.push(t);break}case"Folder":{const t=function(t){const e={};for(const n of Array.from(t.childNodes))u(n)&&rt.includes(n.tagName)&&(e[n.tagName]=o(n));return{type:"folder",meta:e,children:[]}}(r);i.children.push(t),i=t;break}}if(r.childNodes)for(let e=0;e<r.childNodes.length;e++)t(r.childNodes[e],i)}(t,r),r},t.tcx=function(t){return{type:"FeatureCollection",features:Array.from(O(t))}},t.tcxGen=O,Object.defineProperty(t,"__esModule",{value:!0})}));


},{}],"buffer":[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":1,"buffer":"buffer","ieee754":44}],"flatbush":[function(require,module,exports){
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global = global || self, global.Flatbush = factory());
}(this, (function () { 'use strict';

var FlatQueue = function FlatQueue() {
    this.ids = [];
    this.values = [];
    this.length = 0;
};

FlatQueue.prototype.clear = function clear () {
    this.length = 0;
};

FlatQueue.prototype.push = function push (id, value) {
    var pos = this.length++;
    this.ids[pos] = id;
    this.values[pos] = value;

    while (pos > 0) {
        var parent = (pos - 1) >> 1;
        var parentValue = this.values[parent];
        if (value >= parentValue) { break; }
        this.ids[pos] = this.ids[parent];
        this.values[pos] = parentValue;
        pos = parent;
    }

    this.ids[pos] = id;
    this.values[pos] = value;
};

FlatQueue.prototype.pop = function pop () {
    if (this.length === 0) { return undefined; }

    var top = this.ids[0];
    this.length--;

    if (this.length > 0) {
        var id = this.ids[0] = this.ids[this.length];
        var value = this.values[0] = this.values[this.length];
        var halfLength = this.length >> 1;
        var pos = 0;

        while (pos < halfLength) {
            var left = (pos << 1) + 1;
            var right = left + 1;
            var bestIndex = this.ids[left];
            var bestValue = this.values[left];
            var rightValue = this.values[right];

            if (right < this.length && rightValue < bestValue) {
                left = right;
                bestIndex = this.ids[right];
                bestValue = rightValue;
            }
            if (bestValue >= value) { break; }

            this.ids[pos] = bestIndex;
            this.values[pos] = bestValue;
            pos = left;
        }

        this.ids[pos] = id;
        this.values[pos] = value;
    }

    return top;
};

FlatQueue.prototype.peek = function peek () {
    return this.ids[0];
};

FlatQueue.prototype.peekValue = function peekValue () {
    return this.values[0];
};

var ARRAY_TYPES = [
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array
];

var VERSION = 3; // serialized format version

var Flatbush = function Flatbush(numItems, nodeSize, ArrayType, data) {
    if ( nodeSize === void 0 ) nodeSize = 16;
    if ( ArrayType === void 0 ) ArrayType = Float64Array;

    if (numItems === undefined) { throw new Error('Missing required argument: numItems.'); }
    if (isNaN(numItems) || numItems <= 0) { throw new Error(("Unpexpected numItems value: " + numItems + ".")); }

    this.numItems = +numItems;
    this.nodeSize = Math.min(Math.max(+nodeSize, 2), 65535);

    // calculate the total number of nodes in the R-tree to allocate space for
    // and the index of each tree level (used in search later)
    var n = numItems;
    var numNodes = n;
    this._levelBounds = [n * 4];
    do {
        n = Math.ceil(n / this.nodeSize);
        numNodes += n;
        this._levelBounds.push(numNodes * 4);
    } while (n !== 1);

    this.ArrayType = ArrayType || Float64Array;
    this.IndexArrayType = numNodes < 16384 ? Uint16Array : Uint32Array;

    var arrayTypeIndex = ARRAY_TYPES.indexOf(this.ArrayType);
    var nodesByteSize = numNodes * 4 * this.ArrayType.BYTES_PER_ELEMENT;

    if (arrayTypeIndex < 0) {
        throw new Error(("Unexpected typed array class: " + ArrayType + "."));
    }

    if (data && (data instanceof ArrayBuffer)) {
        this.data = data;
        this._boxes = new this.ArrayType(this.data, 8, numNodes * 4);
        this._indices = new this.IndexArrayType(this.data, 8 + nodesByteSize, numNodes);

        this._pos = numNodes * 4;
        this.minX = this._boxes[this._pos - 4];
        this.minY = this._boxes[this._pos - 3];
        this.maxX = this._boxes[this._pos - 2];
        this.maxY = this._boxes[this._pos - 1];

    } else {
        this.data = new ArrayBuffer(8 + nodesByteSize + numNodes * this.IndexArrayType.BYTES_PER_ELEMENT);
        this._boxes = new this.ArrayType(this.data, 8, numNodes * 4);
        this._indices = new this.IndexArrayType(this.data, 8 + nodesByteSize, numNodes);
        this._pos = 0;
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;

        new Uint8Array(this.data, 0, 2).set([0xfb, (VERSION << 4) + arrayTypeIndex]);
        new Uint16Array(this.data, 2, 1)[0] = nodeSize;
        new Uint32Array(this.data, 4, 1)[0] = numItems;
    }

    // a priority queue for k-nearest-neighbors queries
    this._queue = new FlatQueue();
};

Flatbush.from = function from (data) {
    if (!(data instanceof ArrayBuffer)) {
        throw new Error('Data must be an instance of ArrayBuffer.');
    }
    var ref = new Uint8Array(data, 0, 2);
        var magic = ref[0];
        var versionAndType = ref[1];
    if (magic !== 0xfb) {
        throw new Error('Data does not appear to be in a Flatbush format.');
    }
    if (versionAndType >> 4 !== VERSION) {
        throw new Error(("Got v" + (versionAndType >> 4) + " data when expected v" + VERSION + "."));
    }
    var ref$1 = new Uint16Array(data, 2, 1);
        var nodeSize = ref$1[0];
    var ref$2 = new Uint32Array(data, 4, 1);
        var numItems = ref$2[0];

    return new Flatbush(numItems, nodeSize, ARRAY_TYPES[versionAndType & 0x0f], data);
};

Flatbush.prototype.add = function add (minX, minY, maxX, maxY) {
    var index = this._pos >> 2;
    this._indices[index] = index;
    this._boxes[this._pos++] = minX;
    this._boxes[this._pos++] = minY;
    this._boxes[this._pos++] = maxX;
    this._boxes[this._pos++] = maxY;

    if (minX < this.minX) { this.minX = minX; }
    if (minY < this.minY) { this.minY = minY; }
    if (maxX > this.maxX) { this.maxX = maxX; }
    if (maxY > this.maxY) { this.maxY = maxY; }

    return index;
};

Flatbush.prototype.finish = function finish () {
    if (this._pos >> 2 !== this.numItems) {
        throw new Error(("Added " + (this._pos >> 2) + " items when expected " + (this.numItems) + "."));
    }

    var width = this.maxX - this.minX;
    var height = this.maxY - this.minY;
    var hilbertValues = new Uint32Array(this.numItems);
    var hilbertMax = (1 << 16) - 1;

    // map item centers into Hilbert coordinate space and calculate Hilbert values
    for (var i = 0; i < this.numItems; i++) {
        var pos = 4 * i;
        var minX = this._boxes[pos++];
        var minY = this._boxes[pos++];
        var maxX = this._boxes[pos++];
        var maxY = this._boxes[pos++];
        var x = Math.floor(hilbertMax * ((minX + maxX) / 2 - this.minX) / width);
        var y = Math.floor(hilbertMax * ((minY + maxY) / 2 - this.minY) / height);
        hilbertValues[i] = hilbert(x, y);
    }

    // sort items by their Hilbert value (for packing later)
    sort(hilbertValues, this._boxes, this._indices, 0, this.numItems - 1);

    // generate nodes at each tree level, bottom-up
    for (var i$1 = 0, pos$1 = 0; i$1 < this._levelBounds.length - 1; i$1++) {
        var end = this._levelBounds[i$1];

        // generate a parent node for each block of consecutive <nodeSize> nodes
        while (pos$1 < end) {
            var nodeMinX = Infinity;
            var nodeMinY = Infinity;
            var nodeMaxX = -Infinity;
            var nodeMaxY = -Infinity;
            var nodeIndex = pos$1;

            // calculate bbox for the new node
            for (var i$2 = 0; i$2 < this.nodeSize && pos$1 < end; i$2++) {
                var minX$1 = this._boxes[pos$1++];
                var minY$1 = this._boxes[pos$1++];
                var maxX$1 = this._boxes[pos$1++];
                var maxY$1 = this._boxes[pos$1++];
                if (minX$1 < nodeMinX) { nodeMinX = minX$1; }
                if (minY$1 < nodeMinY) { nodeMinY = minY$1; }
                if (maxX$1 > nodeMaxX) { nodeMaxX = maxX$1; }
                if (maxY$1 > nodeMaxY) { nodeMaxY = maxY$1; }
            }

            // add the new node to the tree data
            this._indices[this._pos >> 2] = nodeIndex;
            this._boxes[this._pos++] = nodeMinX;
            this._boxes[this._pos++] = nodeMinY;
            this._boxes[this._pos++] = nodeMaxX;
            this._boxes[this._pos++] = nodeMaxY;
        }
    }
};

Flatbush.prototype.search = function search (minX, minY, maxX, maxY, filterFn) {
    if (this._pos !== this._boxes.length) {
        throw new Error('Data not yet indexed - call index.finish().');
    }

    var nodeIndex = this._boxes.length - 4;
    var level = this._levelBounds.length - 1;
    var queue = [];
    var results = [];

    while (nodeIndex !== undefined) {
        // find the end index of the node
        var end = Math.min(nodeIndex + this.nodeSize * 4, this._levelBounds[level]);

        // search through child nodes
        for (var pos = nodeIndex; pos < end; pos += 4) {
            var index = this._indices[pos >> 2] | 0;

            // check if node bbox intersects with query bbox
            if (maxX < this._boxes[pos]) { continue; } // maxX < nodeMinX
            if (maxY < this._boxes[pos + 1]) { continue; } // maxY < nodeMinY
            if (minX > this._boxes[pos + 2]) { continue; } // minX > nodeMaxX
            if (minY > this._boxes[pos + 3]) { continue; } // minY > nodeMaxY

            if (nodeIndex < this.numItems * 4) {
                if (filterFn === undefined || filterFn(index)) {
                    results.push(index); // leaf item
                }

            } else {
                queue.push(index); // node; add it to the search queue
                queue.push(level - 1);
            }
        }

        level = queue.pop();
        nodeIndex = queue.pop();
    }

    return results;
};

Flatbush.prototype.neighbors = function neighbors (x, y, maxResults, maxDistance, filterFn) {
        if ( maxResults === void 0 ) maxResults = Infinity;
        if ( maxDistance === void 0 ) maxDistance = Infinity;

    if (this._pos !== this._boxes.length) {
        throw new Error('Data not yet indexed - call index.finish().');
    }

    var nodeIndex = this._boxes.length - 4;
    var q = this._queue;
    var results = [];
    var maxDistSquared = maxDistance * maxDistance;

    while (nodeIndex !== undefined) {
        // find the end index of the node
        var end = Math.min(nodeIndex + this.nodeSize * 4, upperBound(nodeIndex, this._levelBounds));

        // add child nodes to the queue
        for (var pos = nodeIndex; pos < end; pos += 4) {
            var index = this._indices[pos >> 2] | 0;

            var dx = axisDist(x, this._boxes[pos], this._boxes[pos + 2]);
            var dy = axisDist(y, this._boxes[pos + 1], this._boxes[pos + 3]);
            var dist = dx * dx + dy * dy;

            if (nodeIndex < this.numItems * 4) { // leaf node
                if (filterFn === undefined || filterFn(index)) {
                    // put a negative index if it's an item rather than a node, to recognize later
                    q.push(-index - 1, dist);
                }
            } else {
                q.push(index, dist);
            }
        }

        // pop items from the queue
        while (q.length && q.peek() < 0) {
            var dist$1 = q.peekValue();
            if (dist$1 > maxDistSquared) {
                q.clear();
                return results;
            }
            results.push(-q.pop() - 1);

            if (results.length === maxResults) {
                q.clear();
                return results;
            }
        }

        nodeIndex = q.pop();
    }

    q.clear();
    return results;
};

function axisDist(k, min, max) {
    return k < min ? min - k : k <= max ? 0 : k - max;
}

// binary search for the first value in the array bigger than the given
function upperBound(value, arr) {
    var i = 0;
    var j = arr.length - 1;
    while (i < j) {
        var m = (i + j) >> 1;
        if (arr[m] > value) {
            j = m;
        } else {
            i = m + 1;
        }
    }
    return arr[i];
}

// custom quicksort that sorts bbox data alongside the hilbert values
function sort(values, boxes, indices, left, right) {
    if (left >= right) { return; }

    var pivot = values[(left + right) >> 1];
    var i = left - 1;
    var j = right + 1;

    while (true) {
        do { i++; } while (values[i] < pivot);
        do { j--; } while (values[j] > pivot);
        if (i >= j) { break; }
        swap(values, boxes, indices, i, j);
    }

    sort(values, boxes, indices, left, j);
    sort(values, boxes, indices, j + 1, right);
}

// swap two values and two corresponding boxes
function swap(values, boxes, indices, i, j) {
    var temp = values[i];
    values[i] = values[j];
    values[j] = temp;

    var k = 4 * i;
    var m = 4 * j;

    var a = boxes[k];
    var b = boxes[k + 1];
    var c = boxes[k + 2];
    var d = boxes[k + 3];
    boxes[k] = boxes[m];
    boxes[k + 1] = boxes[m + 1];
    boxes[k + 2] = boxes[m + 2];
    boxes[k + 3] = boxes[m + 3];
    boxes[m] = a;
    boxes[m + 1] = b;
    boxes[m + 2] = c;
    boxes[m + 3] = d;

    var e = indices[i];
    indices[i] = indices[j];
    indices[j] = e;
}

// Fast Hilbert curve algorithm by http://threadlocalmutex.com/
// Ported from C++ https://github.com/rawrunprotected/hilbert_curves (public domain)
function hilbert(x, y) {
    var a = x ^ y;
    var b = 0xFFFF ^ a;
    var c = 0xFFFF ^ (x | y);
    var d = x & (y ^ 0xFFFF);

    var A = a | (b >> 1);
    var B = (a >> 1) ^ a;
    var C = ((c >> 1) ^ (b & (d >> 1))) ^ c;
    var D = ((a & (c >> 1)) ^ (d >> 1)) ^ d;

    a = A; b = B; c = C; d = D;
    A = ((a & (a >> 2)) ^ (b & (b >> 2)));
    B = ((a & (b >> 2)) ^ (b & ((a ^ b) >> 2)));
    C ^= ((a & (c >> 2)) ^ (b & (d >> 2)));
    D ^= ((b & (c >> 2)) ^ ((a ^ b) & (d >> 2)));

    a = A; b = B; c = C; d = D;
    A = ((a & (a >> 4)) ^ (b & (b >> 4)));
    B = ((a & (b >> 4)) ^ (b & ((a ^ b) >> 4)));
    C ^= ((a & (c >> 4)) ^ (b & (d >> 4)));
    D ^= ((b & (c >> 4)) ^ ((a ^ b) & (d >> 4)));

    a = A; b = B; c = C; d = D;
    C ^= ((a & (c >> 8)) ^ (b & (d >> 8)));
    D ^= ((b & (c >> 8)) ^ ((a ^ b) & (d >> 8)));

    a = C ^ (C >> 1);
    b = D ^ (D >> 1);

    var i0 = x ^ y;
    var i1 = b | (0xFFFF ^ (i0 | a));

    i0 = (i0 | (i0 << 8)) & 0x00FF00FF;
    i0 = (i0 | (i0 << 4)) & 0x0F0F0F0F;
    i0 = (i0 | (i0 << 2)) & 0x33333333;
    i0 = (i0 | (i0 << 1)) & 0x55555555;

    i1 = (i1 | (i1 << 8)) & 0x00FF00FF;
    i1 = (i1 | (i1 << 4)) & 0x0F0F0F0F;
    i1 = (i1 | (i1 << 2)) & 0x33333333;
    i1 = (i1 | (i1 << 1)) & 0x55555555;

    return ((i1 << 1) | i0) >>> 0;
}

return Flatbush;

})));

},{}],"fs":[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"dup":2}],"iconv-lite":[function(require,module,exports){
"use strict";

var Buffer = require("safer-buffer").Buffer;

var bomHandling = require("./bom-handling"),
    iconv = module.exports;

// All codecs and aliases are kept here, keyed by encoding name/alias.
// They are lazy loaded in `iconv.getCodec` from `encodings/index.js`.
iconv.encodings = null;

// Characters emitted in case of error.
iconv.defaultCharUnicode = '�';
iconv.defaultCharSingleByte = '?';

// Public API.
iconv.encode = function encode(str, encoding, options) {
    str = "" + (str || ""); // Ensure string.

    var encoder = iconv.getEncoder(encoding, options);

    var res = encoder.write(str);
    var trail = encoder.end();
    
    return (trail && trail.length > 0) ? Buffer.concat([res, trail]) : res;
}

iconv.decode = function decode(buf, encoding, options) {
    if (typeof buf === 'string') {
        if (!iconv.skipDecodeWarning) {
            console.error('Iconv-lite warning: decode()-ing strings is deprecated. Refer to https://github.com/ashtuchkin/iconv-lite/wiki/Use-Buffers-when-decoding');
            iconv.skipDecodeWarning = true;
        }

        buf = Buffer.from("" + (buf || ""), "binary"); // Ensure buffer.
    }

    var decoder = iconv.getDecoder(encoding, options);

    var res = decoder.write(buf);
    var trail = decoder.end();

    return trail ? (res + trail) : res;
}

iconv.encodingExists = function encodingExists(enc) {
    try {
        iconv.getCodec(enc);
        return true;
    } catch (e) {
        return false;
    }
}

// Legacy aliases to convert functions
iconv.toEncoding = iconv.encode;
iconv.fromEncoding = iconv.decode;

// Search for a codec in iconv.encodings. Cache codec data in iconv._codecDataCache.
iconv._codecDataCache = {};
iconv.getCodec = function getCodec(encoding) {
    if (!iconv.encodings)
        iconv.encodings = require("../encodings"); // Lazy load all encoding definitions.
    
    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    var enc = iconv._canonicalizeEncoding(encoding);

    // Traverse iconv.encodings to find actual codec.
    var codecOptions = {};
    while (true) {
        var codec = iconv._codecDataCache[enc];
        if (codec)
            return codec;

        var codecDef = iconv.encodings[enc];

        switch (typeof codecDef) {
            case "string": // Direct alias to other encoding.
                enc = codecDef;
                break;

            case "object": // Alias with options. Can be layered.
                for (var key in codecDef)
                    codecOptions[key] = codecDef[key];

                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;
                
                enc = codecDef.type;
                break;

            case "function": // Codec itself.
                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;

                // The codec function must load all tables and return object with .encoder and .decoder methods.
                // It'll be called only once (for each different options object).
                codec = new codecDef(codecOptions, iconv);

                iconv._codecDataCache[codecOptions.encodingName] = codec; // Save it to be reused later.
                return codec;

            default:
                throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '"+enc+"')");
        }
    }
}

iconv._canonicalizeEncoding = function(encoding) {
    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    return (''+encoding).toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "");
}

iconv.getEncoder = function getEncoder(encoding, options) {
    var codec = iconv.getCodec(encoding),
        encoder = new codec.encoder(options, codec);

    if (codec.bomAware && options && options.addBOM)
        encoder = new bomHandling.PrependBOM(encoder, options);

    return encoder;
}

iconv.getDecoder = function getDecoder(encoding, options) {
    var codec = iconv.getCodec(encoding),
        decoder = new codec.decoder(options, codec);

    if (codec.bomAware && !(options && options.stripBOM === false))
        decoder = new bomHandling.StripBOM(decoder, options);

    return decoder;
}

// Streaming API
// NOTE: Streaming API naturally depends on 'stream' module from Node.js. Unfortunately in browser environments this module can add
// up to 100Kb to the output bundle. To avoid unnecessary code bloat, we don't enable Streaming API in browser by default.
// If you would like to enable it explicitly, please add the following code to your app:
// > iconv.enableStreamingAPI(require('stream'));
iconv.enableStreamingAPI = function enableStreamingAPI(stream_module) {
    if (iconv.supportsStreams)
        return;

    // Dependency-inject stream module to create IconvLite stream classes.
    var streams = require("./streams")(stream_module);

    // Not public API yet, but expose the stream classes.
    iconv.IconvLiteEncoderStream = streams.IconvLiteEncoderStream;
    iconv.IconvLiteDecoderStream = streams.IconvLiteDecoderStream;

    // Streaming API.
    iconv.encodeStream = function encodeStream(encoding, options) {
        return new iconv.IconvLiteEncoderStream(iconv.getEncoder(encoding, options), options);
    }

    iconv.decodeStream = function decodeStream(encoding, options) {
        return new iconv.IconvLiteDecoderStream(iconv.getDecoder(encoding, options), options);
    }

    iconv.supportsStreams = true;
}

// Enable Streaming API automatically if 'stream' module is available and non-empty (the majority of environments).
var stream_module;
try {
    stream_module = require("stream");
} catch (e) {}

if (stream_module && stream_module.Transform) {
    iconv.enableStreamingAPI(stream_module);

} else {
    // In rare cases where 'stream' module is not available by default, throw a helpful exception.
    iconv.encodeStream = iconv.decodeStream = function() {
        throw new Error("iconv-lite Streaming API is not enabled. Use iconv.enableStreamingAPI(require('stream')); to enable it.");
    };
}

if ("Ā" != "\u0100") {
    console.error("iconv-lite warning: js files use non-utf8 encoding. See https://github.com/ashtuchkin/iconv-lite/wiki/Javascript-source-file-encodings for more info.");
}

},{"../encodings":26,"./bom-handling":42,"./streams":43,"safer-buffer":60,"stream":2}],"idb-keyval":[function(require,module,exports){
'use strict';

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _iterableToArrayLimit(arr, i) { var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"]; if (_i == null) return; var _arr = []; var _n = true; var _d = false; var _s, _e; try { for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

Object.defineProperty(exports, '__esModule', {
  value: true
});

function promisifyRequest(request) {
  return new Promise(function (resolve, reject) {
    // @ts-ignore - file size hacks
    request.oncomplete = request.onsuccess = function () {
      return resolve(request.result);
    }; // @ts-ignore - file size hacks


    request.onabort = request.onerror = function () {
      return reject(request.error);
    };
  });
}

function createStore(dbName, storeName) {
  var request = indexedDB.open(dbName);

  request.onupgradeneeded = function () {
    return request.result.createObjectStore(storeName);
  };

  var dbp = promisifyRequest(request);
  return function (txMode, callback) {
    return dbp.then(function (db) {
      return callback(db.transaction(storeName, txMode).objectStore(storeName));
    });
  };
}

var defaultGetStoreFunc;

function defaultGetStore() {
  if (!defaultGetStoreFunc) {
    defaultGetStoreFunc = createStore('keyval-store', 'keyval');
  }

  return defaultGetStoreFunc;
}
/**
 * Get a value by its key.
 *
 * @param key
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function get(key) {
  var customStore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGetStore();
  return customStore('readonly', function (store) {
    return promisifyRequest(store.get(key));
  });
}
/**
 * Set a value with a key.
 *
 * @param key
 * @param value
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function set(key, value) {
  var customStore = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultGetStore();
  return customStore('readwrite', function (store) {
    store.put(value, key);
    return promisifyRequest(store.transaction);
  });
}
/**
 * Set multiple values at once. This is faster than calling set() multiple times.
 * It's also atomic – if one of the pairs can't be added, none will be added.
 *
 * @param entries Array of entries, where each entry is an array of `[key, value]`.
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function setMany(entries) {
  var customStore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGetStore();
  return customStore('readwrite', function (store) {
    entries.forEach(function (entry) {
      return store.put(entry[1], entry[0]);
    });
    return promisifyRequest(store.transaction);
  });
}
/**
 * Get multiple values by their keys
 *
 * @param keys
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function getMany(keys) {
  var customStore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGetStore();
  return customStore('readonly', function (store) {
    return Promise.all(keys.map(function (key) {
      return promisifyRequest(store.get(key));
    }));
  });
}
/**
 * Update a value. This lets you see the old value and update it as an atomic operation.
 *
 * @param key
 * @param updater A callback that takes the old value and returns a new value.
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function update(key, updater) {
  var customStore = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultGetStore();
  return customStore('readwrite', function (store) {
    return (// Need to create the promise manually.
      // If I try to chain promises, the transaction closes in browsers
      // that use a promise polyfill (IE10/11).
      new Promise(function (resolve, reject) {
        store.get(key).onsuccess = function () {
          try {
            store.put(updater(this.result), key);
            resolve(promisifyRequest(store.transaction));
          } catch (err) {
            reject(err);
          }
        };
      })
    );
  });
}
/**
 * Delete a particular key from the store.
 *
 * @param key
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function del(key) {
  var customStore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGetStore();
  return customStore('readwrite', function (store) {
    store.delete(key);
    return promisifyRequest(store.transaction);
  });
}
/**
 * Delete multiple keys at once.
 *
 * @param keys List of keys to delete.
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function delMany(keys) {
  var customStore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultGetStore();
  return customStore('readwrite', function (store) {
    keys.forEach(function (key) {
      return store.delete(key);
    });
    return promisifyRequest(store.transaction);
  });
}
/**
 * Clear all values in the store.
 *
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function clear() {
  var customStore = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultGetStore();
  return customStore('readwrite', function (store) {
    store.clear();
    return promisifyRequest(store.transaction);
  });
}

function eachCursor(store, callback) {
  store.openCursor().onsuccess = function () {
    if (!this.result) return;
    callback(this.result);
    this.result.continue();
  };

  return promisifyRequest(store.transaction);
}
/**
 * Get all keys in the store.
 *
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function keys() {
  var customStore = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultGetStore();
  return customStore('readonly', function (store) {
    // Fast path for modern browsers
    if (store.getAllKeys) {
      return promisifyRequest(store.getAllKeys());
    }

    var items = [];
    return eachCursor(store, function (cursor) {
      return items.push(cursor.key);
    }).then(function () {
      return items;
    });
  });
}
/**
 * Get all values in the store.
 *
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function values() {
  var customStore = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultGetStore();
  return customStore('readonly', function (store) {
    // Fast path for modern browsers
    if (store.getAll) {
      return promisifyRequest(store.getAll());
    }

    var items = [];
    return eachCursor(store, function (cursor) {
      return items.push(cursor.value);
    }).then(function () {
      return items;
    });
  });
}
/**
 * Get all entries in the store. Each entry is an array of `[key, value]`.
 *
 * @param customStore Method to get a custom store. Use with caution (see the docs).
 */


function entries() {
  var customStore = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultGetStore();
  return customStore('readonly', function (store) {
    // Fast path for modern browsers
    // (although, hopefully we'll get a simpler path some day)
    if (store.getAll && store.getAllKeys) {
      return Promise.all([promisifyRequest(store.getAllKeys()), promisifyRequest(store.getAll())]).then(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2),
            keys = _ref2[0],
            values = _ref2[1];

        return keys.map(function (key, i) {
          return [key, values[i]];
        });
      });
    }

    var items = [];
    return customStore('readonly', function (store) {
      return eachCursor(store, function (cursor) {
        return items.push([cursor.key, cursor.value]);
      }).then(function () {
        return items;
      });
    });
  });
}

exports.clear = clear;
exports.createStore = createStore;
exports.del = del;
exports.delMany = delMany;
exports.entries = entries;
exports.get = get;
exports.getMany = getMany;
exports.keys = keys;
exports.promisifyRequest = promisifyRequest;
exports.set = set;
exports.setMany = setMany;
exports.update = update;
exports.values = values;

},{}],"kdbush":[function(require,module,exports){
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global.KDBush = factory());
}(this, (function () { 'use strict';

function sortKD(ids, coords, nodeSize, left, right, depth) {
    if (right - left <= nodeSize) { return; }

    var m = (left + right) >> 1;

    select(ids, coords, m, left, right, depth % 2);

    sortKD(ids, coords, nodeSize, left, m - 1, depth + 1);
    sortKD(ids, coords, nodeSize, m + 1, right, depth + 1);
}

function select(ids, coords, k, left, right, inc) {

    while (right > left) {
        if (right - left > 600) {
            var n = right - left + 1;
            var m = k - left + 1;
            var z = Math.log(n);
            var s = 0.5 * Math.exp(2 * z / 3);
            var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
            var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
            var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
            select(ids, coords, k, newLeft, newRight, inc);
        }

        var t = coords[2 * k + inc];
        var i = left;
        var j = right;

        swapItem(ids, coords, left, k);
        if (coords[2 * right + inc] > t) { swapItem(ids, coords, left, right); }

        while (i < j) {
            swapItem(ids, coords, i, j);
            i++;
            j--;
            while (coords[2 * i + inc] < t) { i++; }
            while (coords[2 * j + inc] > t) { j--; }
        }

        if (coords[2 * left + inc] === t) { swapItem(ids, coords, left, j); }
        else {
            j++;
            swapItem(ids, coords, j, right);
        }

        if (j <= k) { left = j + 1; }
        if (k <= j) { right = j - 1; }
    }
}

function swapItem(ids, coords, i, j) {
    swap(ids, i, j);
    swap(coords, 2 * i, 2 * j);
    swap(coords, 2 * i + 1, 2 * j + 1);
}

function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function range(ids, coords, minX, minY, maxX, maxY, nodeSize) {
    var stack = [0, ids.length - 1, 0];
    var result = [];
    var x, y;

    while (stack.length) {
        var axis = stack.pop();
        var right = stack.pop();
        var left = stack.pop();

        if (right - left <= nodeSize) {
            for (var i = left; i <= right; i++) {
                x = coords[2 * i];
                y = coords[2 * i + 1];
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) { result.push(ids[i]); }
            }
            continue;
        }

        var m = Math.floor((left + right) / 2);

        x = coords[2 * m];
        y = coords[2 * m + 1];

        if (x >= minX && x <= maxX && y >= minY && y <= maxY) { result.push(ids[m]); }

        var nextAxis = (axis + 1) % 2;

        if (axis === 0 ? minX <= x : minY <= y) {
            stack.push(left);
            stack.push(m - 1);
            stack.push(nextAxis);
        }
        if (axis === 0 ? maxX >= x : maxY >= y) {
            stack.push(m + 1);
            stack.push(right);
            stack.push(nextAxis);
        }
    }

    return result;
}

function within(ids, coords, qx, qy, r, nodeSize) {
    var stack = [0, ids.length - 1, 0];
    var result = [];
    var r2 = r * r;

    while (stack.length) {
        var axis = stack.pop();
        var right = stack.pop();
        var left = stack.pop();

        if (right - left <= nodeSize) {
            for (var i = left; i <= right; i++) {
                if (sqDist(coords[2 * i], coords[2 * i + 1], qx, qy) <= r2) { result.push(ids[i]); }
            }
            continue;
        }

        var m = Math.floor((left + right) / 2);

        var x = coords[2 * m];
        var y = coords[2 * m + 1];

        if (sqDist(x, y, qx, qy) <= r2) { result.push(ids[m]); }

        var nextAxis = (axis + 1) % 2;

        if (axis === 0 ? qx - r <= x : qy - r <= y) {
            stack.push(left);
            stack.push(m - 1);
            stack.push(nextAxis);
        }
        if (axis === 0 ? qx + r >= x : qy + r >= y) {
            stack.push(m + 1);
            stack.push(right);
            stack.push(nextAxis);
        }
    }

    return result;
}

function sqDist(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
}

var defaultGetX = function (p) { return p[0]; };
var defaultGetY = function (p) { return p[1]; };

var KDBush = function KDBush(points, getX, getY, nodeSize, ArrayType) {
    if ( getX === void 0 ) getX = defaultGetX;
    if ( getY === void 0 ) getY = defaultGetY;
    if ( nodeSize === void 0 ) nodeSize = 64;
    if ( ArrayType === void 0 ) ArrayType = Float64Array;

    this.nodeSize = nodeSize;
    this.points = points;

    var IndexArrayType = points.length < 65536 ? Uint16Array : Uint32Array;

    var ids = this.ids = new IndexArrayType(points.length);
    var coords = this.coords = new ArrayType(points.length * 2);

    for (var i = 0; i < points.length; i++) {
        ids[i] = i;
        coords[2 * i] = getX(points[i]);
        coords[2 * i + 1] = getY(points[i]);
    }

    sortKD(ids, coords, nodeSize, 0, ids.length - 1, 0);
};

KDBush.prototype.range = function range$1 (minX, minY, maxX, maxY) {
    return range(this.ids, this.coords, minX, minY, maxX, maxY, this.nodeSize);
};

KDBush.prototype.within = function within$1 (x, y, r) {
    return within(this.ids, this.coords, x, y, r, this.nodeSize);
};

return KDBush;

})));

},{}],"mproj":[function(require,module,exports){
(function (__filename){(function (){
(function(){

// add math.h functions to library scope
// (to make porting projection functions simpler)
var fabs = Math.abs,
    floor = Math.floor,
    sin = Math.sin,
    cos = Math.cos,
    tan = Math.tan,
    asin = Math.asin,
    acos = Math.acos,
    atan = Math.atan,
    atan2 = Math.atan2,
    sqrt = Math.sqrt,
    pow = Math.pow,
    exp = Math.exp,
    log = Math.log,
    hypot = Math.hypot,
    sinh = Math.sinh,
    cosh = Math.cosh,
    MIN = Math.min,
    MAX = Math.max;

// constants from math.h
var HUGE_VAL = Infinity,
    M_PI = Math.PI;

// from proj_api.h
var RAD_TO_DEG = 57.295779513082321,
    DEG_TO_RAD = 0.017453292519943296;

// from pj_transform.c
var SRS_WGS84_SEMIMAJOR = 6378137;
var SRS_WGS84_ESQUARED = 0.0066943799901413165;

// math constants from project.h
var M_FORTPI = M_PI / 4,
    M_HALFPI = M_PI / 2,
    M_PI_HALFPI = 1.5 * M_PI,
    M_TWOPI = 2 * M_PI,
    M_TWO_D_PI = 2 / M_PI,
    M_TWOPI_HALFPI = 2.5 * M_PI;

// datum types
var PJD_UNKNOWN = 0,
    PJD_3PARAM = 1,
    PJD_7PARAM = 2,
    PJD_GRIDSHIFT = 3,
    PJD_WGS84 = 4;

// named errors
var PJD_ERR_GEOCENTRIC = -45,
    PJD_ERR_AXIS = -47,
    PJD_ERR_GRID_AREA = -48,
    PJD_ERR_CATALOG = -49;

// common
var EPS10 = 1e-10;


var PJ_LOG_NONE = 0,
    PJ_LOG_ERROR = 1,
    PJ_LOG_DEBUG_MAJOR = 2,
    PJ_LOG_DEBUG_MINOR = 3;

// context of currently running projection function
// (Unlike Proj.4, we use a single ctx object)
var ctx = {
  last_errno: 0,
  debug_level:  PJ_LOG_NONE,
  logger: null // TODO: implement
};



var pj_err_list = [
  "no arguments in initialization list",  /*  -1 */
  "no options found in 'init' file",    /*  -2 */
  "invalid init= string",   /*  -3 */ // Proj.4 text: "no colon in init= string",
  "projection not named",       /*  -4 */
  "unknown projection id",      /*  -5 */
  "effective eccentricity = 1",      /*  -6 */
  "unknown unit conversion id",     /*  -7 */
  "invalid boolean param argument",   /*  -8 */
  "unknown elliptical parameter name",          /*  -9 */
  "reciprocal flattening (1/f) = 0",    /* -10 */
  "|radius reference latitude| > 90",   /* -11 */
  "squared eccentricity < 0",     /* -12 */
  "major axis or radius = 0 or not given",  /* -13 */
  "latitude or longitude exceeded limits",  /* -14 */
  "invalid x or y",       /* -15 */
  "improperly formed DMS value",      /* -16 */
  "non-convergent inverse meridional dist", /* -17 */
  "non-convergent inverse phi2",      /* -18 */
  "acos/asin: |arg| >1+1e-14",     /* -19 */
  "tolerance condition error",      /* -20 */
  "conic lat_1 = -lat_2",       /* -21 */
  "lat_1 >= 90",          /* -22 */
  "lat_1 = 0",          /* -23 */
  "lat_ts >= 90",         /* -24 */
  "no distance between control points",   /* -25 */
  "projection not selected to be rotated",  /* -26 */
  "W <= 0 or M <= 0",       /* -27 */
  "lsat not in 1-5 range",      /* -28 */
  "path not in range",        /* -29 */
  "h <= 0",         /* -30 */
  "k <= 0",         /* -31 */
  "lat_0 = 0 or 90 or alpha = 90",    /* -32 */
  "lat_1=lat_2 or lat_1=0 or lat_2=90",   /* -33 */
  "elliptical usage required",      /* -34 */
  "invalid UTM zone number",      /* -35 */
  "arg(s) out of range for Tcheby eval",    /* -36 */
  "failed to find projection to be rotated",  /* -37 */
  "failed to load datum shift file",            /* -38 */
  "both n & m must be spec'd and > 0",    /* -39 */
  "n <= 0, n > 1 or not specified",   /* -40 */
  "lat_1 or lat_2 not specified",     /* -41 */
  "|lat_1| == |lat_2|",       /* -42 */
  "lat_0 is pi/2 from mean lat",      /* -43 */
  "unparseable coordinate system definition", /* -44 */
  "geocentric transformation missing z or ellps", /* -45 */
  "unknown prime meridian conversion id",   /* -46 */
  "illegal axis orientation combination",   /* -47 */
  "point not within available datum shift grids", /* -48 */
  "invalid sweep axis, choose x or y",
  "invalid value for h", // -50
  "point outside of projection domain" // -51 taken from Proj v9
];


// see pj_transform.c CHECK_RETURN()
function check_fatal_error() {
  var code = ctx.last_errno;
  if (!code) return;
  if (code > 0 || !is_transient_error(code)) {
    e_error(code);
  } else {
    // transient error
    // TODO: consider a strict mode that throws an error
  }
}

function is_transient_error(code) {
  return transient_error.indexOf(code) > -1;
}

var transient_error = [-14, -15, -17, -18, -19, -20, -27, -48];

function pj_ctx_set_errno(code) {
  ctx.last_errno = code;
}

function f_error() {
  pj_ctx_set_errno(-20);
}

function i_error() {
  pj_ctx_set_errno(-20);
}

function error_msg(code) {
  return pj_err_list[~code] || "unknown error";
}

// alias for e_error()
function error(code) {
  e_error(code);
}

// a fatal error
// see projects.h E_ERROR macro
function e_error(code) {
  pj_ctx_set_errno(code);
  fatal();
}

function fatal(msg, o) {
  if (!o) o = {};
  if (!o.code) o.code = ctx.last_errno || 0;
  if (!msg) msg = error_msg(o.code);
  // reset error code, so processing can continue after this error is handled
  ctx.last_errno = 0;
  throw new ProjError(msg, o);
}

function ProjError(msg, o) {
  var err = new Error(msg);
  err.name = 'ProjError';
  Object.keys(o).forEach(function(k) {
    err[k] = o[k];
  });
  return err;
}


function dmstor(str) {
  return dmstod(str) * DEG_TO_RAD;
}

// Parse a formatted value in DMS DM or D to a numeric value
// Delimiters: D|d (degrees), ' (minutes), " (seconds)
function dmstod(str) {
  var match = /(-?[0-9.]+)d?([0-9.]*)'?([0-9.]*)"?([nsew]?)$/i.exec(str);
  var d = NaN;
  var deg, min, sec;
  if (match) {
    deg = match[1] || '0';
    min = match[2] || '0';
    sec = match[3] || '0';
    d = (+deg) + (+min) / 60 + (+sec) / 3600;
    if (/[ws]/i.test(match[4])) {
      d = -d;
    }
  }
  if (isNaN(d)) {
    // throw an exception instead of just setting an error code
    // (assumes this function is called by pj_init() or a cli program,
    // where an exception is more appropriate)
    e_error(-16);
    // pj_ctx_set_errno(-16);
    // d = HUGE_VAL;
  }
  return d;
}



function pj_atof(str) {
  return pj_strtod(str);
}

function pj_strtod(str) {
  return parseFloat(str);
}


/* types
  t  test for presence
  i  integer
  d  simple real
  r  dms or decimal degrees
  s  string
  b  boolean
*/


// see pj_param.c
// this implementation is slightly different
function pj_param(params, code) {
  var type = code[0],
      name = code.substr(1),
      obj = params[name],
      isset = obj !== void 0,
      val, param;

  if (type == 't') {
    val = isset;
  } else if (isset) {
    param = obj.param;
    obj.used = true;
    if (type == 'i') {
      val = parseInt(param);
    } else if (type == 'd') {
      // Proj.4 handles locale-specific decimal mark
      // TODO: what to do about NaNs
      val = pj_atof(param);
    } else if (type == 'r') {
      val = dmstor(param);
    } else if (type == 's') {
      val = String(param);
    } else if (type == 'b') {
      if (param == 'T' || param == 't' || param === true) {
        val = true;
      } else if (param == 'F' || param == 'f') {
        val = false;
      } else {
        pj_ctx_set_errno(-8);
        val = false;
      }
    }
  } else {
    // value is not set; use default
    val = {
      i: 0,
      b: false,
      d: 0,
      r: 0,
      s: ''
    }[type];
  }
  if (val === void 0) {
    fatal("invalid request to pj_param, fatal");
  }
  return val;
}

// convert arguments in a proj4 definition string into object properties
// (not in Proj.4)
function pj_get_params(args) {
  var rxp = /\+([a-z][a-z0-9_]*(?:=[^\s]*)?)/gi;
  var params = {};
  var match;
  while (match = rxp.exec(args)) {
    pj_mkparam(params, match[1]);
  }
  return params;
}

// different from Proj.4
function pj_mkparam(params, token) {
  var parts = token.split('=');
  var name, val;
  if (parts.length == 1) {
    name = token;
    val = true;
  } else {
    name = parts[0];
    val = token.substr(parts[0].length + 1);
  }
  params[name] = {used: false, param: val};
}



var pj_list = {};

function pj_add(func, key, name, desc) {
  pj_list[key] = {
    init: func,
    name: name,
    description: desc
  };
}


/* @pj_param */

function pj_is_latlong(P) {
  return !P || P.is_latlong;
}

function pj_is_geocent(P) {
  return !P || P.is_geocent;
}

function get_geod_defn(P) {
  var got_datum = false,
      defn = '';
  if ('datum' in P.params) {
    got_datum = true;
    defn += get_param(P, 'datum');
  } else if ('R' in P.params) {
    // moving R above other params, to match sequence in pj_ell_set.js
    defn += get_param(P, 'R');
  } else if ('ellps' in P.params) {
    defn += get_param(P, 'ellps');
  } else if ('a' in P.params) {
    defn += get_param(P, 'a');
    if ('b' in P.params) {
      defn += get_param(P, 'b');
    } else if ('es' in P.params) {
      defn += get_param(P, 'es');
    } else if ('f' in P.params) {
      defn += get_param(P, 'f');
    } else {
      defn += ' +es=' + P.es;
    }
  } else {
    error(-13);
  }
  if (!got_datum) {
    defn += get_param(P, 'towgs84');
    defn += get_param(P, 'nadgrids');
  }
  // defn += get_param(P, 'R'); // moved to above ellps
  defn += get_param(P, 'R_A');
  defn += get_param(P, 'R_V');
  defn += get_param(P, 'R_a');
  defn += get_param(P, 'R_lat_a');
  defn += get_param(P, 'R_lat_g');
  defn += get_param(P, 'pm');
  return defn;
}

// Convert an initialized proj object back to a Proj.4 string
function get_proj_defn(P) {
  // skip geodetic params and some initialization-related params
  var skip = 'datum,ellps,a,b,es,rf,f,towgs84,nadgrids,R,R_A,R_V,R_a,R_lat_a,R_lat_g,pm,init,no_defs'.split(',');
  var defn = '';
  Object.keys(P.params).forEach(function(name) {
    if (skip.indexOf(name) == -1) {
      defn += get_param(P, name);
    }
  });
  // add geodetic params
  defn += get_geod_defn(P);
  return defn.trim();
}

function get_param(P, name) {
  var param = '';
  if (name in P.params) {
    param = ' +' + name;
    if (P.params[name].param !== true) {
      param += '=' + pj_param(P.params, 's' + name);
    }
  }
  return param;
}



var pj_datums = [
  /* id defn ellipse_id comments */
  ["WGS84", "towgs84=0,0,0", "WGS84", "WGS_1984"], // added comment for wkt creation
  ["GGRS87", "towgs84=-199.87,74.79,246.62", "GRS80", "Greek_Geodetic_Reference_System_1987"],
  ["NAD83", "towgs84=0,0,0", "GRS80", "North_American_Datum_1983"],
  // nadgrids not supported; NAD27 will trigger an error
  ["NAD27", "nadgrids=@conus,@alaska,@ntv2_0.gsb,@ntv1_can.dat", "clrk66", "North_American_Datum_1927"],
  ["potsdam", "towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7", "bessel", "Potsdam Rauenberg 1950 DHDN"],
  ["carthage","towgs84=-263.0,6.0,431.0", "clrk80ign", "Carthage 1934 Tunisia"],
  ["hermannskogel", "towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232", "bessel", "Hermannskogel"],
  ["ire65", "towgs84=482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15", "mod_airy", "Ireland 1965"],
  ["nzgd49", "towgs84=59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993", "intl", "New Zealand Geodetic Datum 1949"],
  ["OSGB36", "towgs84=446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894", "airy", "OSGB 1936"],
  [null, null, null, null]
];


var pj_prime_meridians = [
  // id definition
  ["greenwich", "0dE"],
  ["lisbon",    "9d07'54.862\"W"],
  ["paris",     "2d20'14.025\"E"],
  ["bogota",    "74d04'51.3\"W"],
  ["madrid",    "3d41'16.58\"W"],
  ["rome",      "12d27'8.4\"E"],
  ["bern",      "7d26'22.5\"E"],
  ["jakarta",   "106d48'27.79\"E"],
  ["ferro",     "17d40'W"],
  ["brussels",  "4d22'4.71\"E"],
  ["stockholm", "18d3'29.8\"E"],
  ["athens",    "23d42'58.815\"E"],
  ["oslo",      "10d43'22.5\"E"],
  [null,        null]
];

function find_prime_meridian(id) {
  var defn = pj_prime_meridians.reduce(function(memo, arr) {
    return arr[0] === id ? arr : memo;
  }, null);
  return defn ? {id: defn[0], definition: defn[1]} : null;
}

function find_datum(id) {
  var defn = pj_datums.reduce(function(memo, arr) {
    return arr[0] === id ? arr : memo;
  }, null);
  return defn ? {id: defn[0], defn: defn[1], ellipse_id: defn[2], name: defn[3]} : null;
}


function pj_datum_set(P) {
  var SEC_TO_RAD = 4.84813681109535993589914102357e-6;
  var params = P.datum_params = [0,0,0,0,0,0,0];
  var name, datum, nadgrids, catalog, towgs84;

  P.datum_type = PJD_UNKNOWN;

  if (name = pj_param(P.params, 'sdatum')) {
    datum = find_datum(name);
    if (!datum) {
      error(-9);
    }
    if (datum.ellipse_id) {
      pj_mkparam(P.params, 'ellps=' + datum.ellipse_id);
    }
    if (datum.defn) {
      pj_mkparam(P.params, datum.defn);
    }
  }

  nadgrids = pj_param(P.params, "snadgrids");
  if (nadgrids && nadgrids != '@null') {
    fatal("+nadgrids is not implemented");
  }
  if (catalog = pj_param(P.params, "scatalog")) {
    fatal("+catalog is not implemented");
  }
  if (towgs84 = pj_param(P.params, "stowgs84")) {
    towgs84.split(',').forEach(function(s, i) {
      params[i] = pj_atof(s) || 0;
    });
    if (params[3] != 0 || params[4] != 0 || params[5] != 0 || params[6] != 0) {
      P.datum_type = PJD_7PARAM;
      params[3] *= SEC_TO_RAD;
      params[4] *= SEC_TO_RAD;
      params[5] *= SEC_TO_RAD;
      params[6] =  params[6] / 1e6 + 1;
    } else {
      P.datum_type = PJD_3PARAM;
      /* Note that pj_init() will later switch datum_type to
         PJD_WGS84 if shifts are all zero, and ellipsoid is WGS84 or GRS80 */
    }
  }
}



var pj_ellps = [
  // id major ell name
  ["MERIT", "a=6378137.0", "rf=298.257", "MERIT 1983"],
  ["SGS85", "a=6378136.0", "rf=298.257", "Soviet Geodetic System 85"],
  ["GRS80", "a=6378137.0", "rf=298.257222101", "GRS 1980(IUGG, 1980)"],
  ["IAU76", "a=6378140.0", "rf=298.257", "IAU 1976"],
  ["airy", "a=6377563.396", "b=6356256.910", "Airy 1830"],
  ["APL4.9", "a=6378137.0", "rf=298.25", "Appl. Physics. 1965"],
  ["NWL9D", "a=6378145.0", "rf=298.25", "Naval Weapons Lab., 1965"],
  ["mod_airy", "a=6377340.189", "b=6356034.446", "Modified Airy"],
  ["andrae", "a=6377104.43", "rf=300.0", "Andrae 1876 (Den., Iclnd.)"],
  ["aust_SA", "a=6378160.0", "rf=298.25", "Australian Natl & S. Amer. 1969"],
  ["GRS67", "a=6378160.0", "rf=298.2471674270", "GRS 67(IUGG 1967)"],
  ["bessel", "a=6377397.155", "rf=299.1528128", "Bessel 1841"],
  ["bess_nam", "a=6377483.865", "rf=299.1528128", "Bessel 1841 (Namibia)"],
  ["clrk66", "a=6378206.4", "b=6356583.8", "Clarke 1866"],
  ["clrk80", "a=6378249.145", "rf=293.4663", "Clarke 1880 mod."],
  ["clrk80ign", "a=6378249.2", "rf=293.4660212936269", "Clarke 1880 (IGN)."],
  ["CPM", "a=6375738.7", "rf=334.29", "Comm. des Poids et Mesures 1799"],
  ["delmbr", "a=6376428", "rf=311.5", "Delambre 1810 (Belgium)"],
  ["engelis", "a=6378136.05", "rf=298.2566", "Engelis 1985"],
  ["evrst30", "a=6377276.345", "rf=300.8017", "Everest 1830"],
  ["evrst48", "a=6377304.063", "rf=300.8017", "Everest 1948"],
  ["evrst56", "a=6377301.243", "rf=300.8017", "Everest 1956"],
  ["evrst69", "a=6377295.664", "rf=300.8017", "Everest 1969"],
  ["evrstSS", "a=6377298.556", "rf=300.8017", "Everest (Sabah & Sarawak)"],
  ["fschr60", "a=6378166", "rf=298.3", "Fischer (Mercury Datum) 1960"],
  ["fschr60m", "a=6378155", "rf=298.3", "Modified Fischer 1960"],
  ["fschr68", "a=6378150", "rf=298.3", "Fischer 1968"],
  ["helmert", "a=6378200", "rf=298.3", "Helmert 1906"],
  ["hough", "a=6378270.0", "rf=297", "Hough"],
  ["intl", "a=6378388.0", "rf=297", "International 1909 (Hayford)"],
  ["krass", "a=6378245.0", "rf=298.3", "Krasovsky 1940"], // Proj.4 has "Krassovsky, 1942"
  ["kaula", "a=6378163", "rf=298.24", "Kaula 1961"],
  ["lerch", "a=6378139", "rf=298.257", "Lerch 1979"],
  ["mprts", "a=6397300", "rf=191", "Maupertius 1738"],
  ["new_intl", "a=6378157.5", "b=6356772.2", "New International 1967"],
  ["plessis", "a=6376523", "b=6355863",  "Plessis 1817 (France)"],
  ["SEasia", "a=6378155.0", "b=6356773.3205", "Southeast Asia"],
  ["walbeck", "a=6376896.0", "b=6355834.8467", "Walbeck"],
  ["WGS60", "a=6378165.0", "rf=298.3", "WGS 60"],
  ["WGS66", "a=6378145.0", "rf=298.25", "WGS 66"],
  ["WGS72", "a=6378135.0", "rf=298.26", "WGS 72"],
  ["WGS84", "a=6378137.0", "rf=298.257223563", "WGS 84"],
  ["sphere", "a=6370997.0", "b=6370997.0", "Normal Sphere (r=6370997)"],
  [null, null,  null,  null]
];

function find_ellps(id) {
  var defn = pj_ellps.reduce(function(memo, arr) {
    return arr[0] === id ? arr : memo;
  }, null);
  return defn ? {id: defn[0], major: defn[1], ell: defn[2], name: defn[3]} : null;
}


function pj_ell_set(P) {
  var SIXTH = 0.1666666666666666667, /* 1/6 */
      RA4 = 0.04722222222222222222, /* 17/360 */
      RA6 = 0.02215608465608465608, /* 67/3024 */
      RV4 = 0.06944444444444444444, /* 5/72 */
      RV6 = 0.04243827160493827160; /* 55/1296 */
  var params = P.params;
  var a = 0;
  var es = 0;
  var name, ellps, tmp, b, i;
  if (pj_param(params, 'tR')) {
    a = pj_param(params, 'dR');
  } else {
    if (name = pj_param(params, 'sellps')) {
      ellps = find_ellps(name);
      if (!ellps) {
        error(-9);
      }
      pj_mkparam(params, ellps.major);
      pj_mkparam(params, ellps.ell);
    }
    a = pj_param(params, 'da');
    if (pj_param(params, 'tes')) {
      es = pj_param(params, 'des');
    } else if (pj_param(params, 'te')) {
      tmp = pj_param(params, 'de');
      es = tmp * tmp;
    } else if (pj_param(params, 'trf')) {
      tmp = pj_param(params, 'drf');
      if (!tmp) {
        error(-10);
      }
      tmp = 1 / tmp;
      es = tmp * (2 - tmp);
    } else if (pj_param(params, 'tf')) {
      tmp = pj_param(params, 'df');
      es = tmp * (2 - tmp);
    } else if (pj_param(params, 'tb')) {
      b = pj_param(params, 'db');
      es = 1 - (b * b) / (a * a);
    }
    if (!b) {
      b = a * sqrt(1 - es);
    }

    if (pj_param(params, 'bR_A')) {
      a *= 1 - es * (SIXTH + es * (RA4 + es * RA6));
      es = 0;
    } else if (pj_param(params, 'bR_V')) {
      a *= 1 - es * (SIXTH + es * (RV4 + es * RV6));
    } else if (pj_param(params, 'bR_a')) {
      a = 0.5 * (a + b);
      es = 0;
    } else if (pj_param(params, 'bR_g')) {
      a = sqrt(a * b);
      es = 0;
    } else if (pj_param(params, 'bR_h')) {
      if (a + b === 0) {
        error(-20);
      }
      a = 2 * a * b / (a + b);
      es = 0;
    } else if (i = pj_param(params, 'tR_lat_a') || pj_param(params, 'tR_lat_g')) {
      tmp = sin(pj_param(params, i ? 'rR_lat_a' : 'rR_lat_g'));
      if (fabs(tmp) > M_HALFPI) {
        error(-11);
      }
      tmp = 1 - es * tmp * tmp;
      a *= i ? 0.5 * (1 - es + tmp) / (tmp * sqrt(tmp)) : sqrt(1 - es) / tmp;
      es = 0;
    }
  }

  if (es < 0) error(-12);
  if (a <= 0) error(-13);
  P.es = es;
  P.a = a;
}



var pj_units = [
  // id to_meter name
  ["km", "1000", "Kilometer"],
  ["m", "1", "Meter"],
  ["dm", "1/10", "Decimeter"],
  ["cm", "1/100", "Centimeter"],
  ["mm", "1/1000", "Millimeter"],
  ["kmi", "1852.0", "International Nautical Mile"],
  ["in", "0.0254", "International Inch"],
  ["ft", "0.3048", "International Foot"],
  ["yd", "0.9144", "International Yard"],
  ["mi", "1609.344", "International Statute Mile"],
  ["fath", "1.8288", "International Fathom"],
  ["ch", "20.1168", "International Chain"],
  ["link", "0.201168", "International Link"],
  ["us-in", "1/39.37", "U.S. Surveyor's Inch"],
  ["us-ft", "0.304800609601219", "U.S. Surveyor's Foot"],
  ["us-yd", "0.914401828803658", "U.S. Surveyor's Yard"],
  ["us-ch", "20.11684023368047", "U.S. Surveyor's Chain"],
  ["us-mi", "1609.347218694437", "U.S. Surveyor's Statute Mile"],
  ["ind-yd", "0.91439523", "Indian Yard"],
  ["ind-ft", "0.30479841", "Indian Foot"],
  ["ind-ch", "20.11669506", "Indian Chain"],
  [null, null, null]
];

function find_units_by_value(val) {
  return pj_units.reduce(function(memo, defn) {
    if (val == +defn[1]) {
      memo = find_units(defn[0]);
    }
    return memo;
  }, null);
}

function find_units(id) {
  var arr = pj_units.reduce(function(memo, defn) {
    return id === defn[0] ? defn : memo;
  }, null);
  return arr ? {id: arr[0], to_meter: arr[1], name: arr[2]} : null;
}



var initcache = {};

function pj_search_initcache(key) {
  return initcache[key.toLowerCase()] || null;
}

function pj_insert_initcache(key, defn) {
  initcache[key.toLowerCase()] = defn;
}


// Replacement functions for Proj.4 pj_open_lib() (see pj_open_lib.c)
// and get_opt() (see pj_init.c)

var libcache = {};

// add a definition library without reading from a file (for use by web app)
function mproj_insert_libcache(libId, contents) {
  libcache[libId] = contents;
}

function mproj_search_libcache(libId) {
  return libcache[libId] || null;
}

function mproj_read_lib_anycase(libFile) {
  var fs = require('fs'),
      path = require('path'),
      // path to library assumes mproj script is in the dist/ directory
      dir = path.join(path.dirname(__filename), '../nad'),
      pathUC = path.join(dir, libFile.toUpperCase()),
      pathLC = path.join(dir, libFile.toLowerCase()),
      contents;
  if (fs.existsSync(pathUC)) {
    contents = fs.readFileSync(pathUC, 'utf8');
  } else if (fs.existsSync(pathLC)) {
    contents = fs.readFileSync(pathLC, 'utf8');
  } else {
    fatal('unable to read from \'init\' file named ' + libFile); // not in Proj.4
  }
  return contents;
}

// Return opts from a section of a config file,
//   or null if not found or unable to read file
function pj_read_init_opts(initStr) {
  var parts = initStr.split(':'),
      libId = parts[0],
      crsId = parts[1],
      libStr, o;
  if (!crsId || !libId) {
    error(-3);
  }
  libId = libId.toLowerCase(); // not in Proj.4
  libStr = mproj_search_libcache(libId);
  if (!libStr) {
    libStr = mproj_read_lib_anycase(libId);
    libcache[libId] = libStr;
  }
  return libStr ? pj_find_opts(libStr, crsId) : null;
}

// Find params in contents of an init file
function pj_find_opts(contents, id) {
  var opts = '', comment = '',
      idx, idx2;
  // get requested parameters
  idx = contents.indexOf('<' + id + '>');
  if (idx > -1) {
    // get comment text
    idx2 = contents.lastIndexOf('#', idx);
    if (idx2 > -1) {
      comment = contents.substring(idx2 + 1, idx).trim();
      if (/\n/.test(comment)) {
        comment = '';
      }
    }
    // get projection params
    opts = contents.substr(idx + id.length + 2);
    opts = opts.substr(0, opts.indexOf('<'));
    // remove comments
    opts = opts.replace(/#.*/g, '');
    // convert all whitespace to single <sp>
    opts = opts.replace(/[\s]+/g, ' ');

    // if '+' is missing from args, add it
    // kludge: protect spaces in +title= opts
    opts = opts.replace(/\+title=[^+]*[^ +]/g, function(match) {
      return match.replace(/ /g, '\t');
    });
    opts = ' ' + opts;
    opts = opts.replace(/ (?=[a-z])/ig, ' +');
    opts = opts.replace(/\t/g, ' ').trim();
  }
  return opts ? {opts: opts, comment: comment} : null;
}


// Returns an initialized projection object
// @args a proj4 string
function pj_init(args) {
  var params = pj_get_params(args);
  var P = {
    params: params,
    is_latlong: false,
    is_geocent: false,
    is_long_wrap_set: false,
    long_wrap_center: 0,
    axis: "enu",
    gridlist: null,
    gridlist_count: 0,
    vgridlist_geoid: null,
    vgridlist_geoid_count: 0
  };
  var name, defn;
  if (!Object.keys(params).length) {
    error(-1);
  }

  if (pj_param(params, "tinit")) {
    get_init(params, pj_param(params, "sinit"));
  }

  name = pj_param(params, "sproj");
  if (!name) {
    error(-4);
  }

  defn = pj_list[name];
  if (!defn) {
    error(-5);
  }

  if (!pj_param(params, "bno_defs")) {
    get_defaults(P.params, name);
  }

  pj_datum_set(P);
  pj_ell_set(P);

  P.a_orig = P.a;
  P.es_orig = P.es;
  P.e = sqrt(P.es);
  P.ra = 1 / P.a;
  P.one_es = 1 - P.es;
  if (!P.one_es) {
    error(-6);
  }
  P.rone_es = 1 / P.one_es;

  if (is_wgs84(P)) {
    P.datum_type = PJD_WGS84;
  }

  P.geoc = !!P.es && pj_param(params, 'bgeoc');
  P.over = pj_param(params, 'bover');
  P.has_geoid_vgrids = pj_param(params, 'tgeoidgrids');
  if (P.has_geoid_vgrids) {
    pj_param(params, "sgeoidgrids"); // mark as used
  }

  P.is_long_wrap_set = pj_param(params, 'tlon_wrap');
  if (P.is_long_wrap_set) {
    P.long_wrap_center = pj_param(params, 'rlon_wrap');
    // Don't accept excessive values otherwise we might perform badly
    // when correcting longitudes around it
    // The test is written this way to error on long_wrap_center "=" NaN
    if (fabs(P.long_wrap_center) < 10 * M_TWOPI === false) {
      error(-14);
    }
  }

  if (pj_param(params, 'saxis')) {
    init_axis(P);
  }

  P.lam0 = pj_param(params, 'rlon_0');
  P.phi0 = pj_param(params, 'rlat_0');
  P.x0 = pj_param(params, 'dx_0');
  P.y0 = pj_param(params, 'dy_0');

  if (pj_param(params, 'tk_0')) {
    P.k0 = pj_param(params, 'dk_0');
  } else if (pj_param(params, 'tk')) {
    P.k0 = pj_param(params, 'dk');
  } else {
    P.k0 = 1;
  }
  if (P.k0 <= 0) {
    error(-31);
  }

  init_units(P);
  init_prime_meridian(P);
  defn.init(P);
  return P;
}

// Merge default params
// NOTE: Proj.4 loads defaults from the file nad/proj_def.dat
// This function applies the default ellipsoid from proj_def.dat but
//   ignores the other defaults, which could be considered undesirable
//   (see e.g. https://github.com/OSGeo/proj.4/issues/201)
function get_defaults(params, name) {
  get_opt(params, '+ellps=WGS84');
}

function get_init(params, initStr) {
  var defn = pj_search_initcache(initStr);
  if (!defn) {
    defn = pj_read_init_opts(initStr);
    pj_insert_initcache(initStr, defn);
  }
  if (!defn) {
    error(-2);
  }
  // merge init params
  get_opt(params, defn.opts);
}

// Merge params from a proj4 string
// (Slightly different interface from Proj.4 get_opts())
function get_opt(params, args) {
  var newParams = pj_get_params(args);
  var geoIsSet = ['datum', 'ellps', 'a', 'b', 'rf', 'f'].reduce(function(memo, key) {
    return memo || key in params;
  }, false);
  Object.keys(newParams).forEach(function(key) {
    // don't override existing params
    if (key in params) return;
    // don't set ellps if earth model info is set
    if (key == 'ellps' && geoIsSet) return;
    params[key] = newParams[key];
  });
}

function init_prime_meridian(P) {
  var params = P.params,
  name, pm, offs;
  name = pj_param(params, 'spm');
  if (name) {
    pm = find_prime_meridian(name);
    offs = dmstor(pm ? pm.definition : name);
    if (isNaN(offs)) {
      error(-46);
    }
    P.from_greenwich = offs;
  } else {
    P.from_greenwich = 0;
  }
}

function init_units(P) {
  var params = P.params;
  var name, s, units;
  if (name = pj_param(params, 'sunits')) {
    units = find_units(name);
    if (!units) {
      error(-7);
    }
    s = units.to_meter;
  }
  if (s || (s = pj_param(params, 'sto_meter'))) {
    P.to_meter = parse_to_meter(s);
    P.fr_meter = 1 / P.to_meter;
  } else {
    P.to_meter = P.fr_meter = 1;
  }

  // vertical units
  s = null;
  if (name = pj_param(params, 'svunits')) {
    units = find_units(name);
    if (!units) {
      error(-7);
    }
    s = units.to_meter;
  }
  if (s || (pj_param(params, 'svto_meter'))) {
    P.vto_meter = parse_to_meter(s);
    P.vfr_meter = 1 / P.vto_meter;
  } else {
    P.vto_meter = P.to_meter;
    P.vfr_meter = P.fr_meter;
  }
}

function parse_to_meter(s) {
  var parts = s.split('/');
  var val = pj_strtod(parts[0]);
  if (parts.length > 1) {
    val /= pj_strtod(parts[1]);
  }
  return val;
}

function init_axis(P) {
  var axis_legal = "ewnsud";
  var axis = pj_param(P.params, 'saxis');
  if (axis.length != 3) {
    error(PJD_ERR_AXIS);
  }
  if (axis_legal.indexOf(axis[0]) == -1 ||
      axis_legal.indexOf(axis[1]) == -1 ||
      axis_legal.indexOf(axis[2]) == -1) {
    error(PJD_ERR_AXIS);
  }
  P.axis = axis;
}

function is_wgs84(P) {
  return P.datum_type == PJD_3PARAM &&
    P.datum_params[0] == P.datum_params[1] == P.datum_params[2] === 0 &&
    P.a == 6378137 && Math.abs(P.es - 0.006694379990) < 0.000000000050;
}



// TODO: remove error codes (Proj.4 doesn't do anything with them)
var GEOCENT_NO_ERROR = 0x0000,
    GEOCENT_LAT_ERROR = 0x0001,
    GEOCENT_LON_ERROR = 0x0002,
    GEOCENT_A_ERROR = 0x0004,
    GEOCENT_B_ERROR = 0x0008,
    GEOCENT_A_LESS_B_ERROR = 0x0010;

// a: Semi-major axis, in meters.
// b: Semi-minor axis, in meters.
function pj_Set_Geocentric_Parameters(a, b) {
  var err = GEOCENT_NO_ERROR,
      a2 = a * a,
      b2 = b * b;
  if (a <= 0.0) err |= GEOCENT_A_ERROR;
  if (b <= 0.0) err |= GEOCENT_B_ERROR;
  if (a < b) err |= GEOCENT_A_LESS_B_ERROR;
  return err ? null : {
    a: a,
    b: b,
    a2: a2,
    b2: b2,
    e2: (a2 - b2) / a2,
    ep2: (a2 - b2) / b2
  };
}


function pj_Convert_Geodetic_To_Geocentric(gi, i, xx, yy, zz) {
  var err = GEOCENT_NO_ERROR,
      lng = xx[i],
      lat = yy[i],
      height = zz[i],
      x, y, z,
      rn, sinlat, sin2lat, coslat;
  if (lat < -M_HALFPI && lat > -1.001 * M_HALFPI) {
    lat = -M_HALFPI;
  } else if (lat > M_HALFPI && lat < 1.001 * M_HALFPI) {
    lat = M_HALFPI;
  } else if (lat < -M_HALFPI || lat > M_HALFPI) {
    err |= GEOCENT_LAT_ERROR;
  }

  if (!err) {
    if (lng > M_PI) lng -= 2 * M_PI;
    sinlat = sin(lat);
    coslat = cos(lat);
    sin2lat = sinlat * sinlat;
    rn = gi.a / sqrt(1 - gi.e2 * sin2lat);
    xx[i] = (rn + height) * coslat * cos(lng);
    yy[i] = (rn + height) * coslat * sin(lng);
    zz[i] = ((rn * (1 - gi.e2)) + height) * sinlat;
  }
  return err;
}


function pj_Convert_Geocentric_To_Geodetic(gi, i, xx, yy, zz) {
  var EPS = 1e-12,
      EPS2 = EPS * EPS,
      MAXITER = 30,
      x = xx[i],
      y = yy[i],
      z = zz[i],
      lat, lng, height,
      p, rr, ct, st, rx, rn, rk, cphi0, sphi0, cphi, sphi, sdphi, iter;

  p = sqrt(x * x + y * y);
  rr = sqrt(x * x + y * y + z * z);

  if (p / gi.a < EPS) {
    lng = 0;
    if (rr / gi.a < EPS) {
      xx[i] = 0;
      yy[i] = M_HALFPI;
      zz[i] = -gi.b;
      return 0;
    }
  } else {
    lng = atan2(y, x);
  }

  ct = z / rr;
  st = p / rr;
  rx = 1 / sqrt(1 - gi.e2 * (2 - gi.e2) * st * st);
  cphi0 = st * (1 - gi.e2) * rx;
  sphi0 = ct * rx;
  iter = 0;

  do {
    iter++;
    rn = gi.a / sqrt(1 - gi.e2 * sphi0 * sphi0);
    height = p * cphi0 + z * sphi0 - rn * (1 - gi.e2 * sphi0 * sphi0);
    rk = gi.e2 * rn / (rn + height);
    rx = 1 / sqrt(1 - rk * (2 - rk) * st * st);
    cphi = st * (1 - rk) * rx;
    sphi = ct * rx;
    sdphi = sphi * cphi0 - cphi * sphi0;
    cphi0 = cphi;
    sphi0 = sphi;
  } while (sdphi * sdphi > EPS2 && iter < MAXITER);
  lat = atan(sphi / fabs(cphi));
  xx[i] = lng;
  yy[i] = lat;
  zz[i] = height;
}



// A convenience function for transforming a single point (not in Proj.4)
// @p an array containing [x, y] or [x, y, z] coordinates
//     latlong coordinates are assumed to be in decimal degrees
function pj_transform_point(srcdefn, dstdefn, p) {
  var z = p.length > 2,
      xx = [p[0]],
      yy = [p[1]],
      zz = [z ? p[2] : 0];
  if (srcdefn.is_latlong) {
    xx[0] *= DEG_TO_RAD;
    yy[0] *= DEG_TO_RAD;
  }
  ctx.last_errno = 0;
  pj_transform(srcdefn, dstdefn, xx, yy, zz);
  if (ctx.last_errno || xx[0] == HUGE_VAL) {
    // throw error if translation fails
    fatal(null, {point: p});
  }
  if (dstdefn.is_latlong) {
    xx[0] *= RAD_TO_DEG;
    yy[0] *= RAD_TO_DEG;
  }
  p[0] = xx[0];
  p[1] = yy[0];
  if (z) p[2] = zz[0];
}

// Transform arrays of coordinates; latlong coords are in radians
// @xx, @yy[, @zz] coordinate arrays
//
function pj_transform(srcdefn, dstdefn, xx, yy, zz) {
  var point_count = xx.length;
  var lp = {};
  var xy = {};
  var err, i, tmp;

  if (srcdefn.axis != 'enu') {
    pj_adjust_axis(srcdefn.axis, false, xx, yy, zz);
  }

  if (srcdefn.vto_meter != 1 && zz) {
   for ( i = 0; i < point_count; i++ )
      zz[i] *= srcdefn.vto_meter;
  }

  // convert to lat/lng, if needed
  if (srcdefn.is_geocent) {
    if (!zz) {
      error(PJD_ERR_GEOCENTRIC);
    }
    if (srcdefn.to_meter != 1) {
      for (i = 0; i < point_count; i++) {
        if (xx[i] != HUGE_VAL ) {
          xx[i] *= srcdefn.to_meter;
          yy[i] *= srcdefn.to_meter;
        }
      }
    }
    pj_geocentric_to_geodetic(srcdefn.a_orig, srcdefn.es_orig, xx, yy, zz);

  } else if (!srcdefn.is_latlong) {
    if (!srcdefn.inv3d && !srcdefn.inv) {
      // Proj.4 returns error code -17 (a bug?)
      fatal("source projection not invertible");
    }
    if (srcdefn.inv3d) {
      fatal("inverse 3d transformations not supported");
    } else {
      for (i=0; i<point_count; i++) {
        xy.x = xx[i];
        xy.y = yy[i];
        tmp = pj_inv(xy, srcdefn);
        xx[i] = tmp.lam;
        yy[i] = tmp.phi;
        check_fatal_error(); // Proj.4 is a bit different
      }
    }
  }

  if (srcdefn.from_greenwich !== 0) {
    for (i=0; i<point_count; i++) {
      if (xx[i] != HUGE_VAL) {
        xx[i] += srcdefn.from_greenwich;
      }
    }
  }

  if (srcdefn.has_geoid_vgrids && zz) {
    fatal("vgrid transformation not supported");
  }

  pj_datum_transform(srcdefn, dstdefn, xx, yy, zz);

  if (dstdefn.has_geoid_vgrids && zz) {
    fatal("vgrid transformation not supported");
  }

  if (dstdefn.from_greenwich !== 0) {
    for (i=0; i<point_count; i++) {
      if (xx[i] != HUGE_VAL) {
        xx[i] -= dstdefn.from_greenwich;
      }
    }
  }

  if (dstdefn.is_geocent) {
    if (!zz) {
      error(PJD_ERR_GEOCENTRIC);
    }
    pj_geodetic_to_geocentric(dstdefn.a_orig, dstdefn.es_orig, xx, yy, zz);

    if (dstdefn.fr_meter != 1) {
      for (i = 0; i<point_count; i++) {
        if (xx[i] != HUGE_VAL) {
          xx[i] *= dstdefn.fr_meter;
          yy[i] *= dstdefn.fr_meter;
        }
      }
    }
  } else if (!dstdefn.is_latlong) {
    if (dstdefn.fwd3d) {
      fatal("3d transformation not supported");
    } else {
      for (i=0; i<point_count; i++) {
        lp.lam = xx[i];
        lp.phi = yy[i];
        tmp = pj_fwd(lp, dstdefn);
        xx[i] = tmp.x;
        yy[i] = tmp.y;
        check_fatal_error(); // Proj.4 is a bit different
      }
    }
  } else if (dstdefn.is_latlong && dstdefn.is_long_wrap_set) {
    for (i=0; i<point_count; i++) {
      if (xx[i] == HUGE_VAL) continue;
      while (xx[i] < dstdefn.long_wrap_center - M_PI) {
        xx[i] += M_TWOPI;
      }
      while (xx[i] > dstdefn.long_wrap_center + M_PI) {
        xx[i] -= M_TWOPI;
      }
    }
  }

  if (dstdefn.vto_meter != 1 && zz) {
    for (i=0; i<point_count; i++) {
      zz[i] *= dstdefn.vfr_meter;
    }
  }
  if (dstdefn.axis != 'enu') {
    pj_adjust_axis(dstdefn.axis, true, xx, yy, zz);
  }

  return point_count == 1 ? ctx.last_errno : 0;
}

function pj_adjust_axis(axis, denormalize_flag, xx, yy, zz) {
  var point_count = xx.length;
  var x_in, y_in, z_in = 0;
  var i, i_axis, value, target;

  if (!denormalize_flag) {
    for (i = 0; i < point_count; i++) {
      x_in = xx[i];
      y_in = yy[i];
      if (x_in == HUGE_VAL) continue; // not in Proj.4
      if (zz)
        z_in = zz[i];

      for (i_axis = 0; i_axis < 3; i_axis++) {
        if (i_axis == 0)
            value = x_in;
        else if (i_axis == 1)
            value = y_in;
        else
            value = z_in;

        switch (axis[i_axis]) {
          case 'e':
            xx[i] = value; break;
          case 'w':
            xx[i] = -value; break;
          case 'n':
            yy[i] = value; break;
          case 's':
            yy[i] = -value; break;
          case 'u':
            if( zz ) zz[i] = value; break;
          case 'd':
            if( zz ) zz[i] = -value; break;
          default:
            error(PJD_ERR_AXIS);
        }
      } /* i_axis */
    } /* i (point) */
  }

  else {/* denormalize */
    for (i = 0; i < point_count; i++) {
      x_in = xx[i];
      y_in = yy[i];
      if (x_in == HUGE_VAL) continue; // not in Proj.4
      if (zz)
        z_in = zz[i];
      for (i_axis = 0; i_axis < 3; i_axis++) {
        if (i_axis == 2 && !zz)
          continue;
        if (i_axis == 0)
            target = xx;
        else if (i_axis == 1)
            target = yy;
        else
            target = zz;
        switch (axis[i_axis]) {
          case 'e':
            target[i] = x_in; break;
          case 'w':
            target[i] = -x_in; break;
          case 'n':
            target[i] = y_in; break;
          case 's':
            target[i] = -y_in; break;
          case 'u':
            target[i] = z_in; break;
          case 'd':
            target[i] = -z_in; break;
          default:
            error(PJD_ERR_AXIS);
        }
      } /* i_axis */
    } /* i (point) */
  }
}

function pj_datum_transform(srcdefn, dstdefn, xx, yy, zz) {
  var point_count = xx.length;
  var src_a, src_es, dst_a, dst_es;
  var z_is_temp = false;
  /*      We cannot do any meaningful datum transformation if either      */
  /*      the source or destination are of an unknown datum type          */
  /*      (ie. only a +ellps declaration, no +datum).  This is new        */
  /*      behavior for PROJ 4.6.0                                        */
  if (srcdefn.datum_type == PJD_UNKNOWN || dstdefn.datum_type == PJD_UNKNOWN) {
    return;
  }

  /*      Short cut if the datums are identical.                          */
  if (pj_compare_datums(srcdefn, dstdefn)) {
    return;
  }
  src_a = srcdefn.a_orig;
  src_es = srcdefn.es_orig;
  dst_a = dstdefn.a_orig;
  dst_es = dstdefn.es_orig;
  /*      Create a temporary Z array if one is not provided.              */
  if (!zz) {
    zz = new Float64Array(point_count);
    z_is_temp = true;
  }

  if (srcdefn.datum_type == PJD_GRIDSHIFT) {
    fatal("gridshift not implemented");
    // pj_apply_gridshift_2()
    src_a = SRS_WGS84_SEMIMAJOR;
    src_es = SRS_WGS84_ESQUARED;
  }

  if (dstdefn.datum_type == PJD_GRIDSHIFT) {
    dst_a = SRS_WGS84_SEMIMAJOR;
    dst_es = SRS_WGS84_ESQUARED;
  }

  /*      Do we need to go through geocentric coordinates?                */
  if (src_es != dst_es || src_a != dst_a ||
      srcdefn.datum_type == PJD_3PARAM || srcdefn.datum_type == PJD_7PARAM ||
      dstdefn.datum_type == PJD_3PARAM || dstdefn.datum_type == PJD_7PARAM) {

    pj_geodetic_to_geocentric(src_a, src_es, xx, yy, zz);

    if (srcdefn.datum_type == PJD_3PARAM || srcdefn.datum_type == PJD_7PARAM) {
      pj_geocentric_to_wgs84(srcdefn, xx, yy, zz);
    }

    if (dstdefn.datum_type == PJD_3PARAM || dstdefn.datum_type == PJD_7PARAM) {
      pj_geocentric_from_wgs84(dstdefn, xx, yy, zz);
    }

    /*      Convert back to geodetic coordinates.                           */
    pj_geocentric_to_geodetic(dst_a, dst_es, xx, yy, zz);

    /*      Apply grid shift to destination if required.                    */
    if (dstdefn.datum_type == PJD_GRIDSHIFT) {
      pj_apply_gridshift_2(dstdefn, 1, xx, yy, zz);
    }
  }
}

// returns true if datums are equivalent
function pj_compare_datums(srcdefn, dstdefn) {
  if (srcdefn.datum_type != dstdefn.datum_type) return false;
  if (srcdefn.a_orig != dstdefn.a_orig ||
    Math.abs(srcdefn.es_orig - dstdefn.es_orig) > 0.000000000050) {
    /* the tolerance for es is to ensure that GRS80 and WGS84 are considered identical */
    return false;
  }
  if (srcdefn.datum_type == PJD_3PARAM) {
    return (srcdefn.datum_params[0] == dstdefn.datum_params[0] &&
        srcdefn.datum_params[1] == dstdefn.datum_params[1] &&
        srcdefn.datum_params[2] == dstdefn.datum_params[2]);
  }
  if (srcdefn.datum_type == PJD_7PARAM) {
    return (srcdefn.datum_params[0] == dstdefn.datum_params[0] &&
      srcdefn.datum_params[1] == dstdefn.datum_params[1] &&
      srcdefn.datum_params[2] == dstdefn.datum_params[2] &&
      srcdefn.datum_params[3] == dstdefn.datum_params[3] &&
      srcdefn.datum_params[4] == dstdefn.datum_params[4] &&
      srcdefn.datum_params[5] == dstdefn.datum_params[5] &&
      srcdefn.datum_params[6] == dstdefn.datum_params[6]);
  }
  if (srcdefn.datum_type == PJD_GRIDSHIFT) {
    return pj_param(srcdefn.params, "snadgrids") ==
        pj_param(dstdefn.params, "snadgrids");
  }
  return true;
}

function pj_geocentric_to_wgs84(defn, xx, yy, zz) {
  var point_count = xx.length,
      pp = defn.datum_params,
      Dx_BF = pp[0],
      Dy_BF = pp[1],
      Dz_BF = pp[2],
      x, y, z, Rx_BF, Ry_BF, Rz_BF, M_BF,
      i;

  if (defn.datum_type == PJD_3PARAM) {
    for (i=0; i<point_count; i++) {
      if (xx[i] == HUGE_VAL) continue;
      xx[i] += Dx_BF;
      yy[i] += Dy_BF;
      zz[i] += Dz_BF;
    }
  } else if (defn.datum_type == PJD_7PARAM) {
    Rx_BF = pp[3];
    Ry_BF = pp[4];
    Rz_BF = pp[5];
    M_BF = pp[6];
    for (i=0; i<point_count; i++) {
      if (xx[i] == HUGE_VAL) continue;
      x = M_BF * (xx[i] - Rz_BF * yy[i] + Ry_BF *  zz[i]) + Dx_BF;
      y = M_BF * (Rz_BF * xx[i] + yy[i] - Rx_BF * zz[i]) + Dy_BF;
      z = M_BF * (-Ry_BF * xx[i] + Rx_BF * yy[i] + zz[i]) + Dz_BF;
      xx[i] = x;
      yy[i] = y;
      zz[i] = z;
    }
  }
}

function pj_geocentric_from_wgs84(defn, xx, yy, zz) {
  var point_count = xx.length,
      pp = defn.datum_params,
      Dx_BF = pp[0],
      Dy_BF = pp[1],
      Dz_BF = pp[2],
      x, y, z, Rx_BF, Ry_BF, Rz_BF, M_BF,
      i;

  if (defn.datum_type == PJD_3PARAM) {
    for (i=0; i<point_count; i++) {
      if (xx[i] == HUGE_VAL) continue;
      xx[i] -= Dx_BF;
      yy[i] -= Dy_BF;
      zz[i] -= Dz_BF;
    }
  } else if (defn.datum_type == PJD_7PARAM) {
    Rx_BF = pp[3];
    Ry_BF = pp[4];
    Rz_BF = pp[5];
    M_BF = pp[6];
    for (i=0; i<point_count; i++) {
      if (xx[i] == HUGE_VAL) continue;
      x = (xx[i] - Dx_BF) / M_BF;
      y = (yy[i] - Dy_BF) / M_BF;
      z = (zz[i] - Dz_BF) / M_BF;
      xx[i] = x + Rz_BF * y - Ry_BF * z;
      yy[i] = -Rz_BF * x + y + Rx_BF * z;
      zz[i] = Ry_BF * x - Rx_BF * y + z;
    }
  }
}

function pj_geocentric_to_geodetic(a, es, xx, yy, zz) {
  var point_count = xx.length;
  var b, i, gi;
  if (es == 0.0)
    b = a;
  else
    b = a * sqrt(1-es);

  gi = pj_Set_Geocentric_Parameters(a, b);
  if (!gi) {
    error(PJD_ERR_GEOCENTRIC);
  }

  for (i = 0; i < point_count; i++) {
    if (xx[i] != HUGE_VAL) {
      pj_Convert_Geocentric_To_Geodetic(gi, i, xx, yy, zz);
    }
  }
}

function pj_geodetic_to_geocentric(a, es, xx, yy, zz) {
  var point_count = xx.length,
      b, i, gi;
  if (es === 0) {
    b = a;
  } else {
    b = a * sqrt(1 - es);
  }
  gi = pj_Set_Geocentric_Parameters(a, b);
  if (!gi) {
    error(PJD_ERR_GEOCENTRIC);
  }
  for (i=0; i<point_count; i++) {
    if (xx[i] == HUGE_VAL) continue;
    if (pj_Convert_Geodetic_To_Geocentric(gi, i, xx, yy, zz)) {
      xx[i] = yy[i] = HUGE_VAL;
    }
  }
}


function adjlon(lon) {
  var SPI = 3.14159265359,
      TWOPI = 6.2831853071795864769,
      ONEPI = 3.14159265358979323846;

  if (fabs(lon) > SPI) {
    lon += ONEPI;  /* adjust to 0.0.2pi rad */
    lon -= TWOPI * floor(lon / TWOPI); /* remove integral # of 'revolutions'*/
    lon -= ONEPI;  /* adjust back to -pi..pi rad */
  }
  return lon;
}


function pj_fwd_deg(lp, P) {
  var lp2 = {lam: lp.lam * DEG_TO_RAD, phi: lp.phi * DEG_TO_RAD};
  return pj_fwd(lp2, P);
}

function pj_fwd(lp, P) {
  var xy = {x: 0, y: 0};
  var EPS = 1e-12;
  var t = fabs(lp.phi) - M_HALFPI;

  // if (t > EPS || fabs(lp.lam) > 10) {
  if (!(t <= EPS && fabs(lp.lam) <= 10)) { // catch NaNs
    pj_ctx_set_errno(-14);
  } else {
    ctx.last_errno = 0; // clear a previous error
    if (fabs(t) <= EPS) {
      lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
    } else if (P.geoc) {
      lp.phi = atan(P.rone_es * tan(lp.phi));
    }
    lp.lam -= P.lam0;
    if (!P.over) {
      lp.lam = adjlon(lp.lam);
    }
    if (P.fwd) {
      P.fwd(lp, xy);
      xy.x = P.fr_meter * (P.a * xy.x + P.x0);
      xy.y = P.fr_meter * (P.a * xy.y + P.y0);
    } else {
      xy.x = xy.y = HUGE_VAL;
    }
  }
  if (ctx.last_errno || !isFinite(xy.x) || !isFinite(xy.y)) {
    // isFinite() catches NaN and +/- Infinity but not null
    xy.x = xy.y = HUGE_VAL;
  }
  return xy;
}


function pj_inv_deg(xy, P) {
  var lp = pj_inv(xy, P);
  return {
    lam: lp.lam * RAD_TO_DEG,
    phi: lp.phi * RAD_TO_DEG
  };
}

function pj_inv(xy, P) {
  var EPS = 1e-12;
  var lp = {lam: 0, phi: 0};

  // if (xy.x == HUGE_VAL || xy.y == HUGE_VAL) {
  if (!(xy.x < HUGE_VAL && xy.y < HUGE_VAL)) { // catch NaNs
    pj_ctx_set_errno(-15);
  } else {
    ctx.last_errno = 0;
    if (P.inv) {
      xy.x = (xy.x * P.to_meter - P.x0) * P.ra;
      xy.y = (xy.y * P.to_meter - P.y0) * P.ra;
      P.inv(xy, lp);
      lp.lam += P.lam0;
      if (!P.over) {
        lp.lam = adjlon(lp.lam);
      }
      if (P.geoc && fabs(fabs(lp.phi) - M_HALFPI) > EPS) {
        lp.phi = atan(P.one_es * tan(lp.phi));
      }
    } else {
      lp.lam = lp.phi = HUGE_VAL;
    }
  }
  if (ctx.last_errno || !isFinite(lp.lam) || !isFinite(lp.phi)) {
    // isFinite() catches NaN and +/- Infinity but not null
    lp.lam = lp.phi = HUGE_VAL;
  }
  return lp;
}


function get_rtodms(decimals, fixedWidth, pos, neg) {
  var dtodms = get_dtodms(decimals, fixedWidth, pos, neg);
  return function(r) {
    return dtodms(r * RAD_TO_DEG);
  };
}

// returns function for formatting as DMS
// See Proj.4 rtodms.c
// @pos: 'N' or 'E'
// @neg: 'S' or 'W'
function get_dtodms(decimals, fixedWidth, pos, neg) {
  var RES, CONV, i;
  if (decimals < 0 || decimals >= 9) {
    decimals = 3;
  }
  RES = 1;
  for (i=0; i<decimals; i++) {
    RES *= 10;
  }
  CONV = 3600 * RES;

  return function(r) {
    var sign = '',
        mstr = '',
        sstr = '',
        min, sec, suff, dstr;
    if (r === HUGE_VAL || isNaN(r)) return '';
    if (r < 0) {
      r = -r;
      suff = neg || '';
      if (!suff) {
        sign = '-';
      }
    } else {
      suff = pos || '';
    }
    r = floor(r * CONV + 0.5);
    sec = (r / RES) % 60;
    r = floor(r / (RES * 60));
    min = r % 60;
    dstr = floor(r / 60) + 'd';
    sstr = sec.toFixed(decimals);
    sec = parseFloat(sstr);
    if (sec) {
      sstr = (fixedWidth ? sstr : String(sec)) + '"';
    } else {
      sstr = '';
    }
    if (sec || min) {
      mstr = String(min) + "'";
      if (mstr.length == 2 && fixedWidth) {
        mstr = '0' + mstr;
      }
    }
    return sign + dstr + mstr + sstr + suff;
  };
}


// Support for the proj4js api:
//    proj4(fromProjection[, toProjection, coordinates])

function proj4js(arg1, arg2, arg3) {
  var p, fromStr, toStr, P1, P2, transform;
  if (typeof arg1 != 'string') {
    // E.g. Webpack's require function tries to initialize mproj by calling
    // the module function.
    return api;
  } else if (typeof arg2 != 'string') {
    fromStr = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs'; // '+datum=WGS84 +proj=lonlat';
    toStr = arg1;
    p = arg2;
  } else {
    fromStr = arg1;
    toStr = arg2;
    p = arg3;
  }
  P1 = pj_init(fromStr);
  P2 = pj_init(toStr);
  transform = get_proj4js_transform(P1, P2);
  if (p) {
    return transform(p);
  } else {
    return {forward: transform, inverse: get_proj4js_transform(P2, P1)};
  }
}

proj4js.WGS84 = '+proj=longlat +datum=WGS84'; // for compatibility with proj4js tests

// for compatibility with proj4js tests
proj4js.toPoint = function(array) {
  var out = {
    x: array[0],
    y: array[1]
  };
  if (array.length>2) {
    out.z = array[2];
  }
  if (array.length>3) {
    out.m = array[3];
  }
  return out;
};

function get_proj4js_transform(P1, P2) {
  return function(p) {
    var useArray = Array.isArray(p);
    p = useArray ? p.concat() : [p.x, p.y];
    pj_transform_point(P1, P2, p);
    if (!useArray) {
      p = {x: p[0], y: p[1]};
    }
    return p;
  };
}



// Fallback WKT definitions include a Proj.4 string in an EXTENSION property.
// They should be readable by QGIS and gdal/ogr, but will not work
// with most other GIS software.

function get_fallback_wkt_maker(P) {
  // TODO: validate P?
  return make_fallback_wkt;
}

function make_fallback_wkt(P) {
  var projName = P.proj in pj_list ? pj_list[P.proj].name : '';
  var proj4 = get_proj_defn(P);
  var geogcs = wkt_make_geogcs(P);
  // GDAL seems to use "unnamed" all the time
  var name = projName ? geogcs.NAME + ' / ' + projName : 'unnamed';
  return {PROJCS: {
    NAME: name,
    GEOGCS: geogcs,
    PROJECTION: 'custom_proj4',
    PARAMETER: [],
    UNIT: wkt_make_unit(P),
    EXTENSION: ['PROJ4', proj4 + ' +wktext']
  }};
}

function get_fallback_wkt_parser(projcs) {
  var proj4 = get_proj4_from_extension(projcs);
  // TODO: try parsing proj4 string to validate?
  return proj4 ? get_proj4_from_extension : null;
}

function get_proj4_from_extension(projcs) {
  var ext = projcs.EXTENSION;
  if (ext && ext[0] == 'PROJ4') {
    return (ext[1] || '').replace(' +wktext', '');
  }
  return null;
}


// Global collections of WKT parsers and makers
// arr[0] is test function; arr[1] is conversion function
var wkt_makers = [];
var wkt_parsers = [];

// TODO: use utility library
function wkt_is_object(val) {
  return !!val && typeof val == 'object' && !Array.isArray(val);
}

function wkt_is_string(val) {
  return typeof val == 'string';
}

function find_wkt_parser(projcs) {
  var parser = find_wkt_conversion_function(projcs, wkt_parsers);
  if (!parser) {
    parser = get_fallback_wkt_parser(projcs);
  }
  if (!parser) {
    wkt_error('unsupported WKT definition: ' + get_wkt_label(projcs));
  }
  return parser;
}

function find_wkt_maker(P) {
  var maker = find_wkt_conversion_function(P, wkt_makers);
  if (!maker) {
    maker = get_fallback_wkt_maker(P);
  }
  if (!maker) {
    wkt_error('unsupported projection: ' + get_proj_label(P));
  }
  return maker;
}

function find_wkt_conversion_function(o, arr) {
  var is_match;
  for (var i=0; i<arr.length; i++) {
    is_match = arr[i][0];
    if (is_match(o)) return arr[i][1];
  }
  return null;
}

function get_proj_label(P) {
  return get_proj_id(P) || '[unknown]';
}

function get_wkt_label(o) {
  return o.NAME || '[unknown]';
}

function get_proj_id(P) {
  return  pj_param(P.params, 'sproj');
}

function wkt_name_to_slug(name) {
  return name.replace(/[-_ \/]+/g, '_').toLowerCase();
}

function wkt_split_names(names) {
  var arr;
  if (Array.isArray(names)) {
    arr = names;
  } else if (names && names.length > 0) {
    arr = names.split(',');
  }
  return arr;
}

function wkt_error(msg) {
  throw new Error(msg);
}

function wkt_warn(msg) {
  // TODO: consider option to inhibit logging
  //       consider strict mode to throw error
  console.error('[wkt] ' + msg);
}




function wkt_get_unit_defn(projcs) {
  // TODO: consider using unit names
  return {
    to_meter: projcs.UNIT[1]
  };
}

function wkt_convert_unit(PROJCS) {
  var defn = wkt_get_unit_defn(PROJCS);
  var proj4 = "";
  if (defn.to_meter != 1) {
    proj4 = '+to_meter=' + defn.to_meter;
  } else if (!WKT_OMIT_DEFAULTS) {
    proj4 = '+units=m';
  }
  return proj4;
}

function wkt_make_unit(P) {
  return ['Meter', P.to_meter || 1];
}

/*
// OLD -- merge into wkt_make_unit()
function wkt_get_unit(P) {
  var defn = pj_find_units_by_value(P.to_meter);
  var name = defn ? defn.name : 'Unknown';
  return ['UNIT', name, P.to_meter];
}
*/


function wkt_convert_geogcs(geogcs, opts) {
  var datum = geogcs.DATUM,
      spheroid = datum.SPHEROID,
      datumId = wkt_find_datum_id(datum),
      ellId = wkt_find_ellps_id(spheroid),
      aux_sphere = opts && opts.aux_sphere,
      a = spheroid[1],
      rf = spheroid[2],
      str, pm;

  wkt_check_units(geogcs.UNIT, 'degree');
  if (aux_sphere) {
    // TODO: in addition to semimajor, ESRI supports spheres based on
    //   semiminor and authalic radii; could support these
    str = '+a=' + spheroid[1];
  } else if (datumId) {
    str = '+datum=' + datumId;
  } else if (ellId) {
    str = '+ellps=' + ellId;
  } else {
   str = '+a=' + a;
    if (rf > 0) {
      str += ' +rf=' + rf;
    }
  }
  if (datum.TOWGS84 && !aux_sphere && !datumId) {
    str += ' +towgs84=' + datum.TOWGS84.join(',');
  }

  pm = geogcs.PRIMEM ? geogcs.PRIMEM[1] : 0;
  if (pm > 0 || pm < 0) {
    str += ' +pm=' + pm; // assuming degrees
  }
  return str;
}

function wkt_find_ellps_id(spheroid) {
  // TODO: match on ellipsoid parameters rather than name
  var aliases = {
    international1924: "intl"
  };
  var key = wkt_harmonize_geo_name(spheroid[0]);
  var defn;
  if (key in aliases) {
    return aliases[key];
  }
  if (/^grs1980/.test(key)) {
    // handle cases like "GRS 1980(IUGG, 1980)")
    return 'GRS80';
  }
  if (key == 'sphere') {
    // not a well defined ellipsoid
    // TODO: if we check ellipsoid params, this test can go away
    return null;
  }
  for (var i=0; i<pj_ellps.length; i++) {
    defn = pj_ellps[i];
    if (wkt_harmonize_geo_name(defn[3]) == key ||
        wkt_harmonize_geo_name(defn[0]) == key) {
      break;
    }
  }
  return defn ? defn[0] : null;
}

function wkt_find_datum_id(datum) {
  var aliases = { // ESRI aliases
    northamerican1983: 'NAD83',
    newzealand1949: 'nzgd49'
  };
  var key = wkt_harmonize_geo_name(datum.NAME);
  var defn;
  if (key in aliases) {
    return aliases[key];
  }
  for (var i=0; i<pj_datums.length; i++) {
    defn = pj_datums[i];
    if (wkt_harmonize_geo_name(defn[3]) == key ||
        wkt_harmonize_geo_name(defn[0]) == key) {
      break;
    }
  }
  return defn ? defn[0] : null;
}

function wkt_harmonize_geo_name(name) {
  return (name || '').replace(/^(GCS|D)_/i, '').replace(/[ _]/g, '').toLowerCase();
}

function wkt_check_units(UNIT, expect) {
  if (UNIT && UNIT[0].toLowerCase() != expect) {
    wkt_error("unexpected geographic units: " + geogcs.UNIT[0]);
  }
}


// Converts a PROJCS WKT in object format to a Proj.4 string
// Throws an Error if unable to convert
function wkt_convert_projcs(projcs) {
  return find_wkt_parser(projcs)(projcs);
}

function wkt_simple_projcs_converter(projId, paramIds) {
  return wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter(projId),
    PARAMETER: wkt_parameter_converter(paramIds)
  });
}

function wkt_simple_projection_converter(id) {
  return function() {return '+proj=' + id;};
}

function wkt_projcs_converter(o) {
  return function(projcs) {
    var projStr = o.PROJECTION(projcs);
    var paramStr = o.PARAMETER(projcs);
    var geogStr = o.GEOGCS ? o.GEOGCS(projcs) : wkt_convert_geogcs(projcs.GEOGCS);
    var unitStr = wkt_convert_unit(projcs);
    return [projStr, paramStr, geogStr, unitStr, '+no_defs'].filter(function(s) {return !!s;}).join(' ');
  };
}


// Functions for exporting a wkt GEOGCS definition

function wkt_make_geogcs(P) {
  var geogcs = {
    NAME: wkt_get_geogcs_name(P),
    DATUM: wkt_make_datum(P),
    PRIMEM: ['Greenwich', 0], // TODO: don't assume greenwich
    UNIT: ['degree', 0.017453292519943295] // TODO: support other units
  };
  return geogcs;
}

function wkt_make_datum(P) {
  var datum = {
    NAME: wkt_get_datum_name(P),
    SPHEROID: wkt_make_spheroid(P)
  };
  var towgs84 = pj_param(P.params, 'stowgs84');
  if (/[1-9]/.test(towgs84)) { // only adding TOWGS84 if transformation is non-zero
    datum.TOWGS84 = towgs84;
  }
  return datum;
}

function wkt_make_spheroid(P) {
  var rf;
  if (pj_param(P.params, 'trf')) {
    rf = pj_param(P.params, 'drf');
  } else if (P.es) {
    rf = 1 / (1 - Math.sqrt(1 - P.es));
  } else {
    rf = 0;
  }
  return [wkt_get_ellps_name(P), P.a, rf];
}

function wkt_get_geogcs_name(P) {
  var name;
  if (pj_is_latlong(P)) {
    name = wkt_get_init_name(P);
  }
  if (!name) {
    name = wkt_get_datum_id(P);
    if (/^[a-z]+$/.test(name)) {
      name = name[0].toUpperCase() + name.substr(1);
    } else {
      name = name.toUpperCase();
    }
  }
  return name || 'UNK';
}

function wkt_get_ellps_name(P) {
  var ellps = find_ellps(wkt_get_ellps_id(P));
  return ellps ? ellps.name : 'Unknown ellipsoid';
}

function wkt_get_datum_name(P) {
  var defn = find_datum(wkt_get_datum_id(P));
  return defn && defn.name || 'Unknown datum';
}

function wkt_get_datum_id(P) {
  return pj_param(P.params, 'sdatum');
}

function wkt_get_ellps_id(P) {
  var datumId = wkt_get_datum_id(P),
      datum = datumId ? find_datum(datumId) : null,
      ellpsId;
  if (datum) {
    ellpsId = datum.ellipse_id;
  } else {
    ellpsId = pj_param(P.params, 'sellps');
  }
  return ellpsId || '';
}


// Converts a Proj object to a WKT in object format
function wkt_make_projcs(P) {
  return find_wkt_maker(P)(P);
}

function wkt_simple_projcs_maker(wktProjection, paramIds) {
  return wkt_projcs_maker({
    PROJECTION: wktProjection,
    PARAMETER: wkt_parameter_maker(paramIds)
  });
}

function wkt_projcs_maker(o) {
  return function(P) {
    var projcs = {
      // if o.NAME GEOGCS exists and returns falsy value, use default function
      GEOGCS: o.GEOGCS && o.GEOGCS(P) || wkt_make_geogcs(P),
      PROJECTION: wkt_is_string(o.PROJECTION) ? o.PROJECTION : o.PROJECTION(P),
      PARAMETER: o.PARAMETER(P),
      UNIT: wkt_make_unit(P)
    };
    // if o.NAME function exists and returns falsy value, use default name
    projcs.NAME = o.NAME && o.NAME(P, projcs) || wkt_make_default_projcs_name(P, projcs);
    return {PROJCS: projcs};
  };
}

// Get CS name from comment in +init source (if +init param is present)
function wkt_get_init_name(P) {
  var o;
  if (pj_param(P.params, 'tinit')) {
    o = pj_read_init_opts(pj_param(P.params, 'sinit'));
  }
  return o ? o.comment : '';
}

function wkt_make_default_projcs_name(P, projcs) {
  var initName = wkt_get_init_name(P);
  return initName || projcs.GEOGCS.NAME + ' / ' + projcs.PROJECTION;
}


function add_simple_wkt_parser(projId, wktProjections, params) {
  var is_match = get_simple_parser_test(wktProjections);
  var convert = wkt_simple_projcs_converter(projId, params);
  add_wkt_parser(is_match, convert);
}

function add_simple_wkt_maker(projId, wktProjection, params) {
  var is_match = get_simple_maker_test(projId);
  var make = wkt_simple_projcs_maker(wktProjection, params);
  // add_wkt_maker(is_match, wkt_make_projcs);
  add_wkt_maker(is_match, make);
}

function get_simple_parser_test(wktNames) {
  var slugs = wkt_split_names(wktNames).map(wkt_name_to_slug);
  return function(obj) {
    var wktName = obj.PROJECTION[0]; // TODO: handle unexpected structure
    return slugs.indexOf(wkt_name_to_slug(wktName)) > -1;
  };
}

function get_simple_maker_test(projId) {
  return function(P) {
    var id = get_proj_id(P);
    return id && id == projId;
  };
}

function add_wkt_parser(is_match, parse) {
  if (typeof is_match != 'function') wkt_error("Missing WKT parser test");
  if (typeof parse != 'function') wkt_error("Missing WKT parse function");
  wkt_parsers.push([is_match, parse]);
}

function add_wkt_maker(is_match, make) {
  if (typeof is_match != 'function') wkt_error("Missing WKT maker test");
  if (typeof make != 'function') wkt_error("Missing WKT maker function");
  wkt_makers.push([is_match, make]);
}


add_wkt_parser(wkt_is_utm, wkt_to_utm);
add_wkt_parser(wkt_is_ups, wkt_to_ups);

add_wkt_maker(get_simple_maker_test('utm'), wkt_from_utm);
add_wkt_maker(get_simple_maker_test('ups'), wkt_from_ups);

var WKT_UTM = /UTM_zone_([0-9]{1,2})(N|S)/i;
var WKT_UPS = /UPS_(North|South)/i;

function wkt_is_utm(projcs) {
  return WKT_UTM.test(wkt_name_to_slug(projcs.NAME));
}

function wkt_is_ups(projcs) {
  return WKT_UPS.test(wkt_name_to_slug(projcs.NAME));
}

function wkt_to_utm(projcs) {
  return wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('utm'),
    PARAMETER: utm_params
  })(projcs);

  function utm_params(projcs) {
    var match = WKT_UTM.exec(wkt_name_to_slug(projcs.NAME));
    var params = '+zone=' + match[1];
    if (match[2].toLowerCase() == 's') params += ' +south';
    return params;
  }
}

function wkt_to_ups(projcs) {
  return wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('ups'),
    PARAMETER: ups_params
  })(projcs);

  function ups_params(projcs) {
    var match = WKT_UPS.exec(wkt_name_to_slug(projcs.NAME));
    return match[1].toLowerCase() == 'south' ? '+south' : '';
  }
}

function wkt_from_utm(P) {
  return wkt_projcs_maker({
    NAME: wkt_make_utm_name,
    PROJECTION: function () {return 'Transverse_Mercator';},
    PARAMETER: wkt_make_utm_params
  })(P);
}

function wkt_from_ups(P) {
  return wkt_projcs_maker({
    NAME: wkt_make_ups_name,
    PROJECTION: function () {return 'Polar_Stereographic';},
    PARAMETER: wkt_make_ups_params
  })(P);
}

function wkt_make_utm_name(P, projcs) {
  return projcs.GEOGCS.NAME + ' / UTM zone ' + pj_param(P.params, 'szone') + (pj_param(P.params, 'tsouth') ? 'S' : 'N');
}

function wkt_make_ups_name(P, projcs) {
  return projcs.GEOGCS.NAME + ' / UPS ' + (pj_param(P.params, 'tsouth') ? 'South' : 'North');
}

function wkt_make_utm_params(P) {
  var lon0 = P.lam0 * 180 / M_PI;
  return [
    ["latitude_of_origin", 0],
    ["central_meridian", lon0],
    ["scale_factor", P.k0],
    ["false_easting", P.x0],
    ["false_northing", P.y0]
  ];
}

function wkt_make_ups_params(P) {
  return [
    ["latitude_of_origin", -90],
    ["central_meridian", 0],
    ["scale_factor", 0.994],
    ["false_easting", 2000000],
    ["false_northing", 2000000]
  ];
}


// Mercator_2SP references:
//    http://geotiff.maptools.org/proj_list/mercator_2sp.html
//    http://www.remotesensing.org/geotiff/proj_list/mercator_2sp.html
//    https://trac.osgeo.org/gdal/ticket/4861

add_wkt_parser(get_simple_parser_test('Mercator_2SP,Mercator_1SP,Mercator,Mercator_Auxiliary_Sphere'),
  wkt_projcs_converter({
    GEOGCS: wkt_convert_merc_geogcs,
    PROJECTION: wkt_simple_projection_converter('merc'),
    PARAMETER: wkt_convert_merc_params
  }));

add_wkt_maker(get_simple_maker_test('merc'),
  wkt_projcs_maker({
    GEOGCS: wkt_make_merc_geogcs,
    PROJECTION: wkt_make_merc_projection,
    PARAMETER: wkt_make_merc_params,
    NAME: wkt_make_merc_name
  }));

function wkt_make_merc_name(P) {
  return wkt_proj4_is_webmercator(P) ? 'WGS 84 / Pseudo-Mercator' : null;
}

function wkt_make_merc_geogcs(P) {
  // PROBLEM: no clear way to get geographic cs from proj4 string
  // ... so assuming WGS 84 (consider using spherical datum instead)
  if (wkt_proj4_is_webmercator(P)) {
    return wkt_make_geogcs(pj_init('+proj=longlat +datum=WGS84'));
  }
  return null;
}

function wkt_convert_merc_geogcs(projcs) {
  var opts = wkt_projcs_is_webmercator(projcs) ? {aux_sphere: true} : null;
  return wkt_convert_geogcs(projcs.GEOGCS, opts);
}

function wkt_make_merc_projection(P) {
  return wkt_proj4_is_merc_2sp(P) ? 'Mercator_2SP' : 'Mercator_1SP';
}

function wkt_convert_merc_params(projcs) {
  // TODO: handle (esri) standard_parallel_1 in 1sp version
  // 1sp version accepts latitude_of_origin (ogc) or standard_parallel_1 (esri)
  // var rules = wkt_projcs_is_merc_2sp(projcs) ? 'lat_ts,lat_0b' : 'lat_tsb,lat_ts';
  var rules = wkt_projcs_is_merc_2sp(projcs) ? 'lat_ts,lat_0b' : 'lat_tsb,lat_ts';
  return wkt_parameter_converter(rules)(projcs);
}

function wkt_make_merc_params(P) {
  var rules = wkt_proj4_is_merc_2sp(P) ? 'lat_ts,lat_0b' : 'lat_tsb';
  return wkt_parameter_maker(rules)(P);
}

function wkt_projcs_is_merc_2sp(projcs) {
  var param = wkt_find_parameter_by_name(projcs, 'standard_parallel_1');
  return param && param[1] != 0;
}

function wkt_proj4_is_merc_2sp(P) {
  return pj_param(P.params, 'tlat_ts') && pj_param(P.params, 'dlat_ts') != 0;
}

function wkt_projcs_is_webmercator(projcs) {
  return /(Web_Mercator|Pseudo_Mercator)/i.test(wkt_name_to_slug(projcs.NAME));
}

// TODO: support other spheroids (web mercator may be used for other planets)
function wkt_proj4_is_webmercator(P) {
  return P.es === 0 && P.a == 6378137;
}




// Reference:
// http://proj4.org/parameters.html

var wkt_common_params = [
  ['x_0', 'false_easting', 'm'],
  ['y_0', 'false_northing', 'm'],
  ['k_0', 'scale_factor', 'f'],
  ['lat_0', 'latitude_of_center'],
  ['lon_0', 'central_meridian']
];

var wkt_param_table = {
  lat_0b:  ['lat_0', 'latitude_of_origin'],
  lat_0c:  ['lat_0', null], // lcc 1sp, stere
  lat_0d:  ['lat_0', 'standard_parallel_1'],  // stere (esri), merc (esri)
  lat_1:   ['lat_1', 'standard_parallel_1'],
  lat_1b:  ['lat_1', 'latitude_of_point_1'],  // omerc,tpeqd
  lat_1c:  ['lat_1', 'latitude_of_origin'],   // lcc
  lat_2:   ['lat_2', 'standard_parallel_2'],
  lat_2b:  ['lat_2', 'latitude_of_point_2'],  // omerc,tpeqd
  lat_ts:  ['lat_ts', 'standard_parallel_1'], // cea,eqc,merc,stere,wag3,wink1
  lat_tsb: ['lat_ts', 'latitude_of_origin'],  // merc
  lonc:    ['lonc', 'central_meridian'],      // omerc,ocea
  lon_1:   ['lon_1', 'longitude_of_point_1'], // omerc,tpeqd
  lon_2:   ['lon_2', 'longitude_of_point_2'], // omerc,tpeqd
  alpha:   ['alpha', 'azimuth'],              // omerc,ocea
  gamma:   ['gamma', 'rectified_grid_angle'], // omerc
  h:       ['h', 'height', 'f'] // nsper
};

// non-standard name -> standard name
// TODO: consider accepting standard_parallel_1 as (esri) alias for latitude_of_center / latitude_of_origin
var wkt_param_aliases = {
  longitude_of_center: 'central_meridian',
  latitude_of_origin: 'latitude_of_center',
  latitude_of_center: 'latitude_of_origin',
  longitude_of_1st_point: 'longitude_of_point_1',
  longitude_of_2nd_point: 'longitude_of_point_2',
  latitude_of_1st_point: 'latitude_of_point_1',
  latitude_of_2nd_point: 'latitude_of_point_2',
  // proj4
  k: 'k_0'
};

// Convert a wkt PARAMETER name to a proj4 param id
function wkt_convert_param_name_old(wktName, proj) {
  var defn = wkt_find_param_defn_old(proj, function(defn) {
    return defn[1] == wktName;
  });
  return defn ? defn[0] : '';
}

// @proj Proj.4 projection id
function wkt_find_param_defn_old(proj, test) {
  var defn, projs;
  for (var i=0; i<wkt_params.length; i++) {
    defn = wkt_params[i];
    projs = defn[3];
    if (projs && projs.split(',').indexOf(proj) == -1) continue;
    if (test(defn)) return defn;
  }
  return null;
}


function wkt_find_defn(name, idx, arr) {
  for (var i=0; i<arr.length; i++) {
    // returns first match (additional matches -- aliases -- may be present)
    if (arr[i][idx] === name) return arr[i];
  }
  return null;
}

function wkt_find_parameter_defn(name, idx, rules) {
  var defn = null;
  name = name.toLowerCase();
  defn = wkt_find_defn(name, idx, rules);
  if (!defn && (name in wkt_param_aliases)) {
    defn = wkt_find_defn(wkt_param_aliases[name], idx, rules);
  }
  return defn;
}

function wkt_convert_parameter(defn, value, unitDefn) {
  var name = defn[0],
      type = defn[2];
  if (type == 'm') {
    value *= unitDefn.to_meter;
  }
  if (WKT_OMIT_DEFAULTS) {
    if ('x_0,y_0,lat_0,lon_0'.indexOf(name) > -1 && value === 0 ||
      name == 'k_0' && value == 1) {
      return;
    }
  }
  return '+' + name + '=' + value;
}

function wkt_make_parameter(defn, strVal, toMeter) {
  var type = defn[2],
      val;
  if (type == 'm') {
    val = parseFloat(strVal) / toMeter;
  } else if (type == 'f') {
    val = parseFloat(strVal);
  } else {
    val = dmstod(strVal); // default is decimal degrees or DMS
  }
  return [defn[1], val];
}

function wkt_find_parameter_by_name(projcs, name) {
  var params = projcs.PARAMETER || [];
  var paramName;
  for (var i=0; i<params.length; i++) {
    paramName = params[i][0].toLowerCase();
    if (name === paramName || name === wkt_param_aliases[paramName]) {
      return params[i];
    }
  }
  return null;
}

function wkt_get_parameter_value(projcs, name) {
  var param = wkt_find_parameter_by_name(projcs, name);
  return param === null ? null : param[1];
}

function wkt_get_parameter_rules(ids) {
  var rules = null;
  if (ids) {
    rules = wkt_split_names(ids).reduce(function(memo, id) {
      var rule = wkt_param_table[id];
      if (!rule) wkt_error("missing parameter rule: " + id);
      memo.push(rule);
      return memo;
    }, []);
  }
  return (rules || []).concat(wkt_common_params);
}

function wkt_parameter_converter(extraRules) {
  return function(projcs) {
    var parts = [];
    var rules = wkt_get_parameter_rules(extraRules);
    var unitDefn = wkt_get_unit_defn(projcs);
    (projcs.PARAMETER || []).forEach(function(param) { // handle no params
      var defn = wkt_find_parameter_defn(param[0], 1, rules);
      var proj4;
      if (!defn) {
        wkt_warn('unhandled parameter: ' + param[0]);
      } else {
        proj4 = wkt_convert_parameter(defn, param[1], unitDefn);
        if (proj4) parts.push(proj4);
      }
    });
    return parts.join(' ');
  };
}

function wkt_parameter_maker(extraRules) {
  return function(P) {
    var params = [];
    var rules = wkt_get_parameter_rules(extraRules);
    // TODO: think about how to add default params omitted from proj4 defn
    // TODO: think about detecting unused params in proj4 defn
    Object.keys(P.params).forEach(function(key) {
      var defn = wkt_find_parameter_defn(key, 0, rules);
      var sval;
      if (defn && defn[1]) { // handle dummy rules with null wkt param name (see wkt_lcc.js)
        sval = pj_param(P.params, 's' + key);
        params.push(wkt_make_parameter(defn, sval, P.to_meter));
      }
    });
    return params;
  };
}


add_wkt_parser(get_simple_parser_test(
  'Lambert_Conformal_Conic,Lambert_Conformal_Conic_1SP,Lambert_Conformal_Conic_2SP'),
  wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('lcc'),
    PARAMETER: wkt_convert_lcc_params
  }));

add_wkt_maker(get_simple_maker_test('lcc'),
  wkt_projcs_maker({
    PROJECTION: wkt_make_lcc_projection,
    PARAMETER: wkt_make_lcc_params
  }));

function wkt_make_lcc_params(P) {
  var params = wkt_proj4_is_lcc_1sp(P) ? 'lat_1c,lat_0c' : 'lat_0b,lat_1,lat_2';
  return wkt_parameter_maker(params)(P);
}

function wkt_convert_lcc_params(projcs) {
  var params = wkt_projcs_is_lcc_1sp(projcs) ? 'lat_1c' : 'lat_0b,lat_1,lat_2';
  return wkt_parameter_converter(params)(projcs);
}

function wkt_make_lcc_projection(P) {
  return wkt_proj4_is_lcc_1sp(P) ? 'Lambert_Conformal_Conic_1SP' : 'Lambert_Conformal_Conic_2SP';
}

function wkt_projcs_is_lcc_1sp(projcs) {
  return !wkt_find_parameter_by_name(projcs, 'standard_parallel_2');
}

function wkt_proj4_is_lcc_1sp(P) {
  return !('lat_1' in P.params && 'lat_2' in P.params);
}


// Type A
add_wkt_parser(
  get_simple_parser_test('Hotine_Oblique_Mercator,Hotine_Oblique_Mercator_Azimuth_Natural_Origin'),
  wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('omerc'),
    PARAMETER: function(P) {return wkt_parameter_converter('alpha,gamma,lonc')(P) + ' +no_uoff';}
  })
);
add_wkt_maker(wkt_proj4_is_omerc_A, wkt_simple_projcs_maker('Hotine_Oblique_Mercator', 'alpha,gamma,lonc'));

// Type B
add_simple_wkt_parser('omerc', 'Oblique_Mercator,Hotine_Oblique_Mercator_Azimuth_Center', 'alpha,gamma,lonc');
add_wkt_maker(wkt_proj4_is_omerc_B, wkt_simple_projcs_maker('Oblique_Mercator', 'alpha,gamma,lonc'));

// Two-point version
add_simple_wkt_parser('omerc', 'Hotine_Oblique_Mercator_Two_Point_Natural_Origin', 'lat_1b,lat_2b,lon_1,lon_2');
add_wkt_maker(
  wkt_proj4_is_omerc_2pt,
  wkt_simple_projcs_maker('Hotine_Oblique_Mercator_Two_Point_Natural_Origin', 'lat_1b,lat_2b,lon_1,lon_2')
);

function wkt_proj4_is_omerc_2pt(P) {
  return get_proj_id(P) == 'omerc' && 'lat_2' in P.params && 'lon_2' in P.params;
}

function wkt_proj4_is_omerc(P) {
  return get_proj_id(P) == 'omerc' && ('alpha' in P.params || 'gamma' in P.params);
}

function wkt_proj4_is_omerc_A(P) {
  return wkt_proj4_is_omerc(P) && ('no_uoff' in P.params || 'no_off' in P.params);
}

function wkt_proj4_is_omerc_B(P) {
  return wkt_proj4_is_omerc(P) && !wkt_proj4_is_omerc_A(P);
}


// add_simple_wkt_parser('stere', ['Stereographic', 'Polar_Stereographic', 'Stereographic_North_Pole', 'Stereographic_South_Pole']);

/*
  Stereographic vs. Polar Stereographic from geotiff
  http://geotiff.maptools.org/proj_list/polar_stereographic.html
  http://geotiff.maptools.org/proj_list/stereographic.html
  http://geotiff.maptools.org/proj_list/random_issues.html#stereographic
*/

add_wkt_parser(get_simple_parser_test('Stereographic,Polar_Stereographic,Stereographic_North_Pole,Stereographic_South_Pole'),
  wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('stere'),
    PARAMETER: wkt_convert_stere_params
  }));

add_wkt_maker(get_simple_maker_test('stere'),
  wkt_projcs_maker({
    PROJECTION: wkt_make_stere_projection,
    PARAMETER: wkt_make_stere_params
  }));

function wkt_convert_stere_params(projcs) {
  // assuming not oblique; TOOD: verify not oblique
  var params = wkt_parameter_converter('lat_ts,lat_tsb')(projcs);
  var match = /lat_ts=([^ ]+)/.exec(params);
  if (match && params.indexOf('lat_0=') == -1) {
    // Add +lat_0=90 or +lat_0=-90
    params = '+lat_0=' + (parseFloat(match[1]) < 0 ? -90 : 90) + ' ' + params;
  }
  return params;
}

function wkt_make_stere_projection(P) {
  // switching to stere -> Stereographic, to match ogr2ogr output
  // return wkt_proj4_is_stere_polar(P) ? 'Polar_Stereographic' : 'Oblique_Stereographic';
  return wkt_proj4_is_stere_polar(P) ? 'Polar_Stereographic' : 'Stereographic';
}

function wkt_make_stere_params(P) {
  return wkt_proj4_is_stere_polar(P) ?
    wkt_parameter_maker('lat_tsb,lat_0c')(P) : // lat_ts -> latitude_of_origin, lat_0 -> null
    wkt_parameter_maker('lat_0b')(P);      // lat_0 -> latitude_of_origin
}

function wkt_proj4_is_stere_polar(P) {
  return pj_param(P.params, 'tlat_ts');
}


add_simple_wkt_maker('vandg', 'VanDerGrinten');
add_wkt_parser(
  get_simple_parser_test('VanDerGrinten,Van_der_Grinten_I'),
  wkt_projcs_converter({
    PROJECTION: wkt_simple_projection_converter('vandg'),
    PARAMETER: function(P) {
      var params = wkt_parameter_converter('')(P);
      if (params) params += ' ';
      return params + '+R_A';
    }
  })
);


/*
// projections still missing WKT conversion
[
  ['airy', ''],
  ['boggs', ''],
  ['crast', 'Craster_Parabolic'],
  ['gn_sinu', ''],
  ['gstmerc', 'Gauss_Schreiber_Transverse_Mercator'], // https://trac.osgeo.org/gdal/ticket/2663
  ['geos', 'Geostationary_Satellite'],
  ['goode', 'Goode_Homolosine'],
  ['igh', 'Interrupted_Goode_Homolosine'],
  ['imw_p', 'International_Map_of_the_World_Polyconic'],
  ['kav7', ''],
  ['krovak', 'Krovak'],
  ['laborde', 'Laborde_Oblique_Mercator'],
  ['mbtfps', ''],
  ['nell_h', ''],
  ['ocea', ''], // see OneNote notes
  ['qua_aut', 'Quartic_Authalic'],
  ['', 'Swiss_Oblique_Cylindrical'], // http://www.remotesensing.org/geotiff/proj_list/swiss_oblique_cylindrical.html
  ['', 'Transverse_Mercator_South_Orientated'], // http://www.remotesensing.org/geotiff/proj_list/transverse_mercator_south_oriented.html
]
*/

// Add simple conversion functions
// optional third field gives alternate parameters (defined in wkt_parameters.js)
[
  ['aitoff', 'Aitoff', 'lat1'],
  ['aea', 'Albers_Conic_Equal_Area,Albers', 'lat_1,lat_2'],
  ['aeqd', 'Azimuthal_Equidistant'],
  ['bonne', 'Bonne', 'lat_1'],
  ['cass', 'Cassini_Soldner,Cassini'],
  ['cea', 'Cylindrical_Equal_Area', 'lat_ts'],
  ['eck1', 'Eckert_I'],
  ['eck2', 'Eckert_II'],
  ['eck3', 'Eckert_III'],
  ['eck4', 'Eckert_IV'],
  ['eck5', 'Eckert_V'],
  ['eck6', 'Eckert_VI'],
  ['eqdc', 'Equidistant_Conic', 'lat_1,lat_2'],
  ['eqc', 'Plate_Carree,Equirectangular,Equidistant_Cylindrical', 'lat_ts'],
  ['gall', 'Gall_Stereographic'],
  ['gnom', 'Gnomonic'],
  ['laea', 'Lambert_Azimuthal_Equal_Area'],
  ['loxim', 'Loximuthal', 'lat_1'],
  ['mill', 'Miller_Cylindrical'],
  ['moll', 'Mollweide'],
  ['nsper', 'Vertical_Near_Side_Perspective', 'h'],
  ['nzmg', 'New_Zealand_Map_Grid', 'lat_0b'],
  ['ortho', 'Orthographic', 'lat_0b'],
  ['poly', 'Polyconic'],
  ['robin', 'Robinson'],
  ['sinu', 'Sinusoidal'],
  ['sterea', 'Oblique_Stereographic,Double_Stereographic'], // http://geotiff.maptools.org/proj_list/oblique_stereographic.html
  ['tmerc', 'Transverse_Mercator,Gauss_Kruger', 'lat_0b'],
  ['tpeqd', 'Two_Point_Equidistant', 'lat_1b,lat_2b,lon_1,lon_2'],
  // ['vandg', 'VanDerGrinten,Van_der_Grinten_I'], // slight complication, see wkt_vandg.js
  ['wag1', 'Wagner_I'],
  ['wag2', 'Wagner_II'],
  ['wag3', 'Wagner_III', 'lat_ts'],
  ['wag4', 'Wagner_IV'],
  ['wag5', 'Wagner_V'],
  ['wag6', 'Wagner_VI'],
  ['wag7', 'Wagner_VII'],
  ['wink1', 'Winkel_I', 'lat_ts'],
  ['wink2', 'Winkel_II'],
  ['wintri', 'Winkel_Tripel', 'lat_1']
].forEach(function(arr) {
  var alternateParams = arr[2] || null;
  add_simple_wkt_parser(arr[0], arr[1], alternateParams);
  add_simple_wkt_maker(arr[0], arr[1].split(',')[0], alternateParams);
});



function wkt_stringify(o) {
  var str = JSON.stringify(wkt_stringify_reorder(o));
  str = str.replace(/\["([A-Z0-9]+)",/g, '$1['); // convert JSON arrays to WKT
  // remove quotes from AXIS values (not supported: UP|DOWN|OTHER etc.)
  // see (http://www.geoapi.org/apidocs/org/opengis/referencing/doc-files/WKT.html)
  str = str.replace(/"(EAST|NORTH|SOUTH|WEST)"/g, '$1');
  return str;
}

function wkt_sort_order(key) {
  // supported WKT names in sorted order
  var names = 'NAME,PROJCS,GEOGCS,GEOCCS,DATUM,SPHEROID,PRIMEM,PROJECTION,PARAMETER,UNIT,AXIS';
  return names.indexOf(key) + 1 || 999;
}

function wkt_keys(o) {
  var keys = Object.keys(o);
  return keys.sort(function(a, b) {
    return wkt_sort_order(a) - wkt_sort_order(b);
  });
}

// Rearrange a generated WKT object for easier string conversion
// inverse of wkt_parse_reorder()
function wkt_stringify_reorder(o, depth) {
  var arr = [], e;
  depth = depth || 0;
  wkt_keys(o).forEach(function(name) {
    var val = o[name];
    if (wkt_is_object(val)) {
      arr.push([name].concat(wkt_stringify_reorder(val, depth + 1)));
    } else if (name == 'NAME') {
      arr.push(wkt_is_string(val) ? val : val[0]);
    } else if (name == 'PARAMETER' || name == 'AXIS') {
      val.forEach(function(param) {
        arr.push([name].concat(param));
      });
    } else if (wkt_is_string(val)) {
      arr.push([name, val]);
    } else if (Array.isArray(val)) {
       arr.push([name].concat(val));
    } else {
      e = {};
      e[name] = val;
      wkt_error("Incorrectly formatted WKT element: " + JSON.stringify(e));
    }
  });
  if (depth === 0 && arr.length == 1) {
    arr = arr[0]; // kludge to remove top-level array
  }
  return arr;
}




function wkt_parse(str) {
  var obj = {};
  wkt_unpack(str).forEach(function(part) {
    wkt_parse_reorder(part, obj);
  });
  return obj;
}

// Convert WKT string to a JS object
// WKT format: http://docs.opengeospatial.org/is/12-063r5/12-063r5.html#11
function wkt_unpack(str) {
  var obj;
  // Convert WKT escaped quotes to JSON escaped quotes
  // str = str.replace(/""/g, '\\"'); // BUGGY
  str = convert_wkt_quotes(str);

  // Convert WKT entities to JSON arrays
  // str = str.replace(/([A-Z0-9]+)\[/g, '["$1",');
  // Changed to ignore some names that look like entities, like "GCS_TWD97[2020]"
  // allow only [ or , character before the next quote (i.e. block close quotes)
  str = str.replace(/([A-Z0-9]+)\[(?![^"]*[^\[,"]")/g, '["$1",');

  // Enclose axis keywords in quotes to create valid JSON strings
  str = str.replace(/, *([a-zA-Z]+) *(?=[,\]])/g, ',"$1"');

  // str = str.replace(/[^\]]*$/, ''); // esri .prj string may have extra stuff appended

  // WKT may have a "VERTCS" section after "PROJCS" section; enclosing contents
  //   in brackets to create valid JSON array.
  str = '[' + str + ']';

  try {
    obj = JSON.parse(str);
  } catch(e) {
    wkt_error('unparsable WKT format');
  }
  return obj;
}

// Convert WKT escaped quotes to JSON escaped quotes ("" -> \")
function convert_wkt_quotes(str) {
  var c = 0;
  return str.replace(/"+/g, function(s) {
    var even = c % 2 == 0;
    c += s.length;
    // ordinary, unescaped quotes
    if (s == '"' || s == '""' && even) return s;
    // WKT-escaped quotes
    if (even) {
      return '"' + s.substring(1).replace(/""/g, '\\"');
    } else {
      return s.replace(/""/g, '\\"');
    }
  });
}

// Rearrange a subarray of a parsed WKT file for easier traversal
// E.g.
//   ["WGS84", ...]  to  {NAME: "WGS84"}
//   ["PROJECTION", "Mercator"]  to  {PROJECTION: "Mercator"}
//   ["PARAMETER", <param1>], ...  to  {PARAMETER: [<param1>, ...]}
function wkt_parse_reorder(arr, obj) {
  var name = arr[0], // TODO: handle alternate OGC names
      i;
  if (name == 'GEOGCS' || name == 'GEOCCS' || name == 'PROJCS' || name == 'DATUM' || name == 'VERTCS') {
    obj[name] = {
      NAME: arr[1]
    };
    for (i=2; i<arr.length; i++) {
      if (Array.isArray(arr[i])) {
        wkt_parse_reorder(arr[i], obj[name]);
      } else {
        throw wkt_error("WKT parse error");
      }
    }
  } else if (name == 'AXIS' || name == 'PARAMETER') {
    if (name in obj === false) {
      obj[name] = [];
    }
    obj[name].push(arr.slice(1));

  } else {
    obj[name] = arr.slice(1);
  }
  return obj;
}


var WKT_OMIT_DEFAULTS = true;

function wkt_from_proj4(P) {
  var obj;
  if (P.length) P = pj_init(P); // convert proj4 string
  if (pj_is_latlong(P)) {
    obj = {GEOGCS: wkt_make_geogcs(P)};
  } else {
    obj = wkt_make_projcs(P);
  }
  return wkt_stringify(obj);
}

// @str A WKT CRS definition string (e.g. contents of a .prj file)
function wkt_to_proj4(str) {
  var o = wkt_parse(str);
  var proj4;

  if (o.PROJCS) {
    proj4 = wkt_convert_projcs(o.PROJCS);

  } else if (o.GEOGCS) {
    proj4 = '+proj=longlat ' + wkt_convert_geogcs(o.GEOGCS);

  } else if (o.GEOCCS) {
    wkt_error('geocentric coordinates are not supported');

  } else {
    wkt_error('missing a supported WKT CS type');
  }
  return proj4;
}



/*
 * Math.js
 * Transcription of Math.hpp, Constants.hpp, and Accumulator.hpp into
 * JavaScript.
 *
 * Copyright (c) Charles Karney (2011-2017) <charles@karney.com> and licensed
 * under the MIT/X11 License.  For more information, see
 * https://geographiclib.sourceforge.io/
 */

/**
 * @namespace GeographicLib
 * @description The parent namespace for the following modules:
 * - {@link module:GeographicLib/Geodesic GeographicLib/Geodesic} The main
 *   engine for solving geodesic problems via the
 *   {@link module:GeographicLib/Geodesic.Geodesic Geodesic} class.
 * - {@link module:GeographicLib/GeodesicLine GeographicLib/GeodesicLine}
 *   computes points along a single geodesic line via the
 *   {@link module:GeographicLib/GeodesicLine.GeodesicLine GeodesicLine}
 *   class.
 * - {@link module:GeographicLib/PolygonArea GeographicLib/PolygonArea}
 *   computes the area of a geodesic polygon via the
 *   {@link module:GeographicLib/PolygonArea.PolygonArea PolygonArea}
 *   class.
 * - {@link module:GeographicLib/DMS GeographicLib/DMS} handles the decoding
 *   and encoding of angles in degree, minutes, and seconds, via static
 *   functions in this module.
 * - {@link module:GeographicLib/Constants GeographicLib/Constants} defines
 *   constants specifying the version numbers and the parameters for the WGS84
 *   ellipsoid.
 *
 * The following modules are used internally by the package:
 * - {@link module:GeographicLib/Math GeographicLib/Math} defines various
 *   mathematical functions.
 * - {@link module:GeographicLib/Accumulator GeographicLib/Accumulator}
 *   interally used by
 *   {@link module:GeographicLib/PolygonArea.PolygonArea PolygonArea} (via the
 *   {@link module:GeographicLib/Accumulator.Accumulator Accumulator} class)
 *   for summing the contributions to the area of a polygon.
 */
"use strict";
var GeographicLib = {};
GeographicLib.Constants = {};
GeographicLib.Math = {};
GeographicLib.Accumulator = {};

(function(
  /**
   * @exports GeographicLib/Constants
   * @description Define constants defining the version and WGS84 parameters.
   */
  c) {

  /**
   * @constant
   * @summary WGS84 parameters.
   * @property {number} a the equatorial radius (meters).
   * @property {number} f the flattening.
   */
  c.WGS84 = { a: 6378137, f: 1/298.257223563 };
  /**
   * @constant
   * @summary an array of version numbers.
   * @property {number} major the major version number.
   * @property {number} minor the minor version number.
   * @property {number} patch the patch number.
   */
  c.version = { major: 1, minor: 48, patch: 0 };
  /**
   * @constant
   * @summary version string
   */
  c.version_string = "1.48";
})(GeographicLib.Constants);

(function(
  /**
   * @exports GeographicLib/Math
   * @description Some useful mathematical constants and functions (mainly for
   *   internal use).
   */
  m) {

  /**
   * @summary The number of digits of precision in floating-point numbers.
   * @constant {number}
   */
  m.digits = 53;
  /**
   * @summary The machine epsilon.
   * @constant {number}
   */
  m.epsilon = Math.pow(0.5, m.digits - 1);
  /**
   * @summary The factor to convert degrees to radians.
   * @constant {number}
   */
  m.degree = Math.PI/180;

  /**
   * @summary Square a number.
   * @param {number} x the number.
   * @returns {number} the square.
   */
  m.sq = function(x) { return x * x; };

  /**
   * @summary The hypotenuse function.
   * @param {number} x the first side.
   * @param {number} y the second side.
   * @returns {number} the hypotenuse.
   */
  m.hypot = function(x, y) {
    var a, b;
    x = Math.abs(x);
    y = Math.abs(y);
    a = Math.max(x, y); b = Math.min(x, y) / (a ? a : 1);
    return a * Math.sqrt(1 + b * b);
  };

  /**
   * @summary Cube root function.
   * @param {number} x the argument.
   * @returns {number} the real cube root.
   */
  m.cbrt = function(x) {
    var y = Math.pow(Math.abs(x), 1/3);
    return x < 0 ? -y : y;
  };

  /**
   * @summary The log1p function.
   * @param {number} x the argument.
   * @returns {number} log(1 + x).
   */
  m.log1p = function(x) {
    var y = 1 + x,
        z = y - 1;
    // Here's the explanation for this magic: y = 1 + z, exactly, and z
    // approx x, thus log(y)/z (which is nearly constant near z = 0) returns
    // a good approximation to the true log(1 + x)/x.  The multiplication x *
    // (log(y)/z) introduces little additional error.
    return z === 0 ? x : x * Math.log(y) / z;
  };

  /**
   * @summary Inverse hyperbolic tangent.
   * @param {number} x the argument.
   * @returns {number} tanh<sup>&minus;1</sup> x.
   */
  m.atanh = function(x) {
    var y = Math.abs(x);          // Enforce odd parity
    y = m.log1p(2 * y/(1 - y))/2;
    return x < 0 ? -y : y;
  };

  /**
   * @summary Copy the sign.
   * @param {number} x gives the magitude of the result.
   * @param {number} y gives the sign of the result.
   * @returns {number} value with the magnitude of x and with the sign of y.
   */
  m.copysign = function(x, y) {
    return Math.abs(x) * (y < 0 || (y === 0 && 1/y < 0) ? -1 : 1);
  };

  /**
   * @summary An error-free sum.
   * @param {number} u
   * @param {number} v
   * @returns {object} sum with sum.s = round(u + v) and sum.t is u + v &minus;
   *   round(u + v)
   */
  m.sum = function(u, v) {
    var s = u + v,
        up = s - v,
        vpp = s - up,
        t;
    up -= u;
    vpp -= v;
    t = -(up + vpp);
    // u + v =       s      + t
    //       = round(u + v) + t
    return {s: s, t: t};
  };

  /**
   * @summary Evaluate a polynomial.
   * @param {integer} N the order of the polynomial.
   * @param {array} p the coefficient array (of size N + 1) (leading
   *   order coefficient first)
   * @param {number} x the variable.
   * @returns {number} the value of the polynomial.
   */
  m.polyval = function(N, p, s, x) {
    var y = N < 0 ? 0 : p[s++];
    while (--N >= 0) y = y * x + p[s++];
    return y;
  };

  /**
   * @summary Coarsen a value close to zero.
   * @param {number} x
   * @returns {number} the coarsened value.
   */
  m.AngRound = function(x) {
    // The makes the smallest gap in x = 1/16 - nextafter(1/16, 0) = 1/2^57 for
    // reals = 0.7 pm on the earth if x is an angle in degrees.  (This is about
    // 1000 times more resolution than we get with angles around 90 degrees.)
    // We use this to avoid having to deal with near singular cases when x is
    // non-zero but tiny (e.g., 1.0e-200).  This converts -0 to +0; however
    // tiny negative numbers get converted to -0.
    if (x === 0) return x;
    var z = 1/16,
        y = Math.abs(x);
    // The compiler mustn't "simplify" z - (z - y) to y
    y = y < z ? z - (z - y) : y;
    return x < 0 ? -y : y;
  };

  /**
   * @summary Normalize an angle.
   * @param {number} x the angle in degrees.
   * @returns {number} the angle reduced to the range (&minus;180&deg;,
   *   180&deg;].
   */
  m.AngNormalize = function(x) {
    // Place angle in [-180, 180).
    x = x % 360;
    return x <= -180 ? x + 360 : (x <= 180 ? x : x - 360);
  };

  /**
   * @summary Normalize a latitude.
   * @param {number} x the angle in degrees.
   * @returns {number} x if it is in the range [&minus;90&deg;, 90&deg;],
   *   otherwise return NaN.
   */
  m.LatFix = function(x) {
    // Replace angle with NaN if outside [-90, 90].
    return Math.abs(x) > 90 ? Number.NaN : x;
  };

  /**
   * @summary The exact difference of two angles reduced to (&minus;180&deg;,
   *   180&deg;]
   * @param {number} x the first angle in degrees.
   * @param {number} y the second angle in degrees.
   * @return {object} diff the exact difference, y &minus; x.
   *
   * This computes z = y &minus; x exactly, reduced to (&minus;180&deg;,
   * 180&deg;]; and then sets diff.s = d = round(z) and diff.t = e = z &minus;
   * round(z).  If d = &minus;180, then e &gt; 0; If d = 180, then e &le; 0.
   */
  m.AngDiff = function(x, y) {
    // Compute y - x and reduce to [-180,180] accurately.
    var r = m.sum(m.AngNormalize(-x), m.AngNormalize(y)),
        d = m.AngNormalize(r.s),
        t = r.t;
    return m.sum(d === 180 && t > 0 ? -180 : d, t);
  };

  /**
   * @summary Evaluate the sine and cosine function with the argument in
   *   degrees
   * @param {number} x in degrees.
   * @returns {object} r with r.s = sin(x) and r.c = cos(x).
   */
  m.sincosd = function(x) {
    // In order to minimize round-off errors, this function exactly reduces
    // the argument to the range [-45, 45] before converting it to radians.
    var r, q, s, c, sinx, cosx;
    r = x % 360;
    q = Math.floor(r / 90 + 0.5);
    r -= 90 * q;
    // now abs(r) <= 45
    r *= this.degree;
    // Possibly could call the gnu extension sincos
    s = Math.sin(r); c = Math.cos(r);
    switch (q & 3) {
      case 0:  sinx =  s; cosx =  c; break;
      case 1:  sinx =  c; cosx = -s; break;
      case 2:  sinx = -s; cosx = -c; break;
      default: sinx = -c; cosx =  s; break; // case 3
    }
    if (x) { sinx += 0; cosx += 0; }
    return {s: sinx, c: cosx};
  };

  /**
   * @summary Evaluate the atan2 function with the result in degrees
   * @param {number} y
   * @param {number} x
   * @returns atan2(y, x) in degrees, in the range (&minus;180&deg;
   *   180&deg;].
   */
  m.atan2d = function(y, x) {
    // In order to minimize round-off errors, this function rearranges the
    // arguments so that result of atan2 is in the range [-pi/4, pi/4] before
    // converting it to degrees and mapping the result to the correct
    // quadrant.
    var q = 0, t, ang;
    if (Math.abs(y) > Math.abs(x)) { t = x; x = y; y = t; q = 2; }
    if (x < 0) { x = -x; ++q; }
    // here x >= 0 and x >= abs(y), so angle is in [-pi/4, pi/4]
    ang = Math.atan2(y, x) / this.degree;
    switch (q) {
      // Note that atan2d(-0.0, 1.0) will return -0.  However, we expect that
      // atan2d will not be called with y = -0.  If need be, include
      //
      //   case 0: ang = 0 + ang; break;
      //
      // and handle mpfr as in AngRound.
      case 1: ang = (y >= 0 ? 180 : -180) - ang; break;
      case 2: ang =  90 - ang; break;
      case 3: ang = -90 + ang; break;
    }
    return ang;
  };
})(GeographicLib.Math);

(function(
  /**
   * @exports GeographicLib/Accumulator
   * @description Accurate summation via the
   *   {@link module:GeographicLib/Accumulator.Accumulator Accumulator} class
   *   (mainly for internal use).
   */
  a, m) {

  /**
   * @class
   * @summary Accurate summation of many numbers.
   * @classdesc This allows many numbers to be added together with twice the
   *   normal precision.  In the documentation of the member functions, sum
   *   stands for the value currently held in the accumulator.
   * @param {number | Accumulator} [y = 0]  set sum = y.
   */
  a.Accumulator = function(y) {
    this.Set(y);
  };

  /**
   * @summary Set the accumulator to a number.
   * @param {number | Accumulator} [y = 0] set sum = y.
   */
  a.Accumulator.prototype.Set = function(y) {
    if (!y) y = 0;
    if (y.constructor === a.Accumulator) {
      this._s = y._s;
      this._t = y._t;
    } else {
      this._s = y;
      this._t = 0;
    }
  };

  /**
   * @summary Add a number to the accumulator.
   * @param {number} [y = 0] set sum += y.
   */
  a.Accumulator.prototype.Add = function(y) {
    // Here's Shewchuk's solution...
    // Accumulate starting at least significant end
    var u = m.sum(y, this._t),
        v = m.sum(u.s, this._s);
    u = u.t;
    this._s = v.s;
    this._t = v.t;
    // Start is _s, _t decreasing and non-adjacent.  Sum is now (s + t + u)
    // exactly with s, t, u non-adjacent and in decreasing order (except
    // for possible zeros).  The following code tries to normalize the
    // result.  Ideally, we want _s = round(s+t+u) and _u = round(s+t+u -
    // _s).  The follow does an approximate job (and maintains the
    // decreasing non-adjacent property).  Here are two "failures" using
    // 3-bit floats:
    //
    // Case 1: _s is not equal to round(s+t+u) -- off by 1 ulp
    // [12, -1] - 8 -> [4, 0, -1] -> [4, -1] = 3 should be [3, 0] = 3
    //
    // Case 2: _s+_t is not as close to s+t+u as it shold be
    // [64, 5] + 4 -> [64, 8, 1] -> [64,  8] = 72 (off by 1)
    //                    should be [80, -7] = 73 (exact)
    //
    // "Fixing" these problems is probably not worth the expense.  The
    // representation inevitably leads to small errors in the accumulated
    // values.  The additional errors illustrated here amount to 1 ulp of
    // the less significant word during each addition to the Accumulator
    // and an additional possible error of 1 ulp in the reported sum.
    //
    // Incidentally, the "ideal" representation described above is not
    // canonical, because _s = round(_s + _t) may not be true.  For
    // example, with 3-bit floats:
    //
    // [128, 16] + 1 -> [160, -16] -- 160 = round(145).
    // But [160, 0] - 16 -> [128, 16] -- 128 = round(144).
    //
    if (this._s === 0)          // This implies t == 0,
      this._s = u;              // so result is u
    else
      this._t += u;             // otherwise just accumulate u to t.
  };

  /**
   * @summary Return the result of adding a number to sum (but
   *   don't change sum).
   * @param {number} [y = 0] the number to be added to the sum.
   * @return sum + y.
   */
  a.Accumulator.prototype.Sum = function(y) {
    var b;
    if (!y)
      return this._s;
    else {
      b = new a.Accumulator(this);
      b.Add(y);
      return b._s;
    }
  };

  /**
   * @summary Set sum = &minus;sum.
   */
  a.Accumulator.prototype.Negate = function() {
    this._s *= -1;
    this._t *= -1;
  };
})(GeographicLib.Accumulator, GeographicLib.Math);


/*
 * Geodesic.js
 * Transcription of Geodesic.[ch]pp into JavaScript.
 *
 * See the documentation for the C++ class.  The conversion is a literal
 * conversion from C++.
 *
 * The algorithms are derived in
 *
 *    Charles F. F. Karney,
 *    Algorithms for geodesics, J. Geodesy 87, 43-55 (2013);
 *    https://doi.org/10.1007/s00190-012-0578-z
 *    Addenda: https://geographiclib.sourceforge.io/geod-addenda.html
 *
 * Copyright (c) Charles Karney (2011-2017) <charles@karney.com> and licensed
 * under the MIT/X11 License.  For more information, see
 * https://geographiclib.sourceforge.io/
 */

// Load AFTER Math.js

GeographicLib.Geodesic = {};
GeographicLib.GeodesicLine = {};
GeographicLib.PolygonArea = {};

(function(
  /**
   * @exports GeographicLib/Geodesic
   * @description Solve geodesic problems via the
   *   {@link module:GeographicLib/Geodesic.Geodesic Geodesic} class.
   */
  g, l, p, m, c) {

  var GEOGRAPHICLIB_GEODESIC_ORDER = 6,
      nA1_ = GEOGRAPHICLIB_GEODESIC_ORDER,
      nA2_ = GEOGRAPHICLIB_GEODESIC_ORDER,
      nA3_ = GEOGRAPHICLIB_GEODESIC_ORDER,
      nA3x_ = nA3_,
      nC3x_, nC4x_,
      maxit1_ = 20,
      maxit2_ = maxit1_ + m.digits + 10,
      tol0_ = m.epsilon,
      tol1_ = 200 * tol0_,
      tol2_ = Math.sqrt(tol0_),
      tolb_ = tol0_ * tol1_,
      xthresh_ = 1000 * tol2_,
      CAP_NONE = 0,
      CAP_ALL  = 0x1F,
      CAP_MASK = CAP_ALL,
      OUT_ALL  = 0x7F80,
      astroid,
      A1m1f_coeff, C1f_coeff, C1pf_coeff,
      A2m1f_coeff, C2f_coeff,
      A3_coeff, C3_coeff, C4_coeff;

  g.tiny_ = Math.sqrt(Number.MIN_VALUE);
  g.nC1_ = GEOGRAPHICLIB_GEODESIC_ORDER;
  g.nC1p_ = GEOGRAPHICLIB_GEODESIC_ORDER;
  g.nC2_ = GEOGRAPHICLIB_GEODESIC_ORDER;
  g.nC3_ = GEOGRAPHICLIB_GEODESIC_ORDER;
  g.nC4_ = GEOGRAPHICLIB_GEODESIC_ORDER;
  nC3x_ = (g.nC3_ * (g.nC3_ - 1)) / 2;
  nC4x_ = (g.nC4_ * (g.nC4_ + 1)) / 2;
  g.CAP_C1   = 1<<0;
  g.CAP_C1p  = 1<<1;
  g.CAP_C2   = 1<<2;
  g.CAP_C3   = 1<<3;
  g.CAP_C4   = 1<<4;

  g.NONE          = 0;
  g.ARC           = 1<<6;
  g.LATITUDE      = 1<<7  | CAP_NONE;
  g.LONGITUDE     = 1<<8  | g.CAP_C3;
  g.AZIMUTH       = 1<<9  | CAP_NONE;
  g.DISTANCE      = 1<<10 | g.CAP_C1;
  g.STANDARD      = g.LATITUDE | g.LONGITUDE | g.AZIMUTH | g.DISTANCE;
  g.DISTANCE_IN   = 1<<11 | g.CAP_C1 | g.CAP_C1p;
  g.REDUCEDLENGTH = 1<<12 | g.CAP_C1 | g.CAP_C2;
  g.GEODESICSCALE = 1<<13 | g.CAP_C1 | g.CAP_C2;
  g.AREA          = 1<<14 | g.CAP_C4;
  g.ALL           = OUT_ALL| CAP_ALL;
  g.LONG_UNROLL   = 1<<15;
  g.OUT_MASK      = OUT_ALL| g.LONG_UNROLL;

  g.SinCosSeries = function(sinp, sinx, cosx, c) {
    // Evaluate
    // y = sinp ? sum(c[i] * sin( 2*i    * x), i, 1, n) :
    //            sum(c[i] * cos((2*i+1) * x), i, 0, n-1)
    // using Clenshaw summation.  N.B. c[0] is unused for sin series
    // Approx operation count = (n + 5) mult and (2 * n + 2) add
    var k = c.length,           // Point to one beyond last element
        n = k - (sinp ? 1 : 0),
        ar = 2 * (cosx - sinx) * (cosx + sinx), // 2 * cos(2 * x)
        y0 = n & 1 ? c[--k] : 0, y1 = 0;        // accumulators for sum
    // Now n is even
    n = Math.floor(n/2);
    while (n--) {
      // Unroll loop x 2, so accumulators return to their original role
      y1 = ar * y0 - y1 + c[--k];
      y0 = ar * y1 - y0 + c[--k];
    }
    return (sinp ? 2 * sinx * cosx * y0 : // sin(2 * x) * y0
            cosx * (y0 - y1));            // cos(x) * (y0 - y1)
  };

  astroid = function(x, y) {
    // Solve k^4+2*k^3-(x^2+y^2-1)*k^2-2*y^2*k-y^2 = 0 for positive
    // root k.  This solution is adapted from Geocentric::Reverse.
    var k,
        p = m.sq(x),
        q = m.sq(y),
        r = (p + q - 1) / 6,
        S, r2, r3, disc, u, T3, T, ang, v, uv, w;
    if ( !(q === 0 && r <= 0) ) {
      // Avoid possible division by zero when r = 0 by multiplying
      // equations for s and t by r^3 and r, resp.
      S = p * q / 4;            // S = r^3 * s
      r2 = m.sq(r);
      r3 = r * r2;
      // The discriminant of the quadratic equation for T3.  This is
      // zero on the evolute curve p^(1/3)+q^(1/3) = 1
      disc = S * (S + 2 * r3);
      u = r;
      if (disc >= 0) {
        T3 = S + r3;
        // Pick the sign on the sqrt to maximize abs(T3).  This
        // minimizes loss of precision due to cancellation.  The
        // result is unchanged because of the way the T is used
        // in definition of u.
        T3 += T3 < 0 ? -Math.sqrt(disc) : Math.sqrt(disc);    // T3 = (r * t)^3
        // N.B. cbrt always returns the real root.  cbrt(-8) = -2.
        T = m.cbrt(T3);     // T = r * t
        // T can be zero; but then r2 / T -> 0.
        u += T + (T !== 0 ? r2 / T : 0);
      } else {
        // T is complex, but the way u is defined the result is real.
        ang = Math.atan2(Math.sqrt(-disc), -(S + r3));
        // There are three possible cube roots.  We choose the
        // root which avoids cancellation.  Note that disc < 0
        // implies that r < 0.
        u += 2 * r * Math.cos(ang / 3);
      }
      v = Math.sqrt(m.sq(u) + q);       // guaranteed positive
      // Avoid loss of accuracy when u < 0.
      uv = u < 0 ? q / (v - u) : u + v; // u+v, guaranteed positive
      w = (uv - q) / (2 * v);           // positive?
      // Rearrange expression for k to avoid loss of accuracy due to
      // subtraction.  Division by 0 not possible because uv > 0, w >= 0.
      k = uv / (Math.sqrt(uv + m.sq(w)) + w); // guaranteed positive
    } else {                                  // q == 0 && r <= 0
      // y = 0 with |x| <= 1.  Handle this case directly.
      // for y small, positive root is k = abs(y)/sqrt(1-x^2)
      k = 0;
    }
    return k;
  };

  A1m1f_coeff = [
    // (1-eps)*A1-1, polynomial in eps2 of order 3
      +1, 4, 64, 0, 256
  ];

  // The scale factor A1-1 = mean value of (d/dsigma)I1 - 1
  g.A1m1f = function(eps) {
    var p = Math.floor(nA1_/2),
        t = m.polyval(p, A1m1f_coeff, 0, m.sq(eps)) / A1m1f_coeff[p + 1];
    return (t + eps) / (1 - eps);
  };

  C1f_coeff = [
    // C1[1]/eps^1, polynomial in eps2 of order 2
      -1, 6, -16, 32,
    // C1[2]/eps^2, polynomial in eps2 of order 2
      -9, 64, -128, 2048,
    // C1[3]/eps^3, polynomial in eps2 of order 1
      +9, -16, 768,
    // C1[4]/eps^4, polynomial in eps2 of order 1
      +3, -5, 512,
    // C1[5]/eps^5, polynomial in eps2 of order 0
      -7, 1280,
    // C1[6]/eps^6, polynomial in eps2 of order 0
      -7, 2048
  ];

  // The coefficients C1[l] in the Fourier expansion of B1
  g.C1f = function(eps, c) {
    var eps2 = m.sq(eps),
        d = eps,
        o = 0,
        l, p;
    for (l = 1; l <= g.nC1_; ++l) {     // l is index of C1p[l]
      p = Math.floor((g.nC1_ - l) / 2); // order of polynomial in eps^2
      c[l] = d * m.polyval(p, C1f_coeff, o, eps2) / C1f_coeff[o + p + 1];
      o += p + 2;
      d *= eps;
    }
  };

  C1pf_coeff = [
    // C1p[1]/eps^1, polynomial in eps2 of order 2
      +205, -432, 768, 1536,
    // C1p[2]/eps^2, polynomial in eps2 of order 2
      +4005, -4736, 3840, 12288,
    // C1p[3]/eps^3, polynomial in eps2 of order 1
      -225, 116, 384,
    // C1p[4]/eps^4, polynomial in eps2 of order 1
      -7173, 2695, 7680,
    // C1p[5]/eps^5, polynomial in eps2 of order 0
      +3467, 7680,
    // C1p[6]/eps^6, polynomial in eps2 of order 0
      +38081, 61440
  ];

  // The coefficients C1p[l] in the Fourier expansion of B1p
  g.C1pf = function(eps, c) {
    var eps2 = m.sq(eps),
        d = eps,
        o = 0,
        l, p;
    for (l = 1; l <= g.nC1p_; ++l) {     // l is index of C1p[l]
      p = Math.floor((g.nC1p_ - l) / 2); // order of polynomial in eps^2
      c[l] = d * m.polyval(p, C1pf_coeff, o, eps2) / C1pf_coeff[o + p + 1];
      o += p + 2;
      d *= eps;
    }
  };

  A2m1f_coeff = [
    // (eps+1)*A2-1, polynomial in eps2 of order 3
      -11, -28, -192, 0, 256
  ];

  // The scale factor A2-1 = mean value of (d/dsigma)I2 - 1
  g.A2m1f = function(eps) {
    var p = Math.floor(nA2_/2),
        t = m.polyval(p, A2m1f_coeff, 0, m.sq(eps)) / A2m1f_coeff[p + 1];
    return (t - eps) / (1 + eps);
  };

  C2f_coeff = [
    // C2[1]/eps^1, polynomial in eps2 of order 2
      +1, 2, 16, 32,
    // C2[2]/eps^2, polynomial in eps2 of order 2
      +35, 64, 384, 2048,
    // C2[3]/eps^3, polynomial in eps2 of order 1
      +15, 80, 768,
    // C2[4]/eps^4, polynomial in eps2 of order 1
      +7, 35, 512,
    // C2[5]/eps^5, polynomial in eps2 of order 0
      +63, 1280,
    // C2[6]/eps^6, polynomial in eps2 of order 0
      +77, 2048
  ];

  // The coefficients C2[l] in the Fourier expansion of B2
  g.C2f = function(eps, c) {
    var eps2 = m.sq(eps),
        d = eps,
        o = 0,
        l, p;
    for (l = 1; l <= g.nC2_; ++l) {     // l is index of C2[l]
      p = Math.floor((g.nC2_ - l) / 2); // order of polynomial in eps^2
      c[l] = d * m.polyval(p, C2f_coeff, o, eps2) / C2f_coeff[o + p + 1];
      o += p + 2;
      d *= eps;
    }
  };

  /**
   * @class
   * @property {number} a the equatorial radius (meters).
   * @property {number} f the flattening.
   * @summary Initialize a Geodesic object for a specific ellipsoid.
   * @classdesc Performs geodesic calculations on an ellipsoid of revolution.
   *   The routines for solving the direct and inverse problems return an
   *   object with some of the following fields set: lat1, lon1, azi1, lat2,
   *   lon2, azi2, s12, a12, m12, M12, M21, S12.  See {@tutorial 2-interface},
   *   "The results".
   * @example
   * var GeographicLib = require("geographiclib"),
   *     geod = GeographicLib.Geodesic.WGS84;
   * var inv = geod.Inverse(1,2,3,4);
   * console.log("lat1 = " + inv.lat1 + ", lon1 = " + inv.lon1 +
   *             ", lat2 = " + inv.lat2 + ", lon2 = " + inv.lon2 +
   *             ",\nazi1 = " + inv.azi1 + ", azi2 = " + inv.azi2 +
   *             ", s12 = " + inv.s12);
   * @param {number} a the equatorial radius of the ellipsoid (meters).
   * @param {number} f the flattening of the ellipsoid.  Setting f = 0 gives
   *   a sphere (on which geodesics are great circles).  Negative f gives a
   *   prolate ellipsoid.
   * @throws an error if the parameters are illegal.
   */
  g.Geodesic = function(a, f) {
    this.a = a;
    this.f = f;
    this._f1 = 1 - this.f;
    this._e2 = this.f * (2 - this.f);
    this._ep2 = this._e2 / m.sq(this._f1); // e2 / (1 - e2)
    this._n = this.f / ( 2 - this.f);
    this._b = this.a * this._f1;
    // authalic radius squared
    this._c2 = (m.sq(this.a) + m.sq(this._b) *
                (this._e2 === 0 ? 1 :
                 (this._e2 > 0 ? m.atanh(Math.sqrt(this._e2)) :
                  Math.atan(Math.sqrt(-this._e2))) /
                 Math.sqrt(Math.abs(this._e2))))/2;
    // The sig12 threshold for "really short".  Using the auxiliary sphere
    // solution with dnm computed at (bet1 + bet2) / 2, the relative error in
    // the azimuth consistency check is sig12^2 * abs(f) * min(1, 1-f/2) / 2.
    // (Error measured for 1/100 < b/a < 100 and abs(f) >= 1/1000.  For a given
    // f and sig12, the max error occurs for lines near the pole.  If the old
    // rule for computing dnm = (dn1 + dn2)/2 is used, then the error increases
    // by a factor of 2.)  Setting this equal to epsilon gives sig12 = etol2.
    // Here 0.1 is a safety factor (error decreased by 100) and max(0.001,
    // abs(f)) stops etol2 getting too large in the nearly spherical case.
    this._etol2 = 0.1 * tol2_ /
      Math.sqrt( Math.max(0.001, Math.abs(this.f)) *
                 Math.min(1.0, 1 - this.f/2) / 2 );
    if (!(isFinite(this.a) && this.a > 0))
      throw new Error("Equatorial radius is not positive");
    if (!(isFinite(this._b) && this._b > 0))
      throw new Error("Polar semi-axis is not positive");
    this._A3x = new Array(nA3x_);
    this._C3x = new Array(nC3x_);
    this._C4x = new Array(nC4x_);
    this.A3coeff();
    this.C3coeff();
    this.C4coeff();
  };

  A3_coeff = [
    // A3, coeff of eps^5, polynomial in n of order 0
      -3, 128,
    // A3, coeff of eps^4, polynomial in n of order 1
      -2, -3, 64,
    // A3, coeff of eps^3, polynomial in n of order 2
      -1, -3, -1, 16,
    // A3, coeff of eps^2, polynomial in n of order 2
      +3, -1, -2, 8,
    // A3, coeff of eps^1, polynomial in n of order 1
      +1, -1, 2,
    // A3, coeff of eps^0, polynomial in n of order 0
      +1, 1
  ];

  // The scale factor A3 = mean value of (d/dsigma)I3
  g.Geodesic.prototype.A3coeff = function() {
    var o = 0, k = 0,
        j, p;
    for (j = nA3_ - 1; j >= 0; --j) { // coeff of eps^j
      p = Math.min(nA3_ - j - 1, j);  // order of polynomial in n
      this._A3x[k++] = m.polyval(p, A3_coeff, o, this._n) /
        A3_coeff[o + p + 1];
      o += p + 2;
    }
  };

  C3_coeff = [
    // C3[1], coeff of eps^5, polynomial in n of order 0
      +3, 128,
    // C3[1], coeff of eps^4, polynomial in n of order 1
      +2, 5, 128,
    // C3[1], coeff of eps^3, polynomial in n of order 2
      -1, 3, 3, 64,
    // C3[1], coeff of eps^2, polynomial in n of order 2
      -1, 0, 1, 8,
    // C3[1], coeff of eps^1, polynomial in n of order 1
      -1, 1, 4,
    // C3[2], coeff of eps^5, polynomial in n of order 0
      +5, 256,
    // C3[2], coeff of eps^4, polynomial in n of order 1
      +1, 3, 128,
    // C3[2], coeff of eps^3, polynomial in n of order 2
      -3, -2, 3, 64,
    // C3[2], coeff of eps^2, polynomial in n of order 2
      +1, -3, 2, 32,
    // C3[3], coeff of eps^5, polynomial in n of order 0
      +7, 512,
    // C3[3], coeff of eps^4, polynomial in n of order 1
      -10, 9, 384,
    // C3[3], coeff of eps^3, polynomial in n of order 2
      +5, -9, 5, 192,
    // C3[4], coeff of eps^5, polynomial in n of order 0
      +7, 512,
    // C3[4], coeff of eps^4, polynomial in n of order 1
      -14, 7, 512,
    // C3[5], coeff of eps^5, polynomial in n of order 0
      +21, 2560
  ];

  // The coefficients C3[l] in the Fourier expansion of B3
  g.Geodesic.prototype.C3coeff = function() {
    var o = 0, k = 0,
        l, j, p;
    for (l = 1; l < g.nC3_; ++l) {        // l is index of C3[l]
      for (j = g.nC3_ - 1; j >= l; --j) { // coeff of eps^j
        p = Math.min(g.nC3_ - j - 1, j);  // order of polynomial in n
        this._C3x[k++] = m.polyval(p, C3_coeff, o, this._n) /
          C3_coeff[o + p + 1];
        o += p + 2;
      }
    }
  };

  C4_coeff = [
    // C4[0], coeff of eps^5, polynomial in n of order 0
      +97, 15015,
    // C4[0], coeff of eps^4, polynomial in n of order 1
      +1088, 156, 45045,
    // C4[0], coeff of eps^3, polynomial in n of order 2
      -224, -4784, 1573, 45045,
    // C4[0], coeff of eps^2, polynomial in n of order 3
      -10656, 14144, -4576, -858, 45045,
    // C4[0], coeff of eps^1, polynomial in n of order 4
      +64, 624, -4576, 6864, -3003, 15015,
    // C4[0], coeff of eps^0, polynomial in n of order 5
      +100, 208, 572, 3432, -12012, 30030, 45045,
    // C4[1], coeff of eps^5, polynomial in n of order 0
      +1, 9009,
    // C4[1], coeff of eps^4, polynomial in n of order 1
      -2944, 468, 135135,
    // C4[1], coeff of eps^3, polynomial in n of order 2
      +5792, 1040, -1287, 135135,
    // C4[1], coeff of eps^2, polynomial in n of order 3
      +5952, -11648, 9152, -2574, 135135,
    // C4[1], coeff of eps^1, polynomial in n of order 4
      -64, -624, 4576, -6864, 3003, 135135,
    // C4[2], coeff of eps^5, polynomial in n of order 0
      +8, 10725,
    // C4[2], coeff of eps^4, polynomial in n of order 1
      +1856, -936, 225225,
    // C4[2], coeff of eps^3, polynomial in n of order 2
      -8448, 4992, -1144, 225225,
    // C4[2], coeff of eps^2, polynomial in n of order 3
      -1440, 4160, -4576, 1716, 225225,
    // C4[3], coeff of eps^5, polynomial in n of order 0
      -136, 63063,
    // C4[3], coeff of eps^4, polynomial in n of order 1
      +1024, -208, 105105,
    // C4[3], coeff of eps^3, polynomial in n of order 2
      +3584, -3328, 1144, 315315,
    // C4[4], coeff of eps^5, polynomial in n of order 0
      -128, 135135,
    // C4[4], coeff of eps^4, polynomial in n of order 1
      -2560, 832, 405405,
    // C4[5], coeff of eps^5, polynomial in n of order 0
      +128, 99099
  ];

  g.Geodesic.prototype.C4coeff = function() {
    var o = 0, k = 0,
        l, j, p;
    for (l = 0; l < g.nC4_; ++l) {        // l is index of C4[l]
      for (j = g.nC4_ - 1; j >= l; --j) { // coeff of eps^j
        p = g.nC4_ - j - 1;               // order of polynomial in n
        this._C4x[k++] = m.polyval(p, C4_coeff, o, this._n) /
          C4_coeff[o + p + 1];
        o += p + 2;
      }
    }
  };

  g.Geodesic.prototype.A3f = function(eps) {
    // Evaluate A3
    return m.polyval(nA3x_ - 1, this._A3x, 0, eps);
  };

  g.Geodesic.prototype.C3f = function(eps, c) {
    // Evaluate C3 coeffs
    // Elements c[1] thru c[nC3_ - 1] are set
    var mult = 1,
        o = 0,
        l, p;
    for (l = 1; l < g.nC3_; ++l) { // l is index of C3[l]
      p = g.nC3_ - l - 1;          // order of polynomial in eps
      mult *= eps;
      c[l] = mult * m.polyval(p, this._C3x, o, eps);
      o += p + 1;
    }
  };

  g.Geodesic.prototype.C4f = function(eps, c) {
    // Evaluate C4 coeffs
    // Elements c[0] thru c[g.nC4_ - 1] are set
    var mult = 1,
        o = 0,
        l, p;
    for (l = 0; l < g.nC4_; ++l) { // l is index of C4[l]
      p = g.nC4_ - l - 1;          // order of polynomial in eps
      c[l] = mult * m.polyval(p, this._C4x, o, eps);
      o += p + 1;
      mult *= eps;
    }
  };

  // return s12b, m12b, m0, M12, M21
  g.Geodesic.prototype.Lengths = function(eps, sig12,
                                          ssig1, csig1, dn1, ssig2, csig2, dn2,
                                          cbet1, cbet2, outmask,
                                          C1a, C2a) {
    // Return m12b = (reduced length)/_b; also calculate s12b =
    // distance/_b, and m0 = coefficient of secular term in
    // expression for reduced length.
    outmask &= g.OUT_MASK;
    var vals = {},
        m0x = 0, J12 = 0, A1 = 0, A2 = 0,
        B1, B2, l, csig12, t;
    if (outmask & (g.DISTANCE | g.REDUCEDLENGTH | g.GEODESICSCALE)) {
      A1 = g.A1m1f(eps);
      g.C1f(eps, C1a);
      if (outmask & (g.REDUCEDLENGTH | g.GEODESICSCALE)) {
        A2 = g.A2m1f(eps);
        g.C2f(eps, C2a);
        m0x = A1 - A2;
        A2 = 1 + A2;
      }
      A1 = 1 + A1;
    }
    if (outmask & g.DISTANCE) {
      B1 = g.SinCosSeries(true, ssig2, csig2, C1a) -
        g.SinCosSeries(true, ssig1, csig1, C1a);
      // Missing a factor of _b
      vals.s12b = A1 * (sig12 + B1);
      if (outmask & (g.REDUCEDLENGTH | g.GEODESICSCALE)) {
        B2 = g.SinCosSeries(true, ssig2, csig2, C2a) -
          g.SinCosSeries(true, ssig1, csig1, C2a);
        J12 = m0x * sig12 + (A1 * B1 - A2 * B2);
      }
    } else if (outmask & (g.REDUCEDLENGTH | g.GEODESICSCALE)) {
      // Assume here that nC1_ >= nC2_
      for (l = 1; l <= g.nC2_; ++l)
        C2a[l] = A1 * C1a[l] - A2 * C2a[l];
      J12 = m0x * sig12 + (g.SinCosSeries(true, ssig2, csig2, C2a) -
                           g.SinCosSeries(true, ssig1, csig1, C2a));
    }
    if (outmask & g.REDUCEDLENGTH) {
      vals.m0 = m0x;
      // Missing a factor of _b.
      // Add parens around (csig1 * ssig2) and (ssig1 * csig2) to ensure
      // accurate cancellation in the case of coincident points.
      vals.m12b = dn2 * (csig1 * ssig2) - dn1 * (ssig1 * csig2) -
        csig1 * csig2 * J12;
    }
    if (outmask & g.GEODESICSCALE) {
      csig12 = csig1 * csig2 + ssig1 * ssig2;
      t = this._ep2 * (cbet1 - cbet2) * (cbet1 + cbet2) / (dn1 + dn2);
      vals.M12 = csig12 + (t * ssig2 - csig2 * J12) * ssig1 / dn1;
      vals.M21 = csig12 - (t * ssig1 - csig1 * J12) * ssig2 / dn2;
    }
    return vals;
  };

  // return sig12, salp1, calp1, salp2, calp2, dnm
  g.Geodesic.prototype.InverseStart = function(sbet1, cbet1, dn1,
                                               sbet2, cbet2, dn2,
                                               lam12, slam12, clam12,
                                               C1a, C2a) {
    // Return a starting point for Newton's method in salp1 and calp1
    // (function value is -1).  If Newton's method doesn't need to be
    // used, return also salp2 and calp2 and function value is sig12.
    // salp2, calp2 only updated if return val >= 0.
    var vals = {},
        // bet12 = bet2 - bet1 in [0, pi); bet12a = bet2 + bet1 in (-pi, 0]
        sbet12 = sbet2 * cbet1 - cbet2 * sbet1,
        cbet12 = cbet2 * cbet1 + sbet2 * sbet1,
        sbet12a, shortline, omg12, sbetm2, somg12, comg12, t, ssig12, csig12,
        x, y, lamscale, betscale, k2, eps, cbet12a, bet12a, m12b, m0, nvals,
        k, omg12a, lam12x;
    vals.sig12 = -1;        // Return value
    // Volatile declaration needed to fix inverse cases
    // 88.202499451857 0 -88.202499451857 179.981022032992859592
    // 89.262080389218 0 -89.262080389218 179.992207982775375662
    // 89.333123580033 0 -89.333123580032997687 179.99295812360148422
    // which otherwise fail with g++ 4.4.4 x86 -O3
    sbet12a = sbet2 * cbet1;
    sbet12a += cbet2 * sbet1;

    shortline = cbet12 >= 0 && sbet12 < 0.5 && cbet2 * lam12 < 0.5;
    if (shortline) {
      sbetm2 = m.sq(sbet1 + sbet2);
      // sin((bet1+bet2)/2)^2
      // =  (sbet1 + sbet2)^2 / ((sbet1 + sbet2)^2 + (cbet1 + cbet2)^2)
      sbetm2 /= sbetm2 + m.sq(cbet1 + cbet2);
      vals.dnm = Math.sqrt(1 + this._ep2 * sbetm2);
      omg12 = lam12 / (this._f1 * vals.dnm);
      somg12 = Math.sin(omg12); comg12 = Math.cos(omg12);
    } else {
      somg12 = slam12; comg12 = clam12;
    }

    vals.salp1 = cbet2 * somg12;
    vals.calp1 = comg12 >= 0 ?
      sbet12 + cbet2 * sbet1 * m.sq(somg12) / (1 + comg12) :
      sbet12a - cbet2 * sbet1 * m.sq(somg12) / (1 - comg12);

    ssig12 = m.hypot(vals.salp1, vals.calp1);
    csig12 = sbet1 * sbet2 + cbet1 * cbet2 * comg12;
    if (shortline && ssig12 < this._etol2) {
      // really short lines
      vals.salp2 = cbet1 * somg12;
      vals.calp2 = sbet12 - cbet1 * sbet2 *
        (comg12 >= 0 ? m.sq(somg12) / (1 + comg12) : 1 - comg12);
      // norm(vals.salp2, vals.calp2);
      t = m.hypot(vals.salp2, vals.calp2); vals.salp2 /= t; vals.calp2 /= t;
      // Set return value
      vals.sig12 = Math.atan2(ssig12, csig12);
    } else if (Math.abs(this._n) > 0.1 || // Skip astroid calc if too eccentric
               csig12 >= 0 ||
               ssig12 >= 6 * Math.abs(this._n) * Math.PI * m.sq(cbet1)) {
      // Nothing to do, zeroth order spherical approximation is OK
    } else {
      // Scale lam12 and bet2 to x, y coordinate system where antipodal
      // point is at origin and singular point is at y = 0, x = -1.
      lam12x = Math.atan2(-slam12, -clam12); // lam12 - pi
      if (this.f >= 0) {       // In fact f == 0 does not get here
        // x = dlong, y = dlat
        k2 = m.sq(sbet1) * this._ep2;
        eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
        lamscale = this.f * cbet1 * this.A3f(eps) * Math.PI;
        betscale = lamscale * cbet1;

        x = lam12x / lamscale;
        y = sbet12a / betscale;
      } else {                  // f < 0
        // x = dlat, y = dlong
        cbet12a = cbet2 * cbet1 - sbet2 * sbet1;
        bet12a = Math.atan2(sbet12a, cbet12a);
        // In the case of lon12 = 180, this repeats a calculation made
        // in Inverse.
        nvals = this.Lengths(this._n, Math.PI + bet12a,
                             sbet1, -cbet1, dn1, sbet2, cbet2, dn2,
                             cbet1, cbet2, g.REDUCEDLENGTH, C1a, C2a);
        m12b = nvals.m12b; m0 = nvals.m0;
        x = -1 + m12b / (cbet1 * cbet2 * m0 * Math.PI);
        betscale = x < -0.01 ? sbet12a / x :
          -this.f * m.sq(cbet1) * Math.PI;
        lamscale = betscale / cbet1;
        y = lam12 / lamscale;
      }

      if (y > -tol1_ && x > -1 - xthresh_) {
        // strip near cut
        if (this.f >= 0) {
          vals.salp1 = Math.min(1, -x);
          vals.calp1 = -Math.sqrt(1 - m.sq(vals.salp1));
        } else {
          vals.calp1 = Math.max(x > -tol1_ ? 0 : -1, x);
          vals.salp1 = Math.sqrt(1 - m.sq(vals.calp1));
        }
      } else {
        // Estimate alp1, by solving the astroid problem.
        //
        // Could estimate alpha1 = theta + pi/2, directly, i.e.,
        //   calp1 = y/k; salp1 = -x/(1+k);  for f >= 0
        //   calp1 = x/(1+k); salp1 = -y/k;  for f < 0 (need to check)
        //
        // However, it's better to estimate omg12 from astroid and use
        // spherical formula to compute alp1.  This reduces the mean number of
        // Newton iterations for astroid cases from 2.24 (min 0, max 6) to 2.12
        // (min 0 max 5).  The changes in the number of iterations are as
        // follows:
        //
        // change percent
        //    1       5
        //    0      78
        //   -1      16
        //   -2       0.6
        //   -3       0.04
        //   -4       0.002
        //
        // The histogram of iterations is (m = number of iterations estimating
        // alp1 directly, n = number of iterations estimating via omg12, total
        // number of trials = 148605):
        //
        //  iter    m      n
        //    0   148    186
        //    1 13046  13845
        //    2 93315 102225
        //    3 36189  32341
        //    4  5396      7
        //    5   455      1
        //    6    56      0
        //
        // Because omg12 is near pi, estimate work with omg12a = pi - omg12
        k = astroid(x, y);
        omg12a = lamscale * ( this.f >= 0 ? -x * k/(1 + k) : -y * (1 + k)/k );
        somg12 = Math.sin(omg12a); comg12 = -Math.cos(omg12a);
        // Update spherical estimate of alp1 using omg12 instead of
        // lam12
        vals.salp1 = cbet2 * somg12;
        vals.calp1 = sbet12a -
          cbet2 * sbet1 * m.sq(somg12) / (1 - comg12);
      }
    }
    // Sanity check on starting guess.  Backwards check allows NaN through.
    if (!(vals.salp1 <= 0.0)) {
      // norm(vals.salp1, vals.calp1);
      t = m.hypot(vals.salp1, vals.calp1); vals.salp1 /= t; vals.calp1 /= t;
    } else {
      vals.salp1 = 1; vals.calp1 = 0;
    }
    return vals;
  };

  // return lam12, salp2, calp2, sig12, ssig1, csig1, ssig2, csig2, eps,
  // domg12, dlam12,
  g.Geodesic.prototype.Lambda12 = function(sbet1, cbet1, dn1, sbet2, cbet2, dn2,
                                           salp1, calp1, slam120, clam120,
                                           diffp, C1a, C2a, C3a) {
    var vals = {},
        t, salp0, calp0,
        somg1, comg1, somg2, comg2, somg12, comg12, B312, eta, k2, nvals;
    if (sbet1 === 0 && calp1 === 0)
      // Break degeneracy of equatorial line.  This case has already been
      // handled.
      calp1 = -g.tiny_;

    // sin(alp1) * cos(bet1) = sin(alp0)
    salp0 = salp1 * cbet1;
    calp0 = m.hypot(calp1, salp1 * sbet1); // calp0 > 0

    // tan(bet1) = tan(sig1) * cos(alp1)
    // tan(omg1) = sin(alp0) * tan(sig1) = tan(omg1)=tan(alp1)*sin(bet1)
    vals.ssig1 = sbet1; somg1 = salp0 * sbet1;
    vals.csig1 = comg1 = calp1 * cbet1;
    // norm(vals.ssig1, vals.csig1);
    t = m.hypot(vals.ssig1, vals.csig1); vals.ssig1 /= t; vals.csig1 /= t;
    // norm(somg1, comg1); -- don't need to normalize!

    // Enforce symmetries in the case abs(bet2) = -bet1.  Need to be careful
    // about this case, since this can yield singularities in the Newton
    // iteration.
    // sin(alp2) * cos(bet2) = sin(alp0)
    vals.salp2 = cbet2 !== cbet1 ? salp0 / cbet2 : salp1;
    // calp2 = sqrt(1 - sq(salp2))
    //       = sqrt(sq(calp0) - sq(sbet2)) / cbet2
    // and subst for calp0 and rearrange to give (choose positive sqrt
    // to give alp2 in [0, pi/2]).
    vals.calp2 = cbet2 !== cbet1 || Math.abs(sbet2) !== -sbet1 ?
      Math.sqrt(m.sq(calp1 * cbet1) + (cbet1 < -sbet1 ?
                                       (cbet2 - cbet1) * (cbet1 + cbet2) :
                                       (sbet1 - sbet2) * (sbet1 + sbet2))) /
      cbet2 : Math.abs(calp1);
    // tan(bet2) = tan(sig2) * cos(alp2)
    // tan(omg2) = sin(alp0) * tan(sig2).
    vals.ssig2 = sbet2; somg2 = salp0 * sbet2;
    vals.csig2 = comg2 = vals.calp2 * cbet2;
    // norm(vals.ssig2, vals.csig2);
    t = m.hypot(vals.ssig2, vals.csig2); vals.ssig2 /= t; vals.csig2 /= t;
    // norm(somg2, comg2); -- don't need to normalize!

    // sig12 = sig2 - sig1, limit to [0, pi]
    vals.sig12 = Math.atan2(Math.max(0, vals.csig1 * vals.ssig2 -
                                        vals.ssig1 * vals.csig2),
                                        vals.csig1 * vals.csig2 +
                                        vals.ssig1 * vals.ssig2);

    // omg12 = omg2 - omg1, limit to [0, pi]
    somg12 = Math.max(0, comg1 * somg2 - somg1 * comg2);
    comg12 =             comg1 * comg2 + somg1 * somg2;
    // eta = omg12 - lam120
    eta = Math.atan2(somg12 * clam120 - comg12 * slam120,
                     comg12 * clam120 + somg12 * slam120);
    k2 = m.sq(calp0) * this._ep2;
    vals.eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
    this.C3f(vals.eps, C3a);
    B312 = (g.SinCosSeries(true, vals.ssig2, vals.csig2, C3a) -
            g.SinCosSeries(true, vals.ssig1, vals.csig1, C3a));
    vals.domg12 =  -this.f * this.A3f(vals.eps) * salp0 * (vals.sig12 + B312);
    vals.lam12 = eta + vals.domg12;
    if (diffp) {
      if (vals.calp2 === 0)
        vals.dlam12 = -2 * this._f1 * dn1 / sbet1;
      else {
        nvals = this.Lengths(vals.eps, vals.sig12,
                             vals.ssig1, vals.csig1, dn1,
                             vals.ssig2, vals.csig2, dn2,
                             cbet1, cbet2, g.REDUCEDLENGTH, C1a, C2a);
        vals.dlam12 = nvals.m12b;
        vals.dlam12 *= this._f1 / (vals.calp2 * cbet2);
      }
    }
    return vals;
  };

  /**
   * @summary Solve the inverse geodesic problem.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} lat2 the latitude of the second point in degrees.
   * @param {number} lon2 the longitude of the second point in degrees.
   * @param {bitmask} [outmask = STANDARD] which results to include.
   * @returns {object} the requested results
   * @description The lat1, lon1, lat2, lon2, and a12 fields of the result are
   *   always set.  For details on the outmask parameter, see {@tutorial
   *   2-interface}, "The outmask and caps parameters".
   */
  g.Geodesic.prototype.Inverse = function(lat1, lon1, lat2, lon2, outmask) {
    var r, vals;
    if (!outmask) outmask = g.STANDARD;
    if (outmask === g.LONG_UNROLL) outmask |= g.STANDARD;
    outmask &= g.OUT_MASK;
    r = this.InverseInt(lat1, lon1, lat2, lon2, outmask);
    vals = r.vals;
    if (outmask & g.AZIMUTH) {
      vals.azi1 = m.atan2d(r.salp1, r.calp1);
      vals.azi2 = m.atan2d(r.salp2, r.calp2);
    }
    return vals;
  };

  g.Geodesic.prototype.InverseInt = function(lat1, lon1, lat2, lon2, outmask) {
    var vals = {},
        lon12, lon12s, lonsign, t, swapp, latsign,
        sbet1, cbet1, sbet2, cbet2, s12x, m12x,
        dn1, dn2, lam12, slam12, clam12,
        sig12, calp1, salp1, calp2, salp2, C1a, C2a, C3a, meridian, nvals,
        ssig1, csig1, ssig2, csig2, eps, omg12, dnm,
        numit, salp1a, calp1a, salp1b, calp1b,
        tripn, tripb, v, dv, dalp1, sdalp1, cdalp1, nsalp1,
        lengthmask, salp0, calp0, alp12, k2, A4, C4a, B41, B42,
        somg12, comg12, domg12, dbet1, dbet2, salp12, calp12, sdomg12, cdomg12;
    // Compute longitude difference (AngDiff does this carefully).  Result is
    // in [-180, 180] but -180 is only for west-going geodesics.  180 is for
    // east-going and meridional geodesics.
    vals.lat1 = lat1 = m.LatFix(lat1); vals.lat2 = lat2 = m.LatFix(lat2);
    // If really close to the equator, treat as on equator.
    lat1 = m.AngRound(lat1);
    lat2 = m.AngRound(lat2);
    lon12 = m.AngDiff(lon1, lon2); lon12s = lon12.t; lon12 = lon12.s;
    if (outmask & g.LONG_UNROLL) {
      vals.lon1 = lon1; vals.lon2 = (lon1 + lon12) + lon12s;
    } else {
      vals.lon1 = m.AngNormalize(lon1); vals.lon2 = m.AngNormalize(lon2);
    }
    // Make longitude difference positive.
    lonsign = lon12 >= 0 ? 1 : -1;
    // If very close to being on the same half-meridian, then make it so.
    lon12 = lonsign * m.AngRound(lon12);
    lon12s = m.AngRound((180 - lon12) - lonsign * lon12s);
    lam12 = lon12 * m.degree;
    t = m.sincosd(lon12 > 90 ? lon12s : lon12);
    slam12 = t.s; clam12 = (lon12 > 90 ? -1 : 1) * t.c;

    // Swap points so that point with higher (abs) latitude is point 1
    // If one latitude is a nan, then it becomes lat1.
    swapp = Math.abs(lat1) < Math.abs(lat2) ? -1 : 1;
    if (swapp < 0) {
      lonsign *= -1;
      t = lat1;
      lat1 = lat2;
      lat2 = t;
      // swap(lat1, lat2);
    }
    // Make lat1 <= 0
    latsign = lat1 < 0 ? 1 : -1;
    lat1 *= latsign;
    lat2 *= latsign;
    // Now we have
    //
    //     0 <= lon12 <= 180
    //     -90 <= lat1 <= 0
    //     lat1 <= lat2 <= -lat1
    //
    // longsign, swapp, latsign register the transformation to bring the
    // coordinates to this canonical form.  In all cases, 1 means no change was
    // made.  We make these transformations so that there are few cases to
    // check, e.g., on verifying quadrants in atan2.  In addition, this
    // enforces some symmetries in the results returned.

    t = m.sincosd(lat1); sbet1 = this._f1 * t.s; cbet1 = t.c;
    // norm(sbet1, cbet1);
    t = m.hypot(sbet1, cbet1); sbet1 /= t; cbet1 /= t;
    // Ensure cbet1 = +epsilon at poles
    cbet1 = Math.max(g.tiny_, cbet1);

    t = m.sincosd(lat2); sbet2 = this._f1 * t.s; cbet2 = t.c;
    // norm(sbet2, cbet2);
    t = m.hypot(sbet2, cbet2); sbet2 /= t; cbet2 /= t;
    // Ensure cbet2 = +epsilon at poles
    cbet2 = Math.max(g.tiny_, cbet2);

    // If cbet1 < -sbet1, then cbet2 - cbet1 is a sensitive measure of the
    // |bet1| - |bet2|.  Alternatively (cbet1 >= -sbet1), abs(sbet2) + sbet1 is
    // a better measure.  This logic is used in assigning calp2 in Lambda12.
    // Sometimes these quantities vanish and in that case we force bet2 = +/-
    // bet1 exactly.  An example where is is necessary is the inverse problem
    // 48.522876735459 0 -48.52287673545898293 179.599720456223079643
    // which failed with Visual Studio 10 (Release and Debug)

    if (cbet1 < -sbet1) {
      if (cbet2 === cbet1)
        sbet2 = sbet2 < 0 ? sbet1 : -sbet1;
    } else {
      if (Math.abs(sbet2) === -sbet1)
        cbet2 = cbet1;
    }

    dn1 = Math.sqrt(1 + this._ep2 * m.sq(sbet1));
    dn2 = Math.sqrt(1 + this._ep2 * m.sq(sbet2));

    // index zero elements of these arrays are unused
    C1a = new Array(g.nC1_ + 1);
    C2a = new Array(g.nC2_ + 1);
    C3a = new Array(g.nC3_);

    meridian = lat1 === -90 || slam12 === 0;
    if (meridian) {

      // Endpoints are on a single full meridian, so the geodesic might
      // lie on a meridian.

      calp1 = clam12; salp1 = slam12; // Head to the target longitude
      calp2 = 1; salp2 = 0;           // At the target we're heading north

      // tan(bet) = tan(sig) * cos(alp)
      ssig1 = sbet1; csig1 = calp1 * cbet1;
      ssig2 = sbet2; csig2 = calp2 * cbet2;

      // sig12 = sig2 - sig1
      sig12 = Math.atan2(Math.max(0, csig1 * ssig2 - ssig1 * csig2),
                                     csig1 * csig2 + ssig1 * ssig2);
      nvals = this.Lengths(this._n, sig12,
                           ssig1, csig1, dn1, ssig2, csig2, dn2, cbet1, cbet2,
                           outmask | g.DISTANCE | g.REDUCEDLENGTH,
                           C1a, C2a);
      s12x = nvals.s12b;
      m12x = nvals.m12b;
      // Ignore m0
      if ((outmask & g.GEODESICSCALE) !== 0) {
        vals.M12 = nvals.M12;
        vals.M21 = nvals.M21;
      }
      // Add the check for sig12 since zero length geodesics might yield
      // m12 < 0.  Test case was
      //
      //    echo 20.001 0 20.001 0 | GeodSolve -i
      //
      // In fact, we will have sig12 > pi/2 for meridional geodesic
      // which is not a shortest path.
      if (sig12 < 1 || m12x >= 0) {
        // Need at least 2, to handle 90 0 90 180
        if (sig12 < 3 * g.tiny_)
          sig12 = m12x = s12x = 0;
        m12x *= this._b;
        s12x *= this._b;
        vals.a12 = sig12 / m.degree;
      } else
        // m12 < 0, i.e., prolate and too close to anti-podal
        meridian = false;
    }

    somg12 = 2;
    if (!meridian &&
        sbet1 === 0 &&           // and sbet2 == 0
        (this.f <= 0 || lon12s >= this.f * 180)) {

      // Geodesic runs along equator
      calp1 = calp2 = 0; salp1 = salp2 = 1;
      s12x = this.a * lam12;
      sig12 = omg12 = lam12 / this._f1;
      m12x = this._b * Math.sin(sig12);
      if (outmask & g.GEODESICSCALE)
        vals.M12 = vals.M21 = Math.cos(sig12);
      vals.a12 = lon12 / this._f1;

    } else if (!meridian) {

      // Now point1 and point2 belong within a hemisphere bounded by a
      // meridian and geodesic is neither meridional or equatorial.

      // Figure a starting point for Newton's method
      nvals = this.InverseStart(sbet1, cbet1, dn1, sbet2, cbet2, dn2,
                                lam12, slam12, clam12, C1a, C2a);
      sig12 = nvals.sig12;
      salp1 = nvals.salp1;
      calp1 = nvals.calp1;

      if (sig12 >= 0) {
        salp2 = nvals.salp2;
        calp2 = nvals.calp2;
        // Short lines (InverseStart sets salp2, calp2, dnm)

        dnm = nvals.dnm;
        s12x = sig12 * this._b * dnm;
        m12x = m.sq(dnm) * this._b * Math.sin(sig12 / dnm);
        if (outmask & g.GEODESICSCALE)
          vals.M12 = vals.M21 = Math.cos(sig12 / dnm);
        vals.a12 = sig12 / m.degree;
        omg12 = lam12 / (this._f1 * dnm);
      } else {

        // Newton's method.  This is a straightforward solution of f(alp1) =
        // lambda12(alp1) - lam12 = 0 with one wrinkle.  f(alp) has exactly one
        // root in the interval (0, pi) and its derivative is positive at the
        // root.  Thus f(alp) is positive for alp > alp1 and negative for alp <
        // alp1.  During the course of the iteration, a range (alp1a, alp1b) is
        // maintained which brackets the root and with each evaluation of
        // f(alp) the range is shrunk if possible.  Newton's method is
        // restarted whenever the derivative of f is negative (because the new
        // value of alp1 is then further from the solution) or if the new
        // estimate of alp1 lies outside (0,pi); in this case, the new starting
        // guess is taken to be (alp1a + alp1b) / 2.
        numit = 0;
        // Bracketing range
        salp1a = g.tiny_; calp1a = 1; salp1b = g.tiny_; calp1b = -1;
        for (tripn = false, tripb = false; numit < maxit2_; ++numit) {
          // the WGS84 test set: mean = 1.47, sd = 1.25, max = 16
          // WGS84 and random input: mean = 2.85, sd = 0.60
          nvals = this.Lambda12(sbet1, cbet1, dn1, sbet2, cbet2, dn2,
                                salp1, calp1, slam12, clam12, numit < maxit1_,
                                C1a, C2a, C3a);
          v = nvals.lam12;
          salp2 = nvals.salp2;
          calp2 = nvals.calp2;
          sig12 = nvals.sig12;
          ssig1 = nvals.ssig1;
          csig1 = nvals.csig1;
          ssig2 = nvals.ssig2;
          csig2 = nvals.csig2;
          eps = nvals.eps;
          domg12 = nvals.domg12;
          dv = nvals.dlam12;

          // 2 * tol0 is approximately 1 ulp for a number in [0, pi].
          // Reversed test to allow escape with NaNs
          if (tripb || !(Math.abs(v) >= (tripn ? 8 : 1) * tol0_))
            break;
          // Update bracketing values
          if (v > 0 && (numit < maxit1_ || calp1/salp1 > calp1b/salp1b)) {
            salp1b = salp1; calp1b = calp1;
          } else if (v < 0 &&
                     (numit < maxit1_ || calp1/salp1 < calp1a/salp1a)) {
            salp1a = salp1; calp1a = calp1;
          }
          if (numit < maxit1_ && dv > 0) {
            dalp1 = -v/dv;
            sdalp1 = Math.sin(dalp1); cdalp1 = Math.cos(dalp1);
            nsalp1 = salp1 * cdalp1 + calp1 * sdalp1;
            if (nsalp1 > 0 && Math.abs(dalp1) < Math.PI) {
              calp1 = calp1 * cdalp1 - salp1 * sdalp1;
              salp1 = nsalp1;
              // norm(salp1, calp1);
              t = m.hypot(salp1, calp1); salp1 /= t; calp1 /= t;
              // In some regimes we don't get quadratic convergence because
              // slope -> 0.  So use convergence conditions based on epsilon
              // instead of sqrt(epsilon).
              tripn = Math.abs(v) <= 16 * tol0_;
              continue;
            }
          }
          // Either dv was not positive or updated value was outside legal
          // range.  Use the midpoint of the bracket as the next estimate.
          // This mechanism is not needed for the WGS84 ellipsoid, but it does
          // catch problems with more eccentric ellipsoids.  Its efficacy is
          // such for the WGS84 test set with the starting guess set to alp1 =
          // 90deg:
          // the WGS84 test set: mean = 5.21, sd = 3.93, max = 24
          // WGS84 and random input: mean = 4.74, sd = 0.99
          salp1 = (salp1a + salp1b)/2;
          calp1 = (calp1a + calp1b)/2;
          // norm(salp1, calp1);
          t = m.hypot(salp1, calp1); salp1 /= t; calp1 /= t;
          tripn = false;
          tripb = (Math.abs(salp1a - salp1) + (calp1a - calp1) < tolb_ ||
                   Math.abs(salp1 - salp1b) + (calp1 - calp1b) < tolb_);
        }
        lengthmask = outmask |
            (outmask & (g.REDUCEDLENGTH | g.GEODESICSCALE) ?
             g.DISTANCE : g.NONE);
        nvals = this.Lengths(eps, sig12,
                             ssig1, csig1, dn1, ssig2, csig2, dn2, cbet1, cbet2,
                             lengthmask, C1a, C2a);
        s12x = nvals.s12b;
        m12x = nvals.m12b;
        // Ignore m0
        if ((outmask & g.GEODESICSCALE) !== 0) {
          vals.M12 = nvals.M12;
          vals.M21 = nvals.M21;
        }
        m12x *= this._b;
        s12x *= this._b;
        vals.a12 = sig12 / m.degree;
        if (outmask & g.AREA) {
          // omg12 = lam12 - domg12
          sdomg12 = Math.sin(domg12); cdomg12 = Math.cos(domg12);
          somg12 = slam12 * cdomg12 - clam12 * sdomg12;
          comg12 = clam12 * cdomg12 + slam12 * sdomg12;
        }
      }
    }

    if (outmask & g.DISTANCE)
      vals.s12 = 0 + s12x;      // Convert -0 to 0

    if (outmask & g.REDUCEDLENGTH)
      vals.m12 = 0 + m12x;      // Convert -0 to 0

    if (outmask & g.AREA) {
      // From Lambda12: sin(alp1) * cos(bet1) = sin(alp0)
      salp0 = salp1 * cbet1;
      calp0 = m.hypot(calp1, salp1 * sbet1); // calp0 > 0
      if (calp0 !== 0 && salp0 !== 0) {
        // From Lambda12: tan(bet) = tan(sig) * cos(alp)
        ssig1 = sbet1; csig1 = calp1 * cbet1;
        ssig2 = sbet2; csig2 = calp2 * cbet2;
        k2 = m.sq(calp0) * this._ep2;
        eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
        // Multiplier = a^2 * e^2 * cos(alpha0) * sin(alpha0).
        A4 = m.sq(this.a) * calp0 * salp0 * this._e2;
        // norm(ssig1, csig1);
        t = m.hypot(ssig1, csig1); ssig1 /= t; csig1 /= t;
        // norm(ssig2, csig2);
        t = m.hypot(ssig2, csig2); ssig2 /= t; csig2 /= t;
        C4a = new Array(g.nC4_);
        this.C4f(eps, C4a);
        B41 = g.SinCosSeries(false, ssig1, csig1, C4a);
        B42 = g.SinCosSeries(false, ssig2, csig2, C4a);
        vals.S12 = A4 * (B42 - B41);
      } else
        // Avoid problems with indeterminate sig1, sig2 on equator
        vals.S12 = 0;
      if (!meridian && somg12 > 1) {
        somg12 = Math.sin(omg12); comg12 = Math.cos(omg12);
      }
      if (!meridian &&
          comg12 > -0.7071 &&      // Long difference not too big
          sbet2 - sbet1 < 1.75) { // Lat difference not too big
        // Use tan(Gamma/2) = tan(omg12/2)
        // * (tan(bet1/2)+tan(bet2/2))/(1+tan(bet1/2)*tan(bet2/2))
        // with tan(x/2) = sin(x)/(1+cos(x))
        domg12 = 1 + comg12; dbet1 = 1 + cbet1; dbet2 = 1 + cbet2;
        alp12 = 2 * Math.atan2( somg12 * (sbet1*dbet2 + sbet2*dbet1),
                                domg12 * (sbet1*sbet2 + dbet1*dbet2) );
      } else {
        // alp12 = alp2 - alp1, used in atan2 so no need to normalize
        salp12 = salp2 * calp1 - calp2 * salp1;
        calp12 = calp2 * calp1 + salp2 * salp1;
        // The right thing appears to happen if alp1 = +/-180 and alp2 = 0, viz
        // salp12 = -0 and alp12 = -180.  However this depends on the sign
        // being attached to 0 correctly.  The following ensures the correct
        // behavior.
        if (salp12 === 0 && calp12 < 0) {
          salp12 = g.tiny_ * calp1;
          calp12 = -1;
        }
        alp12 = Math.atan2(salp12, calp12);
      }
      vals.S12 += this._c2 * alp12;
      vals.S12 *= swapp * lonsign * latsign;
      // Convert -0 to 0
      vals.S12 += 0;
    }

    // Convert calp, salp to azimuth accounting for lonsign, swapp, latsign.
    if (swapp < 0) {
      t = salp1;
      salp1 = salp2;
      salp2 = t;
      // swap(salp1, salp2);
      t = calp1;
      calp1 = calp2;
      calp2 = t;
      // swap(calp1, calp2);
      if (outmask & g.GEODESICSCALE) {
        t = vals.M12;
        vals.M12 = vals.M21;
        vals.M21 = t;
        // swap(vals.M12, vals.M21);
      }
    }

    salp1 *= swapp * lonsign; calp1 *= swapp * latsign;
    salp2 *= swapp * lonsign; calp2 *= swapp * latsign;

    return {vals: vals,
            salp1: salp1, calp1: calp1,
            salp2: salp2, calp2: calp2};
  };

  /**
   * @summary Solve the general direct geodesic problem.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   * @param {bool} arcmode is the next parameter an arc length?
   * @param {number} s12_a12 the (arcmode ? arc length : distance) from the
   *   first point to the second in (arcmode ? degrees : meters).
   * @param {bitmask} [outmask = STANDARD] which results to include.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, and a12 fields of the result are always
   *   set; s12 is included if arcmode is false.  For details on the outmask
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  g.Geodesic.prototype.GenDirect = function(lat1, lon1, azi1,
                                            arcmode, s12_a12, outmask) {
    var line;
    if (!outmask) outmask = g.STANDARD;
    else if (outmask === g.LONG_UNROLL) outmask |= g.STANDARD;
    // Automatically supply DISTANCE_IN if necessary
    if (!arcmode) outmask |= g.DISTANCE_IN;
    line = new l.GeodesicLine(this, lat1, lon1, azi1, outmask);
    return line.GenPosition(arcmode, s12_a12, outmask);
  };

  /**
   * @summary Solve the direct geodesic problem.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   * @param {number} s12 the distance from the first point to the second in
   *   meters.
   * @param {bitmask} [outmask = STANDARD] which results to include.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, s12, and a12 fields of the result are
   *   always set.  For details on the outmask parameter, see {@tutorial
   *   2-interface}, "The outmask and caps parameters".
   */
  g.Geodesic.prototype.Direct = function(lat1, lon1, azi1, s12, outmask) {
    return this.GenDirect(lat1, lon1, azi1, false, s12, outmask);
  };

  /**
   * @summary Solve the direct geodesic problem with arc length.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   * @param {number} a12 the arc length from the first point to the second in
   *   degrees.
   * @param {bitmask} [outmask = STANDARD] which results to include.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, and a12 fields of the result are
   *   always set.  For details on the outmask parameter, see {@tutorial
   *   2-interface}, "The outmask and caps parameters".
   */
  g.Geodesic.prototype.ArcDirect = function(lat1, lon1, azi1, a12, outmask) {
    return this.GenDirect(lat1, lon1, azi1, true, a12, outmask);
  };

  /**
   * @summary Create a {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   *   degrees.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include.
   * @returns {object} the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object
   * @description For details on the caps parameter, see {@tutorial
   *   2-interface}, "The outmask and caps parameters".
   */
  g.Geodesic.prototype.Line = function(lat1, lon1, azi1, caps) {
    return new l.GeodesicLine(this, lat1, lon1, azi1, caps);
  };

  /**
   * @summary Define a {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} in terms of the direct geodesic problem specified in terms
   *   of distance.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   *   degrees.
   * @param {number} s12 the distance between point 1 and point 2 (meters); it
   *   can be negative.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include.
   * @returns {object} the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object
   * @description This function sets point 3 of the GeodesicLine to correspond
   *   to point 2 of the direct geodesic problem.  For details on the caps
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  g.Geodesic.prototype.DirectLine = function(lat1, lon1, azi1, s12, caps) {
    return this.GenDirectLine(lat1, lon1, azi1, false, s12, caps);
  };

  /**
   * @summary Define a {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} in terms of the direct geodesic problem specified in terms
   *   of arc length.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   *   degrees.
   * @param {number} a12 the arc length between point 1 and point 2 (degrees);
   *   it can be negative.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include.
   * @returns {object} the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object
   * @description This function sets point 3 of the GeodesicLine to correspond
   *   to point 2 of the direct geodesic problem.  For details on the caps
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  g.Geodesic.prototype.ArcDirectLine = function(lat1, lon1, azi1, a12, caps) {
    return this.GenDirectLine(lat1, lon1, azi1, true, a12, caps);
  };

  /**
   * @summary Define a {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} in terms of the direct geodesic problem specified in terms
   *   of either distance or arc length.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   *   degrees.
   * @param {bool} arcmode boolean flag determining the meaning of the
   *   s12_a12.
   * @param {number} s12_a12 if arcmode is false, this is the distance between
   *   point 1 and point 2 (meters); otherwise it is the arc length between
   *   point 1 and point 2 (degrees); it can be negative.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include.
   * @returns {object} the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object
   * @description This function sets point 3 of the GeodesicLine to correspond
   *   to point 2 of the direct geodesic problem.  For details on the caps
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  g.Geodesic.prototype.GenDirectLine = function(lat1, lon1, azi1,
                                                arcmode, s12_a12, caps) {
    var t;
    if (!caps) caps = g.STANDARD | g.DISTANCE_IN;
    // Automatically supply DISTANCE_IN if necessary
    if (!arcmode) caps |= g.DISTANCE_IN;
    t = new l.GeodesicLine(this, lat1, lon1, azi1, caps);
    t.GenSetDistance(arcmode, s12_a12);
    return t;
  };

  /**
   * @summary Define a {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} in terms of the inverse geodesic problem.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} lat2 the latitude of the second point in degrees.
   * @param {number} lon2 the longitude of the second point in degrees.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include.
   * @returns {object} the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine
   *   GeodesicLine} object
   * @description This function sets point 3 of the GeodesicLine to correspond
   *   to point 2 of the inverse geodesic problem.  For details on the caps
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  g.Geodesic.prototype.InverseLine = function(lat1, lon1, lat2, lon2, caps) {
    var r, t, azi1;
    if (!caps) caps = g.STANDARD | g.DISTANCE_IN;
    r = this.InverseInt(lat1, lon1, lat2, lon2, g.ARC);
    azi1 = m.atan2d(r.salp1, r.calp1);
    // Ensure that a12 can be converted to a distance
    if (caps & (g.OUT_MASK & g.DISTANCE_IN)) caps |= g.DISTANCE;
    t = new l.GeodesicLine(this, lat1, lon1, azi1, caps, r.salp1, r.calp1);
    t.SetArc(r.vals.a12);
    return t;
  };

  /**
   * @summary Create a {@link module:GeographicLib/PolygonArea.PolygonArea
   *   PolygonArea} object.
   * @param {bool} [polyline = false] if true the new PolygonArea object
   *   describes a polyline instead of a polygon.
   * @returns {object} the
   *   {@link module:GeographicLib/PolygonArea.PolygonArea
   *   PolygonArea} object
   */
  g.Geodesic.prototype.Polygon = function(polyline) {
    return new p.PolygonArea(this, polyline);
  };

  /**
   * @summary a {@link module:GeographicLib/Geodesic.Geodesic Geodesic} object
   *   initialized for the WGS84 ellipsoid.
   * @constant {object}
   */
  g.WGS84 = new g.Geodesic(c.WGS84.a, c.WGS84.f);
})(GeographicLib.Geodesic, GeographicLib.GeodesicLine,
   GeographicLib.PolygonArea, GeographicLib.Math, GeographicLib.Constants);


/*
 * GeodesicLine.js
 * Transcription of GeodesicLine.[ch]pp into JavaScript.
 *
 * See the documentation for the C++ class.  The conversion is a literal
 * conversion from C++.
 *
 * The algorithms are derived in
 *
 *    Charles F. F. Karney,
 *    Algorithms for geodesics, J. Geodesy 87, 43-55 (2013);
 *    https://doi.org/10.1007/s00190-012-0578-z
 *    Addenda: https://geographiclib.sourceforge.io/geod-addenda.html
 *
 * Copyright (c) Charles Karney (2011-2016) <charles@karney.com> and licensed
 * under the MIT/X11 License.  For more information, see
 * https://geographiclib.sourceforge.io/
 */

// Load AFTER GeographicLib/Math.js, GeographicLib/Geodesic.js

(function(
  g,
  /**
   * @exports GeographicLib/GeodesicLine
   * @description Solve geodesic problems on a single geodesic line via the
   *   {@link module:GeographicLib/GeodesicLine.GeodesicLine GeodesicLine}
   *   class.
   */
  l, m) {

  /**
   * @class
   * @property {number} a the equatorial radius (meters).
   * @property {number} f the flattening.
   * @property {number} lat1 the initial latitude (degrees).
   * @property {number} lon1 the initial longitude (degrees).
   * @property {number} azi1 the initial azimuth (degrees).
   * @property {number} salp1 the sine of the azimuth at the first point.
   * @property {number} calp1 the cosine the azimuth at the first point.
   * @property {number} s13 the distance to point 3 (meters).
   * @property {number} a13 the arc length to point 3 (degrees).
   * @property {bitmask} caps the capabilities of the object.
   * @summary Initialize a GeodesicLine object.  For details on the caps
   *   parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   * @classdesc Performs geodesic calculations along a given geodesic line.
   *   This object is usually instantiated by
   *   {@link module:GeographicLib/Geodesic.Geodesic#Line Geodesic.Line}.
   *   The methods
   *   {@link module:GeographicLib/Geodesic.Geodesic#DirectLine
   *   Geodesic.DirectLine} and
   *   {@link module:GeographicLib/Geodesic.Geodesic#InverseLine
   *   Geodesic.InverseLine} set in addition the position of a reference point
   *   3.
   * @param {object} geod a {@link module:GeographicLib/Geodesic.Geodesic
   *   Geodesic} object.
   * @param {number} lat1 the latitude of the first point in degrees.
   * @param {number} lon1 the longitude of the first point in degrees.
   * @param {number} azi1 the azimuth at the first point in degrees.
   * @param {bitmask} [caps = STANDARD | DISTANCE_IN] which capabilities to
   *   include; LATITUDE | AZIMUTH are always included.
   */
  l.GeodesicLine = function(geod, lat1, lon1, azi1, caps, salp1, calp1) {
    var t, cbet1, sbet1, eps, s, c;
    if (!caps) caps = g.STANDARD | g.DISTANCE_IN;

    this.a = geod.a;
    this.f = geod.f;
    this._b = geod._b;
    this._c2 = geod._c2;
    this._f1 = geod._f1;
    this.caps = caps | g.LATITUDE | g.AZIMUTH | g.LONG_UNROLL;

    this.lat1 = m.LatFix(lat1);
    this.lon1 = lon1;
    if (typeof salp1 === 'undefined' || typeof calp1 === 'undefined') {
      this.azi1 = m.AngNormalize(azi1);
      t = m.sincosd(m.AngRound(this.azi1)); this.salp1 = t.s; this.calp1 = t.c;
    } else {
      this.azi1 = azi1; this.salp1 = salp1; this.calp1 = calp1;
    }
    t = m.sincosd(m.AngRound(this.lat1)); sbet1 = this._f1 * t.s; cbet1 = t.c;
    // norm(sbet1, cbet1);
    t = m.hypot(sbet1, cbet1); sbet1 /= t; cbet1 /= t;
    // Ensure cbet1 = +epsilon at poles
    cbet1 = Math.max(g.tiny_, cbet1);
    this._dn1 = Math.sqrt(1 + geod._ep2 * m.sq(sbet1));

    // Evaluate alp0 from sin(alp1) * cos(bet1) = sin(alp0),
    this._salp0 = this.salp1 * cbet1; // alp0 in [0, pi/2 - |bet1|]
    // Alt: calp0 = hypot(sbet1, calp1 * cbet1).  The following
    // is slightly better (consider the case salp1 = 0).
    this._calp0 = m.hypot(this.calp1, this.salp1 * sbet1);
    // Evaluate sig with tan(bet1) = tan(sig1) * cos(alp1).
    // sig = 0 is nearest northward crossing of equator.
    // With bet1 = 0, alp1 = pi/2, we have sig1 = 0 (equatorial line).
    // With bet1 =  pi/2, alp1 = -pi, sig1 =  pi/2
    // With bet1 = -pi/2, alp1 =  0 , sig1 = -pi/2
    // Evaluate omg1 with tan(omg1) = sin(alp0) * tan(sig1).
    // With alp0 in (0, pi/2], quadrants for sig and omg coincide.
    // No atan2(0,0) ambiguity at poles since cbet1 = +epsilon.
    // With alp0 = 0, omg1 = 0 for alp1 = 0, omg1 = pi for alp1 = pi.
    this._ssig1 = sbet1; this._somg1 = this._salp0 * sbet1;
    this._csig1 = this._comg1 =
      sbet1 !== 0 || this.calp1 !== 0 ? cbet1 * this.calp1 : 1;
    // norm(this._ssig1, this._csig1); // sig1 in (-pi, pi]
    t = m.hypot(this._ssig1, this._csig1);
    this._ssig1 /= t; this._csig1 /= t;
    // norm(this._somg1, this._comg1); -- don't need to normalize!

    this._k2 = m.sq(this._calp0) * geod._ep2;
    eps = this._k2 / (2 * (1 + Math.sqrt(1 + this._k2)) + this._k2);

    if (this.caps & g.CAP_C1) {
      this._A1m1 = g.A1m1f(eps);
      this._C1a = new Array(g.nC1_ + 1);
      g.C1f(eps, this._C1a);
      this._B11 = g.SinCosSeries(true, this._ssig1, this._csig1, this._C1a);
      s = Math.sin(this._B11); c = Math.cos(this._B11);
      // tau1 = sig1 + B11
      this._stau1 = this._ssig1 * c + this._csig1 * s;
      this._ctau1 = this._csig1 * c - this._ssig1 * s;
      // Not necessary because C1pa reverts C1a
      //    _B11 = -SinCosSeries(true, _stau1, _ctau1, _C1pa);
    }

    if (this.caps & g.CAP_C1p) {
      this._C1pa = new Array(g.nC1p_ + 1);
      g.C1pf(eps, this._C1pa);
    }

    if (this.caps & g.CAP_C2) {
      this._A2m1 = g.A2m1f(eps);
      this._C2a = new Array(g.nC2_ + 1);
      g.C2f(eps, this._C2a);
      this._B21 = g.SinCosSeries(true, this._ssig1, this._csig1, this._C2a);
    }

    if (this.caps & g.CAP_C3) {
      this._C3a = new Array(g.nC3_);
      geod.C3f(eps, this._C3a);
      this._A3c = -this.f * this._salp0 * geod.A3f(eps);
      this._B31 = g.SinCosSeries(true, this._ssig1, this._csig1, this._C3a);
    }

    if (this.caps & g.CAP_C4) {
      this._C4a = new Array(g.nC4_); // all the elements of _C4a are used
      geod.C4f(eps, this._C4a);
      // Multiplier = a^2 * e^2 * cos(alpha0) * sin(alpha0)
      this._A4 = m.sq(this.a) * this._calp0 * this._salp0 * geod._e2;
      this._B41 = g.SinCosSeries(false, this._ssig1, this._csig1, this._C4a);
    }

    this.a13 = this.s13 = Number.NaN;
  };

  /**
   * @summary Find the position on the line (general case).
   * @param {bool} arcmode is the next parameter an arc length?
   * @param {number} s12_a12 the (arcmode ? arc length : distance) from the
   *   first point to the second in (arcmode ? degrees : meters).
   * @param {bitmask} [outmask = STANDARD] which results to include; this is
   *   subject to the capabilities of the object.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, and a12 fields of the result are
   *   always set; s12 is included if arcmode is false.  For details on the
   *   outmask parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  l.GeodesicLine.prototype.GenPosition = function(arcmode, s12_a12,
                                                  outmask) {
    var vals = {},
        sig12, ssig12, csig12, B12, AB1, ssig2, csig2, tau12, s, c, serr,
        omg12, lam12, lon12, E, sbet2, cbet2, somg2, comg2, salp2, calp2, dn2,
        B22, AB2, J12, t, B42, salp12, calp12;
    if (!outmask) outmask = g.STANDARD;
    else if (outmask === g.LONG_UNROLL) outmask |= g.STANDARD;
    outmask &= this.caps & g.OUT_MASK;
    vals.lat1 = this.lat1; vals.azi1 = this.azi1;
    vals.lon1 = outmask & g.LONG_UNROLL ?
      this.lon1 : m.AngNormalize(this.lon1);
    if (arcmode)
      vals.a12 = s12_a12;
    else
      vals.s12 = s12_a12;
    if (!( arcmode || (this.caps & g.DISTANCE_IN & g.OUT_MASK) )) {
      // Uninitialized or impossible distance calculation requested
      vals.a12 = Number.NaN;
      return vals;
    }

    // Avoid warning about uninitialized B12.
    B12 = 0; AB1 = 0;
    if (arcmode) {
      // Interpret s12_a12 as spherical arc length
      sig12 = s12_a12 * m.degree;
      t = m.sincosd(s12_a12); ssig12 = t.s; csig12 = t.c;
    } else {
      // Interpret s12_a12 as distance
      tau12 = s12_a12 / (this._b * (1 + this._A1m1));
      s = Math.sin(tau12);
      c = Math.cos(tau12);
      // tau2 = tau1 + tau12
      B12 = -g.SinCosSeries(true,
                            this._stau1 * c + this._ctau1 * s,
                            this._ctau1 * c - this._stau1 * s,
                            this._C1pa);
      sig12 = tau12 - (B12 - this._B11);
      ssig12 = Math.sin(sig12); csig12 = Math.cos(sig12);
      if (Math.abs(this.f) > 0.01) {
        // Reverted distance series is inaccurate for |f| > 1/100, so correct
        // sig12 with 1 Newton iteration.  The following table shows the
        // approximate maximum error for a = WGS_a() and various f relative to
        // GeodesicExact.
        //     erri = the error in the inverse solution (nm)
        //     errd = the error in the direct solution (series only) (nm)
        //     errda = the error in the direct solution (series + 1 Newton) (nm)
        //
        //       f     erri  errd errda
        //     -1/5    12e6 1.2e9  69e6
        //     -1/10  123e3  12e6 765e3
        //     -1/20   1110 108e3  7155
        //     -1/50  18.63 200.9 27.12
        //     -1/100 18.63 23.78 23.37
        //     -1/150 18.63 21.05 20.26
        //      1/150 22.35 24.73 25.83
        //      1/100 22.35 25.03 25.31
        //      1/50  29.80 231.9 30.44
        //      1/20   5376 146e3  10e3
        //      1/10  829e3  22e6 1.5e6
        //      1/5   157e6 3.8e9 280e6
        ssig2 = this._ssig1 * csig12 + this._csig1 * ssig12;
        csig2 = this._csig1 * csig12 - this._ssig1 * ssig12;
        B12 = g.SinCosSeries(true, ssig2, csig2, this._C1a);
        serr = (1 + this._A1m1) * (sig12 + (B12 - this._B11)) -
          s12_a12 / this._b;
        sig12 = sig12 - serr / Math.sqrt(1 + this._k2 * m.sq(ssig2));
        ssig12 = Math.sin(sig12); csig12 = Math.cos(sig12);
        // Update B12 below
      }
    }

    // sig2 = sig1 + sig12
    ssig2 = this._ssig1 * csig12 + this._csig1 * ssig12;
    csig2 = this._csig1 * csig12 - this._ssig1 * ssig12;
    dn2 = Math.sqrt(1 + this._k2 * m.sq(ssig2));
    if (outmask & (g.DISTANCE | g.REDUCEDLENGTH | g.GEODESICSCALE)) {
      if (arcmode || Math.abs(this.f) > 0.01)
        B12 = g.SinCosSeries(true, ssig2, csig2, this._C1a);
      AB1 = (1 + this._A1m1) * (B12 - this._B11);
    }
    // sin(bet2) = cos(alp0) * sin(sig2)
    sbet2 = this._calp0 * ssig2;
    // Alt: cbet2 = hypot(csig2, salp0 * ssig2);
    cbet2 = m.hypot(this._salp0, this._calp0 * csig2);
    if (cbet2 === 0)
      // I.e., salp0 = 0, csig2 = 0.  Break the degeneracy in this case
      cbet2 = csig2 = g.tiny_;
    // tan(alp0) = cos(sig2)*tan(alp2)
    salp2 = this._salp0; calp2 = this._calp0 * csig2; // No need to normalize

    if (arcmode && (outmask & g.DISTANCE))
      vals.s12 = this._b * ((1 + this._A1m1) * sig12 + AB1);

    if (outmask & g.LONGITUDE) {
      // tan(omg2) = sin(alp0) * tan(sig2)
      somg2 = this._salp0 * ssig2; comg2 = csig2; // No need to normalize
      E = m.copysign(1, this._salp0);
      // omg12 = omg2 - omg1
      omg12 = outmask & g.LONG_UNROLL ?
        E * (sig12 -
             (Math.atan2(ssig2, csig2) -
              Math.atan2(this._ssig1, this._csig1)) +
             (Math.atan2(E * somg2, comg2) -
              Math.atan2(E * this._somg1, this._comg1))) :
        Math.atan2(somg2 * this._comg1 - comg2 * this._somg1,
                     comg2 * this._comg1 + somg2 * this._somg1);
      lam12 = omg12 + this._A3c *
        ( sig12 + (g.SinCosSeries(true, ssig2, csig2, this._C3a) -
                   this._B31));
      lon12 = lam12 / m.degree;
      vals.lon2 = outmask & g.LONG_UNROLL ? this.lon1 + lon12 :
        m.AngNormalize(m.AngNormalize(this.lon1) + m.AngNormalize(lon12));
    }

    if (outmask & g.LATITUDE)
      vals.lat2 = m.atan2d(sbet2, this._f1 * cbet2);

    if (outmask & g.AZIMUTH)
      vals.azi2 = m.atan2d(salp2, calp2);

    if (outmask & (g.REDUCEDLENGTH | g.GEODESICSCALE)) {
      B22 = g.SinCosSeries(true, ssig2, csig2, this._C2a);
      AB2 = (1 + this._A2m1) * (B22 - this._B21);
      J12 = (this._A1m1 - this._A2m1) * sig12 + (AB1 - AB2);
      if (outmask & g.REDUCEDLENGTH)
        // Add parens around (_csig1 * ssig2) and (_ssig1 * csig2) to ensure
        // accurate cancellation in the case of coincident points.
        vals.m12 = this._b * ((      dn2 * (this._csig1 * ssig2) -
                               this._dn1 * (this._ssig1 * csig2)) -
                              this._csig1 * csig2 * J12);
      if (outmask & g.GEODESICSCALE) {
        t = this._k2 * (ssig2 - this._ssig1) * (ssig2 + this._ssig1) /
          (this._dn1 + dn2);
        vals.M12 = csig12 + (t * ssig2 - csig2 * J12) * this._ssig1 / this._dn1;
        vals.M21 = csig12 - (t * this._ssig1 - this._csig1 * J12) * ssig2 / dn2;
      }
    }

    if (outmask & g.AREA) {
      B42 = g.SinCosSeries(false, ssig2, csig2, this._C4a);
      if (this._calp0 === 0 || this._salp0 === 0) {
        // alp12 = alp2 - alp1, used in atan2 so no need to normalize
        salp12 = salp2 * this.calp1 - calp2 * this.salp1;
        calp12 = calp2 * this.calp1 + salp2 * this.salp1;
      } else {
        // tan(alp) = tan(alp0) * sec(sig)
        // tan(alp2-alp1) = (tan(alp2) -tan(alp1)) / (tan(alp2)*tan(alp1)+1)
        // = calp0 * salp0 * (csig1-csig2) / (salp0^2 + calp0^2 * csig1*csig2)
        // If csig12 > 0, write
        //   csig1 - csig2 = ssig12 * (csig1 * ssig12 / (1 + csig12) + ssig1)
        // else
        //   csig1 - csig2 = csig1 * (1 - csig12) + ssig12 * ssig1
        // No need to normalize
        salp12 = this._calp0 * this._salp0 *
          (csig12 <= 0 ? this._csig1 * (1 - csig12) + ssig12 * this._ssig1 :
           ssig12 * (this._csig1 * ssig12 / (1 + csig12) + this._ssig1));
        calp12 = m.sq(this._salp0) + m.sq(this._calp0) * this._csig1 * csig2;
      }
      vals.S12 = this._c2 * Math.atan2(salp12, calp12) +
        this._A4 * (B42 - this._B41);
    }

    if (!arcmode)
      vals.a12 = sig12 / m.degree;
    return vals;
  };

  /**
   * @summary Find the position on the line given s12.
   * @param {number} s12 the distance from the first point to the second in
   *   meters.
   * @param {bitmask} [outmask = STANDARD] which results to include; this is
   *   subject to the capabilities of the object.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, s12, and a12 fields of the result are
   *   always set; s12 is included if arcmode is false.  For details on the
   *   outmask parameter, see {@tutorial 2-interface}, "The outmask and caps
   *   parameters".
   */
  l.GeodesicLine.prototype.Position = function(s12, outmask) {
    return this.GenPosition(false, s12, outmask);
  };

  /**
   * @summary Find the position on the line given a12.
   * @param {number} a12 the arc length from the first point to the second in
   *   degrees.
   * @param {bitmask} [outmask = STANDARD] which results to include; this is
   *   subject to the capabilities of the object.
   * @returns {object} the requested results.
   * @description The lat1, lon1, azi1, and a12 fields of the result are
   *   always set.  For details on the outmask parameter, see {@tutorial
   *   2-interface}, "The outmask and caps parameters".
   */
  l.GeodesicLine.prototype.ArcPosition = function(a12, outmask) {
    return this.GenPosition(true, a12, outmask);
  };

  /**
   * @summary Specify position of point 3 in terms of either distance or arc
   *   length.
   * @param {bool} arcmode boolean flag determining the meaning of the second
   *   parameter; if arcmode is false, then the GeodesicLine object must have
   *   been constructed with caps |= DISTANCE_IN.
   * @param {number} s13_a13 if arcmode is false, this is the distance from
   *   point 1 to point 3 (meters); otherwise it is the arc length from
   *   point 1 to point 3 (degrees); it can be negative.
   **********************************************************************/
  l.GeodesicLine.prototype.GenSetDistance = function(arcmode, s13_a13) {
    if (arcmode)
      this.SetArc(s13_a13);
    else
      this.SetDistance(s13_a13);
  };

  /**
   * @summary Specify position of point 3 in terms distance.
   * @param {number} s13 the distance from point 1 to point 3 (meters); it
   *   can be negative.
   **********************************************************************/
  l.GeodesicLine.prototype.SetDistance = function(s13) {
    var r;
    this.s13 = s13;
    r = this.GenPosition(false, this.s13, g.ARC);
    this.a13 = 0 + r.a12;       // the 0+ converts undefined into NaN
  };

  /**
   * @summary Specify position of point 3 in terms of arc length.
   * @param {number} a13 the arc length from point 1 to point 3 (degrees);
   *   it can be negative.
   **********************************************************************/
  l.GeodesicLine.prototype.SetArc = function(a13) {
    var r;
    this.a13 = a13;
    r = this.GenPosition(true, this.a13, g.DISTANCE);
    this.s13 = 0 + r.s12;       // the 0+ converts undefined into NaN
  };

})(GeographicLib.Geodesic, GeographicLib.GeodesicLine, GeographicLib.Math);


/*
 * PolygonArea.js
 * Transcription of PolygonArea.[ch]pp into JavaScript.
 *
 * See the documentation for the C++ class.  The conversion is a literal
 * conversion from C++.
 *
 * The algorithms are derived in
 *
 *    Charles F. F. Karney,
 *    Algorithms for geodesics, J. Geodesy 87, 43-55 (2013);
 *    https://doi.org/10.1007/s00190-012-0578-z
 *    Addenda: https://geographiclib.sourceforge.io/geod-addenda.html
 *
 * Copyright (c) Charles Karney (2011-2017) <charles@karney.com> and licensed
 * under the MIT/X11 License.  For more information, see
 * https://geographiclib.sourceforge.io/
 */

// Load AFTER GeographicLib/Math.js and GeographicLib/Geodesic.js

(function(
  /**
   * @exports GeographicLib/PolygonArea
   * @description Compute the area of geodesic polygons via the
   *   {@link module:GeographicLib/PolygonArea.PolygonArea PolygonArea}
   *   class.
   */
  p, g, m, a) {

  var transit, transitdirect;
  transit = function(lon1, lon2) {
    // Return 1 or -1 if crossing prime meridian in east or west direction.
    // Otherwise return zero.
    var lon12, cross;
    // Compute lon12 the same way as Geodesic::Inverse.
    lon1 = m.AngNormalize(lon1);
    lon2 = m.AngNormalize(lon2);
    lon12 = m.AngDiff(lon1, lon2).s;
    cross = lon1 <= 0 && lon2 > 0 && lon12 > 0 ? 1 :
      (lon2 <= 0 && lon1 > 0 && lon12 < 0 ? -1 : 0);
    return cross;
  };

  // an alternate version of transit to deal with longitudes in the direct
  // problem.
  transitdirect = function(lon1, lon2) {
    // We want to compute exactly
    //   int(floor(lon2 / 360)) - int(floor(lon1 / 360))
    // Since we only need the parity of the result we can use std::remquo but
    // this is buggy with g++ 4.8.3 and requires C++11.  So instead we do
    lon1 = lon1 % 720.0; lon2 = lon2 % 720.0;
    return ( ((lon2 >= 0 && lon2 < 360) || lon2 < -360 ? 0 : 1) -
             ((lon1 >= 0 && lon1 < 360) || lon1 < -360 ? 0 : 1) );
  };

  /**
   * @class
   * @property {number} a the equatorial radius (meters).
   * @property {number} f the flattening.
   * @property {bool} polyline whether the PolygonArea object describes a
   *   polyline or a polygon.
   * @property {number} num the number of vertices so far.
   * @property {number} lat the current latitude (degrees).
   * @property {number} lon the current longitude (degrees).
   * @summary Initialize a PolygonArea object.
   * @classdesc Computes the area and perimeter of a geodesic polygon.
   *   This object is usually instantiated by
   *   {@link module:GeographicLib/Geodesic.Geodesic#Polygon Geodesic.Polygon}.
   * @param {object} geod a {@link module:GeographicLib/Geodesic.Geodesic
   *   Geodesic} object.
   * @param {bool} [polyline = false] if true the new PolygonArea object
   *   describes a polyline instead of a polygon.
   */
  p.PolygonArea = function(geod, polyline) {
    this._geod = geod;
    this.a = this._geod.a;
    this.f = this._geod.f;
    this._area0 = 4 * Math.PI * geod._c2;
    this.polyline = !polyline ? false : polyline;
    this._mask = g.LATITUDE | g.LONGITUDE | g.DISTANCE |
          (this.polyline ? g.NONE : g.AREA | g.LONG_UNROLL);
    if (!this.polyline)
      this._areasum = new a.Accumulator(0);
    this._perimetersum = new a.Accumulator(0);
    this.Clear();
  };

  /**
   * @summary Clear the PolygonArea object, setting the number of vertices to
   *   0.
   */
  p.PolygonArea.prototype.Clear = function() {
    this.num = 0;
    this._crossings = 0;
    if (!this.polyline)
      this._areasum.Set(0);
    this._perimetersum.Set(0);
    this._lat0 = this._lon0 = this.lat = this.lon = Number.NaN;
  };

  /**
   * @summary Add the next vertex to the polygon.
   * @param {number} lat the latitude of the point (degrees).
   * @param {number} lon the longitude of the point (degrees).
   * @description This adds an edge from the current vertex to the new vertex.
   */
  p.PolygonArea.prototype.AddPoint = function(lat, lon) {
    var t;
    if (this.num === 0) {
      this._lat0 = this.lat = lat;
      this._lon0 = this.lon = lon;
    } else {
      t = this._geod.Inverse(this.lat, this.lon, lat, lon, this._mask);
      this._perimetersum.Add(t.s12);
      if (!this.polyline) {
        this._areasum.Add(t.S12);
        this._crossings += transit(this.lon, lon);
      }
      this.lat = lat;
      this.lon = lon;
    }
    ++this.num;
  };

  /**
   * @summary Add the next edge to the polygon.
   * @param {number} azi the azimuth at the current the point (degrees).
   * @param {number} s the length of the edge (meters).
   * @description This specifies the new vertex in terms of the edge from the
   *   current vertex.
   */
  p.PolygonArea.prototype.AddEdge = function(azi, s) {
    var t;
    if (this.num) {
      t = this._geod.Direct(this.lat, this.lon, azi, s, this._mask);
      this._perimetersum.Add(s);
      if (!this.polyline) {
        this._areasum.Add(t.S12);
        this._crossings += transitdirect(this.lon, t.lon2);
      }
      this.lat = t.lat2;
      this.lon = t.lon2;
    }
    ++this.num;
  };

  /**
   * @summary Compute the perimeter and area of the polygon.
   * @param {bool} reverse if true then clockwise (instead of
   *   counter-clockwise) traversal counts as a positive area.
   * @param {bool} sign if true then return a signed result for the area if the
   *   polygon is traversed in the "wrong" direction instead of returning the
   *   area for the rest of the earth.
   * @returns {object} r where r.number is the number of vertices, r.perimeter
   *   is the perimeter (meters), and r.area (only returned if polyline is
   *   false) is the area (meters<sup>2</sup>).
   * @description If the object is a polygon (and not a polygon), the perimeter
   *   includes the length of a final edge connecting the current point to the
   *   initial point.  If the object is a polyline, then area is nan.  More
   *   points can be added to the polygon after this call.
   */
  p.PolygonArea.prototype.Compute = function(reverse, sign) {
    var vals = {number: this.num}, t, tempsum, crossings;
    if (this.num < 2) {
      vals.perimeter = 0;
      if (!this.polyline)
        vals.area = 0;
      return vals;
    }
    if (this.polyline) {
      vals.perimeter = this._perimetersum.Sum();
      return vals;
    }
    t = this._geod.Inverse(this.lat, this.lon, this._lat0, this._lon0,
                           this._mask);
    vals.perimeter = this._perimetersum.Sum(t.s12);
    tempsum = new a.Accumulator(this._areasum);
    tempsum.Add(t.S12);
    crossings = this._crossings + transit(this.lon, this._lon0);
    if (crossings & 1)
      tempsum.Add( (tempsum.Sum() < 0 ? 1 : -1) * this._area0/2 );
    // area is with the clockwise sense.  If !reverse convert to
    // counter-clockwise convention.
    if (!reverse)
      tempsum.Negate();
    // If sign put area in (-area0/2, area0/2], else put area in [0, area0)
    if (sign) {
      if (tempsum.Sum() > this._area0/2)
        tempsum.Add( -this._area0 );
      else if (tempsum.Sum() <= -this._area0/2)
        tempsum.Add( +this._area0 );
    } else {
      if (tempsum.Sum() >= this._area0)
        tempsum.Add( -this._area0 );
      else if (tempsum < 0)
        tempsum.Add( -this._area0 );
    }
    vals.area = tempsum.Sum();
    return vals;
  };

  /**
   * @summary Compute the perimeter and area of the polygon with a tentative
   *   new vertex.
   * @param {number} lat the latitude of the point (degrees).
   * @param {number} lon the longitude of the point (degrees).
   * @param {bool} reverse if true then clockwise (instead of
   *   counter-clockwise) traversal counts as a positive area.
   * @param {bool} sign if true then return a signed result for the area if the
   *   polygon is traversed in the "wrong" direction instead of returning the
   * @returns {object} r where r.number is the number of vertices, r.perimeter
   *   is the perimeter (meters), and r.area (only returned if polyline is
   *   false) is the area (meters<sup>2</sup>).
   * @description A new vertex is *not* added to the polygon.
   */
  p.PolygonArea.prototype.TestPoint = function(lat, lon, reverse, sign) {
    var vals = {number: this.num + 1}, t, tempsum, crossings, i;
    if (this.num === 0) {
      vals.perimeter = 0;
      if (!this.polyline)
        vals.area = 0;
      return vals;
    }
    vals.perimeter = this._perimetersum.Sum();
    tempsum = this.polyline ? 0 : this._areasum.Sum();
    crossings = this._crossings;
    for (i = 0; i < (this.polyline ? 1 : 2); ++i) {
      t = this._geod.Inverse(
       i === 0 ? this.lat : lat, i === 0 ? this.lon : lon,
       i !== 0 ? this._lat0 : lat, i !== 0 ? this._lon0 : lon,
       this._mask);
      vals.perimeter += t.s12;
      if (!this.polyline) {
        tempsum += t.S12;
        crossings += transit(i === 0 ? this.lon : lon,
                               i !== 0 ? this._lon0 : lon);
      }
    }

    if (this.polyline)
      return vals;

    if (crossings & 1)
      tempsum += (tempsum < 0 ? 1 : -1) * this._area0/2;
    // area is with the clockwise sense.  If !reverse convert to
    // counter-clockwise convention.
    if (!reverse)
      tempsum *= -1;
    // If sign put area in (-area0/2, area0/2], else put area in [0, area0)
    if (sign) {
      if (tempsum > this._area0/2)
        tempsum -= this._area0;
      else if (tempsum <= -this._area0/2)
        tempsum += this._area0;
    } else {
      if (tempsum >= this._area0)
        tempsum -= this._area0;
      else if (tempsum < 0)
        tempsum += this._area0;
    }
    vals.area = tempsum;
    return vals;
  };

  /**
   * @summary Compute the perimeter and area of the polygon with a tentative
   *   new edge.
   * @param {number} azi the azimuth of the edge (degrees).
   * @param {number} s the length of the edge (meters).
   * @param {bool} reverse if true then clockwise (instead of
   *   counter-clockwise) traversal counts as a positive area.
   * @param {bool} sign if true then return a signed result for the area if the
   *   polygon is traversed in the "wrong" direction instead of returning the
   * @returns {object} r where r.number is the number of vertices, r.perimeter
   *   is the perimeter (meters), and r.area (only returned if polyline is
   *   false) is the area (meters<sup>2</sup>).
   * @description A new vertex is *not* added to the polygon.
   */
  p.PolygonArea.prototype.TestEdge = function(azi, s, reverse, sign) {
    var vals = {number: this.num ? this.num + 1 : 0}, t, tempsum, crossings;
    if (this.num === 0)
      return vals;
    vals.perimeter = this._perimetersum.Sum() + s;
    if (this.polyline)
      return vals;

    tempsum = this._areasum.Sum();
    crossings = this._crossings;
    t = this._geod.Direct(this.lat, this.lon, azi, s, this._mask);
    tempsum += t.S12;
    crossings += transitdirect(this.lon, t.lon2);
    t = this._geod.Inverse(t.lat2, t.lon2, this._lat0, this._lon0, this._mask);
    vals.perimeter += t.s12;
    tempsum += t.S12;
    crossings += transit(t.lon2, this._lon0);

    if (crossings & 1)
      tempsum += (tempsum < 0 ? 1 : -1) * this._area0/2;
    // area is with the clockwise sense.  If !reverse convert to
    // counter-clockwise convention.
    if (!reverse)
      tempsum *= -1;
    // If sign put area in (-area0/2, area0/2], else put area in [0, area0)
    if (sign) {
      if (tempsum > this._area0/2)
        tempsum -= this._area0;
      else if (tempsum <= -this._area0/2)
        tempsum += this._area0;
    } else {
      if (tempsum >= this._area0)
        tempsum -= this._area0;
      else if (tempsum < 0)
        tempsum += this._area0;
    }
    vals.area = tempsum;
    return vals;
  };

})(GeographicLib.PolygonArea, GeographicLib.Geodesic,
   GeographicLib.Math, GeographicLib.Accumulator);


function pj_qsfn(sinphi, e, one_es) {
  var EPS = 1e-7;
  var con;
  if (e >= EPS) {
    con = e * sinphi;
    // Proj.4 check for div0 and returns HUGE_VAL
    // this returns +/- Infinity; effect should be same
    return (one_es * (sinphi / (1 - con * con) -
       (0.5 / e) * log ((1 - con) / (1 + con))));
  } else
    return (sinphi + sinphi);
}


function pj_msfn(sinphi, cosphi, es) {
  return (cosphi / sqrt (1 - es * sinphi * sinphi));
}


pj_add(pj_aea, 'aea', 'Albers Equal Area', 'Conic Sph&Ell\nlat_1= lat_2=');
pj_add(pj_leac, 'leac', 'Lambert Equal Area Conic', 'Conic, Sph&Ell\nlat_1= south');

function pj_aea(P) {
  var phi1 = pj_param(P.params, "rlat_1");
  var phi2 = pj_param(P.params, "rlat_2");
  pj_aea_init(P, phi1, phi2);
}

function pj_leac(P) {
  var phi1 = pj_param(P.params, "rlat_1");
  var phi2 = pj_param(P.params, "bsouth") ? -M_HALFPI : M_HALFPI;
  pj_aea_init(P, phi1, phi2);
}

function pj_aea_init(P, phi1, phi2) {
  var ec, n, c, dd, n2, rho0, rho, en, ellips,
      cosphi, sinphi, secant, ml2, m2, ml1, m1;

  P.fwd = e_fwd;
  P.inv = e_inv;

  if (fabs(phi1 + phi2) < EPS10) e_error(-21);
  n = sinphi = sin(phi1);
  cosphi = cos(phi1);
  secant = fabs(phi1 - phi2) >= EPS10;
  if ((ellips = (P.es > 0))) {
    en = pj_enfn(P.es);
    m1 = pj_msfn(sinphi, cosphi, P.es);
    ml1 = pj_qsfn(sinphi, P.e, P.one_es);
    if (secant) { /* secant cone */
      sinphi = sin(phi2);
      cosphi = cos(phi2);
      m2 = pj_msfn(sinphi, cosphi, P.es);
      ml2 = pj_qsfn(sinphi, P.e, P.one_es);
      // Ignoring Proj.4 div0 check (above checks should prevent this)
      n = (m1 * m1 - m2 * m2) / (ml2 - ml1);
    }
    ec = 1 - 0.5 * P.one_es * log((1 - P.e) / (1 + P.e)) / P.e;
    c = m1 * m1 + n * ml1;
    dd = 1 / n;
    rho0 = dd * sqrt(c - n * pj_qsfn(sin(P.phi0), P.e, P.one_es));
  } else {
    if (secant) n = 0.5 * (n + sin(phi2));
    n2 = n + n;
    c = cosphi * cosphi + n2 * sinphi;
    dd = 1 / n;
    rho0 = dd * sqrt(c - n2 * sin(P.phi0));
  }

  function e_fwd(lp, xy) {
    var lam = lp.lam;
    var rho;
    if ((rho = c - (ellips ? n * pj_qsfn(sin(lp.phi),
      P.e, P.one_es) : n2 * sin(lp.phi))) < 0) f_error();
    rho = dd * sqrt(rho);
    xy.x = rho * sin(lam *= n);
    xy.y = rho0 - rho * cos(lam);
  }

  function e_inv(xy, lp) {
    var TOL7 = 1e-7,
        x = xy.x,
        y = rho0 - xy.y,
        rho = hypot(x, y);
    if (rho != 0) {
      if (n < 0) {
        rho = -rho;
        x = -x;
        y = -y;
      }
      lp.phi = rho / dd;
      if (ellips) {
        lp.phi = (c - lp.phi * lp.phi) / n;
        if (fabs(ec - fabs(lp.phi)) > TOL7) {
          if ((lp.phi = phi1_(lp.phi, P.e, P.one_es)) == HUGE_VAL)
            i_error();
        } else
          lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
      } else if (fabs(lp.phi = (c - lp.phi * lp.phi) / n2) <= 1)
        lp.phi = asin(lp.phi);
      else
        lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
      lp.lam = atan2(x, y) / n;
    } else {
      lp.lam = 0;
      lp.phi = n > 0 ? M_HALFPI : -M_HALFPI;
    }
  }

  /* determine latitude angle phi-1 */
  function phi1_(qs, Te, Tone_es) {
    var N_ITER = 15,
        EPSILON = 1e-7,
        TOL = 1e-10;
    var Phi, sinpi, cospi, con, com, dphi, i;
    Phi = asin (0.5 * qs);
    if (Te < EPSILON)
      return Phi;
    i = N_ITER;
    do {
      sinpi = sin(Phi);
      cospi = cos(Phi);
      con = Te * sinpi;
      com = 1 - con * con;
      dphi = 0.5 * com * com / cospi * (qs / Tone_es -
         sinpi / com + 0.5 / Te * log ((1 - con) / (1 + con)));
      Phi += dphi;
    } while (fabs(dphi) > TOL && --i);
    return i ? Phi : HUGE_VAL;
  }
}



function pj_enfn(es) {
  var C00 = 1,
      C02 = 0.25,
      C04 = 0.046875,
      C06 = 0.01953125,
      C08 = 0.01068115234375,
      C22 = 0.75,
      C44 = 0.46875,
      C46 = 0.01302083333333333333,
      C48 = 0.00712076822916666666,
      C66 = 0.36458333333333333333,
      C68 = 0.00569661458333333333,
      C88 = 0.3076171875;
  var en = [], t;
  en[0] = C00 - es * (C02 + es * (C04 + es * (C06 + es * C08)));
  en[1] = es * (C22 - es * (C04 + es * (C06 + es * C08)));
  en[2] = (t = es * es) * (C44 - es * (C46 + es * C48));
  en[3] = (t *= es) * (C66 - es * C68);
  en[4] = t * es * C88;
  return en;
}

function pj_mlfn(phi, sphi, cphi, en) {
  cphi *= sphi;
  sphi *= sphi;
  return (en[0] * phi - cphi * (en[1] + sphi*(en[2] + sphi*(en[3] + sphi*en[4]))));
}

function pj_inv_mlfn(arg, es, en) {
  var EPS = 1e-11,
      MAX_ITER = 10,
      EN_SIZE = 5;

  var k = 1 / (1 - es),
      s, t, phi;

  phi = arg;
  for (var i = MAX_ITER; i>0; --i) { /* rarely goes over 2 iterations */
    s = sin(phi);
    t = 1 - es * s * s;
    phi -= t = (pj_mlfn(phi, s, cos(phi), en) - arg) * (t * sqrt(t)) * k;
    if (fabs(t) < EPS) {
      return phi;
    }
  }
  pj_ctx_set_errno( ctx, -17 );
  return phi;
}



function aasin(v) {
  var ONE_TOL = 1.00000000000001;
  var av = fabs(v);
  if (av >= 1) {
    if (av > ONE_TOL) pj_ctx_set_errno(-19);
    return v < 0 ? -M_HALFPI : M_HALFPI;
  }
  return asin(v);
}

function aacos(v) {
  var ONE_TOL = 1.00000000000001;
  var av = fabs(v);
  if (av >= 1) {
    if (av > ONE_TOL) pj_ctx_set_errno(-19);
    return (v < 0 ? M_PI : 0);
  }
  return acos(v);
}

function asqrt(v) { return ((v <= 0) ? 0 : sqrt(v)); }

function aatan2(n, d) {
  var ATOL = 1e-50;
  return ((fabs(n) < ATOL && fabs(d) < ATOL) ? 0 : atan2(n,d));
}


pj_add(pj_aeqd, 'aeqd', 'Azimuthal Equidistant', 'Azi, Sph&Ell\nlat_0 guam');

function pj_aeqd(P) {
  var EPS10 = 1.e-10,
      TOL = 1.e-14,
      N_POLE = 0,
      S_POLE = 1,
      EQUIT = 2,
      OBLIQ = 3;

  var sinph0, cosph0, M1, N1, Mp, He, G, mode, en, g;
  P.phi0 = pj_param(P.params, "rlat_0");
  if (fabs(fabs(P.phi0) - M_HALFPI) < EPS10) {
    mode = P.phi0 < 0 ? S_POLE : N_POLE;
    sinph0 = P.phi0 < 0 ? -1 : 1;
    cosph0 = 0;
  } else if (fabs(P.phi0) < EPS10) {
    mode = EQUIT;
    sinph0 = 0;
    cosph0 = 1;
  } else {
    mode = OBLIQ;
    sinph0 = sin(P.phi0);
    cosph0 = cos(P.phi0);
  }
  if (!P.es) {
    P.inv = s_inv;
    P.fwd = s_fwd;
  } else {
    g = new GeographicLib.Geodesic.Geodesic(P.a, P.es / (1 + sqrt(P.one_es)));
    en = pj_enfn(P.es);
    if (pj_param(P.params, "bguam")) {
      M1 = pj_mlfn(P.phi0, sinph0, cosph0, en);
      P.inv = e_guam_inv;
      P.fwd = e_guam_fwd;
    } else {
      switch (mode) {
        case N_POLE:
          Mp = pj_mlfn(M_HALFPI, 1, 0, en);
          break;
        case S_POLE:
          Mp = pj_mlfn(-M_HALFPI, -1, 0, en);
          break;
        case EQUIT:
        case OBLIQ:
          P.inv = e_inv;
          P.fwd = e_fwd;
          N1 = 1 / sqrt(1 - P.es * sinph0 * sinph0);
          G = sinph0 * (He = P.e / sqrt(P.one_es));
          He *= cosph0;
          break;
      }
      P.inv = e_inv;
      P.fwd = e_fwd;
    }
  }

  function e_fwd(lp, xy) {
    var coslam, cosphi, sinphi, rho;
    var azi1, azi2, s12;
    var lam1, phi1, lam2, phi2;
    var vars;

    coslam = cos(lp.lam);
    cosphi = cos(lp.phi);
    sinphi = sin(lp.phi);
    switch (mode) {
      case N_POLE:
        coslam = - coslam;
        /* falls through */
      case S_POLE:
        xy.x = (rho = fabs(Mp - pj_mlfn(lp.phi, sinphi, cosphi, en))) *
            sin(lp.lam);
        xy.y = rho * coslam;
        break;
      case EQUIT:
      case OBLIQ:
        if (fabs(lp.lam) < EPS10 && fabs(lp.phi - P.phi0) < EPS10) {
            xy.x = xy.y = 0;
            break;
        }
        phi1 = P.phi0 / DEG_TO_RAD; lam1 = P.lam0 / DEG_TO_RAD;
        phi2 = lp.phi / DEG_TO_RAD;  lam2 = (lp.lam+P.lam0) / DEG_TO_RAD;
        vars = g.Inverse(phi1, lam1, phi2, lam2, g.AZIMUTH); // , &s12, &azi1, &azi2);
        azi1 = vars.azi1 * DEG_TO_RAD;
        s12 = vars.s12;
        xy.x = s12 * sin(azi1) / P.a;
        xy.y = s12 * cos(azi1) / P.a;
        break;
    }
  }

  function e_inv(xy, lp) {
    var c, azi1, azi2, s12, x2, y2, lat1, lon1, lat2, lon2;
    var vars;
    if ((c = hypot(xy.x, xy.y)) < EPS10) {
      lp.phi = P.phi0;
      lp.lam = 0;
      return (lp);
    }
    if (mode == OBLIQ || mode == EQUIT) {
      x2 = xy.x * P.a;
      y2 = xy.y * P.a;
      lat1 = P.phi0 / DEG_TO_RAD;
      lon1 = P.lam0 / DEG_TO_RAD;
      azi1 = atan2(x2, y2) / DEG_TO_RAD;
      s12 = sqrt(x2 * x2 + y2 * y2);
      vars = g.Direct(lat1, lon1, azi1, s12, g.STANDARD); // , &lat2, &lon2, &azi2);
      lp.phi = vars.lat2 * DEG_TO_RAD;
      lp.lam = vars.lon2 * DEG_TO_RAD;
      lp.lam -= P.lam0;
    } else { /* Polar */
      lp.phi = pj_inv_mlfn(mode == N_POLE ? Mp - c : Mp + c,
          P.es, en);
      lp.lam = atan2(xy.x, mode == N_POLE ? -xy.y : xy.y);
    }
  }

  function s_fwd(lp, xy) {
    var coslam, cosphi, sinphi;
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);
    switch (mode) {
      case EQUIT:
      case OBLIQ:
        if (mode == EQUIT) {
          xy.y = cosphi * coslam;
        } else {
          xy.y = sinph0 * sinphi + cosph0 * cosphi * coslam;
        }
        if (fabs(fabs(xy.y) - 1) < TOL)
            if (xy.y < 0) f_error();
            else xy.x = xy.y = 0;
        else {
          xy.y = acos(xy.y);
          xy.y /= sin(xy.y);
          xy.x = xy.y * cosphi * sin(lp.lam);
          xy.y *= (mode == EQUIT) ? sinphi :
              cosph0 * sinphi - sinph0 * cosphi * coslam;
        }
        break;
      case N_POLE:
        lp.phi = -lp.phi;
        coslam = -coslam;
        /* falls through */
      case S_POLE:
        if (fabs(lp.phi - M_HALFPI) < EPS10) f_error();
        xy.x = (xy.y = (M_HALFPI + lp.phi)) * sin(lp.lam);
        xy.y *= coslam;
        break;
    }
  }

  function s_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var cosc, c_rh, sinc;
    if ((c_rh = hypot(x, y)) > M_PI) {
        if (c_rh - EPS10 > M_PI) i_error();
        c_rh = M_PI;
    } else if (c_rh < EPS10) {
      lp.phi = P.phi0;
      lp.lam = 0;
      return;
    }
    if (mode == OBLIQ || mode == EQUIT) {
      sinc = sin(c_rh);
      cosc = cos(c_rh);
      if (mode == EQUIT) {
        lp.phi = aasin(y * sinc / c_rh);
        x *= sinc;
        y = cosc * c_rh;
      } else {
        lp.phi = aasin(cosc * sinph0 + y * sinc * cosph0 / c_rh);
        y = (cosc - sinph0 * sin(lp.phi)) * c_rh;
        x *= sinc * cosph0;
      }
      lp.lam = y == 0 ? 0 : atan2(x, y);
    } else if (mode == N_POLE) {
      lp.phi = M_HALFPI - c_rh;
      lp.lam = atan2(x, -y);
    } else {
      lp.phi = c_rh - M_HALFPI;
      lp.lam = atan2(x, y);
    }
  }

  function e_guam_fwd(lp, xy) {
    var cosphi, sinphi, t;
    cosphi = cos(lp.phi);
    sinphi = sin(lp.phi);
    t = 1 / sqrt(1 - P.es * sinphi * sinphi);
    xy.x = lp.lam * cosphi * t;
    xy.y = pj_mlfn(lp.phi, sinphi, cosphi, en) - M1 +
        0.5 * lp.lam * lp.lam * cosphi * sinphi * t;
  }

  function e_guam_inv(xy, lp) {
    var x2, t, i;
    x2 = 0.5 * xy.x * xy.x;
    lp.phi = P.phi0;
    for (i = 0; i < 3; ++i) {
      t = P.e * sin(lp.phi);
      lp.phi = pj_inv_mlfn(M1 + xy.y -
        x2 * tan(lp.phi) * (t = sqrt(1 - t * t)), P.es, en);
    }
    lp.lam = xy.x * t / cos(lp.phi);
  }
}


pj_add(pj_airy, 'airy', 'Airy', 'Misc Sph, no inv.\nno_cut lat_b=');

function pj_airy(P) {
  var EPS = 1e-10,
      N_POLE = 0,
      S_POLE = 1,
      EQUIT = 2,
      OBLIQ = 3,
      p_halfphi, sinph0, cosph0, Cb, mode, no_cut, beta;

  P.es = 0;
  P.fwd = s_fwd;

  no_cut = pj_param(P.params, "bno_cut");
  beta = 0.5 * (M_HALFPI - pj_param(P.params, "rlat_b"));
  if (fabs(beta) < EPS)
    Cb = -0.5;
  else {
    Cb = 1/tan(beta);
    Cb *= Cb * log(cos(beta));
  }

  if (fabs(fabs(P.phi0) - M_HALFPI) < EPS)
    if (P.phi0 < 0) {
      p_halfpi = -M_HALFPI;
      mode = S_POLE;
    } else {
      p_halfpi =  M_HALFPI;
      mode = N_POLE;
    }
  else {
    if (fabs(P.phi0) < EPS)
      mode = EQUIT;
    else {
      mode = OBLIQ;
      sinph0 = sin(P.phi0);
      cosph0 = cos(P.phi0);
    }
  }

  function s_fwd(lp, xy) {
    var sinlam, coslam, cosphi, sinphi, t, s, Krho, cosz;
    sinlam = sin(lp.lam);
    coslam = cos(lp.lam);
    switch (mode) {
      case EQUIT:
      case OBLIQ:
        sinphi = sin(lp.phi);
        cosphi = cos(lp.phi);
        cosz = cosphi * coslam;
        if (mode == OBLIQ)
          cosz = sinph0 * sinphi + cosph0 * cosz;
        if (!no_cut && cosz < -EPS)
          f_error();
        if (fabs(s = 1 - cosz) > EPS) {
          t = 0.5 * (1 + cosz);
          Krho = -log(t)/s - Cb / t;
        } else {
          Krho = 0.5 - Cb;
        }
        xy.x = Krho * cosphi * sinlam;
        if (mode == OBLIQ)
          xy.y = Krho * (cosph0 * sinphi - sinph0 * cosphi * coslam);
        else
          xy.y = Krho * sinphi;
        break;
      case S_POLE:
      case N_POLE:
        lp.phi = fabs(p_halfpi - lp.phi);
        if (!no_cut && (lp.phi - EPS) > M_HALFPI)
          f_error();
        if ((lp.phi *= 0.5) > EPS) {
          t = tan(lp.phi);
          Krho = -2*(log(cos(lp.phi)) / t + t * Cb);
          xy.x = Krho * sinlam;
          xy.y = Krho * coslam;
          if (mode == N_POLE)
            xy.y = -xy.y;
        } else
          xy.x = xy.y = 0;
    }
  }
}


pj_add(pj_wintri, 'wintri', 'Winkel Tripel', 'Misc Sph\nlat_1');
pj_add(pj_aitoff, 'aitoff', 'Aitoff', 'Misc Sph');

function pj_wintri(P) {
  var Q = P.opaque = {mode: 1};
  if (pj_param(P.params, "tlat_1")) {
    if ((Q.cosphi1 = cos(pj_param(P.params, "rlat_1"))) === 0) {
      e_error(-22);
    }
  } else { /* 50d28' or acos(2/pi) */
    Q.cosphi1 = 0.636619772367581343;
  }
  pj_aitoff(P);
}

function pj_aitoff(P) {
  var Q = P.opaque || {mode: 0};

  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var c, d;
    if((d = acos(cos(lp.phi) * cos(c = 0.5 * lp.lam)))) {/* basic Aitoff */
      xy.x = 2 * d * cos(lp.phi) * sin(c) * (xy.y = 1 / sin(d));
      xy.y *= d * sin(lp.phi);
    } else
      xy.x = xy.y = 0;
    if (Q.mode) { /* Winkel Tripel */
      xy.x = (xy.x + lp.lam * Q.cosphi1) * 0.5;
      xy.y = (xy.y + lp.phi) * 0.5;
    }
  }

  function s_inv(xy, lp) {
    var MAXITER = 10,
        MAXROUND = 20,
        EPSILON = 1e-12,
        round = 0,
        iter, D, C, f1, f2, f1p, f1l, f2p, f2l, dp, dl, sl, sp, cp, cl, x, y;

    if ((fabs(xy.x) < EPSILON) && (fabs(xy.y) < EPSILON )) {
      lp.phi = 0;
      lp.lam = 0;
      return;
    }

    /* intial values for Newton-Raphson method */
    lp.phi = xy.y; lp.lam = xy.x;
    do {
      iter = 0;
      do {
        sl = sin(lp.lam * 0.5); cl = cos(lp.lam * 0.5);
        sp = sin(lp.phi); cp = cos(lp.phi);
        D = cp * cl;
        C = 1 - D * D;
        D = acos(D) / pow(C, 1.5);
        f1 = 2 * D * C * cp * sl;
        f2 = D * C * sp;
        f1p = 2 * (sl * cl * sp * cp / C - D * sp * sl);
        f1l = cp * cp * sl * sl / C + D * cp * cl * sp * sp;
        f2p = sp * sp * cl / C + D * sl * sl * cp;
        f2l = 0.5 * (sp * cp * sl / C - D * sp * cp * cp * sl * cl);
        if (Q.mode) { /* Winkel Tripel */
          f1 = 0.5 * (f1 + lp.lam * Q.cosphi1);
          f2 = 0.5 * (f2 + lp.phi);
          f1p *= 0.5;
          f1l = 0.5 * (f1l + Q.cosphi1);
          f2p = 0.5 * (f2p + 1);
          f2l *= 0.5;
        }
        f1 -= xy.x; f2 -= xy.y;
        dl = (f2 * f1p - f1 * f2p) / (dp = f1p * f2l - f2p * f1l);
        dp = (f1 * f2l - f2 * f1l) / dp;
        while (dl > M_PI) dl -= M_PI; /* set to interval [-M_PI, M_PI]  */
        while (dl < -M_PI) dl += M_PI; /* set to interval [-M_PI, M_PI]  */
        lp.phi -= dp; lp.lam -= dl;
      } while ((fabs(dp) > EPSILON || fabs(dl) > EPSILON) && (iter++ < MAXITER));
      if (lp.phi > M_HALFPI) lp.phi -= 2*(lp.phi-M_HALFPI); /* correct if symmetrical solution for Aitoff */
      if (lp.phi < -M_HALFPI) lp.phi -= 2*(lp.phi+M_HALFPI); /* correct if symmetrical solution for Aitoff */
      if ((fabs(fabs(lp.phi) - M_HALFPI) < EPSILON) && (!Q.mode)) lp.lam = 0; /* if pole in Aitoff, return longitude of 0 */

      /* calculate x,y coordinates with solution obtained */
      if((D = acos(cos(lp.phi) * cos(C = 0.5 * lp.lam)))) {/* Aitoff */
        x = 2 * D * cos(lp.phi) * sin(C) * (y = 1 / sin(D));
        y *= D * sin(lp.phi);
      } else
        x = y = 0;
      if (Q.mode) { /* Winkel Tripel */
        x = (x + lp.lam * Q.cosphi1) * 0.5;
        y = (y + lp.phi) * 0.5;
      }
    /* if too far from given values of x,y, repeat with better approximation of phi,lam */
    } while (((fabs(xy.x-x) > EPSILON) || (fabs(xy.y-y) > EPSILON)) && (round++ < MAXROUND));

    if (iter == MAXITER && round == MAXROUND) {
      // not ported: warning message
      // fprintf(stderr, "Warning: Accuracy of 1e-12 not reached. Last increments: dlat=%e and dlon=%e\n", dp, dl);
    }
  }
}


pj_add(pj_august, 'august', 'August Epicycloidal', 'Misc Sph, no inv.');

function pj_august(P) {
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var M = 4 / 3;
    var lam = lp.lam;
    var t, c1, c, x1, x12, y1, y12;
    t = tan(0.5 * lp.phi);
    c1 = sqrt(1 - t * t);
    c = 1 + c1 * cos(lam *= 0.5);
    x1 = sin(lam) *  c1 / c;
    y1 =  t / c;
    xy.x = M * x1 * (3 + (x12 = x1 * x1) - 3 * (y12 = y1 *  y1));
    xy.y = M * y1 * (3 + 3 * x12 - y12);
  }
}


pj_add(pj_apian, 'apian', 'Apian Globular I', 'Misc Sph, no inv.');
pj_add(pj_ortel, 'ortel', 'Ortelius Oval', 'Misc Sph, no inv.');
pj_add(pj_bacon, 'bacon', 'Bacon Globular', 'Misc Sph, no inv.');

function pj_bacon(P) {
  pj_bacon_init(P, true, false);
}

function pj_apian(P) {
  pj_bacon_init(P, false, false);
}

function pj_ortel(P) {
  pj_bacon_init(P, false, true);
}

function pj_bacon_init(P, bacn, ortl) {
  P.es = 0;
  P.fwd = s_fwd;

  function s_fwd(lp, xy) {
    var HLFPI2 = 2.46740110027233965467; /* (pi/2)^2 */
    var EPS = 1e-10;
    var ax, f;
    xy.y = bacn ? M_HALFPI * sin(lp.phi) : lp.phi;
    if ((ax = fabs(lp.lam)) >= EPS) {
      if (ortl && ax >= M_HALFPI)
        xy.x = sqrt(HLFPI2 - lp.phi * lp.phi + EPS) + ax - M_HALFPI;
      else {
        f = 0.5 * (HLFPI2 / ax + ax);
        xy.x = ax - f + sqrt(f * f - xy.y * xy.y);
      }
      if (lp.lam < 0) xy.x = - xy.x;
    } else
      xy.x = 0;
  }
}



/*
  Created by Jacques Bertin in 1953, this projection was the go-to choice
  of the French cartographic school when they wished to represent phenomena
  on a global scale.

  Formula designed by Philippe Rivière, 2017.
  https://visionscarto.net/bertin-projection-1953
  Port to PROJ by Philippe Rivière, 21 September 2018
  Port to JavaScript by Matthew Bloch October 2018
*/
pj_add(pj_bertin1953, 'bertin1953', 'Bertin 1953', 'Misc., Sph., NoInv.');

function pj_bertin1953(P) {
  var cos_delta_phi, sin_delta_phi, cos_delta_gamma, sin_delta_gamma;

  P.es = 0;
  P.fwd = s_fwd;
  P.lam0 = 0;
  P.phi0 = DEG_TO_RAD * -42;

  cos_delta_phi = cos(P.phi0);
  sin_delta_phi = sin(P.phi0);
  cos_delta_gamma = 1;
  sin_delta_gamma = 0;

  function s_fwd(lp, xy) {
    var fu = 1.4, k = 12, w = 1.68, d;
    /* Rotate */
    var cosphi, x, y, z, z0;
    lp.lam += DEG_TO_RAD * -16.5;
    cosphi = cos(lp.phi);
    x = cos(lp.lam) * cosphi;
    y = sin(lp.lam) * cosphi;
    z = sin(lp.phi);
    z0 = z * cos_delta_phi + x * sin_delta_phi;
    lp.lam = atan2(y * cos_delta_gamma - z0 * sin_delta_gamma,
       x * cos_delta_phi - z * sin_delta_phi);
    z0 = z0 * cos_delta_gamma + y * sin_delta_gamma;
    lp.phi = asin(z0);
    lp.lam = adjlon(lp.lam);

    /* Adjust pre-projection */
    if (lp.lam + lp.phi < -fu) {
      d = (lp.lam - lp.phi + 1.6) * (lp.lam + lp.phi + fu) / 8;
      lp.lam += d;
      lp.phi -= 0.8 * d * sin(lp.phi + M_PI / 2);
    }

    /* Project with Hammer (1.68,2) */
    cosphi = cos(lp.phi);
    d = sqrt(2/(1 + cosphi * cos(lp.lam / 2)));
    xy.x = w * d * cosphi * sin(lp.lam / 2);
    xy.y = d * sin(lp.phi);

    /* Adjust post-projection */
    d = (1 - cos(lp.lam * lp.phi)) / k;
    if (xy.y < 0) {
      xy.x *= 1 + d;
    }
    if (xy.y > 0) {
      xy.y *= 1 + d / 1.5 * xy.x * xy.x;
    }

    return xy;
  }
}


pj_add(pj_boggs, 'boggs', 'Boggs Eumorphic', 'PCyl., no inv., Sph.');

function pj_boggs(P) {
  var NITER = 20,
      EPS = 1e-7,
      ONETOL = 1.000001,
      M_SQRT2 = sqrt(2),
      FXC = 2.00276,
      FXC2 = 1.11072,
      FYC = 0.49931;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var theta, th1, c, i;
    theta = lp.phi;
    if (fabs(fabs(lp.phi) - M_HALFPI) < EPS)
      xy.x = 0;
    else {
      c = sin(theta) * M_PI;
      for (i = NITER; i; --i) {
        theta -= th1 = (theta + sin(theta) - c) /
          (1 + cos(theta));
        if (fabs(th1) < EPS) break;
      }
      theta *= 0.5;
      xy.x = FXC * lp.lam / (1 / cos(lp.phi) + FXC2 / cos(theta));
    }
    xy.y = FYC * (lp.phi + M_SQRT2 * sin(theta));
  }
}


pj_add(pj_bonne, 'bonne', 'Bonne (Werner lat_1=90)', 'Conic Sph&Ell\nlat_1=');

function pj_bonne(P) {
  var EPS10 = 1e-10;
  var phi1, cphi1, am1, m1, en, c;

  phi1 = pj_param(P.params, "rlat_1");
  if (fabs(phi1) < EPS10) e_error(-23);
  if (P.es) {
    en = pj_enfn(P.es);
    m1 = pj_mlfn(phi1, am1 = sin(phi1),
      c = cos(phi1), en);
    am1 = c / (sqrt(1 - P.es * am1 * am1) * am1);
    P.inv = e_inv;
    P.fwd = e_fwd;
  } else {
    if (fabs(phi1) + EPS10 >= M_HALFPI)
      cphi1 = 0;
    else
      cphi1 = 1 / tan(phi1);
    P.inv = s_inv;
    P.fwd = s_fwd;
  }

  function e_fwd(lp, xy) {
    var rh, E, c;
    rh = am1 + m1 - pj_mlfn(lp.phi, E = sin(lp.phi), c = cos(lp.phi), en);
    E = c * lp.lam / (rh * sqrt(1 - P.es * E * E));
    xy.x = rh * sin(E);
    xy.y = am1 - rh * cos(E);
  }

  function e_inv(xy, lp) {
    var s, rh;
    rh = hypot(xy.x, xy.y = am1 - xy.y);
    lp.phi = pj_inv_mlfn(am1 + m1 - rh, P.es, en);
    if ((s = fabs(lp.phi)) < M_HALFPI) {
      s = sin(lp.phi);
      lp.lam = rh * atan2(xy.x, xy.y) * sqrt(1 - P.es * s * s) / cos(lp.phi);
    } else if (fabs(s - M_HALFPI) <= EPS10)
      lp.lam = 0;
    else i_error();
  }

  function s_fwd(lp, xy) {
    var E, rh;
    rh = cphi1 + phi1 - lp.phi;
    if (fabs(rh) > EPS10) {
      xy.x = rh * sin(E = lp.lam * cos(lp.phi) / rh);
      xy.y = cphi1 - rh * cos(E);
    } else
      xy.x = xy.y = 0;
  }

  function s_inv(xy, lp) {
    var rh = hypot(xy.x, xy.y = cphi1 - xy.y);
    lp.phi = cphi1 + phi1 - rh;
    if (fabs(lp.phi) > M_HALFPI) i_error();
    if (fabs(fabs(lp.phi) - M_HALFPI) <= EPS10)
      lp.lam = 0;
    else
      lp.lam = rh * atan2(xy.x, xy.y) / cos(lp.phi);
  }
}


pj_add(pj_cass, 'cass', 'Cassini', 'Cyl, Sph&Ell');

function pj_cass(P) {
  var C1 = 0.16666666666666666666,
      C2 = 0.00833333333333333333,
      C3 = 0.04166666666666666666,
      C4 = 0.33333333333333333333,
      C5 = 0.06666666666666666666;
  var m0, en;

  if (P.es) {
    en = pj_enfn(P.es);
    m0 = pj_mlfn(P.phi0,  sin(P.phi0),  cos(P.phi0), en);
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    P.fwd = s_fwd;
    P.inv = s_inv;
  }

  function e_fwd(lp, xy) {
    var n, t, a1, c, a2, tn;
    xy.y = pj_mlfn(lp.phi, n = sin(lp.phi), c = cos(lp.phi), en);

    n  = 1/sqrt(1 - P.es * n*n);
    tn = tan(lp.phi); t = tn * tn;
    a1 = lp.lam * c;
    c *= P.es * c / (1 - P.es);
    a2 = a1 * a1;

    xy.x = n * a1 * (1 - a2 * t * (C1 - (8 - t + 8 * c) * a2 * C2));
    xy.y -= m0 - n * tn * a2 * (0.5 + (5 - t + 6 * c) * a2 * C3);
  }

  function e_inv(xy, lp) {
    var n, t, r, dd, d2, tn, ph1;
    ph1 = pj_inv_mlfn (m0 + xy.y, P.es, en);
    tn  = tan(ph1); t = tn*tn;
    n   = sin(ph1);
    r   = 1 / (1 - P.es * n * n);
    n   = sqrt (r);
    r  *= (1 - P.es) * n;
    dd  = xy.x / n;
    d2  = dd * dd;
    lp.phi = ph1 - (n * tn / r) * d2 *(0.5 - (1 + 3 * t) * d2 * C3);
    lp.lam = dd * (1 + t * d2 * (-C4 + (1 + 3 * t) * d2 * C5)) / cos(ph1);
  }

  function s_fwd(lp, xy) {
    xy.x  =  asin(cos(lp.phi) * sin(lp.lam));
    xy.y  =  atan2(tan(lp.phi), cos(lp.lam)) - P.phi0;
  }

  function s_inv(xy, lp) {
    var dd =  xy.y + P.phi0;
    lp.phi = asin(sin(dd) * cos(xy.x));
    lp.lam = atan2(tan(xy.x), cos(dd));
  }
}



function pj_authset(es) {
  var P00 = 0.33333333333333333333 /*   1 /     3 */,
      P01 = 0.17222222222222222222 /*  31 /   180 */,
      P02 = 0.10257936507936507937 /* 517 /  5040 */,
      P10 = 0.06388888888888888888 /*  23 /   360 */,
      P11 = 0.06640211640211640212 /* 251 /  3780 */,
      P20 = 0.01677689594356261023 /* 761 / 45360 */,
      APA = [];
  var t;

  APA[0] = es * P00;
  t = es * es;
  APA[0] += t * P01;
  APA[1] = t * P10;
  t *= es;
  APA[0] += t * P02;
  APA[1] += t * P11;
  APA[2] = t * P20;
  return APA;
}

function pj_authlat(beta, APA) {
  var t = beta + beta;
  return(beta + APA[0] * sin(t) + APA[1] * sin(t+t) + APA[2] * sin(t+t+t));
}


pj_add(pj_cea, 'cea', 'Equal Area Cylindrical', 'Cyl, Sph&Ell\nlat_ts=');

function pj_cea(P) {
  var t = 0, qp, apa;
  if (pj_param(P.params, "tlat_ts")) {
    P.k0 = cos(t = pj_param(P.params, "rlat_ts"));
    if (P.k0 < 0) {
      e_error(-24);
    }
  }
  if (P.es) {
    t = sin(t);
    P.k0 /= sqrt(1 - P.es * t * t);
    P.e = sqrt(P.es);
    if (!(apa = pj_authset(P.es))) e_error_0();
    qp = pj_qsfn(1, P.e, P.one_es);
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    P.fwd = s_fwd;
    P.inv = s_inv;
  }

  function e_fwd(lp, xy) {
    xy.x = P.k0 * lp.lam;
    xy.y = 0.5 * pj_qsfn(sin (lp.phi), P.e, P.one_es) / P.k0;
  }

  function e_inv(xy, lp) {
    lp.phi = pj_authlat(asin(2 * xy.y * P.k0 / qp), apa);
    lp.lam = xy.x / P.k0;
  }

  function s_fwd(lp, xy) {
    xy.x = P.k0 * lp.lam;
    xy.y = sin(lp.phi) / P.k0;
  }

  function s_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var t;
    if ((t = fabs(y *= P.k0)) - EPS10 <= 1) {
      if (t >= 1)
        lp.phi = y < 0 ? -M_HALFPI : M_HALFPI;
      else
        lp.phi = asin(y);
      lp.lam = x / P.k0;
    } else i_error();
  }
}


pj_add(pj_chamb, 'chamb', 'Chamberlin Trimetric', 'Misc Sph, no inv.\nlat_1= lon_1= lat_2= lon_2= lat_3= lon_3=');

function pj_chamb(P) {
  var THIRD  = 1/3,
      TOL = 1e-9,
      c = [],
      x0, y0,
      v, beta_0, beta_1, beta_2, i, j;

  for (i = 0; i < 3; ++i) { /* get control point locations */
    c[i] = {p: {}};
    c[i].phi = pj_param(P.params, 'rlat_' + (i+1));
    c[i].lam = pj_param(P.params, 'rlon_' + (i+1));
    c[i].lam = adjlon(c[i].lam - P.lam0);
    c[i].cosphi = cos(c[i].phi);
    c[i].sinphi = sin(c[i].phi);
  }
  for (i = 0; i < 3; ++i) { /* inter ctl pt. distances and azimuths */
    j = i == 2 ? 0 : i + 1;
    c[i].v = vect(c[j].phi - c[i].phi, c[i].cosphi, c[i].sinphi,
        c[j].cosphi, c[j].sinphi, c[j].lam - c[i].lam);

    if (!c[i].v.r) e_error(-25);
    /* co-linearity problem ignored for now */
  }
  beta_0 = lc(c[0].v.r, c[2].v.r, c[1].v.r);
  beta_1 = lc(c[0].v.r, c[1].v.r, c[2].v.r);
  beta_2 = M_PI - beta_0;
  y0 = 2 * (c[0].p.y = c[1].p.y = c[2].v.r * sin(beta_0));
  c[2].p.y = 0;
  c[0].p.x = -(c[1].p.x = 0.5 * c[0].v.r);
  x0 = c[2].p.x = c[0].p.x + c[2].v.r * cos(beta_0);

  P.es = 0;
  P.fwd = s_fwd;

  function s_fwd(lp, xy) {
    var sinphi, cosphi, a, i, j, x, y;
    var v = [];
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    for (i = 0; i < 3; ++i) { /* dist/azimiths from control */
      v[i] = vect(lp.phi - c[i].phi, c[i].cosphi, c[i].sinphi,
          cosphi, sinphi, lp.lam - c[i].lam);
      if (!v[i].r)
          break;
      v[i].Az = adjlon(v[i].Az - c[i].v.Az);
    }
    if (i < 3) { /* current point at control point */
      x = c[i].p.x;
      y = c[i].p.y;
    } else { /* point mean of intercepts */
      x = x0;
      y = y0;
      for (i = 0; i < 3; ++i) {
        j = i == 2 ? 0 : i + 1;
        a = lc(c[i].v.r, v[i].r, v[j].r);
        if (v[i].Az < 0)
          a = -a;
        if (! i) { /* coord comp unique to each arc */
          x += v[i].r * cos(a);
          y -= v[i].r * sin(a);
        } else if (i == 1) {
          a = beta_1 - a;
          x -= v[i].r * cos(a);
          y -= v[i].r * sin(a);
        } else {
          a = beta_2 - a;
          x += v[i].r * cos(a);
          y += v[i].r * sin(a);
        }
      }
      x *= THIRD; /* mean of arc intercepts */
      y *= THIRD;
    }
    xy.x = x;
    xy.y = y;
  }

  function vect(dphi, c1, s1, c2, s2, dlam) {
    var v = {};
    var cdl, dp, dl;
    cdl = cos(dlam);
    if (fabs(dphi) > 1 || fabs(dlam) > 1)
      v.r = aacos(cs1 * s2 + c1 * c2 * cdl);
    else { /* more accurate for smaller distances */
      dp = sin(0.5 * dphi);
      dl = sin(0.5 * dlam);
      v.r = 2 * aasin(sqrt(dp * dp + c1 * c2 * dl * dl));
    }
    if (fabs(v.r) > TOL)
      v.Az = atan2(c2 * sin(dlam), c1 * s2 - s1 * c2 * cdl);
    else
      v.r = v.Az = 0;
    return v;
  }

  /* law of cosines */
  function lc(b, c, a) {
    return aacos(0.5 * (b * b + c * c - a * a) / (b * c));
  }
}


pj_add(pj_crast, 'crast', 'Craster Parabolic (Putnins P4)', 'PCyl., Sph.');

function pj_crast(P) {
  var XM = 0.97720502380583984317;
  var RXM = 1.02332670794648848847;
  var YM = 3.06998012383946546542;
  var RYM = 0.32573500793527994772;
  var THIRD = 1/3;
  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    lp.phi *= THIRD;
    xy.x = XM * lp.lam * (2 * cos(lp.phi + lp.phi) - 1);
    xy.y = YM * sin(lp.phi);
  }

  function s_inv(xy, lp) {
    lp.phi = 3 * asin(xy.y * RYM);
    lp.lam = xy.x * RXM / (2 * cos((lp.phi + lp.phi) * THIRD) - 1);
  }
}


pj_add(pj_cupola, 'cupola', 'Cupola', 'PCyl., Sph., NoInv.');

// Source: https://www.tandfonline.com/eprint/EE7Y8RK4GXA4ITWUTQPY/full?target=10.1080/23729333.2020.1862962
// See also: http://www.at-a-lanta.nl/weia/cupola.html

function pj_cupola(P) {
  var de = 0.5253;  // part of the equator on intermediate sphere, default = 1
  var dp = 0.7264;  // sin of angle of polar line, default = 1
  var ri = 1 / Math.sqrt(de * dp);
  var he = 0.4188; // height of equator (can be negative, default = 0)
  var se = 0.9701; // stretch in plane, default = 1
  var phi0 = 22 * DEG_TO_RAD; // phi of projection center
  // center of projection on intermediate sphere
  var pc = calcP(phi0);
  var qc = calcQ(0);
  var spc = sin(pc);
  var cpc = cos(pc);

  // apply default central meridian
  if (!pj_param(P.params, 'tlon_0')) {
    P.lam0 = 11.023 * DEG_TO_RAD;
  }

  P.es = 0;
  P.fwd = s_fwd;

  function calcP(phi) {
    return asin(dp * sin(phi) + he * sqrt(de * dp));
  }

  function calcQ(lam) {
    return de * lam;
  }

  function s_fwd(lp, xy) {
    var p = calcP(lp.phi);
    var q = calcQ(lp.lam);
    var sp = sin(p);
    var cp = cos(p);
    var sqqc = sin(q - qc);
    var cqqc = cos(q - qc);
    var K = sqrt(2 / (1 + sin(pc) * sp + cpc * cp * cqqc));
    xy.x = ri * K * cp * sqqc * se;
    xy.y = ri * K * (cpc * sp - spc * cp * cqqc) / se;
  }
}


pj_add(pj_denoy, 'denoy', 'Denoyer Semi-Elliptical', 'PCyl, Sph., no inv.');

function pj_denoy(P) {
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var C0 = 0.95;
    var C1 = -0.08333333333333333333;
    var C3 = 0.00166666666666666666;
    var D1 = 0.9;
    var D5 = 0.03;
    var lam = fabs(lp.lam);
    xy.y = lp.phi;
    xy.x = lp.lam;
    xy.x *= cos((C0 + lam * (C1 + lam * lam * C3)) *
            (lp.phi * (D1 + D5 * lp.phi * lp.phi * lp.phi * lp.phi)));

  }
}


pj_add(pj_eck1, 'eck1', 'Eckert I', 'PCyl Sph');
pj_add(pj_eck2, 'eck2', 'Eckert II', 'PCyl Sph');
pj_add(pj_eck3, 'eck3', 'Eckert III', 'PCyl Sph');
pj_add(pj_wag6, 'wag6', 'Wagner VI', 'PCyl Sph');
pj_add(pj_kav7, 'kav7', 'Kavraisky VII', 'PCyl Sph');
pj_add(pj_putp1, 'putp1', 'Putnins P1', 'PCyl Sph');
pj_add(pj_eck4, 'eck4', 'Eckert IV', 'PCyl Sph');
pj_add(pj_eck5, 'eck5', 'Eckert V', 'PCyl Sph');

function pj_eck1(P) {
  var FC = 0.92131773192356127802,
      RP = 0.31830988618379067154;
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = FC * lp.lam * (1 - RP * fabs(lp.phi));
    xy.y = FC * lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / FC;
    lp.lam = xy.x / (FC * (1 - RP * fabs(lp.phi)));
  }
}

function pj_eck2(P) {
  var FXC = 0.46065886596178063902,
      FYC = 1.44720250911653531871,
      C13 = 0.33333333333333333333,
      ONEEPS = 1.0000001;
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = FXC * lp.lam * (xy.y = sqrt(4 - 3 * sin(fabs(lp.phi))));
    xy.y = FYC * (2 - xy.y);
    if (lp.phi < 0) xy.y = -xy.y;
  }

  function s_inv(xy, lp) {
    lp.lam = xy.x / (FXC * (lp.phi = 2 - fabs(xy.y) / FYC));
    lp.phi = (4 - lp.phi * lp.phi) * C13;
    if (fabs(lp.phi) >= 1) {
      if (fabs(lp.phi) > ONEEPS) i_error();
      else
        lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
    } else
      lp.phi = asin(lp.phi);
    if (xy.y < 0)
      lp.phi = -lp.phi;
  }
}

function pj_eck3(P) {
  var Q = {
    C_x: 0.42223820031577120149,
    C_y: 0.84447640063154240298,
    A: 1,
    B: 0.4052847345693510857755
  };
  pj_eck3_init(P, Q);
}

function pj_kav7(P) {
  var Q = {
    C_x: 0.8660254037844,
    C_y: 1,
    A: 0,
    B: 0.30396355092701331433
  };
  pj_eck3_init(P, Q);
}

function pj_wag6(P) {
  var Q = {
    C_x: 0.94745,
    C_y: 0.94745,
    A: 0,
    B: 0.30396355092701331433
  };
  pj_eck3_init(P, Q);
}

function pj_putp1(P) {
  var Q = {
    C_x: 1.89490,
    C_y: 0.94745,
    A: -0.5,
    B: 0.30396355092701331433
  };
  pj_eck3_init(P, Q);
}

function pj_eck3_init(P, Q) {
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.y = Q.C_y * lp.phi;
    xy.x = Q.C_x * lp.lam * (Q.A + asqrt(1 - Q.B * lp.phi * lp.phi));
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / Q.C_y;
    lp.lam = xy.x / (Q.C_x * (Q.A + asqrt(1 - Q.B * lp.phi * lp.phi)));
  }
}

function pj_eck4(P) {
  var C_x = 0.42223820031577120149,
      C_y = 1.32650042817700232218,
      RC_y = 0.75386330736002178205,
      C_p = 3.57079632679489661922,
      RC_p = 0.28004957675577868795,
      EPS = 1e-7,
      NITER = 6;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var p, V, s, c, i;
    p = C_p * sin(lp.phi);
    V = lp.phi * lp.phi;
    lp.phi *= 0.895168 + V * ( 0.0218849 + V * 0.00826809 );
    for (i = NITER; i; --i) {
      c = cos(lp.phi);
      s = sin(lp.phi);
      lp.phi -= V = (lp.phi + s * (c + 2) - p) /
          (1 + c * (c + 2) - s * s);
      if (fabs(V) < EPS)
        break;
    }
    if (!i) {
      xy.x = C_x * lp.lam;
      xy.y = lp.phi < 0 ? -C_y : C_y;
    } else {
      xy.x = C_x * lp.lam * (1 + cos(lp.phi));
      xy.y = C_y * sin(lp.phi);
    }
  }

  function s_inv(xy, lp) {
    var c;
    lp.phi = aasin(xy.y / C_y);
    lp.lam = xy.x / (C_x * (1 + (c = cos(lp.phi))));
    lp.phi = aasin((lp.phi + sin(lp.phi) * (c + 2)) / C_p);
  }
}

function pj_eck5(P) {
  var XF = 0.44101277172455148219,
      RXF = 2.26750802723822639137,
      YF = 0.88202554344910296438,
      RYF = 1.13375401361911319568;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = XF * (1 + cos(lp.phi)) * lp.lam;
    xy.y = YF * lp.phi;
  }

  function s_inv(xy, lp) {
    lp.lam = RXF * xy.x / (1 + cos(lp.phi = RYF * xy.y));
  }
}


pj_add(pj_eqc, 'eqc', 'Equidistant Cylindrical (Plate Caree)', 'Cyl, Sph\nlat_ts=[, lat_0=0]');

function pj_eqc(P) {
  var rc = cos(pj_param(P.params, "rlat_ts"));
  if (rc <= 0) e_error(-24);
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = rc * lp.lam;
    xy.y = lp.phi -P.phi0;
  }

  function s_inv(xy, lp) {
    lp.lam = xy.x / rc;
    lp.phi = xy.y + P.phi0;
  }
}


pj_add(pj_eqdc, 'eqdc', 'Equidistant Conic', 'Conic, Sph&Ell\nlat_1= lat_2=');

function pj_eqdc(P) {
  var phi1, phi2, n, rho, rho0, c, en, ellips, cosphi, sinphi, secant;
  var ml1, m1;
  phi1 = pj_param(P.params, "rlat_1");
  phi2 = pj_param(P.params, "rlat_2");
  if (fabs(phi1 + phi2) < EPS10) e_error(-21);
  if (!(en = pj_enfn(P.es)))
      e_error_0();
  n = sinphi = sin(phi1);
  cosphi = cos(phi1);
  secant = fabs(phi1 - phi2) >= EPS10;
  if ((ellips = (P.es > 0)) ) {
    m1 = pj_msfn(sinphi, cosphi, P.es);
    ml1 = pj_mlfn(phi1, sinphi, cosphi, en);
    if (secant) { /* secant cone */
      sinphi = sin(phi2);
      cosphi = cos(phi2);
      n = (m1 - pj_msfn(sinphi, cosphi, P.es)) /
          (pj_mlfn(phi2, sinphi, cosphi, en) - ml1);
    }
    c = ml1 + m1 / n;
    rho0 = c - pj_mlfn(P.phi0, sin(P.phi0),
      cos(P.phi0), en);
  } else {
    if (secant)
       n = (cosphi - cos(phi2)) / (phi2 - phi1);
    c = phi1 + cos(phi1) / n;
    rho0 = c - P.phi0;
  }

  P.fwd = e_fwd;
  P.inv = e_inv;

  function e_fwd(lp, xy) {
    rho = c - (ellips ? pj_mlfn(lp.phi, sin(lp.phi),
        cos(lp.phi), en) : lp.phi);
    xy.x = rho * sin( lp.lam *= n );
    xy.y = rho0 - rho * cos(lp.lam);
  }

  function e_inv(xy, lp) {
    if ((rho = hypot(xy.x, xy.y = rho0 - xy.y)) != 0.0 ) {
      if (n < 0) {
        rho = -rho;
        xy.x = -xy.x;
        xy.y = -xy.y;
      }
      lp.phi = c - rho;
      if (ellips)
        lp.phi = pj_inv_mlfn(lp.phi, P.es, en);
      lp.lam = atan2(xy.x, xy.y) / n;
    } else {
      lp.lam = 0;
      lp.phi = n > 0 ? M_HALFPI : -M_HALFPI;
    }
  }
}


/**
 * Copyright 2018 Bernie Jenny, Monash University, Melbourne, Australia.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Equal Earth is a projection inspired by the Robinson projection, but unlike
 * the Robinson projection retains the relative size of areas. The projection
 * was designed in 2018 by Bojan Savric, Tom Patterson and Bernhard Jenny.
 *
 * Publication:
 * Bojan Savric, Tom Patterson & Bernhard Jenny (2018). The Equal Earth map
 * projection, International Journal of Geographical Information Science,
 * DOI: 10.1080/13658816.2018.1504949
 *
 * Code released August 2018
 * Ported to JavaScript and adapted for mapshaper-proj by Matthew Bloch August 2018
 */
pj_add(pj_eqearth, 'eqearth', 'Equal Earth', 'PCyl., Sph.');

function pj_eqearth(P) {
  var A1 = 1.340264,
      A2 = -0.081106,
      A3 = 0.000893,
      A4 = 0.003796,
      M = Math.sqrt(3) / 2.0;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var paramLat = Math.asin(M * Math.sin(lp.phi)),
        paramLatSq = paramLat * paramLat,
        paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
    xy.x = lp.lam * Math.cos(paramLat) /
            (M * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq)));
    xy.y = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq));
  }

  function s_inv(xy, lp) {
    var EPS = 1e-9,
        NITER = 12,
        paramLat = xy.y,
        paramLatSq, paramLatPow6, fy, fpy, dlat, i;

    for (i = 0; i < NITER; ++i) {
      paramLatSq = paramLat * paramLat;
      paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
      fy = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq)) - xy.y;
      fpy = A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq);
      paramLat -= dlat = fy / fpy;
      if (Math.abs(dlat) < EPS) {
          break;
      }
    }
    paramLatSq = paramLat * paramLat;
    paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
    lp.lam = M * xy.x * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq)) /
            Math.cos(paramLat);
    lp.phi = Math.asin(Math.sin(paramLat) / M);
  }
}


pj_add(pj_etmerc, 'etmerc', 'Extended Transverse Mercator', 'Cyl, Sph\nlat_ts=(0)\nlat_0=(0)');

function pj_etmerc(P) {
  var cgb = [],
      cbg = [],
      utg = [],
      gtu = [],
      Qn, Zb, f, n, np, Z;
  if (P.es <= 0) e_error(-34);
  /* flattening */
  f = P.es / (1 + sqrt(1 - P.es)); /* Replaces: f = 1 - sqrt(1-P.es); */
  /* third flattening */
  np = n = f/(2 - f);
  /* COEF. OF TRIG SERIES GEO <-> GAUSS */
  /* cgb := Gaussian -> Geodetic, KW p190 - 191 (61) - (62) */
  /* cbg := Geodetic -> Gaussian, KW p186 - 187 (51) - (52) */
  /* PROJ_ETMERC_ORDER = 6th degree : Engsager and Poder: ICC2007 */
  cgb[0] = n*(2 + n*(-2/3 + n * (-2 + n*(116/45 + n * (26/45 + n*(-2854/675 ))))));
  cbg[0] = n*(-2 + n*( 2/3 + n*( 4/3 + n*(-82/45 + n*(32/45 + n*(4642/4725))))));
  np *= n;
  cgb[1] = np*(7/3 + n*(-8/5 + n*(-227/45 + n*(2704/315 + n*(2323/945)))));
  cbg[1] = np*(5/3 + n*(-16/15 + n*( -13/9 + n*(904/315 + n*(-1522/945)))));
  np *= n;
  /* n^5 coeff corrected from 1262/105 -> -1262/105 */
  cgb[2] = np*(56/15 + n*(-136/35 + n*(-1262/105 + n*(73814/2835))));
  cbg[2] = np*(-26/15 + n*(34/21 + n*(8/5 + n*(-12686/2835))));
  np *= n;
  /* n^5 coeff corrected from 322/35 -> 332/35 */
  cgb[3] = np*(4279/630 + n*(-332/35 + n*(-399572/14175)));
  cbg[3] = np*(1237/630 + n*(-12/5 + n*( -24832/14175)));
  np *= n;
  cgb[4] = np*(4174/315 + n*(-144838/6237));
  cbg[4] = np*(-734/315 + n*(109598/31185));
  np *= n;
  cgb[5] = np*(601676/22275);
  cbg[5] = np*(444337/155925);

  /* Constants of the projections */
  /* Transverse Mercator (UTM, ITM, etc) */
  np = n*n;
  /* Norm. mer. quad, K&W p.50 (96), p.19 (38b), p.5 (2) */
  Qn = P.k0/(1 + n) * (1 + np*(1/4 + np*(1/64 + np/256)));
  /* coef of trig series */
  /* utg := ell. N, E -> sph. N, E,  KW p194 (65) */
  /* gtu := sph. N, E -> ell. N, E,  KW p196 (69) */
  utg[0] = n*(-0.5 + n*( 2/3 + n*(-37/96 + n*( 1/360 + n*(81/512 + n*(-96199/604800))))));
  gtu[0] = n*(0.5 + n*(-2/3 + n*(5/16 + n*(41/180 + n*(-127/288 + n*(7891/37800))))));
  utg[1] = np*(-1/48 + n*(-1/15 + n*(437/1440 + n*(-46/105 + n*(1118711/3870720)))));
  gtu[1] = np*(13/48 + n*(-3/5 + n*(557/1440 + n*(281/630 + n*(-1983433/1935360)))));
  np *= n;
  utg[2] = np*(-17/480 + n*(37/840 + n*(209/4480 + n*(-5569/90720 ))));
  gtu[2] = np*(61/240 + n*(-103/140 + n*(15061/26880 + n*(167603/181440))));
  np *= n;
  utg[3] = np*(-4397/161280 + n*(11/504 + n*(830251/7257600)));
  gtu[3] = np*(49561/161280 + n*(-179/168 + n*(6601661/7257600)));
  np *= n;
  utg[4] = np*(-4583/161280 + n*(108847/3991680));
  gtu[4] = np*(34729/80640  + n*(-3418889/1995840));
  np *= n;
  utg[5] = np*(-20648693/638668800);
  gtu[5] = np*(212378941/319334400);

   /* Gaussian latitude value of the origin latitude */
  Z = gatg(cbg, P.phi0);

  /* Origin northing minus true northing at the origin latitude */
  /* i.e. true northing = N - P.Zb  */
  Zb = -Qn*(Z + clens(gtu, 2*Z));
  P.fwd = e_fwd;
  P.inv = e_inv;

  function e_fwd(lp, xy) {
    var sin_Cn, cos_Cn, cos_Ce, sin_Ce, tmp;
    var Cn = lp.phi, Ce = lp.lam;

    /* ell. LAT, LNG -> Gaussian LAT, LNG */
    Cn = gatg(cbg, Cn);
    /* Gaussian LAT, LNG -> compl. sph. LAT */
    sin_Cn = sin(Cn);
    cos_Cn = cos(Cn);
    sin_Ce = sin(Ce);
    cos_Ce = cos(Ce);
    Cn = atan2(sin_Cn, cos_Ce*cos_Cn);
    Ce = atan2(sin_Ce*cos_Cn, hypot(sin_Cn, cos_Cn*cos_Ce));
    /* compl. sph. N, E -> ell. norm. N, E */
    Ce = asinhy(tan(Ce));
    tmp = clenS(gtu, 2*Cn, 2*Ce);
    Cn += tmp[0];
    Ce += tmp[1];
    if (fabs (Ce) <= 2.623395162778) {
        xy.y  = Qn * Cn + Zb;  /* Northing */
        xy.x  = Qn * Ce;       /* Easting  */
    } else {
      xy.x = xy.y = HUGE_VAL;
    }
  }

  function e_inv(xy, lp) {
    var sin_Cn, cos_Cn, cos_Ce, sin_Ce, tmp;
    var Cn = xy.y, Ce = xy.x;
    /* normalize N, E */
    Cn = (Cn - Zb)/Qn;
    Ce = Ce/Qn;
    if (fabs(Ce) <= 2.623395162778) { /* 150 degrees */
      /* norm. N, E -> compl. sph. LAT, LNG */
      tmp = clenS(utg, 2*Cn, 2*Ce);
      Cn += tmp[0];
      Ce += tmp[1];
      Ce = atan(sinh(Ce)); /* Replaces: Ce = 2*(atan(exp(Ce)) - M_FORTPI); */
      /* compl. sph. LAT -> Gaussian LAT, LNG */
      sin_Cn = sin(Cn);
      cos_Cn = cos(Cn);
      sin_Ce = sin(Ce);
      cos_Ce = cos(Ce);
      Ce = atan2(sin_Ce, cos_Ce*cos_Cn);
      Cn = atan2(sin_Cn*cos_Ce, hypot(sin_Ce, cos_Ce*cos_Cn));
      /* Gaussian LAT, LNG -> ell. LAT, LNG */
      lp.phi = gatg (cgb, Cn);
      lp.lam = Ce;
    }
    else {
      lp.phi = lp.lam = HUGE_VAL;
    }
  }

  function log1py(x) {
    var y = 1 + x,
        z = y - 1;
    return z === 0 ? x : x * log(y) / z;
  }

  function asinhy(x) {
    var y = fabs(x);
    y = log1py(y * (1 + y/(hypot(1, y) + 1)));
    return x < 0 ? -y : y;
  }

  function gatg(pp, B) {
    var cos_2B = 2 * cos(2 * B),
        i = pp.length - 1,
        h1 = pp[i],
        h2 = 0,
        h;
    while (--i >= 0) {
      h = -h2 + cos_2B * h1 + pp[i];
      h2 = h1;
      h1 = h;
    }
    return (B + h * sin(2 * B));
  }

  function clens(pp, arg_r) {
    var r = 2 * cos(arg_r),
        i = pp.length - 1,
        hr1 = pp[i],
        hr2 = 0,
        hr;
    while (--i >= 0) {
      hr = -hr2 + r * hr1 + pp[i];
      hr2 = hr1;
      hr1 = hr;
    }
    return sin(arg_r) * hr;
  }

  function clenS(pp, arg_r, arg_i) {
    var sin_arg_r = sin(arg_r),
        cos_arg_r = cos(arg_r),
        sinh_arg_i = sinh(arg_i),
        cosh_arg_i = cosh(arg_i),
        r = 2 * cos_arg_r * cosh_arg_i,
        i = -2 * sin_arg_r * sinh_arg_i,
        j = pp.length - 1,
        hr = pp[j],
        hi1 = 0,
        hr1 = 0,
        hi = 0,
        hr2, hi2;
    while (--j >= 0) {
      hr2 = hr1;
      hi2 = hi1;
      hr1 = hr;
      hi1 = hi;
      hr = -hr2 + r*hr1 - i * hi1 + pp[j];
      hi = -hi2 + i*hr1 + r * hi1;
    }
    r = sin_arg_r * cosh_arg_i;
    i = cos_arg_r * sinh_arg_i;
    return [r * hr - i * hi, r * hi + i * hr];
  }
}


pj_add(pj_gall, 'gall', 'Gall (Gall Stereographic)', 'Cyl, Sph');

function pj_gall(P) {
  var YF = 1.70710678118654752440,
      XF = 0.70710678118654752440,
      RYF = 0.58578643762690495119,
      RXF = 1.41421356237309504880;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    xy.x = XF * lp.lam;
    xy.y = YF * tan(0.5 * lp.phi);
  }

  function s_inv(xy, lp) {
    lp.lam = RXF * xy.x;
    lp.phi = 2 * atan(xy.y * RYF);
  }
}


pj_add(pj_geocent, 'geocent', 'Geocentric', '');

function pj_geocent(P) {
  P.is_geocent = true;
  P.x0 = 0;
  P.y0 = 0;

  P.fwd = function (lp, xy) {
    xy.x = lp.lam;
    xy.y = lp.phi;
  };

  P.inv = function(xy, lp) {
    lp.phi = xy.y;
    lp.lam = xy.x;
  };
}


pj_add(pj_geos, 'geos', 'Geostationary Satellite View', 'Azi, Sph&Ell');

function pj_geos(P) {
  var radius_p, radius_p2, radius_p_inv2, radius_g, radius_g_1, C, flip_axis;
  var h = pj_param(P.params, "dh");
  var sweep_axis = pj_param(P.params, "ssweep");
  if (!sweep_axis)
    flip_axis = 0;
  else {
    if (sweep_axis == 'x')
      flip_axis = 1;
    else if (sweep_axis == 'y')
      flip_axis = 0;
    else
     e_error(-49);
  }

  radius_g_1 = h / P.a;
  if (radius_g_1 <= 0 || radius_g_1 > 1e10) {
    e_error(-50);
  }
  radius_g = 1 + radius_g_1;
  C = radius_g * radius_g - 1;
  if (P.es != 0) {
    radius_p = sqrt(P.one_es);
    radius_p2 = P.one_es;
    radius_p_inv2 = P.rone_es;
    P.inv = e_inv;
    P.fwd = e_fwd;
  } else {
    radius_p = radius_p2 = radius_p_inv2 = 1;
    P.inv = s_inv;
    P.fwd = s_fwd;
  }

  function s_fwd(lp, xy) {
    var tmp = cos(lp.phi);
    var Vx = cos(lp.lam) * tmp;
    var Vy = sin(lp.lam) * tmp;
    var Vz = sin(lp.phi);
    /* Calculation based on view angles from satellite.*/
    tmp = radius_g - Vx;

    if (flip_axis) {
      xy.x = radius_g_1 * atan(Vy / hypot(Vz, tmp));
      xy.y = radius_g_1 * atan(Vz / tmp);
    } else {
      xy.x = radius_g_1 * atan(Vy / tmp);
      xy.y = radius_g_1 * atan(Vz / hypot(Vy, tmp));
    }
  }

  function s_inv(xy, lp) {
    var Vx, Vy, Vz, a, b, k;

    /* Setting three components of vector from satellite to position.*/
    Vx = -1;
    if (flip_axis) {
      Vz = tan(xy.y / radius_g_1);
      Vy = tan(xy.x / radius_g_1) * sqrt(1 + Vz * Vz);
    } else {
      Vy = tan(xy.x / radius_g_1);
      Vz = tan(xy.y / radius_g_1) * sqrt(1 + Vy * Vy);
    }

    /* Calculation of terms in cubic equation and determinant.*/
    a = Vy * Vy + Vz * Vz + Vx * Vx;
    b = 2 * radius_g * Vx;
    var det = (b * b) - 4 * a * C;
    if (det < 0) {
      e_error(-51);
    }

    /* Calculation of three components of vector from satellite to position.*/
    k = (-b - sqrt(det)) / (2 * a);
    Vx = radius_g + k * Vx;
    Vy *= k;
    Vz *= k;

    /* Calculation of longitude and latitude.*/
    lp.lam = atan2(Vy, Vx);
    lp.phi = atan(Vz * cos(lp.lam) / Vx);
  }

  function e_fwd(lp, xy) {
    var r, Vx, Vy, Vz, tmp;

    /* Calculation of geocentric latitude. */
    lp.phi = atan(radius_p2 * tan(lp.phi));

    /* Calculation of the three components of the vector from satellite to
    ** position on earth surface (long,lat).*/
    r = (radius_p) / hypot(radius_p * cos(lp.phi), sin(lp.phi));
    Vx = r * cos(lp.lam) * cos(lp.phi);
    Vy = r * sin(lp.lam) * cos(lp.phi);
    Vz = r * sin(lp.phi);

    /* Check visibility. */
    if (((radius_g - Vx) * Vx - Vy * Vy - Vz * Vz * radius_p_inv2) < 0.) {
      e_error(-51);
    }

    /* Calculation based on view angles from satellite. */
    tmp = radius_g - Vx;
    if (flip_axis) {
      xy.x = radius_g_1 * atan(Vy / hypot(Vz, tmp));
      xy.y = radius_g_1 * atan(Vz / tmp);
    } else {
      xy.x = radius_g_1 * atan(Vy / tmp);
      xy.y = radius_g_1 * atan(Vz / hypot(Vy, tmp));
    }
  }

  function e_inv(xy, lp) {
    var Vx, Vy, Vz, a, b, k;

    /* Setting three components of vector from satellite to position.*/
    Vx = -1;

    if (flip_axis) {
      Vz = tan(xy.y / radius_g_1);
      Vy = tan(xy.x / radius_g_1) * hypot(1, Vz);
    } else {
      Vy = tan(xy.x / radius_g_1);
      Vz = tan(xy.y / radius_g_1) * hypot(1, Vy);
    }

    /* Calculation of terms in cubic equation and determinant.*/
    a = Vz / radius_p;
    a = Vy * Vy + a * a + Vx * Vx;
    b = 2 * radius_g * Vx;
    var det = (b * b) - 4 * a * C;
    if (det < 0) {
      e_error(-51);
    }

    /* Calculation of three components of vector from satellite to position.*/
    k = (-b - sqrt(det)) / (2 * a);
    Vx = radius_g + k * Vx;
    Vy *= k;
    Vz *= k;

    /* Calculation of longitude and latitude.*/
    lp.lam = atan2(Vy, Vx);
    lp.phi = atan(Vz * cos(lp.lam) / Vx);
    lp.phi = atan(radius_p_inv2 * tan(lp.phi));
  }
}


// from

pj_add(pj_gilbert, 'gilbert', 'Gilbert Two World Perspective', 'PCyl., Sph., NoInv.\nlat_1=');

function pj_gilbert(P) {
  var lat1 = pj_param(P.params, 'tlat_1') ? pj_param(P.params, 'rlat_1') : 0,
      phi1 = phiprime(lat1),
      sp1 = sin(phi1),
      cp1 = cos(phi1);
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var lam = lp.lam * 0.5,
        phi = phiprime(lp.phi),
        sp = sin(phi),
        cp = cos(phi),
        cl = cos(lam);
    if ((sp1*sp + cp1*cp*cl) >= 0) {
      xy.x = cp * sin(lam);
      xy.y = cp1 * sp - sp1 * cp * cl;
    } else {
      f_error();
    }
  }

  function phiprime(phi) {
    return aasin(tan(0.5 * phi));
  }
}


pj_add(pj_gins8, 'gins8', 'Ginsburg VIII (TsNIIGAiK)', 'PCyl, Sph., no inv.');

function pj_gins8(P) {
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var Cl = 0.000952426;
    var Cp = 0.162388;
    var C12 = 0.08333333333333333;
    var t = lp.phi * lp.phi;
    xy.y = lp.phi * (1 + t * C12);
    xy.x = lp.lam * (1 - Cp * t);
    t = lp.lam * lp.lam;
    xy.x *= (0.87 - Cl * t * t);
  }
}


pj_add(pj_gn_sinu, 'gn_sinu', 'General Sinusoidal Series', 'PCyl, Sph.\nm= n=');
pj_add(pj_sinu, 'sinu', 'Sinusoidal (Sanson-Flamsteed)', 'PCyl, Sph&Ell');
pj_add(pj_eck6, 'eck6', 'Eckert VI', 'PCyl, Sph.\nm= n=');
pj_add(pj_mbtfps, 'mbtfps', 'McBryde-Thomas Flat-Polar Sinusoidal', 'PCyl, Sph.');

function pj_gn_sinu(P) {
  if (pj_param(P.params, 'tn'), pj_param(P.params, 'tm')) {
    pj_sinu_init(P, pj_param(P.params, 'dm'), pj_param(P.params, 'dn'));
  } else {
    e_error(-99);
  }
}

function pj_sinu(P) {
  var en;
  if (P.es) {
    en = pj_enfn(P.es);
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    pj_sinu_init(P, 0, 1);
  }

  function e_fwd(lp, xy) {
    var s, c;
    xy.y = pj_mlfn(lp.phi, s = sin(lp.phi), c = cos(lp.phi), en);
    xy.x = lp.lam * c / sqrt(1 - P.es * s * s);
  }

  function e_inv(xy, lp) {
    var s = fabs(lp.phi = pj_inv_mlfn(xy.y, P.es, en));
    if (s < M_HALFPI) {
        s = sin(lp.phi);
        lp.lam = xy.x * sqrt(1 - P.es * s * s) / cos(lp.phi);
    } else if ((s - EPS10) < M_HALFPI) {
        lp.lam = 0;
    } else {
        i_error();
    }
  }
}

function pj_eck6(P) {
  pj_sinu_init(P, 1, 2.570796326794896619231321691);
}

function pj_mbtfps(P) {
  pj_sinu_init(P, 0.5, 1.785398163397448309615660845);
}

function pj_sinu_init(P, m, n) {
  var MAX_ITER = 8,
      LOOP_TOL = 1e-7,
      C_x, C_y;
  C_x = (C_y = sqrt((m + 1) / n))/(m + 1);
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var k, V, i;
    if (!m)
      lp.phi = n != 1 ? aasin(n * sin(lp.phi)): lp.phi;
    else {
        k = n * sin(lp.phi);
        for (i = MAX_ITER; i ; --i) {
            lp.phi -= V = (m * lp.phi + sin(lp.phi) - k) /
                (m + cos(lp.phi));
            if (fabs(V) < LOOP_TOL)
                break;
        }
        if (!i)
          f_error();
    }
    xy.x = C_x * lp.lam * (m + cos(lp.phi));
    xy.y = C_y * lp.phi;
  }

  function s_inv(xy, lp) {
    xy.y /= C_y;
    lp.phi = m ? aasin((m * xy.y + sin(xy.y)) / n) :
        ( n != 1 ? aasin(sin(xy.y) / n) : xy.y );
    lp.lam = xy.x / (C_x * (m + cos(xy.y)));
  }
}



pj_add(pj_gnom, 'gnom', 'Gnomonic', 'Azi, Sph.');

function pj_gnom(P) {
  var EPS10 = 1.e-10,
      N_POLE = 0,
      S_POLE = 1,
      EQUIT = 2,
      OBLIQ = 3;
  var sinphi0, cosph0, mode;
  if (fabs(fabs(P.phi0) - M_HALFPI) < EPS10) {
      mode = P.phi0 < 0 ? S_POLE : N_POLE;
  } else if (fabs(P.phi0) < EPS10) {
      mode = EQUIT;
  } else {
      mode = OBLIQ;
      sinph0 = sin(P.phi0);
      cosph0 = cos(P.phi0);
  }

  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var coslam, cosphi, sinphi;
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);

    switch (mode) {
        case EQUIT:
            xy.y = cosphi * coslam;
            break;
        case OBLIQ:
            xy.y = sinph0 * sinphi + cosph0 * cosphi * coslam;
            break;
        case S_POLE:
            xy.y = - sinphi;
            break;
        case N_POLE:
            xy.y = sinphi;
            break;
    }

    if (xy.y <= EPS10) f_error();

    xy.x = (xy.y = 1 / xy.y) * cosphi * sin(lp.lam);
    switch (mode) {
        case EQUIT:
            xy.y *= sinphi;
            break;
        case OBLIQ:
            xy.y *= cosph0 * sinphi - sinph0 * cosphi * coslam;
            break;
        case N_POLE:
            coslam = - coslam;
            /* falls through */
        case S_POLE:
            xy.y *= cosphi * coslam;
            break;
    }
  }

  function s_inv(xy, lp) {
    var x = xy.x, y = xy.y; // modified below
    var rh, cosz, sinz;
    rh = hypot(x, y);
    sinz = sin(lp.phi = atan(rh));
    cosz = sqrt(1 - sinz * sinz);

    if (fabs(rh) <= EPS10) {
        lp.phi = P.phi0;
        lp.lam = 0;
    } else {
        switch (mode) {
            case OBLIQ:
                lp.phi = cosz * sinph0 + y * sinz * cosph0 / rh;
                if (fabs(lp.phi) >= 1)
                    lp.phi = lp.phi > 0 ? M_HALFPI : -M_HALFPI;
                else
                    lp.phi = asin(lp.phi);
                y = (cosz - sinph0 * sin(lp.phi)) * rh;
                x *= sinz * cosph0;
                break;
            case EQUIT:
                lp.phi = y * sinz / rh;
                if (fabs(lp.phi) >= 1)
                    lp.phi = lp.phi > 0 ? M_HALFPI : -M_HALFPI;
                else
                    lp.phi = asin(lp.phi);
                y = cosz * rh;
                x *= sinz;
                break;
            case S_POLE:
                lp.phi -= M_HALFPI;
                break;
            case N_POLE:
                lp.phi = M_HALFPI - lp.phi;
                y = -y;
                break;
        }
        lp.lam = atan2(x, y);
    }
  }
}


pj_add(pj_moll, 'moll', 'Mollweide', 'PCyl Sph');
pj_add(pj_wag4, 'wag4', 'Wagner IV', 'PCyl Sph');
pj_add(pj_wag5, 'wag5', 'Wagner V', 'PCyl Sph');

function pj_moll(P) {
  pj_moll_init(P, pj_moll_init_Q(P, M_HALFPI));
}

function pj_wag4(P) {
  pj_moll_init(P, pj_moll_init_Q(P, M_PI/3));
}

function pj_wag5(P) {
  var Q = {
    C_x: 0.90977,
    C_y: 1.65014,
    C_p: 3.00896
  };
  pj_moll_init(P, Q);
}

function pj_moll_init_Q(P, p) {
  var sp = sin(p),
      p2 = p + p,
      r = sqrt(M_TWOPI * sp / (p2 + sin(p2)));
  return {
    C_x: 2 * r / M_PI,
    C_y: r / sp,
    C_p: p2 + sin(p2)
  };
}

function pj_moll_init(P, Q) {
  var MAX_ITER = 10,
      LOOP_TOL = 1e-7;
  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var k, V, i;
    k = Q.C_p * sin(lp.phi);
    for (i = MAX_ITER; i;--i) {
      lp.phi -= V = (lp.phi + sin(lp.phi) - k) /
        (1 + cos(lp.phi));
      if (fabs(V) < LOOP_TOL)
        break;
    }
    if (!i)
      lp.phi = (lp.phi < 0) ? -M_HALFPI : M_HALFPI;
    else
      lp.phi *= 0.5;
    xy.x = Q.C_x * lp.lam * cos(lp.phi);
    xy.y = Q.C_y * sin(lp.phi);
  }

  function s_inv(xy, lp) {
    lp.phi = aasin(xy.y / Q.C_y);
    lp.lam = xy.x / (Q.C_x * cos(lp.phi));
    // if (fabs(lp.lam) < M_PI) { // from Proj.4; fails for edge coordinates
    if (fabs(lp.lam) - M_PI < EPS10) { // allows inv projection of world layer
      lp.phi += lp.phi;
      lp.phi = aasin((lp.phi + sin(lp.phi)) / Q.C_p);
    } else {
      lp.lam = lp.phi = HUGE_VAL;
    }
  }
}


pj_add(pj_goode, 'goode', 'Goode Homolosine', 'PCyl, Sph.');

function pj_goode(P) {
  var Y_COR = 0.05280,
      PHI_LIM = 0.71093078197902358062,
      sinuFwd, sinuInv, mollFwd, mollInv;
  P.es = 0;
  pj_sinu(P);
  sinuFwd = P.fwd;
  sinuInv = P.inv;
  pj_moll(P);
  mollFwd = P.fwd;
  mollInv = P.inv;
  P.fwd = function(lp, xy) {
    if (fabs(lp.phi) < PHI_LIM) {
      sinuFwd(lp, xy);
    } else {
      mollFwd(lp, xy);
      xy.y -= lp.phi > 0 ? Y_COR : -Y_COR;
    }
  };
  P.inv = function(xy, lp) {
    if (fabs(xy.y) <= PHI_LIM) {
      sinuInv(xy, lp);
    } else {
      xy.y += xy.y > 0 ? Y_COR : -Y_COR;
      mollInv(xy, lp);
    }
  };
}


pj_add(pj_hammer, 'hammer', 'Hammer & Eckert-Greifendorff', 'Misc Sph,\nW= M=');

function pj_hammer(P) {
  var w, m, rm;
  var EPS = 1e-10;
  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  if (pj_param(P.params, "tW")) {
    if ((w = fabs(pj_param(P.params, "dW"))) <= 0) e_error(-27);
  } else
    w = 0.5;
  if (pj_param(P.params, "tM")) {
      if ((m = fabs(pj_param(P.params, "dM"))) <= 0) e_error(-27);
  } else
      m = 1;
  rm = 1 / m;
  m /= w;

  function s_fwd(lp, xy) {
    var cosphi, d;
    d = sqrt(2/(1 + (cosphi = cos(lp.phi)) * cos(lp.lam *= w)));
    xy.x = m * d * cosphi * sin(lp.lam);
    xy.y = rm * d * sin(lp.phi);
  }

  function s_inv(xy, lp) {
    var z = sqrt(1 - 0.25*w*w*xy.x*xy.x - 0.25*xy.y*xy.y);
    if (fabs(2*z*z-1) < EPS) {
      lp.lam = HUGE_VAL;
      lp.phi = HUGE_VAL;
      pj_errno = -14;
    } else {
      lp.lam = aatan2(w * xy.x * z,2 * z * z - 1)/w;
      lp.phi = aasin(z * xy.y);
    }
  }
}


pj_add(pj_hatano, 'hatano', 'Hatano Asymmetrical Equal Area', 'PCyl., Sph.');

function pj_hatano(P) {
  var NITER = 20;
  var EPS = 1e-7;
  var ONETOL = 1.000001;
  var CN = 2.67595;
  var CS = 2.43763;
  var RCN = 0.37369906014686373063;
  var RCS = 0.41023453108141924738;
  var FYCN = 1.75859;
  var FYCS = 1.93052;
  var RYCN = 0.56863737426006061674;
  var RYCS = 0.51799515156538134803;
  var FXC = 0.85;
  var RXC = 1.17647058823529411764;

  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var th1, c;
    var i;
    c = sin(lp.phi) * (lp.phi < 0 ? CS : CN);
    for (i = NITER; i; --i) {
      lp.phi -= th1 = (lp.phi + sin(lp.phi) - c) / (1 + cos(lp.phi));
      if (fabs(th1) < EPS) break;
    }
    xy.x = FXC * lp.lam * cos(lp.phi *= 0.5);
    xy.y = sin(lp.phi) * (lp.phi < 0 ? FYCS : FYCN);
  }

  function s_inv(xy, lp) {
    var th = xy.y * (xy.y < 0 ? RYCS : RYCN);
    if (fabs(th) > 1) {
      if (fabs(th) > ONETOL) {
        i_error();
      } else {
        th = th > 0 ? M_HALFPI : -M_HALFPI;
      }
    } else {
      th = asin(th);
    }

    lp.lam = RXC * xy.x / cos(th);
    th += th;
    lp.phi = (th + sin(th)) * (xy.y < 0 ? RCS : RCN);
    if (fabs(lp.phi) > 1) {
      if (fabs(lp.phi) > ONETOL) {
        i_error();
      } else {
        lp.phi = lp.phi > 0 ? M_HALFPI : -M_HALFPI;
      }
    } else {
      lp.phi = asin(lp.phi);
    }
  }
}


pj_add(pj_healpix, 'healpix', 'HEALPix', 'Sph., Ellps.');
pj_add(pj_rhealpix, 'rhealpix', 'rHEALPix', 'Sph., Ellps.\nnorth_square= south_square=');

function pj_rhealpix(P) {
  pj_healpix(P, true);
}

function pj_healpix(P, rhealpix) {
  var R1 = [
    [0, -1],
    [1, 0]
  ];
  var R2 = [
    [-1, 0],
    [0, -1]
  ];
  var R3 = [
    [0, 1],
    [-1, 0]
  ];
  var IDENT = [
    [1, 0],
    [0, 1]
  ];
  var rot = [IDENT, R1, R2, R3, R3, R2, R1];
  var EPS = 1e-15;

  var north_square;
  var south_square;
  var qp;
  var apa;
  var vertsJit;

  if (rhealpix) {
    north_square = pj_param(P.params, "inorth_square");
    south_square = pj_param(P.params, "isouth_square");

    /* Check for valid north_square and south_square inputs. */
    if (north_square < 0 || north_square > 3) {
      e_error(-47);
    }
    if (south_square < 0 || south_square > 3) {
      e_error(-47);
    }
    vertsJit = [
      [-M_PI - EPS, M_FORTPI + EPS],
      [-M_PI + north_square * M_HALFPI - EPS, M_FORTPI + EPS],
      [-M_PI + north_square * M_HALFPI - EPS, 3 * M_FORTPI + EPS],
      [-M_PI + (north_square + 1.0) * M_HALFPI + EPS, 3 * M_FORTPI + EPS],
      [-M_PI + (north_square + 1.0) * M_HALFPI + EPS, M_FORTPI + EPS],
      [M_PI + EPS, M_FORTPI + EPS],
      [M_PI + EPS, -M_FORTPI - EPS],
      [-M_PI + (south_square + 1.0) * M_HALFPI + EPS, -M_FORTPI - EPS],
      [-M_PI + (south_square + 1.0) * M_HALFPI + EPS, -3 * M_FORTPI - EPS],
      [-M_PI + south_square * M_HALFPI - EPS, -3 * M_FORTPI - EPS],
      [-M_PI + south_square * M_HALFPI - EPS, -M_FORTPI - EPS],
      [-M_PI - EPS, -M_FORTPI - EPS]
    ];

    if (P.es != 0.0) {
      apa = pj_authset(P.es); /* For auth_lat(). */
      qp = pj_qsfn(1.0, P.e, P.one_es); /* For auth_lat(). */
      P.a = P.a * sqrt(0.5 * qp); /* Set P.a to authalic radius. */
      P.ra = 1.0 / P.a;
      P.fwd = e_rhealpix_forward;
      P.inv = e_rhealpix_inverse;
    } else {
      P.fwd = s_rhealpix_forward;
      P.inv = s_rhealpix_inverse;
    }

  } else { // healpix
    vertsJit = [
      [-M_PI - EPS, M_FORTPI],
      [-3 * M_FORTPI, M_HALFPI + EPS],
      [-M_HALFPI, M_FORTPI + EPS],
      [-M_FORTPI, M_HALFPI + EPS],
      [0.0, M_FORTPI + EPS],
      [M_FORTPI, M_HALFPI + EPS],
      [M_HALFPI, M_FORTPI + EPS],
      [3 * M_FORTPI, M_HALFPI + EPS],
      [M_PI + EPS, M_FORTPI],
      [M_PI + EPS, -M_FORTPI],
      [3 * M_FORTPI, -M_HALFPI - EPS],
      [M_HALFPI, -M_FORTPI - EPS],
      [M_FORTPI, -M_HALFPI - EPS],
      [0.0, -M_FORTPI - EPS],
      [-M_FORTPI, -M_HALFPI - EPS],
      [-M_HALFPI, -M_FORTPI - EPS],
      [-3 * M_FORTPI, -M_HALFPI - EPS],
      [-M_PI - EPS, -M_FORTPI]
    ];

    if (P.es != 0.0) {
      apa = pj_authset(P.es); /* For auth_lat(). */
      qp = pj_qsfn(1.0, P.e, P.one_es); /* For auth_lat(). */
      P.a = P.a * sqrt(0.5 * qp); /* Set P.a to authalic radius. */
      P.ra = 1.0 / P.a;
      P.fwd = e_healpix_forward;
      P.inv = e_healpix_inverse;
    } else {
      P.fwd = s_healpix_forward;
      P.inv = s_healpix_inverse;
    }
  }

  function s_healpix_forward(lp, xy) {
    healpix_sphere(lp, xy);
  }

  function e_healpix_forward(lp, xy) {
    lp.phi = auth_lat(P, lp.phi, 0);
    healpix_sphere(lp, xy);
  }

  function s_healpix_inverse(xy, lp) {
    if (!in_image(xy.x, xy.y)) {
      lp.lam = HUGE_VAL;
      lp.phi = HUGE_VAL;
      pj_ctx_set_errno(-15);
      return;
    }
    healpix_sphere_inverse(xy, lp);
  }

  function e_healpix_inverse(xy, lp) {
    if (!in_image(xy.x, xy.y)) {
      lp.lam = HUGE_VAL;
      lp.phi = HUGE_VAL;
      pj_ctx_set_errno(-15);
      return;
    }
    healpix_sphere_inverse(xy, lp);
    lp.phi = auth_lat(P, lp.phi, 1);
  }

  function s_rhealpix_forward(lp, xy) {
    healpix_sphere(lp, xy);
    combine_caps(xy, north_square, south_square, 0);
  }

  function e_rhealpix_forward(lp, xy) {
    lp.phi = auth_lat(P, lp.phi, 0);
    healpix_sphere(lp, xy);
    return combine_caps(xy, north_square, south_square, 0);
  }

  function s_rhealpix_inverse(xy, lp) {
    if (!in_image(xy.x, xy.y)) {
      lp.lam = HUGE_VAL;
      lp.phi = HUGE_VAL;
      pj_ctx_set_errno(-15);
      return;
    }
    combine_caps(xy, north_square, south_square, 1);
    healpix_sphere_inverse(xy, lp);
  }

  function e_rhealpix_inverse(xy, lp) {
    if (!in_image(xy.x, xy.y)) {
      lp.lam = HUGE_VAL;
      lp.phi = HUGE_VAL;
      pj_ctx_set_errno(-15);
      return;
    }
    combine_caps(xy, north_square, south_square, 1);
    healpix_sphere_inverse(xy, lp);
    lp.phi = auth_lat(P, lp.phi, 1);
  }

  function healpix_sphere(lp, xy) {
    var lam = lp.lam;
    var phi = lp.phi;
    var phi0 = asin(2.0 / 3.0);

    /* equatorial region */
    if (fabs(phi) <= phi0) {
      xy.x = lam;
      xy.y = 3 * M_PI / 8 * sin(phi);
    } else {
      var lamc;
      var sigma = sqrt(3 * (1 - fabs(sin(phi))));
      var cn = floor(2 * lam / M_PI + 2);
      if (cn >= 4) {
        cn = 3;
      }
      lamc = -3 * M_FORTPI + M_HALFPI * cn;
      xy.x = lamc + (lam - lamc) * sigma;
      xy.y = pj_sign(phi) * M_FORTPI * (2 - sigma);
    }
  }

  function healpix_sphere_inverse(xy, lp) {
    var x = xy.x;
    var y = xy.y;
    var y0 = M_FORTPI;

    /* Equatorial region. */
    if (fabs(y) <= y0) {
      lp.lam = x;
      lp.phi = asin(8 * y / (3 * M_PI));
    } else if (fabs(y) < M_HALFPI) {
      var cn = floor(2 * x / M_PI + 2);
      var xc, tau;
      if (cn >= 4) {
        cn = 3;
      }
      xc = -3 * M_FORTPI + M_HALFPI * cn;
      tau = 2.0 - 4 * fabs(y) / M_PI;
      lp.lam = xc + (x - xc) / tau;
      lp.phi = pj_sign(y) * asin(1.0 - pow(tau, 2) / 3.0);
    } else {
      lp.lam = -M_PI;
      lp.phi = pj_sign(y) * M_HALFPI;
    }
  }

  function pj_sign(v) {
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  }

  /**
   * Return the index of the matrix in ROT.
   * @param index ranges from -3 to 3.
   */
  function get_rotate_index(index) {
    switch (index) {
      case 0:
        return 0;
      case 1:
        return 1;
      case 2:
        return 2;
      case 3:
        return 3;
      case -1:
        return 4;
      case -2:
        return 5;
      case -3:
        return 6;
    }
    return 0;
  }

  /**
   * Return true if point (testx, testy) lies in the interior of the polygon
   * determined by the vertices in vert, and return false otherwise.
   * See http://paulbourke.net/geometry/polygonmesh/ for more details.
   * @param nvert the number of vertices in the polygon.
   * @param vert the (x, y)-coordinates of the polygon's vertices
   **/
  function pnpoly(vert, testx, testy) {
    var counter = 0;
    var nvert = vert.length;
    var x1, y1, x2, y2;
    var xinters;
    var i;

    /* Check for boundary cases */
    for (i = 0; i < nvert; i++) {
      if (testx == vert[i][0] && testy == vert[i][1]) {
        return true;
      }
    }

    x1 = vert[0][0];
    y1 = vert[0][1];

    for (i = 1; i < nvert; i++) {
      x2 = vert[i % nvert][0];
      y2 = vert[i % nvert][1];
      if (testy > MIN(y1, y2) &&
        testy <= MAX(y1, y2) &&
        testx <= MAX(x1, x2) &&
        y1 != y2) {
        xinters = (testy - y1) * (x2 - x1) / (y2 - y1) + x1;
        if (x1 == x2 || testx <= xinters)
          counter++;
      }
      x1 = x2;
      y1 = y2;
    }
    return counter % 2 != 0;
  }

  function in_image(x, y) {
    return pnpoly(vertsJit, x, y);
  }

  /**
   * Return the authalic latitude of latitude alpha (if inverse=0) or
   * return the approximate latitude of authalic latitude alpha (if inverse=1).
   * P contains the relevant ellipsoid parameters.
   **/
  function auth_lat(P, alpha, inverse) {
    if (!inverse) {
      /* Authalic latitude. */
      var q = pj_qsfn(sin(alpha), P.e, 1.0 - P.es);
      var ratio = q / qp;

      if (fabs(ratio) > 1) {
        /* Rounding error. */
        ratio = pj_sign(ratio);
      }
      return asin(ratio);
    } else {
      /* Approximation to inverse authalic latitude. */
      return pj_authlat(alpha, apa);
    }
  }

  function vector_add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function vector_sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }

  function dot_product(a, b) {
    var i, j;
    var ret = [0, 0];
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 2; j++) {
        ret[i] += a[i][j] * b[j];
      }
    }
    return ret;
  }

  /**
   * Return the number of the polar cap, the pole point coordinates, and
   * the region that (x, y) lies in.
   * If inverse=0, then assume (x,y) lies in the image of the HEALPix
   * projection of the unit sphere.
   * If inverse=1, then assume (x,y) lies in the image of the
   * (north_square, south_square)-rHEALPix projection of the unit sphere.
   **/
  function get_cap(x, y, north_square, south_square, inverse) {
    var capmap = {};
    var c;
    capmap.x = x;
    capmap.y = y;
    if (!inverse) {
      if (y > M_FORTPI) {
        capmap.region = 'north';
        c = M_HALFPI;
      } else if (y < -M_FORTPI) {
        capmap.region = 'south';
        c = -M_HALFPI;
      } else {
        capmap.region = 'equatorial';
        capmap.cn = 0;
        return capmap;
      }
      /* polar region */
      if (x < -M_HALFPI) {
        capmap.cn = 0;
        capmap.x = (-3 * M_FORTPI);
        capmap.y = c;
      } else if (x >= -M_HALFPI && x < 0) {
        capmap.cn = 1;
        capmap.x = -M_FORTPI;
        capmap.y = c;
      } else if (x >= 0 && x < M_HALFPI) {
        capmap.cn = 2;
        capmap.x = M_FORTPI;
        capmap.y = c;
      } else {
        capmap.cn = 3;
        capmap.x = 3 * M_FORTPI;
        capmap.y = c;
      }
    } else {
      if (y > M_FORTPI) {
        capmap.region = 'north';
        capmap.x = -3 * M_FORTPI + north_square * M_HALFPI;
        capmap.y = M_HALFPI;
        x = x - north_square * M_HALFPI;
      } else if (y < -M_FORTPI) {
        capmap.region = 'south';
        capmap.x = -3 * M_FORTPI + south_square * M_HALFPI;
        capmap.y = -M_HALFPI;
        x = x - south_square * M_HALFPI;
      } else {
        capmap.region = 'equatorial';
        capmap.cn = 0;
        return capmap;
      }
      /* Polar Region, find the HEALPix polar cap number that
         x, y moves to when rHEALPix polar square is disassembled. */
      if (capmap.region == 'north') {
        if (y >= -x - M_FORTPI - EPS && y < x + 5 * M_FORTPI - EPS) {
          capmap.cn = (north_square + 1) % 4;
        } else if (y > -x - M_FORTPI + EPS && y >= x + 5 * M_FORTPI - EPS) {
          capmap.cn = (north_square + 2) % 4;
        } else if (y <= -x - M_FORTPI + EPS && y > x + 5 * M_FORTPI + EPS) {
          capmap.cn = (north_square + 3) % 4;
        } else {
          capmap.cn = north_square;
        }
      } else if (capmap.region == 'south') {
        if (y <= x + M_FORTPI + EPS && y > -x - 5 * M_FORTPI + EPS) {
          capmap.cn = (south_square + 1) % 4;
        } else if (y < x + M_FORTPI - EPS && y <= -x - 5 * M_FORTPI + EPS) {
          capmap.cn = (south_square + 2) % 4;
        } else if (y >= x + M_FORTPI - EPS && y < -x - 5 * M_FORTPI - EPS) {
          capmap.cn = (south_square + 3) % 4;
        } else {
          capmap.cn = south_square;
        }
      }
    }
    return capmap;
  }

  /**
   * Rearrange point (x, y) in the HEALPix projection by
   * combining the polar caps into two polar squares.
   * Put the north polar square in position north_square and
   * the south polar square in position south_square.
   * If inverse=1, then uncombine the polar caps.
   * @param north_square integer between 0 and 3.
   * @param south_square integer between 0 and 3.
   **/
  function combine_caps(xy, north_square, south_square, inverse) {
    var v, c, vector, v_min_c, ret_dot, tmpRot, a;
    var pole = 0;
    var capmap = get_cap(xy.x, xy.y, north_square, south_square, inverse);
    if (capmap.region == 'equatorial') {
      xy.x = capmap.x;
      xy.y = capmap.y;
      return;
    }
    v = [xy.x, xy.y];
    c = [capmap.x, capmap.y];

    if (!inverse) {
      /* Rotate (x, y) about its polar cap tip and then translate it to
         north_square or south_square. */

      if (capmap.region == 'north') {
        pole = north_square;
        tmpRot = rot[get_rotate_index(capmap.cn - pole)];
      } else {
        pole = south_square;
        tmpRot = rot[get_rotate_index(-1 * (capmap.cn - pole))];
      }
    } else {
      /* Inverse function.
       Unrotate (x, y) and then translate it back. */

      /* disassemble */
      if (capmap.region == 'north') {
        pole = north_square;
        tmpRot = rot[get_rotate_index(-1 * (capmap.cn - pole))];
      } else {
        pole = south_square;
        tmpRot = rot[get_rotate_index(capmap.cn - pole)];
      }
    }
    v_min_c = vector_sub(v, c);
    ret_dot = dot_product(tmpRot, v_min_c);
    a = [-3 * M_FORTPI + ((!inverse) ? 0 : capmap.cn) * M_HALFPI, M_HALFPI];
    vector = vector_add(ret_dot, a);
    xy.x = vector[0];
    xy.y = vector[1];
  }
}


pj_add(pj_hill, 'hill', 'Hill Eucyclic', 'PCyl., Sph.');

// Adapted from: https://github.com/d3/d3-geo-projection/blob/master/src/hill.js
// License: https://github.com/d3/d3-geo-projection/blob/master/LICENSE

function pj_hill(P) {
  var K = 1, // TODO: expose as parameter
      L = 1 + K,
      sinBt = sin(1 / L),
      Bt = asin(sinBt),
      A = 2 * sqrt(M_PI / (B = M_PI + 4 * Bt * L)),
      B,
      rho0 = 0.5 * A * (L + sqrt(K * (2 + K))),
      K2 = K * K,
      L2 = L * L,
      EPS = 1e-12;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var t = 1 - sin(lp.phi),
        rho, omega;
    if (t && t < 2) {
      var theta = M_HALFPI - lp.phi,
          i = 25,
          delta, sinTheta, cosTheta, C, Bt_Bt1;
      do {
        sinTheta = sin(theta);
        cosTheta = cos(theta);
        Bt_Bt1 = Bt + atan2(sinTheta, L - cosTheta);
        C = 1 + L2 - 2 * L * cosTheta;
        theta -= delta = (theta - K2 * Bt - L * sinTheta + C * Bt_Bt1 -0.5 * t * B) / (2 * L * sinTheta * Bt_Bt1);
      } while (fabs(delta) > EPS && --i > 0);
      rho = A * sqrt(C);
      omega = lp.lam * Bt_Bt1 / M_PI;
    } else {
      rho = A * (K + t);
      omega = lp.lam * Bt / M_PI;
    }

    xy.x = rho * sin(omega);
    xy.y = rho0 - rho * cos(omega);
  }

  function s_inv(xy, lp) {
    var x = xy.x,
        y = xy.y,
        rho2 = x * x + (y -= rho0) * y,
        cosTheta = (1 + L2 - rho2 / (A * A)) / (2 * L),
        theta = acos(cosTheta),
        sinTheta = sin(theta),
        Bt_Bt1 = Bt + atan2(sinTheta, L - cosTheta);
    lp.lam = asin(x / sqrt(rho2)) * M_PI / Bt_Bt1,
    lp.phi = asin(1 - 2 * (theta - K2 * Bt - L * sinTheta + (1 + L2 - 2 * L * cosTheta) * Bt_Bt1) / B);
  }
}


pj_add(pj_krovak, 'krovak', 'Krovak', 'PCyl., Ellps.');

function pj_krovak(P) {
  var u0, n0, g;
  var alpha, k, n, rho0, ad, czech;
  var EPS = 1e-15;
  var S45 = 0.785398163397448; /* 45 deg */
  var S90 = 1.570796326794896; /* 90 deg */
  var UQ = 1.04216856380474;   /* DU(2, 59, 42, 42.69689) */
  var S0 = 1.37008346281555;   /* Latitude of pseudo standard parallel 78deg 30'00" N */

  /* we want Bessel as fixed ellipsoid */
  P.a = 6377397.155;
  P.e = sqrt(P.es = 0.006674372230614);

  /* if latitude of projection center is not set, use 49d30'N */
  if (!pj_param(P.params, "tlat_0"))
    P.phi0 = 0.863937979737193;

  /* if center long is not set use 42d30'E of Ferro - 17d40' for Ferro */
  /* that will correspond to using longitudes relative to greenwich    */
  /* as input and output, instead of lat/long relative to Ferro */
  if (!pj_param(P.params, "tlon_0"))
          P.lam0 = 0.7417649320975901 - 0.308341501185665;

  /* if scale not set default to 0.9999 */
  if (!pj_param(P.params, "tk"))
          P.k0 = 0.9999;
  czech = 1;
  if (!pj_param(P.params, "tczech"))
    czech = -1;

  /* Set up shared parameters between forward and inverse */
  alpha = sqrt(1 + (P.es * pow(cos(P.phi0), 4)) / (1 - P.es));
  u0 = asin(sin(P.phi0) / alpha);
  g = pow((1 + P.e * sin(P.phi0)) / (1 - P.e * sin(P.phi0)), alpha * P.e / 2);
  k = tan( u0 / 2 + S45) / pow  (tan(P.phi0 / 2 + S45) , alpha) * g;
  n0 = sqrt(1 - P.es) / (1 - P.es * pow(sin(P.phi0), 2));
  n = sin(S0);
  rho0 = P.k0 * n0 / tan(S0);
  ad = S90 - UQ;
  P.inv = e_inv;
  P.fwd = e_fwd;

  function e_fwd(lp, xy) {
    var gfi, u, deltav, s, d, eps, rho;

    gfi = pow ( (1 + P.e * sin(lp.phi)) / (1 - P.e * sin(lp.phi)), alpha * P.e / 2);

    u = 2 * (atan(k * pow( tan(lp.phi / 2 + S45), alpha) / gfi)-S45);
    deltav = -lp.lam * alpha;

    s = asin(cos(ad) * sin(u) + sin(ad) * cos(u) * cos(deltav));
    d = asin(cos(u) * sin(deltav) / cos(s));
    eps = n * d;
    rho = rho0 * pow(tan(S0 / 2 + S45) , n) / pow(tan(s / 2 + S45) , n);
    xy.y = rho * cos(eps);
    xy.x = rho * sin(eps);
    xy.y *= czech;
    xy.x *= czech;
  }

  function e_inv(xy, lp) {
    var u, deltav, s, d, eps, rho, fi1, xy0;
    var ok;
    xy0 = xy.x;
    xy.x = xy.y;
    xy.y = xy0;
    xy.x *= czech;
    xy.y *= czech;

    rho = sqrt(xy.x * xy.x + xy.y * xy.y);
    eps = atan2(xy.y, xy.x);
    d = eps / sin(S0);
    s = 2 * (atan(  pow(rho0 / rho, 1 / n) * tan(S0 / 2 + S45)) - S45);
    u = asin(cos(ad) * sin(s) - sin(ad) * cos(s) * cos(d));
    deltav = asin(cos(s) * sin(d) / cos(u));
    lp.lam = P.lam0 - deltav / alpha;

    /* ITERATION FOR lp.phi */
    fi1 = u;
    ok = 0;
    do {
      lp.phi = 2 * (atan(pow( k, -1 / alpha) * pow( tan(u / 2 + S45), 1 / alpha) *
        pow( (1 + P.e * sin(fi1)) / (1 - P.e * sin(fi1)) , P.e / 2))  - S45);
      if (fabs(fi1 - lp.phi) < EPS) ok=1;
      fi1 = lp.phi;
   } while (ok===0);
   lp.lam -= P.lam0;
  }
}


pj_add(pj_laea, 'laea', 'Lambert Azimuthal Equal Area', 'Azi, Sph&Ell');

function pj_laea(P) {
  var EPS10 = 1e-10,
      NITER = 20,
      CONV = 1e-10,
      N_POLE = 0,
      S_POLE = 1,
      EQUIT = 2,
      OBLIQ = 3;
  var sinb1, cosb1, xmf, ymf, mmf, qp, dd, rq, apa, mode, t, sinphi;

  t = fabs(P.phi0);
  if (fabs(t - M_HALFPI) < EPS10)
      mode = P.phi0 < 0 ? S_POLE : N_POLE;
  else if (fabs(t) < EPS10)
      mode = EQUIT;
  else
      mode = OBLIQ;
  if (P.es) {
      P.e = sqrt(P.es);
      qp = pj_qsfn(1, P.e, P.one_es);
      mmf = 0.5 / (1 - P.es);
      apa = pj_authset(P.es);
      switch (mode) {
        case N_POLE:
        case S_POLE:
          dd = 1;
          break;
        case EQUIT:
          dd = 1 / (rq = sqrt(0.5 * qp));
          xmf = 1;
          ymf = 0.5 * qp;
          break;
        case OBLIQ:
          rq = sqrt(0.5 * qp);
          sinphi = sin(P.phi0);
          sinb1 = pj_qsfn(sinphi, P.e, P.one_es) / qp;
          cosb1 = sqrt(1 - sinb1 * sinb1);
          dd = cos(P.phi0) / (sqrt(1 - P.es * sinphi * sinphi) *
             rq * cosb1);
          ymf = (xmf = rq) / dd;
          xmf *= dd;
          break;
      }
      P.inv = e_inv;
      P.fwd = e_fwd;
  } else {
      if (mode == OBLIQ) {
          sinb1 = sin(P.phi0);
          cosb1 = cos(P.phi0);
      }
      P.inv = s_inv;
      P.fwd = s_fwd;
  }

  function e_fwd(lp, xy) {
    var coslam, sinlam, sinphi, q, sinb=0.0, cosb=0.0, b=0.0;
    coslam = cos(lp.lam);
    sinlam = sin(lp.lam);
    sinphi = sin(lp.phi);
    q = pj_qsfn(sinphi, P.e, P.one_es);

    if (mode == OBLIQ || mode == EQUIT) {
        sinb = q / qp;
        cosb = sqrt(1 - sinb * sinb);
    }

    switch (mode) {
      case OBLIQ:
        b = 1 + sinb1 * sinb + cosb1 * cosb * coslam;
        break;
      case EQUIT:
        b = 1 + cosb * coslam;
        break;
      case N_POLE:
        b = M_HALFPI + lp.phi;
        q = qp - q;
        break;
      case S_POLE:
        b = lp.phi - M_HALFPI;
        q = qp + q;
        break;
    }
    if (fabs(b) < EPS10) f_error();

    switch (mode) {
      case OBLIQ:
      case EQUIT:
        if (mode == OBLIQ) {
          b = sqrt(2 / b);
          xy.y = ymf * b * (cosb1 * sinb - sinb1 * cosb * coslam);
        } else {
          b = sqrt(2 / (1 + cosb * coslam));
          xy.y = b * sinb * ymf;
        }
        xy.x = xmf * b * cosb * sinlam;
        break;
      case N_POLE:
      case S_POLE:
        if (q >= 0) {
            b = sqrt(q);
            xy.x = b * sinlam;
            xy.y = coslam * (mode == S_POLE ? b : -b);
        } else
            xy.x = xy.y = 0;
        break;
    }
  }

  function e_inv(xy, lp) {
    var cCe, sCe, q, rho, ab=0.0;

    switch (mode) {
      case EQUIT:
      case OBLIQ:
        xy.x /= dd;
        xy.y *=  dd;
        rho = hypot(xy.x, xy.y);
        if (rho < EPS10) {
            lp.lam = 0;
            lp.phi = P.phi0;
            return lp;
        }
        sCe = 2 * asin(0.5 * rho / rq);
        cCe = cos(sCe);
        sCe = sin(sCe);
        xy.x *= sCe;
        if (mode == OBLIQ) {
            ab = cCe * sinb1 + xy.y * sCe * cosb1 / rho;
            xy.y = rho * cosb1 * cCe - xy.y * sinb1 * sCe;
        } else {
            ab = xy.y * sCe / rho;
            xy.y = rho * cCe;
        }
        break;
      case N_POLE:
        xy.y = -xy.y;
        /* falls through */
      case S_POLE:
        q = (xy.x * xy.x + xy.y * xy.y);
        if (!q) {
            lp.lam = 0;
            lp.phi = P.phi0;
            return (lp);
        }
        ab = 1 - q / qp;
        if (mode == S_POLE)
            ab = - ab;
        break;
    }
    lp.lam = atan2(xy.x, xy.y);
    lp.phi = pj_authlat(asin(ab), apa);
    return lp;
  }

  function s_fwd(lp, xy) {
    var coslam, cosphi, sinphi;
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);
    switch (mode) {
      case EQUIT:
      case OBLIQ:
        if (mode == EQUIT) {
          xy.y = 1 + cosphi * coslam;
        } else {
          xy.y = 1 + sinb1 * sinphi + cosb1 * cosphi * coslam;
        }
        if (xy.y <= EPS10) f_error();
        xy.y = sqrt(2 / xy.y);
        xy.x = xy.y * cosphi * sin(lp.lam);
        xy.y *= mode == EQUIT ? sinphi :
           cosb1 * sinphi - sinb1 * cosphi * coslam;
        break;
      case N_POLE:
        coslam = -coslam;
        /* falls through */
      case S_POLE:
        if (fabs(lp.phi + P.phi0) < EPS10) f_error();
        xy.y = M_FORTPI - lp.phi * 0.5;
        xy.y = 2 * (mode == S_POLE ? cos(xy.y) : sin(xy.y));
        xy.x = xy.y * sin(lp.lam);
        xy.y *= coslam;
        break;
    }
  }

  function s_inv(xy, lp) {
    var cosz=0.0, rh, sinz=0.0;

    rh = hypot(xy.x, xy.y);
    if ((lp.phi = rh * 0.5 ) > 1) i_error();
    lp.phi = 2 * asin(lp.phi);
    if (mode == OBLIQ || mode == EQUIT) {
        sinz = sin(lp.phi);
        cosz = cos(lp.phi);
    }
    switch (mode) {
      case EQUIT:
        lp.phi = fabs(rh) <= EPS10 ? 0 : asin(xy.y * sinz / rh);
        xy.x *= sinz;
        xy.y = cosz * rh;
        break;
      case OBLIQ:
        lp.phi = fabs(rh) <= EPS10 ? P.phi0 :
           asin(cosz * sinb1 + xy.y * sinz * cosb1 / rh);
        xy.x *= sinz * cosb1;
        xy.y = (cosz - sin(lp.phi) * sinb1) * rh;
        break;
      case N_POLE:
        xy.y = -xy.y;
        lp.phi = M_HALFPI - lp.phi;
        break;
      case S_POLE:
        lp.phi -= M_HALFPI;
        break;
    }
    lp.lam = (xy.y == 0 && (mode == EQUIT || mode == OBLIQ)) ?
        0 : atan2(xy.x, xy.y);
  }
}


pj_add(pj_lonlat, 'lonlat', 'Lat/long (Geodetic)', '');
pj_add(pj_lonlat, 'longlat', 'Lat/long (Geodetic alias)', '');
pj_add(pj_lonlat, 'latlon', 'Lat/long (Geodetic alias)', '');
pj_add(pj_lonlat, 'latlong', 'Lat/long (Geodetic alias)', '');

function pj_lonlat(P) {
  P.x0 = 0;
  P.y0 = 0;
  P.is_latlong = true;

  P.fwd = function(lp, xy) {
    xy.x = lp.lam / P.a;
    xy.y = lp.phi / P.a;
  };

  P.inv = function(xy, lp) {
    lp.lam = xy.x * P.a;
    lp.phi = xy.y * P.a;
  };
}



function pj_tsfn(phi, sinphi, e) {
	sinphi *= e;
  // Proj.4 returns HUGE_VAL on div0; this returns +/- Infinity; effect should be same
	return (tan(0.5 * (M_HALFPI - phi)) /
	  pow((1 - sinphi) / (1 + sinphi), 0.5 * e));
}


pj_add(pj_lcc, 'lcc', 'Lambert Conformal Conic', 'Conic, Sph&Ell\nlat_1= and lat_2= or lat_0=');

function pj_lcc(P) {
  var EPS10 = 1e-10;
  var cosphi, sinphi, secant;
  var phi1, phi2, n, rho0, c, ellips, ml1, m1;

  P.inv = e_inv;
  P.fwd = e_fwd;

  phi1 = pj_param(P.params, "rlat_1");
  if (pj_param(P.params, "tlat_2"))
    phi2 = pj_param(P.params, "rlat_2");
  else {
    phi2 = phi1;
    if (!pj_param(P.params, "tlat_0"))
      P.phi0 = phi1;
  }
  if (fabs(phi1 + phi2) < EPS10) e_error(-21);
  n = sinphi = sin(phi1);
  cosphi = cos(phi1);
  secant = fabs(phi1 - phi2) >= EPS10;
  if ((ellips = (P.es != 0))) {
    P.e = sqrt(P.es);
    m1 = pj_msfn(sinphi, cosphi, P.es);
    ml1 = pj_tsfn(phi1, sinphi, P.e);
    if (secant) { /* secant cone */
      sinphi = sin(phi2);
      n = log(m1 / pj_msfn(sinphi, cos(phi2), P.es));
      n /= log(ml1 / pj_tsfn(phi2, sinphi, P.e));
    }
    c = (rho0 = m1 * pow(ml1, -n) / n);
    rho0 *= (fabs(fabs(P.phi0) - M_HALFPI) < EPS10) ? 0 :
        pow(pj_tsfn(P.phi0, sin(P.phi0), P.e), n);
  } else {
    if (secant)
      n = log(cosphi / cos(phi2)) /
          log(tan(M_FORTPI + 0.5 * phi2) /
          tan(M_FORTPI + 0.5 * phi1));
    c = cosphi * pow(tan(M_FORTPI + 0.5 * phi1), n) / n;
    rho0 = (fabs(fabs(P.phi0) - M_HALFPI) < EPS10) ? 0 :
        c * pow(tan(M_FORTPI + 0.5 * P.phi0), -n);
  }

  function e_fwd(lp, xy) {
    var lam = lp.lam;
    var rho;
    if (fabs(fabs(lp.phi) - M_HALFPI) < EPS10) {
      if ((lp.phi * n) <= 0) f_error();
      rho = 0;
    } else {
      rho = c * (ellips ? pow(pj_tsfn(lp.phi, sin(lp.phi),
            P.e), n) : pow(tan(M_FORTPI + 0.5 * lp.phi), -n));
    }
    lam *= n;
    xy.x = P.k0 * (rho * sin(lam));
    xy.y = P.k0 * (rho0 - rho * cos(lam));
  }

  function e_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var rho;
    x /= P.k0;
    y /= P.k0;

    y = rho0 - y;
    rho = hypot(x, y);
    if (rho != 0) {
      if (n < 0) {
        rho = -rho;
        x = -x;
        y = -y;
      }
      if (ellips) {
        lp.phi = pj_phi2(pow(rho / c, 1/n), P.e);
        if (lp.phi == HUGE_VAL) i_error();
      } else
        lp.phi = 2 * atan(pow(c / rho, 1/n)) - M_HALFPI;
      lp.lam = atan2(x, y) / n;
    } else {
      lp.lam = 0;
      lp.phi = n > 0 ? M_HALFPI : -M_HALFPI;
    }
  }

}


pj_add(pj_loxim, 'loxim', 'Loximuthal', 'PCyl Sph');

function pj_loxim(P) {
  var EPS = 1e-8;
  var phi1, cosphi1, tanphi1;
      phi1 = pj_param(P.params, "rlat_1");
      cosphi1 = cos(phi1);
      tanphi1 = tan(M_FORTPI + 0.5 * phi1);
  if (cosphi1 < EPS) e_error(-22);
  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    xy.y = lp.phi - phi1;
    if (fabs(xy.y) < EPS)
      xy.x = lp.lam * cosphi1;
    else {
      xy.x = M_FORTPI + 0.5 * lp.phi;
      if (fabs(xy.x) < EPS || fabs(fabs(xy.x) - M_HALFPI) < EPS)
        xy.x = 0;
      else
        xy.x = lp.lam * xy.y / log(tan(xy.x) / tanphi1);
    }
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y + phi1;
    if (fabs(xy.y) < EPS) {
      lp.lam = xy.x / cosphi1;
    } else {
      lp.lam = M_FORTPI + 0.5 * lp.phi;
      if (fabs(lp.lam) < EPS || fabs(fabs(lp.lam) - M_HALFPI) < EPS)
        lp.lam = 0;
      else
        lp.lam = xy.x * log(tan(lp.lam) / tanphi1) / xy.y;
    }
  }
}


pj_add(pj_mbt_fpp, 'mbt_fpp', 'McBride-Thomas Flat-Polar Parabolic', 'Cyl., Sph.');

function pj_mbt_fpp(P) {
  var CS = 0.95257934441568037152,
      FXC = 0.92582009977255146156,
      FYC = 3.40168025708304504493,
      C23 = 2 / 3,
      C13 = 1 / 3,
      ONEEPS = 1.0000001;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    lp.phi = asin(CS * sin(lp.phi));
    xy.x = FXC * lp.lam * (2 * cos(C23 * lp.phi) - 1);
    xy.y = FYC * sin(C13 * lp.phi);
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / FYC;
    if (fabs(lp.phi) >= 1) {
      if (fabs(lp.phi) > ONEEPS)
        i_error();
      else
        lp.phi = (lp.phi < 0) ? -M_HALFPI : M_HALFPI;
    } else
      lp.phi = asin(lp.phi);

    lp.lam = xy.x / (FXC * (2 * cos(C23 * (lp.phi *= 3)) - 1));
    if (fabs(lp.phi = sin(lp.phi) / CS) >= 1) {
      if (fabs(lp.phi) > ONEEPS)
        i_error();
      else
        lp.phi = (lp.phi < 0) ? -M_HALFPI : M_HALFPI;
    } else
      lp.phi = asin(lp.phi);
  }
}


pj_add(pj_mbt_fpq, 'mbt_fpq', 'McBryde-Thomas Flat-Polar Quartic', 'Cyl., Sph.');

function pj_mbt_fpq(P) {
  var NITER = 20,
      EPS = 1e-7,
      ONETOL = 1.000001,
      C = 1.70710678118654752440,
      RC = 0.58578643762690495119,
      FYC = 1.87475828462269495505,
      RYC = 0.53340209679417701685,
      FXC = 0.31245971410378249250,
      RXC = 3.20041258076506210122;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var th1, c, i;
    c = C * sin(lp.phi);
    for (i = NITER; i; --i) {
      lp.phi -= th1 = (sin(0.5 * lp.phi) + sin(lp.phi) - c) /
        (0.5 * cos(0.5 * lp.phi) + cos(lp.phi));
      if (fabs(th1) < EPS) break;
    }
    xy.x = FXC * lp.lam * (1.0 + 2 * cos(lp.phi) / cos(0.5 * lp.phi));
    xy.y = FYC * sin(0.5 * lp.phi);
  }

  function s_inv(xy, lp) {
    var t;
    lp.phi = RYC * xy.y;
    if (fabs(lp.phi) > 1) {
      if (fabs(lp.phi) > ONETOL) i_error();
      else if (lp.phi < 0) {
        t = -1;
        lp.phi = -M_PI;
      } else {
        t = 1;
        lp.phi = M_PI;
      }
    } else
      lp.phi = 2 * asin(t = lp.phi);
    lp.lam = RXC * xy.x / (1 + 2 * cos(lp.phi) / cos(0.5 * lp.phi));
    lp.phi = RC * (t + sin(lp.phi));
    if (fabs(lp.phi) > 1)
      if (fabs(lp.phi) > ONETOL) i_error();
      else
        lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
    else
      lp.phi = asin(lp.phi);
  }
}


pj_add(pj_mbt_fps, 'mbt_fps', 'McBryde-Thomas Flat-Pole Sine (No. 2)', 'Cyl., Sph.');

function pj_mbt_fps(P) {
  var MAX_ITER = 10,
      LOOP_TOL = 1e-7,
      C1 = 0.45503,
      C2 = 1.36509,
      C3 = 1.41546,
      C_x = 0.22248,
      C_y = 1.44492,
      C1_2 = 1 / 3;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var k, V, t, i;
    k = C3 * sin(lp.phi);
    for (i = MAX_ITER; i; --i) {
      t = lp.phi / C2;
      lp.phi -= V = (C1 * sin(t) + sin(lp.phi) - k) /
        (C1_2 * cos(t) + cos(lp.phi));
      if (fabs(V) < LOOP_TOL)
        break;
    }
    t = lp.phi / C2;
    xy.x = C_x * lp.lam * (1 + 3 * cos(lp.phi) / cos(t));
    xy.y = C_y * sin(t);
  }

  function s_inv(xy, lp) {
    var t;
    lp.phi = C2 * (t = aasin(xy.y / C_y));
    lp.lam = xy.x / (C_x * (1 + 3 * cos(lp.phi) / cos(t)));
    lp.phi = aasin((C1 * sin(t) + sin(lp.phi)) / C3);
  }
}


function pj_phi2(ts, e) {
  var N_ITER = 15,
      TOL = 1e-10,
      eccnth = 0.5 * e,
      Phi = M_HALFPI - 2 * atan(ts),
      i = N_ITER,
      con, dphi;

  do {
    con = e * sin(Phi);
    dphi = M_HALFPI - 2 * atan(ts * pow((1 - con) /
       (1 + con), eccnth)) - Phi;
    Phi += dphi;
  } while (fabs(dphi) > TOL && --i);
  if (i <= 0) {
    pj_ctx_set_errno(-18);
  }
  return Phi;
}


pj_add(pj_merc, 'merc', 'Mercator', 'Cyl, Sph&Ell\nlat_ts=');
pj_add(pj_webmerc, 'webmerc', 'Web Mercator / Pseudo Mercator', 'Cyl, Ell');

function pj_merc(P) {
  var EPS10 = 1e-10;
  var phits = 0;
  var is_phits = pj_param(P.params, 'tlat_ts');

  if (is_phits) {
    phits = pj_param(P.params, 'rlat_ts');
    if (phits >= M_HALFPI) {
      e_error(-24);
    }
  }

  if (P.es) { // ellipsoid
    if (is_phits) {
      P.k0 = pj_msfn(sin(phits), cos(phits), P.es);
    }
    P.inv = e_inv;
    P.fwd = e_fwd;
  } else {
    P.inv = s_inv;
    P.fwd = s_fwd;
  }

  function e_fwd(lp, xy) {
    if (fabs(fabs(lp.phi) - M_HALFPI) <= EPS10) {
      f_error();
    }
    xy.x = P.k0 * lp.lam;
    xy.y = -P.k0 * log(pj_tsfn(lp.phi, sin(lp.phi), P.e));
  }

  function e_inv(xy, lp) {
    lp.phi = pj_phi2(exp(-xy.y / P.k0), P.e);
    if (lp.phi === HUGE_VAL) {
      i_error();
    }
    lp.lam = xy.x / P.k0;
  }

  function s_fwd(lp, xy) {
    if (fabs(fabs(lp.phi) - M_HALFPI) <= EPS10) {
      f_error();
    }
    xy.x = P.k0 * lp.lam;
    xy.y = P.k0 * log(tan(M_FORTPI + 0.5 * lp.phi));
  }

  function s_inv(xy, lp) {
    lp.phi = M_HALFPI - 2 * atan(exp(-xy.y / P.k0));
    lp.lam = xy.x / P.k0;
  }
}

function pj_webmerc(P) {
  P.k0 = 1;
  P.inv = s_inv;
  P.fwd = s_fwd;

  function s_fwd(lp, xy) {
    if (fabs(fabs(lp.phi) - M_HALFPI) <= EPS10) {
      f_error();
    }
    xy.x = P.k0 * lp.lam;
    xy.y = P.k0 * log(tan(M_FORTPI + 0.5 * lp.phi));
  }

  function s_inv(xy, lp) {
    lp.phi = M_HALFPI - 2 * atan(exp(-xy.y / P.k0));
    lp.lam = xy.x / P.k0;
  }
}



pj_add(pj_mill, 'mill', 'Miller Cylindrical', 'Cyl, Sph');

function pj_mill(P) {

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    xy.x = lp.lam;
    xy.y = log(tan(M_FORTPI + lp.phi * 0.4)) * 1.25;
  }

  function s_inv(xy, lp) {
    lp.lam = xy.x;
    lp.phi = 2.5 * (atan(exp(0.8 * xy.y)) - M_FORTPI);
  }
}


/* evaluate complex polynomial */

/* note: coefficients are always from C_1 to C_n
**  i.e. C_0 == (0., 0)
**  n should always be >= 1 though no checks are made
*/
// z: Complex number (object with r and i properties)
// C: Array of complex numbers
// returns: complex number
function pj_zpoly1(z, C) {
  var t, r, i;
  var n = C.length - 1;
  r = C[n][0];
  i = C[n][1];
  while (--n >= 0) {
    t = r;
    r = C[n][0] + z.r * t - z.i * i;
    i = C[n][1] + z.r * i + z.i * t;
  }
  return {
    r: z.r * r - z.i * i,
    i: z.r * i + z.i * r
  };
}

/* evaluate complex polynomial and derivative */
function pj_zpolyd1(z, C, der) {
  var ai, ar, bi, br, t;
  var first = true;
  var n = C.length - 1;
  ar = br = C[n][0];
  ai = bi = C[n][1];
  while (--n >= 0) {
    if (first) {
      first = false;
    } else {
      br = ar + z.r * (t = br) - z.i * bi;
      bi = ai + z.r * bi + z.i * t;
    }
    ar = C[n][0] + z.r * (t = ar) - z.i * ai;
    ai = C[n][1] + z.r * ai + z.i * t;
  }
  der.r = ar + z.r * br - z.i * bi;
  der.i = ai + z.r * bi + z.i * br;
  return {
    r: z.r * ar - z.i * ai,
    i: z.r * ai + z.i * ar
  };
}


pj_add(pj_mil_os, 'mil_os', 'Miller Oblated Stereographic', 'Azi(mod)');
pj_add(pj_lee_os, 'lee_os', 'Lee Oblated Stereographic', 'Azi(mod)');
pj_add(pj_gs48, 'gs48', 'Mod Stereographic of 48 U.S.', 'Azi(mod)');
pj_add(pj_alsk, 'alsk', 'Mod Stereographic of Alaska', 'Azi(mod)');
pj_add(pj_gs50, 'gs50', 'Mod Stereographic of 50 U.S.', 'Azi(mod)');

function pj_mil_os(P) {
  var AB = [
    [0.924500, 0],
    [0,        0],
    [0.019430, 0]
  ];
  P.lam0 = DEG_TO_RAD * 20;
  P.phi0 = DEG_TO_RAD * 18;
  P.es = 0;
  pj_mod_ster(P, AB);
}

function pj_lee_os(P) {
  var AB = [
    [0.721316,    0],
    [0,           0],
    [-0.0088162, -0.00617325]
  ];
  P.lam0 = DEG_TO_RAD * -165;
  P.phi0 = DEG_TO_RAD * -10;
  P.es = 0;
  pj_mod_ster(P, AB);
}

function pj_gs48(P) {
  var AB = [
    [0.98879,   0],
    [0,         0],
    [-0.050909, 0],
    [0,         0],
    [0.075528,  0]
  ];
  P.lam0 = DEG_TO_RAD * -96;
  P.phi0 = DEG_TO_RAD * 39;
  P.es = 0;
  P.a = 6370997;
  pj_mod_ster(P, AB);
}

function pj_alsk(P) {
  var ABe = [ /* Alaska ellipsoid */
    [ 0.9945303, 0],
    [ 0.0052083, -0.0027404],
    [ 0.0072721,  0.0048181],
    [-0.0151089, -0.1932526],
    [ 0.0642675, -0.1381226],
    [ 0.3582802, -0.2884586],
  ];
  var ABs = [ /* Alaska sphere */
    [ 0.9972523,  0],
    [ 0.0052513, -0.0041175],
    [ 0.0074606,  0.0048125],
    [-0.0153783, -0.1968253],
    [ 0.0636871, -0.1408027],
    [ 0.3660976, -0.2937382]
  ];
  var AB;
  P.lam0 = DEG_TO_RAD * -152;
  P.phi0 = DEG_TO_RAD * 64;
  if (P.es != 0.0) { /* fixed ellipsoid/sphere */
    AB = ABe;
    P.a = 6378206.4;
    P.e = sqrt(P.es = 0.00676866);
  } else {
    AB = ABs;
    P.a = 6370997;
  }
  pj_mod_ster(P, AB);
}

function pj_gs50(P) {
  var ABe = [
    [ 0.9827497,  0],
    [ 0.0210669,  0.0053804],
    [-0.1031415, -0.0571664],
    [-0.0323337, -0.0322847],
    [ 0.0502303,  0.1211983],
    [ 0.0251805,  0.0895678],
    [-0.0012315, -0.1416121],
    [ 0.0072202, -0.1317091],
    [-0.0194029,  0.0759677],
    [-0.0210072,  0.0834037]
  ];
  var ABs = [
    [ 0.9842990,  0],
    [ 0.0211642,  0.0037608],
    [-0.1036018, -0.0575102],
    [-0.0329095, -0.0320119],
    [ 0.0499471,  0.1223335],
    [ 0.0260460,  0.0899805],
    [ 0.0007388, -0.1435792],
    [ 0.0075848, -0.1334108],
    [-0.0216473,  0.0776645],
    [-0.0225161,  0.0853673]
  ];
  var AB;
  P.lam0 = DEG_TO_RAD * -120;
  P.phi0 = DEG_TO_RAD * 45;
  if (P.es != 0.0) { /* fixed ellipsoid/sphere */
    AB = ABe;
    P.a = 6378206.4;
    P.e = sqrt(P.es = 0.00676866);
  } else {
    AB = ABs;
    P.a = 6370997;
  }
  pj_mod_ster(P, AB);
}

function pj_mod_ster(P, zcoeff) {
  var EPSLN = 1e-12;
  var esphi, chio;
  var cchio, schio;
  if (P.es != 0.0) {
    esphi = P.e * sin(P.phi0);
    chio = 2 * atan(tan((M_HALFPI + P.phi0) * 0.5) *
        pow((1 - esphi) / (1 + esphi), P.e * 0.5)) - M_HALFPI;
  } else
    chio = P.phi0;
  schio = sin(chio);
  cchio = cos(chio);
  P.inv = e_inv;
  P.fwd = e_fwd;

  function e_fwd(lp, xy) {
    var sinlon, coslon, esphi, chi, schi, cchi, s;
    var p = {};

    sinlon = sin(lp.lam);
    coslon = cos(lp.lam);
    esphi = P.e * sin(lp.phi);
    chi = 2 * atan(tan((M_HALFPI + lp.phi) * 0.5) *
        pow((1 - esphi) / (1 + esphi), P.e * 0.5)) - M_HALFPI;
    schi = sin(chi);
    cchi = cos(chi);
    s = 2 / (1 + schio * schi + cchio * cchi * coslon);
    p.r = s * cchi * sinlon;
    p.i = s * (cchio * schi - schio * cchi * coslon);
    p = pj_zpoly1(p, zcoeff);
    xy.x = p.r;
    xy.y = p.i;
  }

  function e_inv(xy, lp) {
    var nn;
    var p = {}, fxy, fpxy = {}, dp = {}; // complex numbers
    var den, rh = 0.0, z, sinz = 0.0, cosz = 0.0, chi, phi = 0.0, esphi;
    var dphi;

    p.r = xy.x;
    p.i = xy.y;
    for (nn = 20; nn ;--nn) {
      fxy = pj_zpolyd1(p, zcoeff, fpxy);
      fxy.r -= xy.x;
      fxy.i -= xy.y;
      den = fpxy.r * fpxy.r + fpxy.i * fpxy.i;
      dp.r = -(fxy.r * fpxy.r + fxy.i * fpxy.i) / den;
      dp.i = -(fxy.i * fpxy.r - fxy.r * fpxy.i) / den;
      p.r += dp.r;
      p.i += dp.i;
      if ((fabs(dp.r) + fabs(dp.i)) <= EPSLN)
          break;
    }
    if (nn) {
      rh = hypot(p.r, p.i);
      z = 2 * atan(0.5 * rh);
      sinz = sin(z);
      cosz = cos(z);
      lp.lam = P.lam0;
      if (fabs(rh) <= EPSLN) {
        /* if we end up here input coordinates were (0,0).
         * pj_inv() adds P.lam0 to lp.lam, this way we are
         * sure to get the correct offset */
        lp.lam = 0.0;
        lp.phi = P.phi0;
        return;
      }
      chi = aasin(cosz * schio + p.i * sinz * cchio / rh);
      phi = chi;
      for (nn = 20; nn ;--nn) {
        esphi = P.e * sin(phi);
        dphi = 2 * atan(tan((M_HALFPI + chi) * 0.5) *
            pow((1 + esphi) / (1 - esphi), P.e * 0.5)) - M_HALFPI - phi;
        phi += dphi;
        if (fabs(dphi) <= EPSLN)
          break;
      }
    }
    if (nn) {
      lp.phi = phi;
      lp.lam = atan2(p.r * sinz, rh * cchio * cosz - p.i * schio * sinz);
    } else
      lp.lam = lp.phi = HUGE_VAL;
  }
}


pj_add(pj_natearth, 'natearth', 'Natural Earth', 'PCyl., Sph.');
pj_add(pj_natearth2, 'natearth2', 'Natural Earth 2', 'PCyl., Sph.');

function pj_natearth(P) {
  var A0 = 0.8707,
  A1 = -0.131979,
  A2 = -0.013791,
  A3 = 0.003971,
  A4 = -0.001529,
  B0 = 1.007226,
  B1 = 0.015085,
  B2 = -0.044475,
  B3 = 0.028874,
  B4 = -0.005916,
  C0 = B0,
  C1 = (3 * B1),
  C2 = (7 * B2),
  C3 = (9 * B3),
  C4 = (11 * B4),
  EPS = 1e-11,
  MAX_Y = (0.8707 * 0.52 * M_PI);

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var phi2, phi4;
    phi2 = lp.phi * lp.phi;
    phi4 = phi2 * phi2;
    xy.x = lp.lam * (A0 + phi2 * (A1 + phi2 * (A2 + phi4 * phi2 * (A3 + phi2 * A4))));
    xy.y = lp.phi * (B0 + phi2 * (B1 + phi4 * (B2 + B3 * phi2 + B4 * phi4)));
  }

  function s_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var yc, tol, y2, y4, f, fder;
    if (y > MAX_Y) {
      y = MAX_Y;
    } else if (y < -MAX_Y) {
      y = -MAX_Y;
    }

    yc = y;
      for (;;) { /* Newton-Raphson */
      y2 = yc * yc;
      y4 = y2 * y2;
      f = (yc * (B0 + y2 * (B1 + y4 * (B2 + B3 * y2 + B4 * y4)))) - y;
      fder = C0 + y2 * (C1 + y4 * (C2 + C3 * y2 + C4 * y4));
      yc -= tol = f / fder;
      if (fabs(tol) < EPS) {
          break;
      }
    }
    lp.phi = yc;
    y2 = yc * yc;
    lp.lam = x / (A0 + y2 * (A1 + y2 * (A2 + y2 * y2 * y2 * (A3 + y2 * A4))));
  }
}

function pj_natearth2(P) {
  var A0 = 0.84719,
      A1 = -0.13063,
      A2 = -0.04515,
      A3 = 0.05494,
      A4 = -0.02326,
      A5 = 0.00331,
      B0 = 1.01183,
      B1 = -0.02625,
      B2 = 0.01926,
      B3 = -0.00396,
      C0 = B0,
      C1 = (9 * B1),
      C2 = (11 * B2),
      C3 = (13 * B3),
      EPS = 1e-11,
      MAX_Y = (0.84719 * 0.535117535153096 * M_PI);

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var phi2, phi4, phi6;
    phi2 = lp.phi * lp.phi;
    phi4 = phi2 * phi2;
    phi6 = phi2 * phi4;
    xy.x = lp.lam * (A0 + A1 * phi2 + phi6 * phi6 * (A2 + A3 * phi2 + A4 * phi4 + A5 * phi6));
    xy.y = lp.phi * (B0 + phi4 * phi4 * (B1 + B2 * phi2 + B3 * phi4));
  }

  function s_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var yc, tol, y2, y4, y6, f, fder;
    if (y > MAX_Y) {
      y = MAX_Y;
    } else if (y < -MAX_Y) {
      y = -MAX_Y;
    }
    yc = y;
    for (;;) { /* Newton-Raphson */
      y2 = yc * yc;
      y4 = y2 * y2;
      f = (yc * (B0 + y4 * y4 * (B1 + B2 * y2 + B3 * y4))) - y;
      fder = C0 + y4 * y4 * (C1 + C2 * y2 + C3 * y4);
      yc -= tol = f / fder;
      if (fabs(tol) < EPS) {
        break;
      }
    }
    lp.phi = yc;
    y2 = yc * yc;
    y4 = y2 * y2;
    y6 = y2 * y4;
    lp.lam = x / (A0 + A1 * y2 + y6 * y6 * (A2 + A3 * y2 + A4 * y4 + A5 * y6));
  }
}


pj_add(pj_nell, 'nell', 'Nell', 'PCyl., Sph.');

function pj_nell(P) {
  var MAX_ITER = 10;
  var LOOP_TOL = 1e-7;
  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var k, V, i;
    k = 2 * sin(lp.phi);
    V = lp.phi * lp.phi;
    lp.phi *= 1.00371 + V * (-0.0935382 + V * -0.011412);
    for (i = MAX_ITER; i ; --i) {
        lp.phi -= V = (lp.phi + sin(lp.phi) - k) /
            (1 + cos(lp.phi));
        if (fabs(V) < LOOP_TOL)
            break;
    }
    xy.x = 0.5 * lp.lam * (1 + cos(lp.phi));
    xy.y = lp.phi;
  }

  function s_inv(xy, lp) {
    lp.lam = 2 * xy.x / (1 + cos(xy.y));
    lp.phi = aasin(0.5 * (xy.y + sin(xy.y)));
  }
}


pj_add(pj_nell_h, 'nell_h', 'Nell-Hammer', 'PCyl., Sph.');

function pj_nell_h(P) {
var NITER = 9,
    EPS = 1e-7;
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = 0.5 * lp.lam * (1 + cos(lp.phi));
    xy.y = 2.0 * (lp.phi - tan(0.5 *lp.phi));
  }

  function s_inv(xy, lp) {
    var V, c, p, i;
    p = 0.5 * xy.y;
    for (i = NITER; i>0; --i) {
      c = cos(0.5 * lp.phi);
      lp.phi -= V = (lp.phi - tan(lp.phi/2) - p)/(1 - 0.5/(c*c));
      if (fabs(V) < EPS)
        break;
    }
    if (!i) {
      lp.phi = p < 0 ? -M_HALFPI : M_HALFPI;
      lp.lam = 2 * xy.x;
    } else
      lp.lam = 2 * xy.x / (1 + cos(lp.phi));
  }
}


pj_add(pj_nicol, 'nicol', 'Nicolosi Globular', 'Misc Sph, no inv');

function pj_nicol(P) {
  P.es = 0;
  P.fwd = s_fwd;

  function s_fwd(lp, xy) {
    var EPS = 1e-10;
    if (fabs(lp.lam) < EPS) {
      xy.x = 0;
      xy.y = lp.phi;
    } else if (fabs(lp.phi) < EPS) {
      xy.x = lp.lam;
      xy.y = 0;
    } else if (fabs(fabs(lp.lam) - M_HALFPI) < EPS) {
      xy.x = lp.lam * cos(lp.phi);
      xy.y = M_HALFPI * sin(lp.phi);
    } else if (fabs(fabs(lp.phi) - M_HALFPI) < EPS) {
      xy.x = 0;
      xy.y = lp.phi;
    } else {
      var tb = M_HALFPI / lp.lam - lp.lam / M_HALFPI;
      var c = lp.phi / M_HALFPI;
      var sp = sin(lp.phi);
      var d = (1 - c * c) / (sp - c);
      var r2 = tb / d;
      r2 *= r2;
      var m = (tb * sp / d - 0.5 * tb) / (1 + r2);
      var n = (sp / r2 + 0.5 * d) / (1 + 1 / r2);
      xy.x = cos(lp.phi);
      xy.x = sqrt(m * m + xy.x * xy.x / (1 + r2));
      xy.x = M_HALFPI * (m + (lp.lam < 0. ? -xy.x : xy.x));
      xy.y = sqrt(n * n - (sp * sp / r2 + d * sp - 1) / (1 + 1 / r2));
      xy.y = M_HALFPI * (n + (lp.phi < 0. ? xy.y : -xy.y));
    }
  }
}


pj_add(pj_nsper, 'nsper', 'Near-sided perspective', 'Azi, Sph\nh=');
pj_add(pj_tpers, 'tpers', 'Tilted perspective', 'Azi, Sph\ntilt= azi= h=');

function pj_nsper(P) {
  pj_tpers_init(P, pj_param(P.params, "dh"));
}

function pj_tpers(P) {
  var tilt = pj_param(P.params, 'dtilt') * DEG_TO_RAD;
  var azi = pj_param(P.params, 'dazi') * DEG_TO_RAD;
  var height = pj_param(P.params, "dh");
  pj_tpers_init(P, height, tilt, azi);
}

function pj_tpers_init(P, height, tiltAngle, azimuth) {
  var N_POLE = 0,
      S_POLE = 1,
      EIT = 2,
      OBLI= 3,
      tilt = !isNaN(tiltAngle) && !isNaN(azimuth),
      mode, sinph0, cosph0, p, rp, pn1, pfact, h, cg, sg, sw, cw;

  if (height <= 0) e_error(-30);
  if (tilt) {
    cg = cos(azimuth);
    sg = sin(azimuth);
    cw = cos(tiltAngle);
    sw = sin(tiltAngle);
  }
  if (fabs(fabs(P.phi0) - M_HALFPI) < EPS10)
    mode = P.phi0 < 0 ? S_POLE : N_POLE;
  else if (fabs(P.phi0) < EPS10)
    mode = EIT;
  else {
    mode = OBLI;
    sinph0 = sin(P.phi0);
    cosph0 = cos(P.phi0);
  }
  pn1 = height / P.a; /* normalize by radius */
  p = 1 + pn1;
  rp = 1 / p;
  h = 1 / pn1;
  pfact = (p + 1) * h;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var coslam, cosphi, sinphi;
    var yt, ba;
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);
    switch (mode) {
      case OBLI:
        xy.y = sinph0 * sinphi + cosph0 * cosphi * coslam;
        break;
      case EIT:
        xy.y = cosphi * coslam;
        break;
      case S_POLE:
        xy.y = - sinphi;
        break;
      case N_POLE:
        xy.y = sinphi;
        break;
    }
    if (xy.y < rp) f_error();
    xy.y = pn1 / (p - xy.y);
    xy.x = xy.y * cosphi * sin(lp.lam);
    switch (mode) {
      case OBLI:
        xy.y *= (cosph0 * sinphi -
           sinph0 * cosphi * coslam);
        break;
      case EIT:
        xy.y *= sinphi;
        break;
      case N_POLE:
        coslam = - coslam;
        /* falls through */
      case S_POLE:
        xy.y *= cosphi * coslam;
        break;
    }
    if (tilt) {
      yt = xy.y * cg + xy.x * sg;
      ba = 1 / (yt * sw * h + cw);
      xy.x = (xy.x * cg - xy.y * sg) * cw * ba;
      xy.y = yt * ba;
    }
  }

  function s_inv(xy, lp) {
    var rh, cosz, sinz;
    var bm, bq, yt;
    if (tilt) {
      yt = 1/(pn1 - xy.y * sw);
      bm = pn1 * xy.x * yt;
      bq = pn1 * xy.y * cw * yt;
      xy.x = bm * cg + bq * sg;
      xy.y = bq * cg - bm * sg;
    }
    rh = hypot(xy.x, xy.y);
    if ((sinz = 1 - rh * rh * pfact) < 0) i_error();
    sinz = (p - sqrt(sinz)) / (pn1 / rh + rh / pn1);
    cosz = sqrt(1 - sinz * sinz);
    if (fabs(rh) <= EPS10) {
        lp.lam = 0;
        lp.phi = P.phi0;
    } else {
      switch (mode) {
        case OBLI:
          lp.phi = asin(cosz * sinph0 + xy.y * sinz * cosph0 / rh);
          xy.y = (cosz - sinph0 * sin(lp.phi)) * rh;
          xy.x *= sinz * cosph0;
          break;
        case EIT:
          lp.phi = asin(xy.y * sinz / rh);
          xy.y = cosz * rh;
          xy.x *= sinz;
          break;
        case N_POLE:
          lp.phi = asin(cosz);
          xy.y = -xy.y;
          break;
        case S_POLE:
          lp.phi = - asin(cosz);
          break;
      }
      lp.lam = atan2(xy.x, xy.y);
    }
  }
}


pj_add(pj_nzmg, 'nzmg', 'New Zealand Map Grid', 'fixed Earth');

function pj_nzmg(P) {
  var EPSLN = 1e-10;
  var SEC5_TO_RAD = 0.4848136811095359935899141023;
  var RAD_TO_SEC5 = 2.062648062470963551564733573;
  var bf = [
    [ 0.7557853228, 0.0],
    [ 0.249204646,  0.003371507],
    [-0.001541739,  0.041058560],
    [-0.10162907,   0.01727609],
    [-0.26623489,  -0.36249218],
    [-0.6870983,   -1.1651967]];

  var tphi= [1.5627014243, 0.5185406398, -0.03333098,
    -0.1052906, -0.0368594, 0.007317, 0.01220, 0.00394, -0.0013];

  var tpsi = [0.6399175073, -0.1358797613, 0.063294409, -0.02526853, 0.0117879,
    -0.0055161, 0.0026906, -0.001333, 0.00067, -0.00034];

  /* force to International major axis */
  P.ra = 1 / (P.a = 6378388.0);
  P.lam0 = DEG_TO_RAD * 173;
  P.phi0 = DEG_TO_RAD * -41;
  P.x0 = 2510000;
  P.y0 = 6023150;

  P.inv = e_inv;
  P.fwd = e_fwd;

  function e_fwd(lp, xy) {
    var i = tpsi.length - 1;
    var p = {r: tpsi[i]};
    var phi = (lp.phi - P.phi0) * RAD_TO_SEC5;
    for (--i; i >= 0; --i)
      p.r = tpsi[i] + phi * p.r;
    p.r *= phi;
    p.i = lp.lam;
    p = pj_zpoly1(p, bf);
    xy.x = p.i;
    xy.y = p.r;
  }

  function e_inv(xy, lp) {
    var nn, i, dr, di, f, den;
    var p = {r: xy.y, i: xy.x};
    var fp = {};
    for (nn = 20; nn > 0 ;--nn) {
      f = pj_zpolyd1(p, bf, fp);
      f.r -= xy.y;
      f.i -= xy.x;
      den = fp.r * fp.r + fp.i * fp.i;
      p.r += dr = -(f.r * fp.r + f.i * fp.i) / den;
      p.i += di = -(f.i * fp.r - f.r * fp.i) / den;
      if ((fabs(dr) + fabs(di)) <= EPSLN) break;
    }
    if (nn > 0) {
      lp.lam = p.i;
      i = tphi.length - 1;
      lp.phi = tphi[i];
      for (--i; i >= 0; --i)
        lp.phi = tphi[i] + p.r * lp.phi;
      lp.phi = P.phi0 + p.r * lp.phi * SEC5_TO_RAD;
    } else
      lp.lam = lp.phi = HUGE_VAL;
  }
}


pj_add(pj_ob_tran, 'ob_tran', 'General Oblique Transformation', 'Misc Sph\n' +
  'o_proj= plus parameters for projection\n' +
  'o_lat_p= o_lon_p= (new pole) or\n' +
  'o_alpha= o_lon_c= o_lat_c= or\n' +
  'o_lon_1= o_lat_1= o_lon_2= o_lat_2=');

function pj_ob_tran(P) {
  var name, defn, P2;
  var lamp, cphip, sphip, phip;
  var lamc, phic, alpha;
  var lam1, lam2, phi1, phi2, con;
  var TOL = 1e-10;

  name = pj_param(P.params, 'so_proj');
  defn = pj_list[name];
  if (!name) e_error(-26);
  if (!defn || name == 'ob_tran') e_error(-37);
  P.es = 0;
  // copy params to second object
  P2 = {};
  Object.keys(P).forEach(function(key) {
    // TODO: remove o_ params?
    P2[key] = P[key];
  });
  defn.init(P2);

  // NOT in Proj.4
  // fix output units when doing latlong transform (see pj_transform.js)
  if (P2.is_latlong && P.to_meter == 1) {
    P.to_meter = DEG_TO_RAD;
    P.fr_meter = RAD_TO_DEG;
  }

  if (pj_param(P.params, 'to_alpha')) {
    lamc  = pj_param(P.params, 'ro_lon_c');
    phic  = pj_param(P.params, 'ro_lat_c');
    alpha = pj_param(P.params, 'ro_alpha');

    if (fabs(fabs(phic) - M_HALFPI) <= TOL) e_error(-32);
    lamp = lamc + aatan2(-cos(alpha), -sin(alpha) * sin(phic));
    phip = aasin(cos(phic) * sin(alpha));

  } else if (pj_param(P.params, 'to_lat_p')) { /* specified new pole */
    lamp = pj_param(P.params, 'ro_lon_p');
    phip = pj_param(P.params, 'ro_lat_p');

  } else { /* specified new 'equator' points */

    lam1 = pj_param(P.params, 'ro_lon_1');
    phi1 = pj_param(P.params, 'ro_lat_1');
    lam2 = pj_param(P.params, 'ro_lon_2');
    phi2 = pj_param(P.params, 'ro_lat_2');
    if (fabs(phi1 - phi2) <= TOL ||
        (con = fabs(phi1)) <= TOL ||
        fabs(con - M_HALFPI) <= TOL ||
        fabs(fabs(phi2) - M_HALFPI) <= TOL) e_error(-33);
    lamp = atan2(cos(phi1) * sin(phi2) * cos(lam1) -
        sin(phi1) * cos(phi2) * cos(lam2),
        sin(phi1) * cos(phi2) * sin(lam2) -
        cos(phi1) * sin(phi2) * sin(lam1));
    phip = atan(-cos(lamp - lam1) / tan(phi1));
  }
  if (fabs(phip) > TOL) { /* oblique */
    cphip = cos(phip);
    sphip = sin(phip);
    P.fwd = o_fwd;
    P.inv = P2.inv ? o_inv : null;
  } else { /* transverse */
    P.fwd = t_fwd;
    P.inv = P2.inv ? t_inv : null;
  }

  function o_fwd(lp, xy) {
    var coslam, sinphi, cosphi;
    coslam = cos(lp.lam);
    sinphi = sin(lp.phi);
    cosphi = cos(lp.phi);
    lp.lam = adjlon(aatan2(cosphi * sin(lp.lam), sphip * cosphi * coslam +
        cphip * sinphi) + lamp);
    lp.phi = aasin(sphip * sinphi - cphip * cosphi * coslam);
    P2.fwd(lp, xy);
  }

  function t_fwd(lp, xy) {
    var cosphi, coslam;
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);
    lp.lam = adjlon(aatan2(cosphi * sin(lp.lam), sin(lp.phi)) + lamp);
    lp.phi = aasin(-cosphi * coslam);
    P2.fwd(lp, xy);
  }

  function o_inv(xy, lp) {
    var coslam, sinphi, cosphi;
    P2.inv(xy, lp);
    if (lp.lam != HUGE_VAL) {
      coslam = cos(lp.lam -= lamp);
      sinphi = sin(lp.phi);
      cosphi = cos(lp.phi);
      lp.phi = aasin(sphip * sinphi + cphip * cosphi * coslam);
      lp.lam = aatan2(cosphi * sin(lp.lam), sphip * cosphi * coslam -
        cphip * sinphi);
    }
  }

  function t_inv(xy, lp) {
    var cosphi, t;
    P2.inv(xy, lp);
    if (lp.lam != HUGE_VAL) {
      cosphi = cos(lp.phi);
      t = lp.lam - lamp;
      lp.lam = aatan2(cosphi * sin(t), - sin(lp.phi));
      lp.phi = aasin(cosphi * cos(t));
    }
  }
}


pj_add(pj_ocea, 'ocea', 'Oblique Cylindrical Equal Area', 'Cyl, Sph lonc= alpha= or\nlat_1= lat_2= lon_1= lon_2=');

function pj_ocea(P) {
  var phi_0 = 0,
      phi_1, phi_2, lam_1, lam_2, lonz, alpha,
      rok, rtk, sinphi, cosphi, singam, cosgam;
  rok = 1 / P.k0;
  rtk = P.k0;
  /*If the keyword "alpha" is found in the sentence then use 1point+1azimuth*/
  if (pj_param(P.params, "talpha")) {
    /*Define Pole of oblique transformation from 1 point & 1 azimuth*/
    alpha   = pj_param(P.params, "ralpha");
    lonz = pj_param(P.params, "rlonc");
    /*Equation 9-8 page 80 (http://pubs.usgs.gov/pp/1395/report.pdf)*/
    singam = atan(-cos(alpha)/(-sin(phi_0) * sin(alpha))) + lonz;
    /*Equation 9-7 page 80 (http://pubs.usgs.gov/pp/1395/report.pdf)*/
    sinphi = asin(cos(phi_0) * sin(alpha));
  /*If the keyword "alpha" is NOT found in the sentence then use 2points*/
  } else {
    /*Define Pole of oblique transformation from 2 points*/
    phi_1 = pj_param(P.params, "rlat_1");
    phi_2 = pj_param(P.params, "rlat_2");
    lam_1 = pj_param(P.params, "rlon_1");
    lam_2 = pj_param(P.params, "rlon_2");
    /*Equation 9-1 page 80 (http://pubs.usgs.gov/pp/1395/report.pdf)*/
    singam = atan2(cos(phi_1) * sin(phi_2) * cos(lam_1) -
      sin(phi_1) * cos(phi_2) * cos(lam_2),
      sin(phi_1) * cos(phi_2) * sin(lam_2) -
      cos(phi_1) * sin(phi_2) * sin(lam_1) );

    /* take care of P->lam0 wrap-around when +lam_1=-90*/
    if (lam_1 == -M_HALFPI)
      singam = -singam;

    /*Equation 9-2 page 80 (http://pubs.usgs.gov/pp/1395/report.pdf)*/
    sinphi = atan(-cos(singam - lam_1) / tan(phi_1));
  }
  P.lam0 = singam + M_HALFPI;
  cosphi = cos(sinphi);
  sinphi = sin(sinphi);
  cosgam = cos(singam);
  singam = sin(singam);
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var t;
    xy.y = sin(lp.lam);
    t = cos(lp.lam);
    xy.x = atan((tan(lp.phi) * cosphi + sinphi * xy.y) / t);
    if (t < 0)
        xy.x += M_PI;
    xy.x *= rtk;
    xy.y = rok * (sinphi * sin(lp.phi) - cosphi * cos(lp.phi) * xy.y);
  }

  function s_inv(xy, lp) {
    var t, s;
    xy.y /= rok;
    xy.x /= rtk;
    t = sqrt(1 - xy.y * xy.y);
    lp.phi = asin(xy.y * sinphi + t * cosphi * (s = sin(xy.x)));
    lp.lam = atan2(t * sinphi * s - xy.y * cosphi,
        t * cos(xy.x));
  }
}


pj_add(pj_omerc, 'omerc', 'Oblique Mercator', 'Cyl, Sph&Ell no_rot\n' +
    'alpha= [gamma=] [no_off] lonc= or\nlon_1= lat_1= lon_2= lat_2=');

function pj_omerc(P) {
  var TOL = 1e-7;
  var con, com, cosph0, D, F, H, L, sinph0, p, J, gamma=0,
      gamma0, lamc=0, lam1=0, lam2=0, phi1=0, phi2=0, alpha_c=0;
  var alp, gam, no_off = 0;
  var A, B, E, AB, ArB, BrA, rB, singam, cosgam, sinrot, cosrot;
  var v_pole_n, v_pole_s, u_0;
  var no_rot;

  no_rot = pj_param(P.params, "tno_rot");
  if ((alp = pj_param(P.params, "talpha")) != 0)
  alpha_c = pj_param(P.params, "ralpha");
  if ((gam = pj_param(P.params, "tgamma")) != 0)
  gamma = pj_param(P.params, "rgamma");
  if (alp || gam) {
    lamc = pj_param(P.params, "rlonc");
    no_off =
      /* For libproj4 compatibility ... for backward compatibility */
      pj_param(P.params, "tno_off") || pj_param(P.params, "tno_uoff");
    if (no_off) {
      /* Mark the parameter as used, so that the pj_get_def() return them */
      pj_param(P.params, "sno_uoff");
      pj_param(P.params, "sno_off");
    }
  } else {
    lam1 = pj_param(P.params, "rlon_1");
    phi1 = pj_param(P.params, "rlat_1");
    lam2 = pj_param(P.params, "rlon_2");
    phi2 = pj_param(P.params, "rlat_2");
    if (fabs(phi1 - phi2) <= TOL || (con = fabs(phi1)) <= TOL ||
        fabs(con - M_HALFPI) <= TOL || fabs(fabs(P.phi0) - M_HALFPI) <= TOL ||
        fabs(fabs(phi2) - M_HALFPI) <= TOL) e_error(-33);
  }
  com = sqrt(P.one_es);
  if (fabs(P.phi0) > EPS10) {
    sinph0 = sin(P.phi0);
    cosph0 = cos(P.phi0);
    con = 1 - P.es * sinph0 * sinph0;
    B = cosph0 * cosph0;
    B = sqrt(1 + P.es * B * B / P.one_es);
    A = B * P.k0 * com / con;
    D = B * com / (cosph0 * sqrt(con));
    if ((F = D * D - 1) <= 0)
      F = 0;
    else {
      F = sqrt(F);
      if (P.phi0 < 0)
        F = -F;
    }
    E = F += D;
    E *= pow(pj_tsfn(P.phi0, sinph0, P.e), B);
  } else {
    B = 1 / com;
    A = P.k0;
    E = D = F = 1;
  }
  if (alp || gam) {
    if (alp) {
      gamma0 = asin(sin(alpha_c) / D);
      if (!gam)
          gamma = alpha_c;
    } else
        alpha_c = asin(D*sin(gamma0 = gamma));
    P.lam0 = lamc - asin(0.5 * (F - 1 / F) * tan(gamma0)) / B;
  } else {
    H = pow(pj_tsfn(phi1, sin(phi1), P.e), B);
    L = pow(pj_tsfn(phi2, sin(phi2), P.e), B);
    F = E / H;
    p = (L - H) / (L + H);
    J = E * E;
    J = (J - L * H) / (J + L * H);
    if ((con = lam1 - lam2) < -M_PI)
        lam2 -= M_TWOPI;
    else if (con > M_PI)
        lam2 += M_TWOPI;
    P.lam0 = adjlon(0.5 * (lam1 + lam2) - atan(J * tan(0.5 * B * (lam1 - lam2)) / p) / B);
    gamma0 = atan(2 * sin(B * adjlon(lam1 - P.lam0)) / (F - 1 / F));
    gamma = alpha_c = asin(D * sin(gamma0));
  }
  singam = sin(gamma0);
  cosgam = cos(gamma0);
  sinrot = sin(gamma);
  cosrot = cos(gamma);
  BrA = 1 / (ArB = A * (rB = 1 / B));
  AB = A * B;
  if (no_off)
    u_0 = 0;
  else {
    u_0 = fabs(ArB * atan(sqrt(D * D - 1) / cos(alpha_c)));
    if (P.phi0 < 0)
        u_0 = - u_0;
  }
  F = 0.5 * gamma0;
  v_pole_n = ArB * log(tan(M_FORTPI - F));
  v_pole_s = ArB * log(tan(M_FORTPI + F));

  P.fwd = e_fwd;
  P.inv = e_inv;

  function e_fwd(lp, xy) {
    var S, T, U, V, W, temp, u, v;

    if (fabs(fabs(lp.phi) - M_HALFPI) > EPS10) {
      W = E / pow(pj_tsfn(lp.phi, sin(lp.phi), P.e), B);
      temp = 1 / W;
      S = 0.5 * (W - temp);
      T = 0.5 * (W + temp);
      V = sin(B * lp.lam);
      U = (S * singam - V * cosgam) / T;
      if (fabs(fabs(U) - 1.0) < EPS10)
        f_error();
      v = 0.5 * ArB * log((1 - U)/(1 + U));
      temp = cos(B * lp.lam);
      if(fabs(temp) < TOL) {
          u = A * lp.lam;
      } else {
          u = ArB * atan2((S * cosgam + V * singam), temp);
      }
    } else {
        v = lp.phi > 0 ? v_pole_n : v_pole_s;
        u = ArB * lp.phi;
    }
    if (no_rot) {
        xy.x = u;
        xy.y = v;
    } else {
        u -= u_0;
        xy.x = v * cosrot + u * sinrot;
        xy.y = u * cosrot - v * sinrot;
    }
  }

  function e_inv(xy, lp) {
    var u, v, Qp, Sp, Tp, Vp, Up;
    if (no_rot) {
      v = xy.y;
      u = xy.x;
    } else {
      v = xy.x * cosrot - xy.y * sinrot;
      u = xy.y * cosrot + xy.x * sinrot + u_0;
    }
    Qp = exp(- BrA * v);
    Sp = 0.5 * (Qp - 1 / Qp);
    Tp = 0.5 * (Qp + 1 / Qp);
    Vp = sin(BrA * u);
    Up = (Vp * cosgam + Sp * singam) / Tp;
    if (fabs(fabs(Up) - 1) < EPS10) {
      lp.lam = 0;
      lp.phi = Up < 0 ? -M_HALFPI : M_HALFPI;
    } else {
      lp.phi = E / sqrt((1 + Up) / (1 - Up));
      if ((lp.phi = pj_phi2(pow(lp.phi, 1 / B), P.e)) == HUGE_VAL)
          i_error();
      lp.lam = - rB * atan2((Sp * cosgam - Vp * singam), cos(BrA * u));
    }
  }
}


pj_add(pj_ortho, 'ortho', 'Orthographic', 'Azi, Sph.');

function pj_ortho(P) {
  var EPS10 = 1.e-10,
      N_POLE = 0,
      S_POLE = 1,
      EQUIT = 2,
      OBLIQ = 3;
  var Q = {};

  if (fabs(fabs(P.phi0) - M_HALFPI) <= EPS10)
    Q.mode = P.phi0 < 0 ? S_POLE : N_POLE;
  else if (fabs(P.phi0) > EPS10) {
    Q.mode = OBLIQ;
    Q.sinph0 = sin(P.phi0);
    Q.cosph0 = cos(P.phi0);
  } else
    Q.mode = EQUIT;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var coslam, cosphi, sinphi;
    cosphi = cos(lp.phi);
    coslam = cos(lp.lam);
    switch (Q.mode) {
    case EQUIT:
      if (cosphi * coslam < - EPS10) f_error();
      xy.y = sin(lp.phi);
      break;
    case OBLIQ:
      if (Q.sinph0 * (sinphi = sin(lp.phi)) +
         Q.cosph0 * cosphi * coslam < - EPS10) f_error();
      xy.y = Q.cosph0 * sinphi - Q.sinph0 * cosphi * coslam;
      break;
    case N_POLE:
      coslam = -coslam;
      /* falls through */
    case S_POLE:
      if (fabs(lp.phi - P.phi0) - EPS10 > M_HALFPI) f_error();
      xy.y = cosphi * coslam;
      break;
    }
    xy.x = cosphi * sin(lp.lam);
  }

  function s_inv(xy, lp) {
    var rh, cosc, sinc;

    if ((sinc = (rh = hypot(xy.x, xy.y))) > 1) {
        if ((sinc - 1) > EPS10) i_error();
        sinc = 1;
    }
    cosc = sqrt(1 - sinc * sinc); /* in this range OK */
    if (fabs(rh) <= EPS10) {
        lp.phi = P.phi0;
        lp.lam = 0.0;
    } else {
        switch (Q.mode) {
        case N_POLE:
            xy.y = -xy.y;
            lp.phi = acos(sinc);
            break;
        case S_POLE:
            lp.phi = - acos(sinc);
            break;
        case EQUIT:
        case OBLIQ:
          if (Q.mode == EQUIT) {
            lp.phi = xy.y * sinc / rh;
            xy.x *= sinc;
            xy.y = cosc * rh;
          } else {
            lp.phi = cosc * Q.sinph0 + xy.y * sinc * Q.cosph0 /rh;
            xy.y = (cosc - Q.sinph0 * lp.phi) * rh;
            xy.x *= sinc * Q.cosph0;
          }
          if (fabs(lp.phi) >= 1)
              lp.phi = lp.phi < 0 ? -M_HALFPI : M_HALFPI;
          else
              lp.phi = asin(lp.phi);
          break;
        }
        lp.lam = (xy.y == 0 && (Q.mode == OBLIQ || Q.mode == EQUIT)) ?
          (xy.x == 0 ? 0 : xy.x < 0 ? -M_HALFPI : M_HALFPI) : atan2(xy.x, xy.y);
    }
  }
}


pj_add(pj_patterson, 'patterson', 'Patterson Cylindrical', 'Cyl., Sph.');

function pj_patterson(P) {
  var K1 = 1.0148,
    K2 = 0.23185,
    K3 = -0.14499,
    K4 = 0.02406,
    C1 = K1,
    C2 = (5.0 * K2),
    C3 = (7.0 * K3),
    C4 = (9.0 * K4),
    EPS = 1e-11,
    MAX_Y =  908571831.7;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var phi2 = lp.phi * lp.phi;
    xy.x = lp.lam;
    xy.y = lp.phi * (K1 + phi2 * phi2 * (K2 + phi2 * (K3 + K4 * phi2)));
  }

  function s_inv(xy, lp) {
    var MAX_ITER = 100;
    var yc, tol, y2, f, fder;
    var i;

    yc = xy.y;

    /* make sure y is inside valid range */
    if (xy.y > MAX_Y) {
      xy.y = MAX_Y;
    } else if (xy.y < -MAX_Y) {
      xy.y = -MAX_Y;
    }

    for (i = MAX_ITER; i ; --i) { /* Newton-Raphson */
      y2 = yc * yc;
      f = (yc * (K1 + y2 * y2 * (K2 + y2 * (K3 + K4 * y2)))) - xy.y;
      fder = C1 + y2 * y2 * (C2 + y2 * (C3 + C4 * y2));
      yc -= tol = f / fder;
      if (fabs(tol) < EPS) {
        break;
      }
    }
    // other projections don't error if non-convergent
    // if (i === 0) error(PJD_ERR_NON_CONVERGENT);
    lp.phi = yc;

    /* longitude */
    lp.lam = xy.x;
  }
}


pj_add(pj_poly, 'poly', 'Polyconic (American)', 'Conic, Sph&Ell');

function pj_poly(P) {
  var TOL = 1e-10,
      CONV = 1e-10,
      N_ITER = 10,
      I_ITER = 20,
      ITOL = 1.e-12,
      ml0, en;

  if (P.es) {
    en = pj_enfn(P.es);
    ml0 = pj_mlfn(P.phi0, sin(P.phi0), cos(P.phi0), en);
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    ml0 = -P.phi0;
    P.fwd = s_fwd;
    P.inv = s_inv;
  }

  function e_fwd(lp, xy) {
    var ms, sp, cp;

    if (fabs(lp.phi) <= TOL) {
      xy.x = lp.lam;
      xy.y = -ml0;
    } else {
      sp = sin(lp.phi);
      ms = fabs(cp = cos(lp.phi)) > TOL ? pj_msfn(sp, cp, P.es) / sp : 0;
      xy.x = ms * sin(lp.lam *= sp);
      xy.y = (pj_mlfn(lp.phi, sp, cp, en) - ml0) + ms * (1 - cos(lp.lam));
    }
  }

  function e_inv(xy, lp) {
    var x = xy.x, y = xy.y;
    var r, c, sp, cp, s2ph, ml, mlb, mlp, dPhi, i;
    y += ml0;
    if (fabs(y) <= TOL) {
      lp.lam = x;
      lp.phi = 0;
    } else {
      r = y * y + x * x;
      for (lp.phi = y, i = I_ITER; i>0 ; --i) {
        sp = sin(lp.phi);
        s2ph = sp * (cp = cos(lp.phi));
        if (fabs(cp) < ITOL)
          i_error();
        c = sp * (mlp = sqrt(1 - P.es * sp * sp)) / cp;
        ml = pj_mlfn(lp.phi, sp, cp, en);
        mlb = ml * ml + r;
        mlp = P.one_es / (mlp * mlp * mlp);
        lp.phi += (dPhi =
          ( ml + ml + c * mlb - 2 * y * (c * ml + 1) ) / (
          P.es * s2ph * (mlb - 2 * y * ml) / c +
          2 * (y - ml) * (c * mlp - 1 / s2ph) - mlp - mlp));
        if (fabs(dPhi) <= ITOL)
          break;
      }
      if (!i) {
        i_error();
      }
      c = sin(lp.phi);
      lp.lam = asin(x * tan(lp.phi) * sqrt(1 - P.es * c * c)) / sin(lp.phi);
    }
  }

  function s_fwd(lp, xy) {
    var cot, E;
    if (fabs(lp.phi) <= TOL) {
      xy.x = lp.lam;
      xy.y = ml0;
    } else {
      cot = 1 / tan(lp.phi);
      xy.x = sin(E = lp.lam * sin(lp.phi)) * cot;
      xy.y = lp.phi - P.phi0 + cot * (1 - cos(E));
    }
  }

  function s_inv(xy, lp) {
    var B, dphi, tp, i;
    if (fabs(xy.y = P.phi0 + xy.y) <= TOL) {
      lp.lam = xy.x;
      lp.phi = 0;
    } else {
      lp.phi = xy.y;
      B = xy.x * xy.x + xy.y * xy.y;
      i = N_ITER;
      do {
        tp = tan(lp.phi);
        lp.phi -= (dphi = (xy.y * (lp.phi * tp + 1) - lp.phi -
          0.5 * ( lp.phi * lp.phi + B) * tp) /
          ((lp.phi - xy.y) / tp - 1));
      } while (fabs(dphi) > CONV && --i);
      if (!i) i_error();
      lp.lam = asin(xy.x * tan(lp.phi)) / sin(lp.phi);
    }
  }
}


pj_add(pj_putp2, 'putp2', 'Putnins P2', 'PCyl., Sph.');

function pj_putp2(P) {
  var C_x = 1.89490,
      C_y = 1.71848,
      C_p = 0.6141848493043784,
      EPS = 1e-10,
      NITER = 10,
      PI_DIV_3 = 1.0471975511965977;
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var p, c, s, V, i;
    p = C_p * sin(lp.phi);
    s = lp.phi * lp.phi;
    lp.phi *= 0.615709 + s * ( 0.00909953 + s * 0.0046292 );
    for (i = NITER; i ; --i) {
      c = cos(lp.phi);
      s = sin(lp.phi);
      lp.phi -= V = (lp.phi + s * (c - 1) - p) /
        (1 + c * (c - 1) - s * s);
      if (fabs(V) < EPS)
        break;
    }
    if (!i)
      lp.phi = lp.phi < 0 ? - PI_DIV_3 : PI_DIV_3;
    xy.x = C_x * lp.lam * (cos(lp.phi) - 0.5);
    xy.y = C_y * sin(lp.phi);
  }

  function s_inv(xy, lp) {
    var c;
    lp.phi = aasin(xy.y / C_y);
    lp.lam = xy.x / (C_x * ((c = cos(lp.phi)) - 0.5));
    lp.phi = aasin((lp.phi + sin(lp.phi) * (c - 1)) / C_p);
  }
}


pj_add(pj_putp3, 'putp3', 'Putnins P3', 'PCyl., Sph.');
pj_add(pj_putp3p, 'putp3p', 'Putnins P3\'', 'PCyl., Sph.');

function pj_putp3p(P) {
  pj_putp3(P, true);
}

function pj_putp3(P, prime) {
  var C = 0.79788456,
      RPISQ = 0.1013211836,
      A = (prime ? 2 : 4) * RPISQ;
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = C * lp.lam * (1 - A * lp.phi * lp.phi);
    xy.y = C * lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / C;
    lp.lam = xy.x / (C * (1 - A * lp.phi * lp.phi));
  }
}


pj_add(pj_putp4p, 'putp4p', 'Putnins P4\'', 'PCyl., Sph.');
pj_add(pj_weren, 'weren', 'Werenskiold I', 'PCyl., Sph.');

function pj_putp4p(P) {
  pj_putp4p_init(P, 0.874038744, 3.883251825);
}

function pj_weren(P) {
  pj_putp4p_init(P, 1, 4.442882938);
}

function pj_putp4p_init(P, C_x, C_y) {
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    lp.phi = aasin(0.883883476 * sin(lp.phi));
    xy.x = C_x * lp.lam * cos(lp.phi);
    xy.x /= cos(lp.phi *= 0.333333333333333);
    xy.y = C_y * sin(lp.phi);
  }

  function s_inv(xy, lp) {
    lp.phi = aasin(xy.y / C_y);
    lp.lam = xy.x * cos(lp.phi) / C_x;
    lp.phi *= 3;
    lp.lam /= cos(lp.phi);
    lp.phi = aasin(1.13137085 * sin(lp.phi));
  }
}


pj_add(pj_putp5, 'putp5', 'Putnins P5', 'PCyl., Sph.');
pj_add(pj_putp5p, 'putp5p', 'Putnins P5\'', 'PCyl., Sph.');

function pj_putp5p(P) {
  pj_putp5(P, true);
}

function pj_putp5(P, prime) {
  var A = (prime ? 1.5 : 2),
      B = (prime ? 0.5 : 1),
      C = 1.01346,
      D = 1.2158542;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = C * lp.lam * (A - B * sqrt(1 + D * lp.phi * lp.phi));
    xy.y = C * lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / C;
    lp.lam = xy.x / (C * (A - B * sqrt(1 + D * lp.phi * lp.phi)));
  }
}


pj_add(pj_putp6, 'putp6', 'Putnins P6', 'PCyl., Sph.');
pj_add(pj_putp6p, 'putp6p', 'Putnins P6\'', 'PCyl., Sph.');

function pj_putp6p(P) {
  pj_putp6(P, true);
}

function pj_putp6(P, prime) {
  var EPS = 1e-10,
      NITER = 10,
      CON_POLE = 1.732050807568877,
      A, B, C_x, C_y, D;

  if (prime) {
    C_x = 0.44329;
    C_y = 0.80404;
    A   = 6;
    B   = 5.61125;
    D   = 3;
  } else {
    C_x = 1.01346;
    C_y = 0.91910;
    A   = 4;
    B   = 2.1471437182129378784;
    D   = 2;
  }

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var p, r, V, i;
    p = B * sin(lp.phi);
    lp.phi *=  1.10265779;
    for (i = NITER; i ; --i) {
        r = sqrt(1 + lp.phi * lp.phi);
        lp.phi -= V = ( (A - r) * lp.phi - log(lp.phi + r) - p ) /
            (A - 2 * r);
        if (fabs(V) < EPS)
            break;
    }
    if (!i)
        lp.phi = p < 0 ? -CON_POLE : CON_POLE;
    xy.x = C_x * lp.lam * (D - sqrt(1 + lp.phi * lp.phi));
    xy.y = C_y * lp.phi;
  }

  function s_inv(xy, lp) {
    var r;
    lp.phi = xy.y / C_y;
    r = sqrt(1 + lp.phi * lp.phi);
    lp.lam = xy.x / (C_x * (D - r));
    lp.phi = aasin(((A - r) * lp.phi - log(lp.phi + r)) / B);
  }
}


pj_add(pj_qsc, 'qsc', 'Quadrilateralized Spherical Cube', 'Azi, Sph.');

function pj_qsc(P) {
  var EPS10 = 1.e-10;

  /* The six cube faces. */
  var FACE_FRONT = 0;
  var FACE_RIGHT = 1;
  var FACE_BACK = 2;
  var FACE_LEFT = 3;
  var FACE_TOP = 4;
  var FACE_BOTTOM = 5;

  /* The four areas on a cube face. AREA_0 is the area of definition,
   * the other three areas are counted counterclockwise. */
  var AREA_0 = 0;
  var AREA_1 = 1;
  var AREA_2 = 2;
  var AREA_3 = 3;
  var face;
  var a_squared;
  var b;
  var one_minus_f;
  var one_minus_f_squared;

  /* Determine the cube face from the center of projection. */
  if (P.phi0 >= M_HALFPI - M_FORTPI / 2.0) {
    face = FACE_TOP;
  } else if (P.phi0 <= -(M_HALFPI - M_FORTPI / 2.0)) {
    face = FACE_BOTTOM;
  } else if (fabs(P.lam0) <= M_FORTPI) {
    face = FACE_FRONT;
  } else if (fabs(P.lam0) <= M_HALFPI + M_FORTPI) {
    face = (P.lam0 > 0.0 ? FACE_RIGHT : FACE_LEFT);
  } else {
    face = FACE_BACK;
  }
  /* Fill in useful values for the ellipsoid <-> sphere shift
   * described in [LK12]. */
  if (P.es !== 0.0) {
    a_squared = P.a * P.a;
    b = P.a * sqrt(1.0 - P.es);
    one_minus_f = 1.0 - (P.a - b) / P.a;
    one_minus_f_squared = one_minus_f * one_minus_f;
  }

  P.fwd = e_fwd;
  P.inv = e_inv;

  function e_fwd(lp, xy) {
    var lat, lon;
    var theta, phi;
    var t, mu; /* nu; */
    var area;
    var q, r, s;
    var sinlat, coslat;
    var sinlon, coslon;
    var tmp;

    /* Convert the geodetic latitude to a geocentric latitude.
     * This corresponds to the shift from the ellipsoid to the sphere
     * described in [LK12]. */
    if (P.es !== 0.0) {
      lat = atan(one_minus_f_squared * tan(lp.phi));
    } else {
      lat = lp.phi;
    }

    /* Convert the input lat, lon into theta, phi as used by QSC.
     * This depends on the cube face and the area on it.
     * For the top and bottom face, we can compute theta and phi
     * directly from phi, lam. For the other faces, we must use
     * unit sphere cartesian coordinates as an intermediate step. */
    lon = lp.lam;
    if (face == FACE_TOP) {
      phi = M_HALFPI - lat;
      if (lon >= M_FORTPI && lon <= M_HALFPI + M_FORTPI) {
        area = AREA_0;
        theta = lon - M_HALFPI;
      } else if (lon > M_HALFPI + M_FORTPI || lon <= -(M_HALFPI + M_FORTPI)) {
        area = AREA_1;
        theta = (lon > 0.0 ? lon - M_PI : lon + M_PI);
      } else if (lon > -(M_HALFPI + M_FORTPI) && lon <= -M_FORTPI) {
        area = AREA_2;
        theta = lon + M_HALFPI;
      } else {
        area = AREA_3;
        theta = lon;
      }
    } else if (face == FACE_BOTTOM) {
      phi = M_HALFPI + lat;
      if (lon >= M_FORTPI && lon <= M_HALFPI + M_FORTPI) {
        area = AREA_0;
        theta = -lon + M_HALFPI;
      } else if (lon < M_FORTPI && lon >= -M_FORTPI) {
        area = AREA_1;
        theta = -lon;
      } else if (lon < -M_FORTPI && lon >= -(M_HALFPI + M_FORTPI)) {
        area = AREA_2;
        theta = -lon - M_HALFPI;
      } else {
        area = AREA_3;
        theta = (lon > 0.0 ? -lon + M_PI : -lon - M_PI);
      }
    } else {
      if (face == FACE_RIGHT) {
        lon = qsc_shift_lon_origin(lon, +M_HALFPI);
      } else if (face == FACE_BACK) {
        lon = qsc_shift_lon_origin(lon, +M_PI);
      } else if (face == FACE_LEFT) {
        lon = qsc_shift_lon_origin(lon, -M_HALFPI);
      }
      sinlat = sin(lat);
      coslat = cos(lat);
      sinlon = sin(lon);
      coslon = cos(lon);
      q = coslat * coslon;
      r = coslat * sinlon;
      s = sinlat;

      if (face == FACE_FRONT) {
        phi = acos(q);
        tmp = qsc_fwd_equat_face_theta(phi, s, r);
      } else if (face == FACE_RIGHT) {
        phi = acos(r);
        tmp = qsc_fwd_equat_face_theta(phi, s, -q);
      } else if (face == FACE_BACK) {
        phi = acos(-q);
        tmp = qsc_fwd_equat_face_theta(phi, s, -r);
      } else if (face == FACE_LEFT) {
        phi = acos(-r);
        tmp = qsc_fwd_equat_face_theta(phi, s, q);
      } else {
        /* Impossible */
        phi = 0.0;
        tmp = {
          area: AREA_0,
          theta: 0
        };
      }
      theta = tmp.theta;
      area = tmp.area;
    }

    /* Compute mu and nu for the area of definition.
     * For mu, see Eq. (3-21) in [OL76], but note the typos:
     * compare with Eq. (3-14). For nu, see Eq. (3-38). */
    mu = atan((12.0 / M_PI) * (theta + acos(sin(theta) * cos(M_FORTPI)) - M_HALFPI));
    t = sqrt((1.0 - cos(phi)) / (cos(mu) * cos(mu)) / (1.0 - cos(atan(1.0 / cos(theta)))));
    /* nu = atan(t);        We don't really need nu, just t, see below. */

    /* Apply the result to the real area. */
    if (area == AREA_1) {
      mu += M_HALFPI;
    } else if (area == AREA_2) {
      mu += M_PI;
    } else if (area == AREA_3) {
      mu += M_PI_HALFPI;
    }

    /* Now compute x, y from mu and nu */
    /* t = tan(nu); */
    xy.x = t * cos(mu);
    xy.y = t * sin(mu);
  }

  function e_inv(xy, lp) {
    var mu, nu, cosmu, tannu;
    var tantheta, theta, cosphi, phi;
    var t;
    var area;

    /* Convert the input x, y to the mu and nu angles as used by QSC.
     * This depends on the area of the cube face. */
    nu = atan(sqrt(xy.x * xy.x + xy.y * xy.y));
    mu = atan2(xy.y, xy.x);
    if (xy.x >= 0.0 && xy.x >= fabs(xy.y)) {
      area = AREA_0;
    } else if (xy.y >= 0.0 && xy.y >= fabs(xy.x)) {
      area = AREA_1;
      mu -= M_HALFPI;
    } else if (xy.x < 0.0 && -xy.x >= fabs(xy.y)) {
      area = AREA_2;
      mu = (mu < 0.0 ? mu + M_PI : mu - M_PI);
    } else {
      area = AREA_3;
      mu += M_HALFPI;
    }

    /* Compute phi and theta for the area of definition.
     * The inverse projection is not described in the original paper, but some
     * good hints can be found here (as of 2011-12-14):
     * http://fits.gsfc.nasa.gov/fitsbits/saf.93/saf.9302
     * (search for "Message-Id: <9302181759.AA25477 at fits.cv.nrao.edu>") */
    t = (M_PI / 12.0) * tan(mu);
    tantheta = sin(t) / (cos(t) - (1.0 / sqrt(2.0)));
    theta = atan(tantheta);
    cosmu = cos(mu);
    tannu = tan(nu);
    cosphi = 1.0 - cosmu * cosmu * tannu * tannu * (1.0 - cos(atan(1.0 / cos(theta))));
    if (cosphi < -1.0) {
      cosphi = -1.0;
    } else if (cosphi > +1.0) {
      cosphi = +1.0;
    }

    /* Apply the result to the real area on the cube face.
     * For the top and bottom face, we can compute phi and lam directly.
     * For the other faces, we must use unit sphere cartesian coordinates
     * as an intermediate step. */
    if (face == FACE_TOP) {
      phi = acos(cosphi);
      lp.phi = M_HALFPI - phi;
      if (area == AREA_0) {
        lp.lam = theta + M_HALFPI;
      } else if (area == AREA_1) {
        lp.lam = (theta < 0.0 ? theta + M_PI : theta - M_PI);
      } else if (area == AREA_2) {
        lp.lam = theta - M_HALFPI;
      } else /* area == AREA_3 */ {
        lp.lam = theta;
      }
    } else if (face == FACE_BOTTOM) {
      phi = acos(cosphi);
      lp.phi = phi - M_HALFPI;
      if (area == AREA_0) {
        lp.lam = -theta + M_HALFPI;
      } else if (area == AREA_1) {
        lp.lam = -theta;
      } else if (area == AREA_2) {
        lp.lam = -theta - M_HALFPI;
      } else /* area == AREA_3 */ {
        lp.lam = (theta < 0.0 ? -theta - M_PI : -theta + M_PI);
      }
    } else {
      /* Compute phi and lam via cartesian unit sphere coordinates. */
      var q, r, s;
      q = cosphi;
      t = q * q;
      if (t >= 1.0) {
        s = 0.0;
      } else {
        s = sqrt(1.0 - t) * sin(theta);
      }
      t += s * s;
      if (t >= 1.0) {
        r = 0.0;
      } else {
        r = sqrt(1.0 - t);
      }
      /* Rotate q,r,s into the correct area. */
      if (area == AREA_1) {
        t = r;
        r = -s;
        s = t;
      } else if (area == AREA_2) {
        r = -r;
        s = -s;
      } else if (area == AREA_3) {
        t = r;
        r = s;
        s = -t;
      }
      /* Rotate q,r,s into the correct cube face. */
      if (face == FACE_RIGHT) {
        t = q;
        q = -r;
        r = t;
      } else if (face == FACE_BACK) {
        q = -q;
        r = -r;
      } else if (face == FACE_LEFT) {
        t = q;
        q = r;
        r = -t;
      }
      /* Now compute phi and lam from the unit sphere coordinates. */
      lp.phi = acos(-s) - M_HALFPI;
      lp.lam = atan2(r, q);
      if (face == FACE_RIGHT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -M_HALFPI);
      } else if (face == FACE_BACK) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -M_PI);
      } else if (face == FACE_LEFT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, +M_HALFPI);
      }
    }

    /* Apply the shift from the sphere to the ellipsoid as described
     * in [LK12]. */
    if (P.es !== 0) {
      var invert_sign;
      var tanphi, xa;
      invert_sign = (lp.phi < 0.0 ? 1 : 0);
      tanphi = tan(lp.phi);
      xa = b / sqrt(tanphi * tanphi + one_minus_f_squared);
      lp.phi = atan(sqrt(P.a * P.a - xa * xa) / (one_minus_f * xa));
      if (invert_sign) {
        lp.phi = -lp.phi;
      }
    }
  }

  /* Helper function for forward projection: compute the theta angle
   * and determine the area number. */
  function qsc_fwd_equat_face_theta(phi, y, x) {
    var area, theta;
    if (phi < EPS10) {
      area = AREA_0;
      theta = 0.0;
    } else {
      theta = atan2(y, x);
      if (fabs(theta) <= M_FORTPI) {
        area = AREA_0;
      } else if (theta > M_FORTPI && theta <= M_HALFPI + M_FORTPI) {
        area = AREA_1;
        theta -= M_HALFPI;
      } else if (theta > M_HALFPI + M_FORTPI || theta <= -(M_HALFPI + M_FORTPI)) {
        area = AREA_2;
        theta = (theta >= 0.0 ? theta - M_PI : theta + M_PI);
      } else {
        area = AREA_3;
        theta += M_HALFPI;
      }
    }
    return {
      area: area,
      theta: theta
    };
  }

  /* Helper function: shift the longitude. */
  function qsc_shift_lon_origin(lon, offset) {
    var slon = lon + offset;
    if (slon < -M_PI) {
      slon += M_TWOPI;
    } else if (slon > +M_PI) {
      slon -= M_TWOPI;
    }
    return slon;
  }
}


pj_add(pj_robin, 'robin', 'Robinson', 'PCyl., Sph.');

function pj_robin(P) {
  var X = to_float([
    [1, 2.2199e-17, -7.15515e-05, 3.1103e-06],
    [0.9986, -0.000482243, -2.4897e-05, -1.3309e-06],
    [0.9954, -0.00083103, -4.48605e-05, -9.86701e-07],
    [0.99, -0.00135364, -5.9661e-05, 3.6777e-06],
    [0.9822, -0.00167442, -4.49547e-06, -5.72411e-06],
    [0.973, -0.00214868, -9.03571e-05, 1.8736e-08],
    [0.96, -0.00305085, -9.00761e-05, 1.64917e-06],
    [0.9427, -0.00382792, -6.53386e-05, -2.6154e-06],
    [0.9216, -0.00467746, -0.00010457, 4.81243e-06],
    [0.8962, -0.00536223, -3.23831e-05, -5.43432e-06],
    [0.8679, -0.00609363, -0.000113898, 3.32484e-06],
    [0.835, -0.00698325, -6.40253e-05, 9.34959e-07],
    [0.7986, -0.00755338, -5.00009e-05, 9.35324e-07],
    [0.7597, -0.00798324, -3.5971e-05, -2.27626e-06],
    [0.7186, -0.00851367, -7.01149e-05, -8.6303e-06],
    [0.6732, -0.00986209, -0.000199569, 1.91974e-05],
    [0.6213, -0.010418, 8.83923e-05, 6.24051e-06],
    [0.5722, -0.00906601, 0.000182, 6.24051e-06],
    [0.5322, -0.00677797, 0.000275608, 6.24051e-06]
  ]);

  var Y = to_float([
    [-5.20417e-18, 0.0124, 1.21431e-18, -8.45284e-11],
    [0.062, 0.0124, -1.26793e-09, 4.22642e-10],
    [0.124, 0.0124, 5.07171e-09, -1.60604e-09],
    [0.186, 0.0123999, -1.90189e-08, 6.00152e-09],
    [0.248, 0.0124002, 7.10039e-08, -2.24e-08],
    [0.31, 0.0123992, -2.64997e-07, 8.35986e-08],
    [0.372, 0.0124029, 9.88983e-07, -3.11994e-07],
    [0.434, 0.0123893, -3.69093e-06, -4.35621e-07],
    [0.4958, 0.0123198, -1.02252e-05, -3.45523e-07],
    [0.5571, 0.0121916, -1.54081e-05, -5.82288e-07],
    [0.6176, 0.0119938, -2.41424e-05, -5.25327e-07],
    [0.6769, 0.011713, -3.20223e-05, -5.16405e-07],
    [0.7346, 0.0113541, -3.97684e-05, -6.09052e-07],
    [0.7903, 0.0109107, -4.89042e-05, -1.04739e-06],
    [0.8435, 0.0103431, -6.4615e-05, -1.40374e-09],
    [0.8936, 0.00969686, -6.4636e-05, -8.547e-06],
    [0.9394, 0.00840947, -0.000192841, -4.2106e-06],
    [0.9761, 0.00616527, -0.000256, -4.2106e-06],
    [1, 0.00328947, -0.000319159, -4.2106e-06]
  ]);

  var FXC = 0.8487,
      FYC = 1.3523,
      C1 = 11.45915590261646417544,
      RC1 = 0.08726646259971647884,
      NODES = 18,
      ONEEPS = 1.000001,
      EPS = 1e-8;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var i, dphi;
    i = floor((dphi = fabs(lp.phi)) * C1);
    if (i < 0) f_error();
    if (i >= NODES) i = NODES - 1;
    dphi = RAD_TO_DEG * (dphi - RC1 * i);
    xy.x = V(X[i], dphi) * FXC * lp.lam;
    xy.y = V(Y[i], dphi) * FYC;
    if (lp.phi < 0) xy.y = -xy.y;
  }

  function s_inv(xy, lp) {
    var t, t1, T, i;
    lp.lam = xy.x / FXC;
    lp.phi = fabs(xy.y / FYC);
    if (lp.phi >= 1) { /* simple pathologic cases */
      if (lp.phi > ONEEPS) i_error();
      else {
        lp.phi = xy.y < 0 ? -M_HALFPI : M_HALFPI;
        lp.lam /= X[NODES][0];
      }
    } else { /* general problem */
      /* in Y space, reduce to table interval */
      i = floor(lp.phi * NODES);
      if (i < 0 || i >= NODES) {
        return i_error();
      }
      for (;;) {
        if (Y[i][0] > lp.phi) --i;
        else if (Y[i+1][0] <= lp.phi) ++i;
        else break;
      }
      T = new Float32Array(Y[i]); // copy row to avoid mutating constants
      /* first guess, linear interp */
      t = 5 * (lp.phi - T[0])/(Y[i+1][0] - T[0]);
      /* make into root */
      T[0] -= lp.phi;
      for (;;) { /* Newton-Raphson reduction */
        t -= t1 = V(T,t) / DV(T,t);
        if (fabs(t1) < EPS) break;
      }
      lp.phi = (5 * i + t) * DEG_TO_RAD;
      if (xy.y < 0) lp.phi = -lp.phi;
      lp.lam /= V(X[i], t);
    }
  }

  function V(C, z) {
    return C[0] + z * (C[1] + z * (C[2] + z * C[3]));
  }

  function DV(C, z) {
    return C[1] + z * (C[2] + C[2] + z * 3 * C[3]);
  }

  // convert constants to single-precision floats, for compatibility with
  // Proj.4 tests (PJ_robin.c uses floats instead of doubles)
  function to_float(rows) {
    return rows.map(function(row) {
      return new Float32Array(row);
    });
  }
}


pj_add(pj_get_sconic('EULER'), 'euler', 'Euler', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('MURD1'), 'murd1', 'Murdoch I', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('MURD2'), 'murd2', 'Murdoch II', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('MURD3'), 'murd3', 'Murdoch III', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('PCONIC'), 'pconic', 'Perspective Conic', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('TISSOT'), 'tissot', 'Tissot', 'Conic, Sph\nlat_1= and lat_2=');
pj_add(pj_get_sconic('VITK1'), 'vitk1', 'Vitkovsky I', 'Conic, Sph\nlat_1= and lat_2=');

function pj_get_sconic(type) {
  return function(P) {
    pj_sconic(P, type);
  };
}

function pj_sconic(P, type) {
  var del, cs;
  var p1, p2;
  var n;
  var rho_c;
  var rho_0;
  var sig;
  var c1, c2;
  var EPS = 1e-10;

  if (!pj_param(P.params, "tlat_1") || !pj_param(P.params, "tlat_2")) {
    e_error(-41);
  } else {
    p1 = pj_param(P.params, "rlat_1");
    p2 = pj_param(P.params, "rlat_2");
    del = 0.5 * (p2 - p1);
    sig = 0.5 * (p2 + p1);
    if (fabs(del) < EPS || fabs(sig) < EPS) {
      e_error(-42);
    }
  }

  switch (type) {
    case 'TISSOT':
      n = sin(sig);
      cs = cos(del);
      rho_c = n / cs + cs / n;
      rho_0 = sqrt((rho_c - 2 * sin(P.phi0)) / n);
      break;

    case 'MURD1':
      rho_c = sin(del) / (del * tan(sig)) + sig;
      rho_0 = rho_c - P.phi0;
      n = sin(sig);
      break;

    case 'MURD2':
      rho_c = (cs = sqrt(cos(del))) / tan(sig);
      rho_0 = rho_c + tan(sig - P.phi0);
      n = sin(sig) * cs;
      break;

    case 'MURD3':
      rho_c = del / (tan(sig) * tan(del)) + sig;
      rho_0 = rho_c - P.phi0;
      n = sin(sig) * sin(del) * tan(del) / (del * del);
      break;

    case 'EULER':
      n = sin(sig) * sin(del) / del;
      del *= 0.5;
      rho_c = del / (tan(del) * tan(sig)) + sig;
      rho_0 = rho_c - P.phi0;
      break;

    case 'PCONIC':
      n = sin(sig);
      c2 = cos(del);
      c1 = 1 / tan(sig);
      if (fabs(del = P.phi0 - sig) - EPS >= M_HALFPI)
        e_error(-43);
      rho_0 = c2 * (c1 - tan(del));
      break;

    case 'VITK1':
      n = (cs = tan(del)) * sin(sig) / del;
      rho_c = del / (cs * tan(sig)) + sig;
      rho_0 = rho_c - P.phi0;
      break;
  }

  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var rho;

    switch (type) {
      case 'MURD2':
        rho = rho_c + tan(sig - lp.phi);
        break;
      case 'PCONIC':
        rho = c2 * (c1 - tan(lp.phi - sig));
        break;
      default:
        rho = rho_c - lp.phi;
        break;
    }
    xy.x = rho * sin(lp.lam *= n);
    xy.y = rho_0 - rho * cos(lp.lam);
  }

  function s_inv(xy, lp) {
    var rho;

    rho = hypot(xy.x, xy.y = rho_0 - xy.y);
    if (n < 0) {
      rho = -rho;
      xy.x = -xy.x;
      xy.y = -xy.y;
    }

    lp.lam = atan2(xy.x, xy.y) / n;

    switch (type) {
      case 'PCONIC':
        lp.phi = atan(c1 - rho / c2) + sig;
        break;
      case 'MURD2':
        lp.phi = sig - atan(rho - rho_c);
        break;
      default:
        lp.phi = rho_c - rho;
    }
  }
}


pj_add(pj_somerc, 'somerc', 'Swiss. Obl. Mercator', 'Cyl, Ell\nFor CH1903');

function pj_somerc(P) {
  var K, c, hlf_e, kR, cosp0, sinp0;
  var EPS = 1.e-10;
  var NITER = 6;
  var cp, phip0, sp;
  hlf_e = 0.5 * P.e;
  cp = cos (P.phi0);
  cp *= cp;
  c = sqrt (1 + P.es * cp * cp * P.rone_es);
  sp = sin (P.phi0);
  cosp0 = cos(phip0 = aasin(sinp0 = sp / c));
  sp *= P.e;
  K = log (tan(M_FORTPI + 0.5 * phip0)) - c * (
      log (tan(M_FORTPI + 0.5 * P.phi0)) - hlf_e *
      log ((1 + sp) / (1 - sp)));
  kR = P.k0 * sqrt(P.one_es) / (1 - sp * sp);
  P.inv = e_inv;
  P.fwd = e_fwd;

  function e_fwd(lp, xy) {
    var phip, lamp, phipp, lampp, sp, cp;
    sp = P.e * sin(lp.phi);
    phip = 2* atan(exp(c * (log(tan(M_FORTPI + 0.5 * lp.phi)) -
        hlf_e * log((1 + sp)/(1 - sp))) + K)) - M_HALFPI;
    lamp = c * lp.lam;
    cp = cos(phip);
    phipp = aasin(cosp0 * sin(phip) - sinp0 * cp * cos(lamp));
    lampp = aasin(cp * sin(lamp) / cos(phipp));
    xy.x = kR * lampp;
    xy.y = kR * log(tan(M_FORTPI + 0.5 * phipp));
  }

  function e_inv(xy, lp) {
    var phip, lamp, phipp, lampp, cp, esp, con, delp;
    var i;
    phipp = 2 * (atan(exp(xy.y / kR)) - M_FORTPI);
    lampp = xy.x / kR;
    cp = cos (phipp);
    phip = aasin(cosp0 * sin(phipp) + sinp0 * cp * cos(lampp));
    lamp = aasin(cp * sin(lampp) / cos(phip));
    con = (K - log(tan(M_FORTPI + 0.5 * phip)))/c;
    for (i = NITER; i; --i) {
      esp = P.e * sin(phip);
      delp = (con + log(tan(M_FORTPI + 0.5 * phip)) - hlf_e *
        log((1 + esp)/(1 - esp))) * (1 - esp * esp) * cos(phip) * P.rone_es;
      phip -= delp;
      if (fabs(delp) < EPS)
        break;
    }
    if (i) {
      lp.phi = phip;
      lp.lam = lamp / c;
    } else
      i_error();
  }
}


pj_add(pj_stere, 'stere', 'Stereographic', 'Azi, Sph&Ell\nlat_ts=');
pj_add(pj_ups, 'ups', 'Universal Polar Stereographic', 'Azi, Sph&Ell\nsouth');

function pj_ups(P) {
  P.phi0 = pj_param(P.params, "bsouth") ? -M_HALFPI : M_HALFPI;
  P.k0 = 0.994;
  P.x0 = 2000000;
  P.y0 = 2000000;
  P.lam0 = 0;
  if (!P.es) e_error(-34);
  pj_stere_init(P, M_HALFPI);
}

function pj_stere(P) {
  var phits = pj_param (P.params, "tlat_ts") ? pj_param (P.params, "rlat_ts") : M_HALFPI;
  pj_stere_init(P, phits);
}

function pj_stere_init(P, phits) {
  var EPS10 = 1.e-10,
      TOL = 1.e-8,
      NITER = 8,
      CONV = 1.e-10,
      S_POLE = 0,
      N_POLE = 1,
      OBLIQ= 2,
      EQUIT = 3;
  var X, t, sinph0, cosph0;
  var sinX1, cosX1, akm1, mode;

  if (fabs((t = fabs (P.phi0)) - M_HALFPI) < EPS10)
      mode = P.phi0 < 0 ? S_POLE : N_POLE;
  else
      mode = t > EPS10 ? OBLIQ: EQUIT;
  phits = fabs (phits);

  if (P.es) {
    switch (mode) {
      case N_POLE:
      case S_POLE:
        if (fabs (phits - M_HALFPI) < EPS10)
            akm1 = 2 * P.k0 /
               sqrt(pow(1 + P.e, 1 + P.e) * pow(1 - P.e, 1 - P.e));
        else {
            akm1 = cos(phits) /
               pj_tsfn(phits, t = sin(phits), P.e);
            t *= P.e;
            akm1 /= sqrt(1 - t * t);
        }
        break;
      case EQUIT:
      case OBLIQ:
        t = sin(P.phi0);
        X = 2 * atan(ssfn(P.phi0, t, P.e)) - M_HALFPI;
        t *= P.e;
        akm1 = 2 * P.k0 * cos(P.phi0) / sqrt(1 - t * t);
        sinX1 = sin(X);
        cosX1 = cos(X);
        break;
    }
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    switch (mode) {
      case OBLIQ:
        sinph0 = sin(P.phi0);
        cosph0 = cos(P.phi0);
        /* falls through */
      case EQUIT:
        akm1 = 2 * P.k0;
        break;
      case S_POLE:
      case N_POLE:
        akm1 = fabs(phits - M_HALFPI) >= EPS10 ?
           cos(phits) / tan(M_FORTPI - 0.5 * phits) : 2 * P.k0;
        break;
    }
    P.fwd = s_fwd;
    P.inv = s_inv;
  }

  function e_fwd(lp, xy) {
    var coslam, sinlam, sinX = 0, cosX = 0, X, A, sinphi;
    coslam = cos(lp.lam);
    sinlam = sin(lp.lam);
    sinphi = sin(lp.phi);
    if (mode == OBLIQ|| mode == EQUIT) {
        sinX = sin(X = 2 * atan(ssfn(lp.phi, sinphi, P.e)) - M_HALFPI);
        cosX = cos(X);
    }

    switch (mode) {
      case OBLIQ:
        A = akm1 / (cosX1 * (1 + sinX1 * sinX +
           cosX1 * cosX * coslam));
        xy.y = A * (cosX1 * sinX - sinX1 * cosX * coslam);
        xy.x = A * cosX;
        break;
      case EQUIT:
        /* zero division is handled in pj_fwd */
        A = akm1 / (1 + cosX * coslam);
        xy.y = A * sinX;
        xy.x = A * cosX;
        break;
      case S_POLE:
        lp.phi = -lp.phi;
        coslam = -coslam;
        sinphi = -sinphi;
        /* falls through */
      case N_POLE:
        xy.x = akm1 * pj_tsfn (lp.phi, sinphi, P.e);
        xy.y = - xy.x * coslam;
        break;
    }
    xy.x = xy.x * sinlam;
  }

  function s_fwd(lp, xy) {
    var phi = lp.phi,
        sinphi = sin(phi),
        cosphi = cos(phi),
        coslam = cos(lp.lam),
        sinlam = sin(lp.lam);

    switch (mode) {
    case EQUIT:
    case OBLIQ:
      if (mode == EQUIT) {
        xy.y = 1 + cosphi * coslam;
      } else {
        xy.y = 1 + sinph0 * sinphi + cosph0 * cosphi * coslam;
      }
      if (xy.y <= EPS10) f_error();
      xy.x = (xy.y = akm1 / xy.y) * cosphi * sinlam;
      xy.y *= (mode == EQUIT) ? sinphi :
         cosph0 * sinphi - sinph0 * cosphi * coslam;
      break;
    case N_POLE:
      coslam = - coslam;
      phi = - phi;
      /* falls through */
    case S_POLE:
      if (fabs(phi - M_HALFPI) < TOL) f_error();
      xy.x = sinlam * (xy.y = akm1 * tan (M_FORTPI + 0.5 * phi));
      xy.y *= coslam;
      break;
    }
  }

  function e_inv(xy, lp) {
    var phi = lp.phi,
        tp=0, phi_l=0, halfe=0, halfpi=0,
        cosphi, sinphi, rho, i;
    rho = hypot (xy.x, xy.y);

    switch (mode) {
      case OBLIQ:
      case EQUIT:
        cosphi = cos ( tp = 2 * atan2(rho * cosX1 , akm1));
        sinphi = sin (tp);
                if ( rho == 0 )
            phi_l = asin (cosphi * sinX1);
                else
            phi_l = asin (cosphi * sinX1 + (xy.y * sinphi * cosX1 / rho));

        tp = tan (0.5 * (M_HALFPI + phi_l));
        xy.x *= sinphi;
        xy.y = rho * cosX1 * cosphi - xy.y * sinX1* sinphi;
        halfpi = M_HALFPI;
        halfe = 0.5 * P.e;
        break;
      case N_POLE:
        xy.y = -xy.y;
        /* falls through */
      case S_POLE:
        phi_l = M_HALFPI - 2 * atan (tp = - rho / akm1);
        halfpi = -M_HALFPI;
        halfe = -0.5 * P.e;
        break;
    }

    for (i = 0; i < NITER; i++, phi_l = lp.phi) {
      sinphi = P.e * sin(phi_l);
      lp.phi = 2 * atan (tp * pow ((1+sinphi)/(1-sinphi), halfe)) - halfpi;
      if (fabs(phi_l - lp.phi) < CONV) {
        if (mode == S_POLE)
          lp.phi = -lp.phi;
        lp.lam = (xy.x == 0 && xy.y == 0) ? 0 : atan2 (xy.x, xy.y);
        return;
      }
    }
    i_error();
  }

  function s_inv(xy, lp) {
    var c, rh, sinc, cosc;
    sinc = sin(c = 2 * atan ((rh = hypot(xy.x, xy.y)) / akm1));
    cosc = cos(c);
    lp.lam = 0;

    switch (mode) {
      case EQUIT:
        if (fabs (rh) <= EPS10)
            lp.phi = 0;
        else
            lp.phi = asin (xy.y * sinc / rh);
        if (cosc != 0 || xy.x != 0)
            lp.lam = atan2 (xy.x * sinc, cosc * rh);
        break;
      case OBLIQ:
        if (fabs (rh) <= EPS10)
            lp.phi = P.phi0;
        else
            lp.phi = asin (cosc * sinph0 + xy.y * sinc * cosph0 / rh);
        if ((c = cosc - sinph0 * sin (lp.phi)) != 0 || xy.x != 0)
            lp.lam = atan2 (xy.x * sinc * cosph0, c * rh);
        break;
      case N_POLE:
        xy.y = -xy.y;
        /* falls through */
      case S_POLE:
        if (fabs (rh) <= EPS10)
            lp.phi = P.phi0;
        else
            lp.phi = asin (mode == S_POLE ? - cosc : cosc);
        lp.lam = (xy.x == 0 && xy.y == 0) ? 0 : atan2 (xy.x, xy.y);
        break;
    }
  }

  function ssfn(phit, sinphi, eccen) {
    sinphi *= eccen;
    return tan(0.5 * (M_HALFPI + phit)) *
       pow ((1 - sinphi) / (1 + sinphi), 0.5 * eccen);
  }
}




function srat(esinp, exp) {
  return pow((1-esinp)/(1+esinp), exp);
}

function pj_gauss_ini(e, phi0) {
  var es = e * e,
      sphi = sin(phi0),
      cphi = cos(phi0),
      rc = sqrt(1 - es) / (1 - es * sphi * sphi),
      C = sqrt(1 + es * cphi * cphi * cphi * cphi / (1 - es)),
      // ignoring Proj.4 div0 check (seems unneccessary)
      chi = asin(sphi / C),
      ratexp = 0.5 * C * e,
      K = tan(0.5 * chi + M_FORTPI) / (pow(tan(0.5 * phi0 + M_FORTPI), C) *
        srat(e * sphi, ratexp));
  return {e: e, K: K, C: C, chi: chi, ratexp: ratexp, rc: rc};
}

function pj_gauss(elp, en) {
  return {
    phi: 2 * atan( en.K * pow(tan(0.5 * elp.phi + M_FORTPI), en.C) *
      srat(en.e * sin(elp.phi), en.ratexp) ) - M_HALFPI,
    lam: en.C * elp.lam
  };
}

function pj_inv_gauss(lp, en) {
  var MAX_ITER = 20,
      DEL_TOL = 1e-14,
      phi1 = lp.phi,
      num = pow(tan(0.5 * lp.phi + M_FORTPI)/en.K, 1/en.C),
      i, phi;
  lp.lam /= en.C;
  for (i = MAX_ITER; i>0; --i) {
    phi = 2 * atan(num * srat(en.e * sin(lp.phi), -0.5 * en.e)) - M_HALFPI;
    if (fabs(phi - lp.phi) < DEL_TOL) break;
    lp.phi = phi;
  }
  if (!i) pj_ctx_set_errno(-17); /* convergence failed */
}


pj_add(pj_sterea, 'sterea', 'Oblique Stereographic Alternative', 'Azimuthal, Sph&Ell');

function pj_sterea(P) {
  var en = pj_gauss_ini(P.e, P.phi0),
      phic0 = en.chi,
      R = en.rc,
      R2 = 2 * R,
      sinc0 = sin(phic0),
      cosc0 = cos(phic0);

  P.fwd = e_fwd;
  P.inv = e_inv;

  function e_fwd(lp, xy) {
    var cosc, sinc, cosl, k;
    lp = pj_gauss(lp, en);
    sinc = sin(lp.phi);
    cosc = cos(lp.phi);
    cosl = cos(lp.lam);
    k = P.k0 * R2 / (1 + sinc0 * sinc + cosc0 * cosc * cosl);
    xy.x = k * cosc * sin(lp.lam);
    xy.y = k * (cosc0 * sinc - sinc0 * cosc * cosl);
  }

  function e_inv(xy, lp) {
    var x = xy.x / P.k0,
        y = xy.y / P.k0,
        rho, c, sinc, cosc;
    if ((rho = hypot(x, y))) {
      c = 2 * atan2(rho, R2);
      sinc = sin(c);
      cosc = cos(c);
      lp.phi = asin(cosc * sinc0 + y * sinc * cosc0 / rho);
      lp.lam = atan2(x * sinc, rho * cosc0 * cosc - y * sinc0 * sinc);
    } else {
      lp.phi = phic0;
      lp.lam = 0;
    }
    pj_inv_gauss(lp, en);
  }
}


pj_add(pj_kav5, 'kav5', 'Kavraisky V', 'PCyl., Sph.');
pj_add(pj_qua_aut, 'qua_aut', 'Quartic Authalic', 'PCyl., Sph.');
pj_add(pj_fouc, 'fouc', 'Foucaut', 'PCyl., Sph.');
pj_add(pj_mbt_s, 'mbt_s', 'McBryde-Thomas Flat-Polar Sine (No. 1)', 'PCyl., Sph.');

function pj_kav5(P) {
  pj_sts(P, 1.50488, 1.35439, false);
}

function pj_qua_aut(P) {
  pj_sts(P, 2, 2, false);
}

function pj_fouc(P) {
  pj_sts(P, 2, 2, true);
}

function pj_mbt_s(P) {
  pj_sts(P, 1.48875, 1.36509, false);
}

function pj_sts(P, p, q, tan_mode) {
  var C_x = q / p;
  var C_y = p;
  var C_p = 1 / q;
  P.inv = s_inv;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var c;
    xy.x = C_x * lp.lam * cos(lp.phi);
    xy.y = C_y;
    lp.phi *= C_p;
    c = cos(lp.phi);
    if (tan_mode) {
      xy.x *= c * c;
      xy.y *= tan(lp.phi);
    } else {
      xy.x /= c;
      xy.y *= sin (lp.phi);
    }
  }

  function s_inv(xy, lp) {
    var c;
    xy.y /= C_y;
    c = cos (lp.phi = tan_mode ? atan(xy.y) : aasin(xy.y));
    lp.phi /= C_p;
    lp.lam = xy.x / (C_x * cos(lp.phi));
    if (tan_mode)
      lp.lam /= c * c;
    else
      lp.lam *= c;
  }
}


pj_add(pj_tcea, 'tcea', 'Transverse Cylindrical Equal Area', 'Cyl, Sph');

function pj_tcea(P) {
  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = cos (lp.phi) * sin (lp.lam) / P.k0;
    xy.y = P.k0 * (atan2 (tan (lp.phi), cos (lp.lam)) - P.phi0);
  }

  function s_inv(xy, lp) {
    var t;
    xy.y = xy.y / P.k0 + P.phi0;
    xy.x *= P.k0;
    t = sqrt (1 - xy.x * xy.x);
    lp.phi = asin (t * sin (xy.y));
    lp.lam = atan2 (xy.x, t * cos (xy.y));
  }
}


pj_add(pj_times, 'times', 'Times', 'Cyl, Sph');

function pj_times(P) {
  P.es = 0;
  P.fwd = function(lp, xy) {
    var t = tan(lp.phi / 2);
    var s = sin(M_FORTPI * t);
    xy.x = lp.lam * (0.74482 - 0.34588 * s * s);
    xy.y = 1.70711 *  t;
  };
  P.inv = function (xy, lp) {
    var t = xy.y / 1.70711;
    var s = sin(M_FORTPI * t);
    lp.lam = xy.x / (0.74482 - 0.34588 * s * s);
    lp.phi = 2 * atan(t);
  };
}


pj_add(pj_tmerc, 'tmerc', 'Transverse Mercator', 'Cyl, Sph&Ell');
pj_add(pj_utm, 'utm', 'Universal Transverse Mercator (UTM)', 'Cyl, Sph\nzone= south');

function pj_utm_zone(P) {

}

function pj_utm(P) {
  var zone;
  if (!P.es) e_error(-34);
  P.y0 = pj_param(P.params, "bsouth") ? 10000000 : 0;
  P.x0 = 500000;
  if (pj_param(P.params, "tzone")) {
    if ((zone = pj_param(P.params, "izone")) > 0 && zone <= 60)
      --zone;
    else
      e_error(-35);
  } else { /* nearest central meridian input */
    zone = floor((adjlon(P.lam0) + M_PI) * 30 / M_PI);
    if (zone < 0)
      zone = 0;
    else if (zone >= 60)
      zone = 59;
  }
  P.lam0 = (zone + 0.5) * M_PI / 30 - M_PI;
  P.k0 = 0.9996;
  P.phi0 = 0;
  pj_etmerc(P);
}

function pj_tmerc(P) {
  // TODO: support +algo option
  if (pj_param(P.params, "bapprox")) {
    pj_tmerc_approx(P);
  } else {
    pj_tmerc_auto(P);
  }
}

function pj_tmerc_auto(P) {
  if (P.es === 0) {
    return pj_tmerc_approx(P);
  }
  pj_etmerc(P);
  var etfwd = P.fwd;
  var etinv = P.inv;
  pj_tmerc_approx(P);
  var fwd = P.fwd;
  var inv = P.inv;

  P.fwd = function(lp, xy) {
    if (fabs(lp.lam) > 3 * DEG_TO_RAD) etfwd(lp, xy);
    else fwd(lp, xy);
  };

  P.inv = function(xy, lp) {
    // See https://github.com/OSGeo/PROJ/blob/master/src/projections/tmerc.cpp
    if (fabs(xy.x) > 0.053 - 0.022 * xy.y * xy.y) etinv(xy, lp);
    else inv(xy, lp);
  };
}

function pj_tmerc_approx(P) {
  var EPS10 = 1e-10,
      FC1 = 1,
      FC2 = 0.5,
      FC3 = 0.16666666666666666666,
      FC4 = 0.08333333333333333333,
      FC5 = 0.05,
      FC6 = 0.03333333333333333333,
      FC7 = 0.02380952380952380952,
      FC8 = 0.01785714285714285714;
  var esp, ml0, en;

  if (P.es) {
    if (!(en = pj_enfn(P.es))) // in pj_mlfn.js
        e_error_0();
    ml0 = pj_mlfn(P.phi0, sin(P.phi0), cos(P.phi0), en);
    esp = P.es / (1 - P.es);
    P.fwd = e_fwd;
    P.inv = e_inv;
  } else {
    esp = P.k0;
    ml0 = 0.5 * esp;
    P.fwd = s_fwd;
    P.inv = s_inv;
  }

  function e_fwd(lp, xy) {
    var sinphi, cosphi, t, al, als, n;
    if ( lp.lam < -M_HALFPI || lp.lam > M_HALFPI ) {
      pj_ctx_set_errno(-14);
      return;
    }

    sinphi = sin (lp.phi);
    cosphi = cos (lp.phi);
    t = fabs(cosphi) > EPS10 ? sinphi/cosphi : 0;
    t *= t;
    al = cosphi * lp.lam;
    als = al * al;
    al /= sqrt(1 - P.es * sinphi * sinphi);
    n = esp * cosphi * cosphi;
    xy.x = P.k0 * al * (FC1 +
        FC3 * als * (1 - t + n +
        FC5 * als * (5 + t * (t - 18) + n * (14 - 58 * t) +
        FC7 * als * (61 + t * ( t * (179 - t) - 479 ) )
        )));
    xy.y = P.k0 * (pj_mlfn(lp.phi, sinphi, cosphi, en) - ml0 +
        sinphi * al * lp.lam * FC2 * ( 1 +
        FC4 * als * (5 - t + n * (9 + 4 * n) +
        FC6 * als * (61 + t * (t - 58) + n * (270 - 330 * t) +
        FC8 * als * (1385 + t * ( t * (543 - t) - 3111) )
        ))));
  }

  function s_fwd(lp, xy) {
    var b, cosphi;
    /*
     * Fail if our longitude is more than 90 degrees from the
     * central meridian since the results are essentially garbage.
     * Is error -20 really an appropriate return value?
     *
     *  http://trac.osgeo.org/proj/ticket/5
     */
    if( lp.lam < -M_HALFPI || lp.lam > M_HALFPI ) {
        pj_ctx_set_errno(-14);
        return;
    }
    cosphi = cos(lp.phi);
    b = cosphi * sin (lp.lam);
    if (fabs(fabs(b) - 1) <= EPS10) f_error();

    xy.x = ml0 * log ((1 + b) / (1 - b));
    xy.y = cosphi * cos(lp.lam) / sqrt(1 - b * b);

    b = fabs ( xy.y );
    if (b >= 1) {
      if ((b - 1) > EPS10) {
        f_error();
      } else {
        xy.y = 0;
      }
    } else
      xy.y = acos(xy.y);

    if (lp.phi < 0)
      xy.y = -xy.y;
    xy.y = esp * (xy.y - P.phi0);
  }

  function e_inv(xy, lp) {
    var n, con, cosphi, d, ds, sinphi, t;
    lp.phi = pj_inv_mlfn(ml0 + xy.y / P.k0, P.es, en);
    if (fabs(lp.phi) >= M_HALFPI) {
      lp.phi = xy.y < 0 ? -M_HALFPI : M_HALFPI;
      lp.lam = 0;
    } else {
      sinphi = sin(lp.phi);
      cosphi = cos(lp.phi);
      t = fabs (cosphi) > 1e-10 ? sinphi/cosphi : 0;
      n = esp * cosphi * cosphi;
      d = xy.x * sqrt (con = 1 - P.es * sinphi * sinphi) / P.k0;
      con *= t;
      t *= t;
      ds = d * d;
      lp.phi -= (con * ds / (1-P.es)) * FC2 * (1 -
        ds * FC4 * (5 + t * (3 - 9 *  n) + n * (1 - 4 * n) -
        ds * FC6 * (61 + t * (90 - 252 * n + 45 * t) + 46 * n -
        ds * FC8 * (1385 + t * (3633 + t * (4095 + 1575 * t)))
        )));
      lp.lam = d * (FC1 - ds * FC3 * (1 + 2 * t + n -
        ds * FC5 * (5 + t * (28 + 24*t + 8*n) + 6 * n -
        ds * FC7 * (61 + t * (662 + t * (1320 + 720 * t)))
        ))) / cosphi;
    }
  }

  function s_inv(xy, lp) {
    var h = exp(xy.x / esp);
    var g = 0.5 * (h - 1 / h);
    h = cos (P.phi0 + xy.y / esp);
    lp.phi = asin(sqrt((1 - h * h) / (1 + g * g)));
    /* Make sure that phi is on the correct hemisphere when false northing is used */
    if (xy.y < 0 && -lp.phi + P.phi0 < 0) lp.phi = -lp.phi;
    lp.lam = (g || h) ? atan2(g, h) : 0;
  }
}


pj_add(pj_tpeqd, 'tpeqd', 'Two Point Equidistant', 'Misc Sph\nlat_1= lon_1= lat_2= lon_2=');

function pj_tpeqd(P) {
  var cp1, sp1, cp2, sp2, ccs, cs, sc, r2z0, z02, dlam2;
  var hz0, thz0, rhshz0, ca, sa, lamp, lamc;
  var lam_1, lam_2, phi_1, phi_2, A12, pp;

  /* get control point locations */
  phi_1 = pj_param(P.params, "rlat_1");
  lam_1 = pj_param(P.params, "rlon_1");
  phi_2 = pj_param(P.params, "rlat_2");
  lam_2 = pj_param(P.params, "rlon_2");

  if (phi_1 == phi_2 && lam_1 == lam_2)
      e_error(-25);
  P.lam0  = adjlon(0.5 * (lam_1 + lam_2));
  dlam2 = adjlon(lam_2 - lam_1);
  cp1 = cos (phi_1);
  cp2 = cos (phi_2);
  sp1 = sin (phi_1);
  sp2 = sin (phi_2);
  cs = cp1 * sp2;
  sc = sp1 * cp2;
  ccs = cp1 * cp2 * sin(dlam2);
  z02 = aacos(sp1 * sp2 + cp1 * cp2 * cos(dlam2));
  hz0 = 0.5 * z02;
  A12 = atan2(cp2 * sin(dlam2),
    cp1 * sp2 - sp1 * cp2 * cos(dlam2));
  ca = cos(pp = aasin(cp1 * sin(A12)));
  sa = sin(pp);
  lamp = adjlon(atan2(cp1 * cos(A12), sp1) - hz0);
  dlam2 *= 0.5;
  lamc = M_HALFPI - atan2(sin(A12) * sp1, cos(A12)) - dlam2;
  thz0 = tan (hz0);
  rhshz0 = 0.5 / sin(hz0);
  r2z0 = 0.5 / z02;
  z02 *= z02;

  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    var t, z1, z2, dl1, dl2, sp, cp;
    sp = sin(lp.phi);
    cp = cos(lp.phi);
    z1 = aacos(sp1 * sp + cp1 * cp * cos (dl1 = lp.lam + dlam2));
    z2 = aacos(sp2 * sp + cp2 * cp * cos (dl2 = lp.lam - dlam2));
    z1 *= z1;
    z2 *= z2;
    xy.x = r2z0 * (t = z1 - z2);
    t = z02 - t;
    xy.y = r2z0 * asqrt (4 * z02 * z2 - t * t);
    if ((ccs * sp - cp * (cs * sin(dl1) - sc * sin(dl2))) < 0)
      xy.y = -xy.y;
  }

  function s_inv(xy, lp) {
    var cz1, cz2, s, d, cp, sp;
    cz1 = cos(hypot(xy.y, xy.x + hz0));
    cz2 = cos(hypot(xy.y, xy.x - hz0));
    s = cz1 + cz2;
    d = cz1 - cz2;
    lp.lam = - atan2(d, (s * thz0));
    lp.phi = aacos(hypot(thz0 * s, d) * rhshz0);
    if ( xy.y < 0 )
      lp.phi = - lp.phi;
    /* lam--phi now in system relative to P1--P2 base equator */
    sp = sin(lp.phi);
    cp = cos(lp.phi);
    lp.phi = aasin(sa * sp + ca * cp * (s = cos(lp.lam -= lamp)));
    lp.lam = atan2(cp * sin(lp.lam), sa * cp * s - ca * sp) + lamc;
  }
}


pj_add(pj_urm5, 'urm5', 'Urmaev V', 'PCyl., Sph., no inv.\nn= q= alpha=');

function pj_urm5(P) {
  var m, rmn, q3, n;
  var alpha, t;
  n = pj_param(P.params, "dn");
  if (n > 0 && n <= 1 === false) {
    e_error(-40);
  }
  q3 = pj_param(P.params, "dq") / 3;
  alpha = pj_param(P.params, "ralpha");
  t = n * sin (alpha);
  m = cos (alpha) / sqrt (1 - t * t);
  rmn = 1 / (m * n);

  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var t = lp.phi = aasin (n * sin (lp.phi));
    xy.x = m * lp.lam * cos (lp.phi);
    t *= t;
    xy.y = lp.phi * (1 + t * q3) * rmn;
  }
}


pj_add(pj_urmfps, 'urmfps', 'Urmaev Flat-Polar Sinusoidal', 'PCyl, Sph.\nn=');
pj_add(pj_wag1, 'wag1', 'Wagner I (Kavraisky VI)', 'PCyl, Sph.');


function pj_wag1(P) {
  pj_urmfps_init(P, 0.8660254037844386467637231707);
}

function pj_urmfps(P) {
  var n = pj_param(P.params, "dn");
  if (n <= 0 || n > 1) e_error(-40);
  pj_urmfps_init(P, n);
}

function pj_urmfps_init(P, n) {
  var C_x = 0.8773826753,
      C_y = 1.139753528477 / n;

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var phi = aasin(n * sin(lp.phi));
    xy.x = C_x * lp.lam * cos(phi);
    xy.y = C_y * phi;
  }

  function s_inv(xy, lp) {
    xy.y /= C_y;
    lp.phi = aasin(sin(xy.y) / n);
    lp.lam = xy.x / (C_x * cos(xy.y));
  }
}


pj_add(pj_vandg, 'vandg', 'van der Grinten (I)', 'Misc Sph');
pj_add(pj_vandg2, 'vandg2', 'van der Grinten II', 'Misc Sph, no inv.');
pj_add(pj_vandg3, 'vandg3', 'van der Grinten III', 'Misc Sph, no inv.');
pj_add(pj_vandg4, 'vandg4', 'van der Grinten IV', 'Misc Sph, no inv.');

function pj_vandg(P) {
  var TOL = 1.e-10,
      THIRD = 0.33333333333333333333,
      TWO_THRD = 0.66666666666666666666,
      C2_27 = 0.07407407407407407407,
      PI4_3 = 4.18879020478639098458,
      PISQ = 9.86960440108935861869,
      TPISQ = 19.73920880217871723738,
      HPISQ = 4.93480220054467930934;

  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    var al, al2, g, g2, p2;
    p2 = fabs(lp.phi / M_HALFPI);
    if ((p2 - TOL) > 1) f_error();
    if (p2 > 1)
      p2 = 1;
    if (fabs(lp.phi) <= TOL) {
      xy.x = lp.lam;
      xy.y = 0;
    } else if (fabs(lp.lam) <= TOL || fabs(p2 - 1) < TOL) {
      xy.x = 0;
      xy.y = M_PI * tan(0.5 * asin(p2));
      if (lp.phi < 0) xy.y = -xy.y;
    } else {
      al = 0.5 * fabs(M_PI / lp.lam - lp.lam / M_PI);
      al2 = al * al;
      g = sqrt(1 - p2 * p2);
      g = g / (p2 + g - 1);
      g2 = g * g;
      p2 = g * (2 / p2 - 1);
      p2 = p2 * p2;
      xy.x = g - p2; g = p2 + al2;
      xy.x = M_PI * (al * xy.x + sqrt(al2 * xy.x * xy.x - g * (g2 - p2))) / g;
      if (lp.lam < 0) xy.x = -xy.x;
      xy.y = fabs(xy.x / M_PI);
      xy.y = 1 - xy.y * (xy.y + 2 * al);
      if (xy.y < -TOL) f_error();
      if (xy.y < 0)
        xy.y = 0;
      else
        xy.y = sqrt(xy.y) * (lp.phi < 0 ? -M_PI : M_PI);
    }
  }

  function s_inv(xy, lp) {
    var t, c0, c1, c2, c3, al, r2, r, m, d, ay, x2, y2;
    x2 = xy.x * xy.x;
    if ((ay = fabs(xy.y)) < TOL) {
      lp.phi = 0;
      t = x2 * x2 + TPISQ * (x2 + HPISQ);
      lp.lam = fabs(xy.x) <= TOL ? 0 :
         0.5 * (x2 - PISQ + sqrt(t)) / xy.x;
      return (lp);
    }
    y2 = xy.y * xy.y;
    r = x2 + y2;    r2 = r * r;
    c1 = - M_PI * ay * (r + PISQ);
    c3 = r2 + M_TWOPI * (ay * r + M_PI * (y2 + M_PI * (ay + M_HALFPI)));
    c2 = c1 + PISQ * (r - 3 *  y2);
    c0 = M_PI * ay;
    c2 /= c3;
    al = c1 / c3 - THIRD * c2 * c2;
    m = 2 * sqrt(-THIRD * al);
    d = C2_27 * c2 * c2 * c2 + (c0 * c0 - THIRD * c2 * c1) / c3;
    if (((t = fabs(d = 3 * d / (al * m))) - TOL) <= 1) {
      d = t > 1 ? (d > 0 ? 0 : M_PI) : acos(d);
      lp.phi = M_PI * (m * cos(d * THIRD + PI4_3) - THIRD * c2);
      if (xy.y < 0) lp.phi = -lp.phi;
      t = r2 + TPISQ * (x2 - y2 + HPISQ);
      lp.lam = fabs(xy.x) <= TOL ? 0 :
         0.5 * (r - PISQ + (t <= 0 ? 0 : sqrt(t))) / xy.x;
    } else
        i_error();
  }
}

function pj_vandg2(P) {
  pj_vandg2_init(P, false);
}

function pj_vandg3(P) {
  pj_vandg2_init(P, true);
}

function pj_vandg2_init(P, vdg3) {
  var TOL = 1e-10;
  P.fwd = s_fwd;
  P.es = 0;

  function s_fwd(lp, xy) {
    var x1, at, bt, ct;
    bt = fabs(M_TWO_D_PI * lp.phi);
    if ((ct = 1 - bt * bt) < 0)
      ct = 0;
    else
      ct = sqrt(ct);
    if (fabs(lp.lam) < TOL) {
      xy.x = 0;
      xy.y = M_PI * (lp.phi < 0 ? -bt : bt) / (1 + ct);
    } else {
      at = 0.5 * fabs(M_PI / lp.lam - lp.lam / M_PI);
      if (vdg3) {
          x1 = bt / (1 + ct);
          xy.x = M_PI * (sqrt(at * at + 1 - x1 * x1) - at);
          xy.y = M_PI * x1;
      } else {
          x1 = (ct * sqrt(1 + at * at) - at * ct * ct) /
              (1 + at * at * bt * bt);
          xy.x = M_PI * x1;
          xy.y = M_PI * sqrt(1 - x1 * (x1 + 2 * at) + TOL);
      }
      if ( lp.lam < 0) xy.x = -xy.x;
      if ( lp.phi < 0) xy.y = -xy.y;
    }
  }
}

function pj_vandg4(P) {
  P.es = 0;
  P.fwd = function(lp, xy) {
    var TOL = 1e-10;
    var x1, t, bt, ct, ft, bt2, ct2, dt, dt2;
    if (fabs(lp.phi) < TOL) {
      xy.x = lp.lam;
      xy.y = 0;
    } else if (fabs(lp.lam) < TOL || fabs(fabs(lp.phi) - M_HALFPI) < TOL) {
      xy.x = 0;
      xy.y = lp.phi;
    } else {
      bt = fabs(M_TWO_D_PI * lp.phi);
      bt2 = bt * bt;
      ct = 0.5 * (bt * (8 - bt * (2 + bt2)) - 5) / (bt2 * (bt - 1));
      ct2 = ct * ct;
      dt = M_TWO_D_PI * lp.lam;
      dt = dt + 1 / dt;
      dt = sqrt(dt * dt - 4);
      if ((fabs(lp.lam) - M_HALFPI) < 0) dt = -dt;
      dt2 = dt * dt;
      x1 = bt + ct; x1 *= x1;
      t = bt + 3*ct;
      ft = x1 * (bt2 + ct2 * dt2 - 1) + (1-bt2) * (
          bt2 * (t * t + 4 * ct2) +
          ct2 * (12 * bt * ct + 4 * ct2) );
      x1 = (dt*(x1 + ct2 - 1) + 2*sqrt(ft)) /
          (4* x1 + dt2);
      xy.x = M_HALFPI * x1;
      xy.y = M_HALFPI * sqrt(1 + dt * fabs(x1) - x1 * x1);
      if (lp.lam < 0) xy.x = -xy.x;
      if (lp.phi < 0) xy.y = -xy.y;
    }
  };
}


pj_add(pj_wag2, 'wag2', 'Wagner II', 'PCyl., Sph.');
pj_add(pj_wag3, 'wag3', 'Wagner III', 'PCyl., Sph.\nlat_ts=');
pj_add(pj_wag7, 'wag7', 'Wagner VII', 'Misc Sph, no inv.');

function pj_wag2(P) {
  var C_x = 0.92483,
      C_y = 1.38725,
      C_p1 = 0.88022,
      C_p2 = 0.88550;

  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    lp.phi = aasin(C_p1 * sin (C_p2 * lp.phi));
    xy.x = C_x * lp.lam * cos (lp.phi);
    xy.y = C_y * lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y / C_y;
    lp.lam = xy.x / (C_x * cos(lp.phi));
    lp.phi = aasin(sin(lp.phi) / C_p1) / C_p2;
  }
}

function pj_wag3(P) {
  var TWOTHIRD = 0.6666666666666666666667,
      ts = pj_param(P.params, "rlat_ts"),
      C_x = cos(ts) / cos(2*ts/3);

  P.es = 0;
  P.fwd = s_fwd;
  P.inv = s_inv;

  function s_fwd(lp, xy) {
    xy.x = C_x * lp.lam * cos(TWOTHIRD * lp.phi);
    xy.y = lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y;
    lp.lam = xy.x / (C_x * cos(TWOTHIRD * lp.phi));
  }
}

function pj_wag7(P) {
  P.es = 0;
  P.fwd = function(lp, xy) {
    var theta, ct, D;
    theta = asin (xy.y = 0.90630778703664996 * sin(lp.phi));
    xy.x  = 2.66723 * (ct = cos (theta)) * sin (lp.lam /= 3);
    xy.y *= 1.24104 * (D = 1/(sqrt (0.5 * (1 + ct * cos(lp.lam)))));
    xy.x *= D;
  };
}



pj_add(pj_wink1, 'wink1', 'Winkel I', 'PCyl., Sph.\nlat_ts=');
pj_add(pj_wink2, 'wink2', 'Winkel II', 'PCyl., Sph., no inv.\nlat_1=');

function pj_wink1(P) {
  var cosphi1 = cos(pj_param(P.params, "rlat_ts"));
  P.fwd = s_fwd;
  P.inv = s_inv;
  P.es = 0;

  function s_fwd(lp, xy) {
    xy.x = 0.5 * lp.lam * (cosphi1 + cos(lp.phi));
    xy.y = lp.phi;
  }

  function s_inv(xy, lp) {
    lp.phi = xy.y;
    lp.lam = 2 * xy.x / (cosphi1 + cos(lp.phi));
  }
}

function pj_wink2(P) {
  var cosphi1 = cos(pj_param(P.params, "rlat_1"));
  var MAX_ITER = 10,
      LOOP_TOL = 1e-7;
  P.fwd = s_fwd;
  P.inv = null;
  P.es = 0;

  function s_fwd(lp, xy) {
    var k, V, i, phi = lp.phi;
    xy.y = phi * M_TWO_D_PI;
    k = M_PI * sin(phi);
    phi *= 1.8;
    for (i = MAX_ITER; i ; --i) {
      phi -= V = (phi + sin (phi) - k) /
        (1 + cos(phi));
      if (fabs(V) < LOOP_TOL)
        break;
    }
    if (!i)
      phi = (phi < 0) ? -M_HALFPI : M_HALFPI;
    else
      phi *= 0.5;
    xy.x = 0.5 * lp.lam * (cos(phi) + cosphi1);
    xy.y = M_FORTPI * (sin(phi) + xy.y);
  }
}


// Projections are inserted here by the build script

var api = proj4js; // (partial) support for proj4js api

// Add Proj.4-style api
api.pj_init = pj_init;
api.pj_fwd = pj_fwd;
api.pj_inv = pj_inv;
api.pj_transform = pj_transform;
api.pj_add = pj_add;

// Convenience functions not in Proj.4
api.pj_fwd_deg = pj_fwd_deg;
api.pj_inv_deg = pj_inv_deg;
api.pj_transform_point = pj_transform_point;

// Export some functions for testing
api.internal = {
  dmstod: dmstod,
  dmstor: dmstor,
  get_rtodms: get_rtodms,
  get_dtodms: get_dtodms,
  get_proj_defn: get_proj_defn,
  pj_latlong_from_proj: pj_latlong_from_proj,
  pj_get_params: pj_get_params,
  pj_datums: pj_datums,
  pj_list: pj_list,
  pj_ellps: pj_ellps,
  pj_units: pj_units,
  pj_read_init_opts: pj_read_init_opts,
  find_datum: find_datum,
  DEG_TO_RAD: DEG_TO_RAD,
  RAD_TO_DEG: RAD_TO_DEG,
  wkt_parse: wkt_parse,
  wkt_unpack: wkt_unpack,
  convert_wkt_quotes: convert_wkt_quotes,
  wkt_to_proj4: wkt_to_proj4,
  wkt_from_proj4: wkt_from_proj4,
  wkt_make_projcs: wkt_make_projcs,
  wkt_get_geogcs_name: wkt_get_geogcs_name,
  wkt_stringify: wkt_stringify,
  mproj_insert_libcache: mproj_insert_libcache,
  mproj_search_libcache: mproj_search_libcache,
  GeographicLib: GeographicLib
};

if (typeof define == 'function' && define.amd) {
  define('mproj', api);
} else if (typeof exports == 'object') {
  module.exports = api;
} else {
  this.mproj = api;
}

// TODO: move to better file
function pj_latlong_from_proj(P) {
  var defn = '+proj=latlong' + get_geod_defn(P);
  return pj_init(defn);
}

}());

}).call(this)}).call(this,"/node_modules/mproj/dist/mproj.js")
},{"fs":"fs","path":"path"}],"path":[function(require,module,exports){
(function (process){(function (){
// 'path' module extracted from Node.js v8.11.1 (only the posix part)
// transplited with Babel

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

function assertPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError('Path must be a string. Received ' + JSON.stringify(path));
  }
}

// Resolves . and .. elements in a path with directory names
function normalizeStringPosix(path, allowAboveRoot) {
  var res = '';
  var lastSegmentLength = 0;
  var lastSlash = -1;
  var dots = 0;
  var code;
  for (var i = 0; i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47 /*/*/)
      break;
    else
      code = 47 /*/*/;
    if (code === 47 /*/*/) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 /*.*/ || res.charCodeAt(res.length - 2) !== 46 /*.*/) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf('/');
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = '';
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = '';
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += '/..';
          else
            res = '..';
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += '/' + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 /*.*/ && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root;
  var base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');
  if (!dir) {
    return base;
  }
  if (dir === pathObject.root) {
    return dir + base;
  }
  return dir + sep + base;
}

var posix = {
  // path.resolve([from ...], to)
  resolve: function resolve() {
    var resolvedPath = '';
    var resolvedAbsolute = false;
    var cwd;

    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path;
      if (i >= 0)
        path = arguments[i];
      else {
        if (cwd === undefined)
          cwd = process.cwd();
        path = cwd;
      }

      assertPath(path);

      // Skip empty entries
      if (path.length === 0) {
        continue;
      }

      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charCodeAt(0) === 47 /*/*/;
    }

    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)

    // Normalize the path
    resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);

    if (resolvedAbsolute) {
      if (resolvedPath.length > 0)
        return '/' + resolvedPath;
      else
        return '/';
    } else if (resolvedPath.length > 0) {
      return resolvedPath;
    } else {
      return '.';
    }
  },

  normalize: function normalize(path) {
    assertPath(path);

    if (path.length === 0) return '.';

    var isAbsolute = path.charCodeAt(0) === 47 /*/*/;
    var trailingSeparator = path.charCodeAt(path.length - 1) === 47 /*/*/;

    // Normalize the path
    path = normalizeStringPosix(path, !isAbsolute);

    if (path.length === 0 && !isAbsolute) path = '.';
    if (path.length > 0 && trailingSeparator) path += '/';

    if (isAbsolute) return '/' + path;
    return path;
  },

  isAbsolute: function isAbsolute(path) {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === 47 /*/*/;
  },

  join: function join() {
    if (arguments.length === 0)
      return '.';
    var joined;
    for (var i = 0; i < arguments.length; ++i) {
      var arg = arguments[i];
      assertPath(arg);
      if (arg.length > 0) {
        if (joined === undefined)
          joined = arg;
        else
          joined += '/' + arg;
      }
    }
    if (joined === undefined)
      return '.';
    return posix.normalize(joined);
  },

  relative: function relative(from, to) {
    assertPath(from);
    assertPath(to);

    if (from === to) return '';

    from = posix.resolve(from);
    to = posix.resolve(to);

    if (from === to) return '';

    // Trim any leading backslashes
    var fromStart = 1;
    for (; fromStart < from.length; ++fromStart) {
      if (from.charCodeAt(fromStart) !== 47 /*/*/)
        break;
    }
    var fromEnd = from.length;
    var fromLen = fromEnd - fromStart;

    // Trim any leading backslashes
    var toStart = 1;
    for (; toStart < to.length; ++toStart) {
      if (to.charCodeAt(toStart) !== 47 /*/*/)
        break;
    }
    var toEnd = to.length;
    var toLen = toEnd - toStart;

    // Compare paths to find the longest common path from root
    var length = fromLen < toLen ? fromLen : toLen;
    var lastCommonSep = -1;
    var i = 0;
    for (; i <= length; ++i) {
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === 47 /*/*/) {
            // We get here if `from` is the exact base path for `to`.
            // For example: from='/foo/bar'; to='/foo/bar/baz'
            return to.slice(toStart + i + 1);
          } else if (i === 0) {
            // We get here if `from` is the root
            // For example: from='/'; to='/foo'
            return to.slice(toStart + i);
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
            // We get here if `to` is the exact base path for `from`.
            // For example: from='/foo/bar/baz'; to='/foo/bar'
            lastCommonSep = i;
          } else if (i === 0) {
            // We get here if `to` is the root.
            // For example: from='/foo'; to='/'
            lastCommonSep = 0;
          }
        }
        break;
      }
      var fromCode = from.charCodeAt(fromStart + i);
      var toCode = to.charCodeAt(toStart + i);
      if (fromCode !== toCode)
        break;
      else if (fromCode === 47 /*/*/)
        lastCommonSep = i;
    }

    var out = '';
    // Generate the relative path based on the path difference between `to`
    // and `from`
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
        if (out.length === 0)
          out += '..';
        else
          out += '/..';
      }
    }

    // Lastly, append the rest of the destination (`to`) path that comes after
    // the common path parts
    if (out.length > 0)
      return out + to.slice(toStart + lastCommonSep);
    else {
      toStart += lastCommonSep;
      if (to.charCodeAt(toStart) === 47 /*/*/)
        ++toStart;
      return to.slice(toStart);
    }
  },

  _makeLong: function _makeLong(path) {
    return path;
  },

  dirname: function dirname(path) {
    assertPath(path);
    if (path.length === 0) return '.';
    var code = path.charCodeAt(0);
    var hasRoot = code === 47 /*/*/;
    var end = -1;
    var matchedSlash = true;
    for (var i = path.length - 1; i >= 1; --i) {
      code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          if (!matchedSlash) {
            end = i;
            break;
          }
        } else {
        // We saw the first non-path separator
        matchedSlash = false;
      }
    }

    if (end === -1) return hasRoot ? '/' : '.';
    if (hasRoot && end === 1) return '//';
    return path.slice(0, end);
  },

  basename: function basename(path, ext) {
    if (ext !== undefined && typeof ext !== 'string') throw new TypeError('"ext" argument must be a string');
    assertPath(path);

    var start = 0;
    var end = -1;
    var matchedSlash = true;
    var i;

    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
      if (ext.length === path.length && ext === path) return '';
      var extIdx = ext.length - 1;
      var firstNonSlashEnd = -1;
      for (i = path.length - 1; i >= 0; --i) {
        var code = path.charCodeAt(i);
        if (code === 47 /*/*/) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else {
          if (firstNonSlashEnd === -1) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            // Try to match the explicit extension
            if (code === ext.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = i;
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }

      if (start === end) end = firstNonSlashEnd;else if (end === -1) end = path.length;
      return path.slice(start, end);
    } else {
      for (i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === 47 /*/*/) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else if (end === -1) {
          // We saw the first non-path separator, mark this as the end of our
          // path component
          matchedSlash = false;
          end = i + 1;
        }
      }

      if (end === -1) return '';
      return path.slice(start, end);
    }
  },

  extname: function extname(path) {
    assertPath(path);
    var startDot = -1;
    var startPart = 0;
    var end = -1;
    var matchedSlash = true;
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    var preDotState = 0;
    for (var i = path.length - 1; i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46 /*.*/) {
          // If this is our first dot, mark it as the start of our extension
          if (startDot === -1)
            startDot = i;
          else if (preDotState !== 1)
            preDotState = 1;
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1;
      }
    }

    if (startDot === -1 || end === -1 ||
        // We saw a non-dot character immediately before the dot
        preDotState === 0 ||
        // The (right-most) trimmed path component is exactly '..'
        preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return '';
    }
    return path.slice(startDot, end);
  },

  format: function format(pathObject) {
    if (pathObject === null || typeof pathObject !== 'object') {
      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
    }
    return _format('/', pathObject);
  },

  parse: function parse(path) {
    assertPath(path);

    var ret = { root: '', dir: '', base: '', ext: '', name: '' };
    if (path.length === 0) return ret;
    var code = path.charCodeAt(0);
    var isAbsolute = code === 47 /*/*/;
    var start;
    if (isAbsolute) {
      ret.root = '/';
      start = 1;
    } else {
      start = 0;
    }
    var startDot = -1;
    var startPart = 0;
    var end = -1;
    var matchedSlash = true;
    var i = path.length - 1;

    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    var preDotState = 0;

    // Get non-dir info
    for (; i >= start; --i) {
      code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46 /*.*/) {
          // If this is our first dot, mark it as the start of our extension
          if (startDot === -1) startDot = i;else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1;
      }
    }

    if (startDot === -1 || end === -1 ||
    // We saw a non-dot character immediately before the dot
    preDotState === 0 ||
    // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      if (end !== -1) {
        if (startPart === 0 && isAbsolute) ret.base = ret.name = path.slice(1, end);else ret.base = ret.name = path.slice(startPart, end);
      }
    } else {
      if (startPart === 0 && isAbsolute) {
        ret.name = path.slice(1, startDot);
        ret.base = path.slice(1, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
      }
      ret.ext = path.slice(startDot, end);
    }

    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);else if (isAbsolute) ret.dir = '/';

    return ret;
  },

  sep: '/',
  delimiter: ':',
  win32: null,
  posix: null
};

posix.posix = posix;

module.exports = posix;

}).call(this)}).call(this,require('_process'))
},{"_process":46}],"rw":[function(require,module,exports){
exports.dash = require("./lib/rw/dash");
exports.readFile = require("./lib/rw/read-file");
exports.readFileSync = require("./lib/rw/read-file-sync");
exports.writeFile = require("./lib/rw/write-file");
exports.writeFileSync = require("./lib/rw/write-file-sync");

},{"./lib/rw/dash":52,"./lib/rw/read-file":56,"./lib/rw/read-file-sync":55,"./lib/rw/write-file":58,"./lib/rw/write-file-sync":57}],"sync-request":[function(require,module,exports){
"use strict";
exports.__esModule = true;
var handle_qs_js_1 = require("then-request/lib/handle-qs.js");
var GenericResponse = require("http-response-object");
var fd = FormData;
exports.FormData = fd;
function doRequest(method, url, options) {
    var xhr = new XMLHttpRequest();
    // check types of arguments
    if (typeof method !== 'string') {
        throw new TypeError('The method must be a string.');
    }
    if (url && typeof url === 'object') {
        url = url.href;
    }
    if (typeof url !== 'string') {
        throw new TypeError('The URL/path must be a string.');
    }
    if (options === null || options === undefined) {
        options = {};
    }
    if (typeof options !== 'object') {
        throw new TypeError('Options must be an object (or null).');
    }
    method = method.toUpperCase();
    options.headers = options.headers || {};
    // handle cross domain
    var match;
    var crossDomain = !!((match = /^([\w-]+:)?\/\/([^\/]+)/.exec(url)) && match[2] != location.host);
    if (!crossDomain)
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
    // handle query string
    if (options.qs) {
        url = handle_qs_js_1["default"](url, options.qs);
    }
    // handle json body
    if (options.json) {
        options.body = JSON.stringify(options.json);
        options.headers['content-type'] = 'application/json';
    }
    if (options.form) {
        options.body = options.form;
    }
    // method, url, async
    xhr.open(method, url, false);
    for (var name in options.headers) {
        xhr.setRequestHeader(name.toLowerCase(), '' + options.headers[name]);
    }
    // avoid sending empty string (#319)
    xhr.send(options.body ? options.body : null);
    var headers = {};
    xhr
        .getAllResponseHeaders()
        .split('\r\n')
        .forEach(function (header) {
        var h = header.split(':');
        if (h.length > 1) {
            headers[h[0].toLowerCase()] = h
                .slice(1)
                .join(':')
                .trim();
        }
    });
    return new GenericResponse(xhr.status, headers, xhr.responseText, url);
}
exports["default"] = doRequest;
module.exports = doRequest;
module.exports["default"] = doRequest;
module.exports.FormData = fd;

},{"http-response-object":23,"then-request/lib/handle-qs.js":64}]},{},[]);
