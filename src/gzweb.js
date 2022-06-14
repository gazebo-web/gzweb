export { Transport } from './transport'
export { Topic } from './topic'
export { Asset } from './asset'

var gzweb = gzweb || {
  REVISION : '2'
};

// Assuming all mobile devices are touch devices.
var isTouchDevice = /Mobi/.test(navigator.userAgent);

/**
 * Convert a binary byte array to a base64 string.
 * @param {byte array} buffer - Binary byte array
 * @return Base64 encoded string.
 **/
export function binaryToBase64(buffer) {
  var binary = '';
  var len = buffer.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return window.btoa(binary);
};