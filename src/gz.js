var GZ3D = GZ3D || {
  REVISION : '1'
};

var globalEmitter = new EventEmitter2({verboseMemoryLeak: true});

// Assuming all mobile devices are touch devices.
var isTouchDevice = /Mobi/.test(navigator.userAgent);

/**
 * Convert a binary byte array to a base64 string.
 * @param {byte array} buffer - Binary byte array
 * @return Base64 encoded string.
 **/
function gzBinaryToBase64(buffer) {
  var binary = '';
  var len = buffer.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return window.btoa(binary);
}
