import { Color } from "./Color";
import { PBRMaterial } from "./PBRMaterial";

export class Material {
  public texture: string = "";
  public normalMap: string = "";
  public ambient: Color | undefined;
  public diffuse: Color | undefined;
  public specular: Color | undefined;
  public opacity: number = 1.0;
  public scale: number = 1.0;
  public pbr: PBRMaterial;
}
