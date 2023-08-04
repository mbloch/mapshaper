// The entry point for the core mapshaper module
import api from './mapshaper-api';

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else if (typeof window === "object" && window) {
  window.mapshaper = api;
}
