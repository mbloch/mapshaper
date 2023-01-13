// Fall back to browserify's Buffer polyfill
var B = typeof Buffer != 'undefined' ? Buffer : require('buffer').Buffer;
export { B as Buffer };

