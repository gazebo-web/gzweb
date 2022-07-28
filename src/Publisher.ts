/**
 * Type that represents a topic to be subscribed. This allows communication between Components and
 * the Websocket service of a Simulation.
 */
export class Publisher {
  /**
   * The name of the topic.
   */
  public topic: string;

  public msgTypeName: string;

  private pubFunc: any;

  /**
   * Publish a message.
   */
  public publish(msg: string): void {
    this.pubFunc(this.topic, this.msgTypeName, msg);
  }

  constructor(topic: string, msgTypeName: string, pub: any) {
    this.topic = topic;
    this.msgTypeName = msgTypeName;
    this.pubFunc = pub;
  }
}
