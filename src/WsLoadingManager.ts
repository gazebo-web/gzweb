import { LoadingManager } from "three";

/**
 * The Websocket Loading Manager is a custom Loading Manager that keeps track
 * of items that need to be loaded via the websocket server.
 *
 * Usually, when a loader fails to load an item, it marks it as done. This
 * manager handles that particular case: It doesn't mark the item as done
 * until it comes back from the websocket connection.
 *
 * Loading Managers handle and keep track of loaded and pending items.
 * For more information, see https://threejs.org/docs/#api/en/loaders/managers/LoadingManager
 */
export class WsLoadingManager extends LoadingManager {
  /**
   * Callback used when the first item starts loading.
   */
  public onStart:
    | ((url: string, loaded: number, total: number) => void)
    | undefined;

  /**
   * LoadingManager method.
   * Called whenever a new item is being loaded by the Loader that has this manager.
   */
  public itemStart: (url: string) => void;

  /**
   * LoadingManager method.
   * Called whenever the Loader finishes loading an item (regardless of error status).
   */
  public itemEnd: (url: string) => void;

  /**
   * LoadingManager method.
   * Called whenever the Loader had an error while loading an item.
   */
  public itemError: (url: string) => void;

  /**
   * Array of URLs that had an error related to the Loader.
   * This manager keeps track of these because we need to try to get them from the websocket server.
   */
  private errorItems: string[] = [];

  /**
   * The number of items loaded. Used to determine progress.
   */
  private itemsLoaded: number = 0;

  /**
   * The total number of items to load. Used to determine progress.
   */
  private itemsTotal: number = 0;

  /**
   * Determine whether items are being loaded or not.
   * Once the loaded items equal the total, we consider the loading to be done.
   */
  private isLoading: boolean = false;

  /**
   * Note: The onLoad, onProgress and onError methods have nothing to do with the Loader that has
   * this manager.
   *
   * @param onLoad Callback when all the items are loaded.
   * @param onProgress Callback when an item is loaded.
   * @param onError Callback when there is an error getting the item from the websocket server. See {@link markAsError}.
   */
  constructor(
    onLoad?: () => void,
    onProgress?: (url: string, loaded: number, total: number) => void,
    onError?: (url: string) => void,
  ) {
    super(onLoad, onProgress, onError);

    /**
     * itemStart method is called internally by loaders using this manager, whenever they start
     * getting the resource.
     */
    this.itemStart = (url) => {
      this.itemsTotal++;

      if (!this.isLoading) {
        if (this.onStart !== undefined) {
          this.onStart(url, this.itemsLoaded, this.itemsTotal);
        }
        this.isLoading = true;
      }
    };

    /**
     * itemEnd method is called internally by loaders using this manager, whenever they finish
     * loading the resource they where trying to load.
     *
     * This is called whether the resource had an error or not.
     */
    this.itemEnd = (url) => {
      // This manager keeps track of the items that had errors. We don't want to mark them as done,
      // as they need to be get from the websocket server.
      if (this.errorItems.includes(url)) {
        return;
      }

      // No error - Proceed to end the item.
      this.itemsLoaded++;

      if (onProgress !== undefined) {
        onProgress(url, this.itemsLoaded, this.itemsTotal);
      }

      if (this.itemsLoaded === this.itemsTotal) {
        this.isLoading = false;
        if (onLoad !== undefined) {
          onLoad();
        }
      }
    };

    /**
     * itemError method is called internally by loaders using this manager, whenever the resource
     * they are trying to load fails.
     */
    this.itemError = (url) => {
      // This manager keeps track of the items that had errors. We don't want to mark them as error until we tried
      // getting the resource from the websocket server.
      if (!this.errorItems.includes(url)) {
        this.errorItems.push(url);
        return;
      }

      if (onError !== undefined) {
        onError(url);
      }
    };
  }

  /**
   * Mark an item as Done.
   * This method should be called manually when the websocket connection successfully gets the item.
   *
   * @param url The URL of the resource.
   */
  public markAsDone(url: string): void {
    if (this.errorItems.includes(url)) {
      this.filterAndEnd(url);
    }
  }

  /**
   * Mark an item as Error.
   * This method should be called manually when the websocket connection fails to get the item.
   *
   * @param url The URL of the resource.
   */
  public markAsError(url: string): void {
    if (this.errorItems.includes(url)) {
      this.itemError(url);
      this.filterAndEnd(url);
    }
  }

  /**
   * Internal method that removes an URL from the error items array and ends it.
   *
   * @param url The URL of the resource.
   */
  private filterAndEnd(url: string): void {
    this.errorItems = this.errorItems.filter(
      (errorUrl: string) => errorUrl !== url,
    );
    this.itemEnd(url);
  }
}
