import * as THREE from "three";

// Color class with alpha. THREE.js has a Color class that lacks an alpha
// channel.
export class Color extends THREE.Color {
  public a: number = 1.0;
  constructor(r?: number, g?: number, b?: number, a?: number) {
    super(r as any, g as any, b as any);

    if (a) {
      this.a = a;
    }
  }
}
