"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LRUCache = void 0;
var _lruCache = require("lru-cache");
var _defaults = _interopRequireDefault(require("../../defaults"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const isValidTTL = ttl => typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0;

// `lru-cache` expresses "never expires" as a TTL of zero.
const NO_EXPIRY = 0;
class LRUCache {
  constructor({
    ttl = _defaults.default.cacheTTL,
    maxSize = _defaults.default.cacheMaxSize
  }) {
    this.ttl = ttl;
    this.cache = new _lruCache.LRUCache({
      max: maxSize,
      ttl
    });
  }
  get(key) {
    return this.cache.get(key) || null;
  }
  put(key, value, ttl = this.ttl) {
    // `lru-cache` takes the per-entry TTL as a property of an options object.
    // Passed positionally it is silently discarded, leaving the entry on the
    // cache-wide TTL.
    //
    // A TTL of `Infinity` means "never expires", matching `RedisCacheAdapter`,
    // and is translated to the zero that `lru-cache` uses for that. `Infinity`
    // is not forwarded as-is because Node cannot express it as a timer
    // duration: under `ttlAutopurge` it emits a `TimeoutOverflowWarning` and
    // clamps the timer to 1ms, so the purge timer re-fires every millisecond.
    // Any other TTL that is not a positive, finite number is forwarded as
    // `undefined`, which is how the library expresses "use the cache-wide TTL".
    let entryTTL;
    if (ttl === Infinity) {
      entryTTL = NO_EXPIRY;
    } else if (isValidTTL(ttl)) {
      entryTTL = ttl;
    }
    this.cache.set(key, value, {
      ttl: entryTTL
    });
  }
  del(key) {
    this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
}
exports.LRUCache = LRUCache;
var _default = exports.default = LRUCache;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbHJ1Q2FjaGUiLCJyZXF1aXJlIiwiX2RlZmF1bHRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImlzVmFsaWRUVEwiLCJ0dGwiLCJOdW1iZXIiLCJpc0Zpbml0ZSIsIk5PX0VYUElSWSIsIkxSVUNhY2hlIiwiY29uc3RydWN0b3IiLCJkZWZhdWx0cyIsImNhY2hlVFRMIiwibWF4U2l6ZSIsImNhY2hlTWF4U2l6ZSIsImNhY2hlIiwiTFJVIiwibWF4IiwiZ2V0Iiwia2V5IiwicHV0IiwidmFsdWUiLCJlbnRyeVRUTCIsIkluZmluaXR5Iiwic2V0IiwiZGVsIiwiZGVsZXRlIiwiY2xlYXIiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQ2FjaGUvTFJVQ2FjaGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi9kZWZhdWx0cyc7XG5cbmNvbnN0IGlzVmFsaWRUVEwgPSB0dGwgPT4gdHlwZW9mIHR0bCA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHR0bCkgJiYgdHRsID4gMDtcblxuLy8gYGxydS1jYWNoZWAgZXhwcmVzc2VzIFwibmV2ZXIgZXhwaXJlc1wiIGFzIGEgVFRMIG9mIHplcm8uXG5jb25zdCBOT19FWFBJUlkgPSAwO1xuXG5leHBvcnQgY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3Rvcih7IHR0bCA9IGRlZmF1bHRzLmNhY2hlVFRMLCBtYXhTaXplID0gZGVmYXVsdHMuY2FjaGVNYXhTaXplIH0pIHtcbiAgICB0aGlzLnR0bCA9IHR0bDtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IG1heFNpemUsXG4gICAgICB0dGwsXG4gICAgfSk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIHB1dChrZXksIHZhbHVlLCB0dGwgPSB0aGlzLnR0bCkge1xuICAgIC8vIGBscnUtY2FjaGVgIHRha2VzIHRoZSBwZXItZW50cnkgVFRMIGFzIGEgcHJvcGVydHkgb2YgYW4gb3B0aW9ucyBvYmplY3QuXG4gICAgLy8gUGFzc2VkIHBvc2l0aW9uYWxseSBpdCBpcyBzaWxlbnRseSBkaXNjYXJkZWQsIGxlYXZpbmcgdGhlIGVudHJ5IG9uIHRoZVxuICAgIC8vIGNhY2hlLXdpZGUgVFRMLlxuICAgIC8vXG4gICAgLy8gQSBUVEwgb2YgYEluZmluaXR5YCBtZWFucyBcIm5ldmVyIGV4cGlyZXNcIiwgbWF0Y2hpbmcgYFJlZGlzQ2FjaGVBZGFwdGVyYCxcbiAgICAvLyBhbmQgaXMgdHJhbnNsYXRlZCB0byB0aGUgemVybyB0aGF0IGBscnUtY2FjaGVgIHVzZXMgZm9yIHRoYXQuIGBJbmZpbml0eWBcbiAgICAvLyBpcyBub3QgZm9yd2FyZGVkIGFzLWlzIGJlY2F1c2UgTm9kZSBjYW5ub3QgZXhwcmVzcyBpdCBhcyBhIHRpbWVyXG4gICAgLy8gZHVyYXRpb246IHVuZGVyIGB0dGxBdXRvcHVyZ2VgIGl0IGVtaXRzIGEgYFRpbWVvdXRPdmVyZmxvd1dhcm5pbmdgIGFuZFxuICAgIC8vIGNsYW1wcyB0aGUgdGltZXIgdG8gMW1zLCBzbyB0aGUgcHVyZ2UgdGltZXIgcmUtZmlyZXMgZXZlcnkgbWlsbGlzZWNvbmQuXG4gICAgLy8gQW55IG90aGVyIFRUTCB0aGF0IGlzIG5vdCBhIHBvc2l0aXZlLCBmaW5pdGUgbnVtYmVyIGlzIGZvcndhcmRlZCBhc1xuICAgIC8vIGB1bmRlZmluZWRgLCB3aGljaCBpcyBob3cgdGhlIGxpYnJhcnkgZXhwcmVzc2VzIFwidXNlIHRoZSBjYWNoZS13aWRlIFRUTFwiLlxuICAgIGxldCBlbnRyeVRUTDtcbiAgICBpZiAodHRsID09PSBJbmZpbml0eSkge1xuICAgICAgZW50cnlUVEwgPSBOT19FWFBJUlk7XG4gICAgfSBlbHNlIGlmIChpc1ZhbGlkVFRMKHR0bCkpIHtcbiAgICAgIGVudHJ5VFRMID0gdHRsO1xuICAgIH1cbiAgICB0aGlzLmNhY2hlLnNldChrZXksIHZhbHVlLCB7IHR0bDogZW50cnlUVEwgfSk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMUlVDYWNoZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsU0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQXNDLFNBQUFFLHVCQUFBQyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRXRDLE1BQU1HLFVBQVUsR0FBR0MsR0FBRyxJQUFJLE9BQU9BLEdBQUcsS0FBSyxRQUFRLElBQUlDLE1BQU0sQ0FBQ0MsUUFBUSxDQUFDRixHQUFHLENBQUMsSUFBSUEsR0FBRyxHQUFHLENBQUM7O0FBRXBGO0FBQ0EsTUFBTUcsU0FBUyxHQUFHLENBQUM7QUFFWixNQUFNQyxRQUFRLENBQUM7RUFDcEJDLFdBQVdBLENBQUM7SUFBRUwsR0FBRyxHQUFHTSxpQkFBUSxDQUFDQyxRQUFRO0lBQUVDLE9BQU8sR0FBR0YsaUJBQVEsQ0FBQ0c7RUFBYSxDQUFDLEVBQUU7SUFDeEUsSUFBSSxDQUFDVCxHQUFHLEdBQUdBLEdBQUc7SUFDZCxJQUFJLENBQUNVLEtBQUssR0FBRyxJQUFJQyxrQkFBRyxDQUFDO01BQ25CQyxHQUFHLEVBQUVKLE9BQU87TUFDWlI7SUFDRixDQUFDLENBQUM7RUFDSjtFQUVBYSxHQUFHQSxDQUFDQyxHQUFHLEVBQUU7SUFDUCxPQUFPLElBQUksQ0FBQ0osS0FBSyxDQUFDRyxHQUFHLENBQUNDLEdBQUcsQ0FBQyxJQUFJLElBQUk7RUFDcEM7RUFFQUMsR0FBR0EsQ0FBQ0QsR0FBRyxFQUFFRSxLQUFLLEVBQUVoQixHQUFHLEdBQUcsSUFBSSxDQUFDQSxHQUFHLEVBQUU7SUFDOUI7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBLElBQUlpQixRQUFRO0lBQ1osSUFBSWpCLEdBQUcsS0FBS2tCLFFBQVEsRUFBRTtNQUNwQkQsUUFBUSxHQUFHZCxTQUFTO0lBQ3RCLENBQUMsTUFBTSxJQUFJSixVQUFVLENBQUNDLEdBQUcsQ0FBQyxFQUFFO01BQzFCaUIsUUFBUSxHQUFHakIsR0FBRztJQUNoQjtJQUNBLElBQUksQ0FBQ1UsS0FBSyxDQUFDUyxHQUFHLENBQUNMLEdBQUcsRUFBRUUsS0FBSyxFQUFFO01BQUVoQixHQUFHLEVBQUVpQjtJQUFTLENBQUMsQ0FBQztFQUMvQztFQUVBRyxHQUFHQSxDQUFDTixHQUFHLEVBQUU7SUFDUCxJQUFJLENBQUNKLEtBQUssQ0FBQ1csTUFBTSxDQUFDUCxHQUFHLENBQUM7RUFDeEI7RUFFQVEsS0FBS0EsQ0FBQSxFQUFHO0lBQ04sSUFBSSxDQUFDWixLQUFLLENBQUNZLEtBQUssQ0FBQyxDQUFDO0VBQ3BCO0FBQ0Y7QUFBQ0MsT0FBQSxDQUFBbkIsUUFBQSxHQUFBQSxRQUFBO0FBQUEsSUFBQW9CLFFBQUEsR0FBQUQsT0FBQSxDQUFBekIsT0FBQSxHQUVjTSxRQUFRIiwiaWdub3JlTGlzdCI6W119