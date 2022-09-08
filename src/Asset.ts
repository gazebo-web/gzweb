export type AssetCb = (msg: any, error?: any) => void;

export enum AssetError {
  NOT_FOUND = 'asset_not_found',
  URI_MISSING = 'asset_uri_missing',
};

/**
 * Type that represents a simulation asset that needs to be fetched from a websocket server.
 */
export class Asset {
  /**
   * The URI of the asset file to be fetched.
   */
  public uri: string;

  /**
   * Callback that is used when the asset has been fetched.
   * Contains the asset and an error, if found.
   */
  public cb: AssetCb;

  constructor(uri: string, cb: AssetCb) {
    this.uri = uri;
    this.cb = cb;
  }
}
