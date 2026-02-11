import { SceneManager } from "../../src/SceneManager";

// Tests for default construction
describe("scene construction", () => {
  // Create the scene object
  let sceneMgr: SceneManager = new SceneManager();

  test("scene connection status is disconnected", () => {
    expect(sceneMgr.getConnectionStatus()).toBe("disconnected");
  });

  test("model list to be empty", () => {
    expect(sceneMgr.getModels().length).toBe(0);
  });
});
