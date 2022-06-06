var controllers = {};
var onButtonCb;
var onAxisCb;

/**
 * Create a gamepad interface
 * @param {function} onButton - Function callback that accepts a controller
 * object and a button object. This function is called when a button is pressed.
 * @param {function} onAxis - Function callback that accepts a controller
 * object and an axis object. This function is called when a joystick axis is moved.
 */
GZ3D.Gamepad = function(onButton, onAxis) {

  onButtonCb = onButton;
  onAxisCb = onAxis;

  // Listen for gamepad connections.
  window.addEventListener('gamepadconnected', handleGamepadConnect);
  // Listen for gamepad disconnections.
  window.addEventListener('gamepaddisconnected', handleGamepadDisconnect);

  // Start the main processing event loop
  requestAnimationFrame(updateGamepads);
};

/** Main controller processing function. This function is called every
 * animation frame to poll for controller updates.
 */
function updateGamepads() {
  // Scan for connected gamepads.
  scanGamepads();

  // Process each controller
  for (var c in controllers) {
    var controller = controllers[c];

    // Poll each button
    for (var b = 0; b < controller.gamepad.buttons.length; b++) {
      var button = controller.gamepad.buttons[b];

      if (controller.prevButtons[b] !== button.pressed) {
        // Note that we update the button *before* we call the user callback.
        // That's so that the user callback can, at its option, get the complete
        // current state of the controller by looking at the prevButtons.
        controller.prevButtons[b] = button.pressed;

        onButtonCb(controller, {'index': b, 'pressed': button.pressed});
      }
    }

    // Poll each axis
    for (var i = 0; i < controller.gamepad.axes.length; i += 2) {
      if (controller.prevAxes[i] !== controller.gamepad.axes[i] ||
          controller.prevAxes[i+1] !== controller.gamepad.axes[i+1]) {
        // Note that we update the axes *before* we call the user callback.
        // That's so that the user callback can, at its option, get the complete
        // current state of the controller by looking at the prevAxes.
        controller.prevAxes[i] = controller.gamepad.axes[i];
        controller.prevAxes[i+1] = controller.gamepad.axes[i+1];

        onAxisCb(controller, {'index': (i/2).toFixed(0),
                  'x': controller.gamepad.axes[i],
                  'y': controller.gamepad.axes[i+1]});
      }
    }
  }

  requestAnimationFrame(updateGamepads);
}

/**
 * Poll for controllers. Some browsers use connection events, and others
 * require polling.
 */
function scanGamepads() {
  var gamepads = navigator.getGamepads();
  for (var i = 0; i < gamepads.length; i++) {
    addGamepad(gamepads[i]);
  }
}

/** Adds or updates a gamepad to the list of controllers.
 * @param {object} The gamepad to add/update
 */
function addGamepad(gamepad) {
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
function removeGamepad(gamepad) {
  if (gamepad && gamepad.index in controllers) {
    delete controllers[gamepad.index];
  }
}

/** Gamepad connect callback handler
 * @param {event} The gamepad connect event.
 */
function handleGamepadConnect(e) {
  addGamepad(e.gamepad);
}

/** Gamepad disconnect callback handler
 * @param {event} The gamepad disconnect event.
 */
function handleGamepadDisconnect(e) {
  removeGamepad(e.gamepad);
}
