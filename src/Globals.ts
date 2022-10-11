import {Object3D} from 'three';

/**
 * Given a ThreeJS Object, return all its children as an array.
 * Notes:
 * - We are using getDescendants as a way to maintain legacy code. We should use traverse() whenever possible.
 * - We should discourage its use and move towards using traverse().
 * @param obj The ThreeJS Object to get the descendants of.
 * @param array Optional. An array that will store all the children.
 * @returns An array of the children of the given ThreeJS Object (can be dismissed if the array argument is used).
 */
export function getDescendants(obj: Object3D, array: Object3D[] = []): Object3D[] {
  obj.traverse((child) => {
    // Note: This function is called on the obj as well.
    // Since we just need its children, we filter the original object.
    if (child !== obj) {
      array.push(child);
    }
  });
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

/**
 * Convert a RGBA encoded uint8array to an image.
 * @param {byte array} array - Binary byte array encoded as RGBA pixels.
 * @param {number} width - Width of the image in pixels
 * @param {number} height - Height of the image in pixels
 */
export function binaryToImage(array: Uint8Array, width: number, height: number): HTMLImageElement {

  // Create the clamped data array
  let imageArray = new Uint8ClampedArray(array.buffer);

  // Create the image data
  let imageData = new ImageData(imageArray, width, height);

  // Create the canvas
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  // Draw the image
  ctx!.putImageData(imageData, 0, 0);

  // Create the image, and grabe the URL of the canvas image
  let imageElem = new Image();
  imageElem.src = canvas.toDataURL();

  return imageElem;
}
