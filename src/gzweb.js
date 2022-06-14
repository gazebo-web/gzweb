export { Asset } from './asset'
export { Gamepad } from './gamepad'
export { Scene } from './scene'
export { Topic } from './topic'
export { Transport } from './transport'

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
