import {Scene} from '../../src/scene'

// Tests for default construction
describe('scene construction', () => {
  // Create the scene object
  let scene: Scene = new Scene();

  test('scene connection status is disconnected', () => {
    expect(scene.getConnectionStatus()).toBe('disconnected');
  });

  test('model list to be empty', () => {
    expect(scene.getModels().length).toBe(0);
  });
});

