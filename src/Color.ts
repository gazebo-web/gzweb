import * as THREE from 'three'; 

// Color class with alpha. THREE.js has a Color class that lacks an alpha
// channel.
export class Color extends THREE.Color {
  public a: number = 0;
}
