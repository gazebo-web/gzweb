/**
 * Type that represents a topic to be subscribed. This allows communication between Components and
 * the Websocket service of a Simulation.
 */
export class Publisher {
  /**
   * The name of the topic.
   */
  public topic: string;

  /**
   * Message type name.
   */
  public msgTypeName: string;

  /**
   * The Protobuf message definition
   */
  private messageDef: any;

  /**
   * Function used to publish a message. This acts as a pass through to
   * Transport.
   */
  private pubFunc: any;

  public createMessage(json: any): any {
    return this.messageDef.create(json);
  }

  /**
   * Publish a message.
   */
  public publish(msg: any): void {
    // Serialized the message
    let buffer = this.messageDef.encode(msg).finish();
    let strBuf = new TextDecoder().decode(buffer);

    // Publish the message over the websocket
    this.pubFunc(this.topic, this.msgTypeName, strBuf);
  }

  /**
   * This constructor should be called by Transport
   */
  constructor(topic: string, msgTypeName: string, def: any, pub: any) {
    this.topic = topic;
    this.msgTypeName = msgTypeName;
    this.messageDef = def;
    this.pubFunc = pub;
  }
}
