import {Color} from './Color';
import {PBRMaterial} from './PBRMaterial';

export class Material {
  public texture: string = ''; 
  public normalMap: string = '';
  public ambient: Color = new Color();
  public diffuse: Color = new Color();
  public specular: Color = new Color();
  public opacity: number = 1.0;
  public scale: number = 1.0;
  public pbr: PBRMaterial;
}
