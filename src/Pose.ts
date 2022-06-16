import {Vector3, Quaternion} from 'three'; 

export class Pose {
  public position: Vector3 = new Vector3();
  public orientation: Quaternion = new Quaternion();
}
