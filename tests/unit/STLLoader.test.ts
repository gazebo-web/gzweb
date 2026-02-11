import * as THREE from "three";
// @ts-ignore
import { STLLoader } from "../../include/STLLoader.js";

describe("STLLoader", () => {
  let loader: STLLoader;

  beforeEach(() => {
    loader = new STLLoader();
  });

  test("should parse ArrayBuffer input (wrapped in Uint8Array)", () => {
    const buffer = new ArrayBuffer(84); // Minimum valid binary STL size
    const view = new DataView(buffer);
    // byte 80 is number of faces. 0 faces.
    view.setUint32(80, 0, true);

    const result = loader.parse(new Uint8Array(buffer));
    expect(result).toBeInstanceOf(THREE.Mesh);
    expect(result.geometry).toBeInstanceOf(THREE.BufferGeometry);
  });

  test("should parse Uint8Array input", () => {
    const buffer = new ArrayBuffer(84);
    const view = new DataView(buffer);
    view.setUint32(80, 0, true);
    const uint8 = new Uint8Array(buffer);

    const result = loader.parse(uint8);
    expect(result).toBeInstanceOf(THREE.Mesh);
    expect(result.geometry).toBeInstanceOf(THREE.BufferGeometry);
  });

  test("should be compatible with Scene.ts usage (Mesh creation)", () => {
    const buffer = new ArrayBuffer(84);
    const view = new DataView(buffer);
    view.setUint32(80, 0, true);

    // STLLoader.parse now returns a Mesh directly
    const mesh = loader.parse(new Uint8Array(buffer));

    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
  });
});
