export { Asset } from './Asset';
export { Gamepad } from './Gamepad';
export { SceneManager } from './SceneManager';
export { Topic } from './Topic';
export { Transport } from './Transport';
export * from './Globals';

var gzweb = gzweb || {
  REVISION : '2'
};

// Assuming all mobile devices are touch devices.
var isTouchDevice = /Mobi/.test(navigator.userAgent);
