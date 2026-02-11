import { Message, Type } from "protobufjs";

/**
 * A Publisher is used to allow clients to publish messages to a particular topic.
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
   * The Protobuf message definition.
   */
  private messageDef: Type;

  /**
   * Function used to publish a message. This acts as a pass through to
   * Transport.
   */
  private pubFunc: (topic: string, msgTypeName: string, msg: string) => void;

  /**
   * This constructor should be called by Transport.
   *
   * @param topic The topic name to publish to.
   * @param msgTypeName The message type name to use.
   * @param def The protobuf message definition.
   * @param pub Function set by Transport in order to send the message through the websocket.
   */
  constructor(
    topic: string,
    msgTypeName: string,
    def: Type,
    pub: (topic: string, msgTypeName: string, msg: string) => void,
  ) {
    this.topic = topic;
    this.msgTypeName = msgTypeName;
    this.messageDef = def;
    this.pubFunc = pub;
  }

  /**
   * Creates a new message using the specified properties.
   *
   * @param properties The propoerties to be set in the message.
   * @returns The message instance.
   */
  public createMessage(properties: any): Message {
    return this.messageDef.create(properties);
  }

  /**
   * Publish a message.
   *
   * @param msg The message to publish.
   */
  public publish(msg: Message): void {
    // Serialized the message
    let buffer = this.messageDef.encode(msg).finish();
    let strBuf = new TextDecoder().decode(buffer);

    // Publish the message over the websocket
    this.pubFunc(this.topic, this.msgTypeName, strBuf);
  }
}
