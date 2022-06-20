import {Object3D} from 'three';

export function getDescendants(obj: Object3D, array: Object3D[]): Object3D[] {
  if (array === undefined) {
    array = [];
  }

  Array.prototype.push.apply(array, obj.children);

  for (var i = 0, l = obj.children.length; i < l; i++) {
    getDescendants(obj.children[ i ], array );
  }

  return array;
};

/**
 * Convert a binary byte array to a base64 string.
 * @param {byte array} buffer - Binary byte array
 * @return Base64 encoded string.
 **/
export function binaryToBase64(buffer: Uint8Array): string {
  var binary = '';
  var len = buffer.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return window.btoa(binary);
};
