let controllers = {};
let onButtonCb: any = null;
let onAxisCb: any = null;

/**
 * Create a gamepad interface
 * @param {function} onButton - Function callback that accepts a button
 * object. This function is called when a button is pressed.
 * @param {function} onAxis - Function callback that accepts an axis
 * object. This function is called when a joystick axis is moved.
 */
export class Gamepad {

  constructor(onButton: any, onAxis: any) {
    onButtonCb = onButton;
    onAxisCb = onAxis;

    // Listen for gamepad connections.
    window.addEventListener('gamepadconnected', handleGamepadConnect);
    // Listen for gamepad disconnections.
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnect);

    // Start the main processing event loop
    requestAnimationFrame(updateGamepads);
  }
}

/** Main controller processing function. This function is called every
 * animation frame to poll for controller updates.
 */
function updateGamepads() {
  // Scan for connected gamepads.
  scanGamepads();

  // Process each controller
  for (var c in controllers) {
    let controller = controllers[c];

    // Poll each button
    for (let b = 0; b < controller.gamepad.buttons.length; b++) {
      let button = controller.gamepad.buttons[b];

      if (controller.prevButtons[b] !== button.pressed) {
          onButtonCb({'index': b, 'pressed': button.pressed});
      }
      controller.prevButtons[b] = button.pressed;
    }

    // Poll each axis
    for (let i = 0; i < controller.gamepad.axes.length; i++) {
      let axis = controller.gamepad.axes[i];
      if (controller.prevAxes[i] !== axis) {
        // Note that we update the axis *before* we call the user callback.
        controller.prevAxes[i] = axis;
        onAxisCb(controller, {'index': i, 'axis': axis});
      }
    }
  }

  requestAnimationFrame(updateGamepads);
}

/**
 * Poll for controllers. Some browsers use connection events, and others
 * require polling.
 */
function scanGamepads(): void {
  var gamepads = navigator.getGamepads();
  for (var i = 0; i < gamepads.length; i++) {
    addGamepad(gamepads[i]);
  }
}

/** Adds or updates a gamepad to the list of controllers.
 * @param {object} The gamepad to add/update
 */
function addGamepad(gamepad: any): void {
  if (gamepad) {
    if (!(gamepad.index in controllers)) {
      console.log('Adding gamepad', gamepad.id);
      controllers[gamepad.index] = {
        gamepad: gamepad,
        prevButtons: new Array(gamepad.buttons.length),
        prevAxes: new Array(gamepad.axes.length)
      };

      // Set button initial state
      for (var b = 0; b < gamepad.buttons.length; b++) {
        controllers[gamepad.index].prevButtons[b] = false;
      }

      // Set axes initial state
      for (var a = 0; a < gamepad.axes.length; a++) {
        controllers[gamepad.index].prevAxes[a] = 0.0;
      }
    } else {
      controllers[gamepad.index].gamepad = gamepad;
    }
  }
}

/** Removes a gamepad from the list of controllers
 * @param {object} The gamepad to remove
 */
function removeGamepad(gamepad: any) {
  if (gamepad && gamepad.index in controllers) {
    delete controllers[gamepad.index];
  }
}

/** Gamepad connect callback handler
 * @param {event} The gamepad connect event.
 */
function handleGamepadConnect(e: any): void {
  addGamepad(e.gamepad);
}

/** Gamepad disconnect callback handler
 * @param {event} The gamepad disconnect event.
 */
function handleGamepadDisconnect(e: any): void {
  removeGamepad(e.gamepad);
}
