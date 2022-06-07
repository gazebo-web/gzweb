export type TopicCb = (msg: any) => void;

/**
 * Type that represents a topic to be subscribed. This allows communication between Components and
 * the Websocket service of a Simulation.
 */
export class Topic {
  /**
   * The name of the topic, used to identify it.
   */
  name: string;

  /**
   * Callback to use for this current topic.
   */
  cb: TopicCb;

  /**
   * Optional. Function to be called when unsubscribing from the topic.
   */
   unsubscribe?(): any;

  constructor(name: string, cb: TopicCb) {
    this.name = name;
    this.cb = cb;
  }
}
