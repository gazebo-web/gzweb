import { BehaviorSubject, Subject } from 'rxjs';
import { Root, Type, parse } from 'protobufjs';
import { Publisher } from './Publisher';
import { Topic } from './Topic';
import { Asset, AssetCb } from './Asset';

/**
 * The Trasnport class is in charge of managing the websocket connection to a
 * Gazebo websocket server.
 */
export class Transport {

  /**
   * Status connection behavior subject.
   * Components can subscribe to it to get connection status updates.
   * Uses a Behavior Subject because it has an initial state and stores a value.
   */
  public status$ = new BehaviorSubject<string>('disconnected');

  /**
   * Scene Information behavior subject.
   * Components can subscribe to it to get the scene information once it is obtained.
   */
  public sceneInfo$ = new BehaviorSubject<any>(null);

  /**
   * The Websocket object.
   */
  private ws: WebSocket;

  /**
   * The root namespace should be obtained from the Websocket upon connection.
   */
  private root: Root | null;

  /**
   * List of available topics.
   *
   * Array of objects containing {topic, msg_type}.
   */
  private availableTopics: object[] = [];

  /**
   * Map of the subscribed topics.
   * - Key: The topic name.
   * - Value: The Topic object, which includes the callback.
   *
   * New subscriptions should be added to this map, in order to correctly derive the messages
   * received.
   */
  private topicMap = new Map<string, Topic>();

  /**
   * A map of asset uri to asset types. This allows a caller to request
   * an asset from the websocket server and receive a callback when the
   * aseset has been fetched.
   */
  private assetMap = new Map<string, Asset>();

  /**
   * The world that is being used in the Simulation.
   */
  private world: string = '';

  /**
   * Connects to a websocket.
   *
   * @param url The url to connect to.
   * @param key Optional. A key to authorize access to the websocket messages.
   */
  public connect(url: string, key?: string): void {
    // First, disconnect from previous connections.
    // This way we make sure that we only support one websocket connection.
    this.disconnect();

    // Create the Websocket interface.
    this.ws = new WebSocket(url);

    // Set the handlers of the websocket events.
    this.ws.onopen = () => this.onOpen(key);
    this.ws.onclose = () => this.onClose();
    this.ws.onmessage = (msgEvent) => this.onMessage(msgEvent);
    this.ws.onerror = (errorEvent) => this.onError(errorEvent);
  }

  /**
   * Disconnects from a websocket.
   * Note: The cleanup should be done in the onclose event of the Websocket.
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }

  /**
   * Advertise a topic.
   *
   * @param topic The topic to advertise.
   */
  public advertise(topic: string, msgTypeName: string): Publisher {
    this.ws.send(this.buildMsg(['adv', topic, msgTypeName, '']));

    const msgDef = this.root!.lookupType(msgTypeName);
    return new Publisher(topic, msgTypeName, msgDef, 
                         (topic: string, msgTypeName: string, msg: string) => {
                           this.publish(topic, msgTypeName, msg);});
  }

  /**
   * Publish to a topic.
   *
   * @param topic The topic to advertise.
   */
  public publish(topic: string, msgTypeName: string, msg: string): void {
    //const StringMsg = this.root!.lookupType(msgTypeName);
    // let strMsg = StringMsg.create({data: msg});

    this.ws.send(this.buildMsg(['pub_in', topic, msgTypeName, msg]));
  }

  /**
   * Subscribe to a topic.
   *
   * @param topic The topic to subscribe to.
   */
  public subscribe(topic: Topic): void {
    this.topicMap.set(topic.name, topic);

    const publisher = this.availableTopics.filter(pub => pub['topic'] === topic.name)[0];
    if (publisher['msg_type'] === 'ignition.msgs.Image' ||
        publisher['msg_type'] === 'gazebo.msgs.Image') {
      this.ws.send(this.buildMsg(['image', topic.name, '', '']));
    }
    else {
      this.ws.send(this.buildMsg(['sub', topic.name, '', '']));
    }
  }

  /**
   * Unsubscribe from a topic.
   *
   * @param name The name of the topic to unsubcribe from.
   */
  public unsubscribe(name: string): void {
    if (this.topicMap.has(name)) {
      const topic = this.topicMap.get(name);
      if (topic !== undefined && topic.unsubscribe !== undefined) {
        topic.unsubscribe();
      }

      this.topicMap.delete(name);
      this.ws.send(this.buildMsg(['unsub', name, '', '']));
    }
  }

  /**
   * throttle the rate at which messages are published on a topic.
   *
   * @param topic The topic to throttle.
   * @param rate Publish rate.
   */
  public throttle(topic: Topic, rate: number): void {
    this.ws.send(this.buildMsg(['throttle', topic.name, 'na', rate.toString()]));
  }

  /**
   * Return the list of available topics.
   *
   * @returns The list of topics that can be subscribed to.
   */
  public getAvailableTopics(): object[] {
    return this.availableTopics;
  }

  /**
   * Return the list of subscribed topics.
   *
   * @returns A map containing the name and message type of topics that we are currently
   *          subscribed to.
   */
  public getSubscribedTopics(): Map<string, Topic> {
    return this.topicMap;
  }

  /**
   * Return the world.
   *
   * @returns The name of the world the websocket is connected to.
   */
  public getWorld(): string {
    return this.world;
  }

  /**
   * Get an asset from Gazebo
   */
  public getAsset(_uri: string, _cb: AssetCb) {
    let asset: Asset = {
      uri: _uri,
      cb: _cb
    };

    this.assetMap.set(_uri, asset);
    this.ws.send(this.buildMsg(['asset', '', '', _uri]));
  }

  /**
   * Handler for the open event of a Websocket.
   *
   * @param key Optional. A key to authorize access to the websocket messages.
   */
  private onOpen(key?: string): void {
    // An authorization key could be required to request the message definitions.
    if (key) {
      this.ws.send(this.buildMsg(['auth', '', '', key]));
    } else {
      this.ws.send(this.buildMsg(['protos', '', '', '']));
    }
  }

  /**
   * Handler for the close event of a Websocket.
   *
   * Cleanup the connections.
   */
  private onClose(): void {
    this.topicMap.clear();
    this.availableTopics = [];
    this.root = null;
    this.status$.next('disconnected');
    this.sceneInfo$.next(null);
  }

  /**
   * Handler for the message event of a Websocket.
   *
   * Parses message responses from Gazebo and sends to the corresponding topic.
   */
  private onMessage(event: MessageEvent): void {
    // If there is no Root, then handle authentication and the message definitions.
    const fileReader = new FileReader();
    if (!this.root) {
      fileReader.onloadend = () => {
        const content = fileReader.result as string;

        // Handle the response.
        switch (content) {
          case 'authorized':
            // Get the message definitions.
            this.ws.send(this.buildMsg(['protos', '', '', '']));
            break;
          case 'invalid':
            // TODO(germanmas) Throw a proper Unauthorized error.
            console.error('Invalid key');
            break;
          default:
            // Parse the message definitions.
            this.root = parse(fileReader.result as string, {keepCase: true}).root;

            // Request topics.
            this.ws.send(this.buildMsg(['topics-types', '', '', '']));

            // Request world information.
            this.ws.send(this.buildMsg(['worlds', '', '', '']));

            // Now we can update the connection status.
            this.status$.next('connected');
            break;
        }
      };

      fileReader.readAsText(event.data);
      return;
    }

    fileReader.onloadend = () => {
      if (!this.root) {
        console.error("Protobuf root has not been created");
        return;
      }

      // Return if at any point, the websocket connection is lost.
      if (this.status$.getValue() === 'disconnected') {
        return;
      }

      // Decode as UTF-8 to get the header.
      const str = new TextDecoder('utf-8').decode(fileReader.result as BufferSource);
      const frameParts = str.split(',');
      const msgType = this.root.lookup(frameParts[2]) as Type;
      const buffer = new Uint8Array(fileReader.result as ArrayBuffer);

      // Decode the Message. The "+3" in the slice accounts for the commas in the frame.
      let msg;
      // get the actual msg payload without the header
      const msgData = buffer.slice(
        frameParts[0].length + frameParts[1].length + frameParts[2].length + 3
        );

      // do not decode image msg as it is raw compressed png data and not a
      // protobuf msg
      if (frameParts[2] === 'ignition.msgs.Image' ||
          frameParts[2] === 'gazebo.msgs.Image') {
        msg = msgData;
      }
      else {
        msg = msgType.decode(msgData);
      }

      // For frame format information see the WebsocketServer documentation at:
      // https://github.com/gazebosim/gz-launch/blob/ign-launch5/plugins/websocket_server/WebsocketServer.hh
      if (frameParts[0] == 'asset') {
        // Run the callback associated with the asset. This lets the requester
        // process the asset message.
        if (this.assetMap.has(frameParts[1])) {
          this?.assetMap?.get(frameParts[1])?.cb(msg['data']);
        } else {
          console.error('No resource callback');
        }
      } else if (frameParts[0] == 'pub') {

        // Handle actions and messages.
        switch (frameParts[1]) {
          case 'topics-types':
            for (const pub of msg['publisher']) {
              this.availableTopics.push(pub);
            }
            break;
          case 'topics':
            this.availableTopics = msg['data'];
            break;
          case 'worlds':
            // The world name needs to be used to get the scene information.
            this.world = msg['data'][0];
            this.ws.send(this.buildMsg(['scene', this.world, '', '']));
            break;
          case 'scene':
            // Emit the scene information. Contains all the models used.
            this.sceneInfo$.next(msg);

            // Once we received the Scene Information, we can start working.
            // We emit the Ready status to reflect this.
            this.status$.next('ready');
            break;
          default:
            // Message from a subscribed topic. Get the topic and execute its
            // callback.
            if (this.topicMap.has(frameParts[1])) {
              this?.topicMap?.get(frameParts[1])?.cb(msg);
            }
            break;
        }
      } else {
        console.warn('Unhandled websocket message with frame operation', frameParts[0]);
      }
    };

    // Read the blob data as an array buffer.
    fileReader.readAsArrayBuffer(event.data);
    return;
  }

  /**
   * Handler for the error event of a Websocket.
   */
  private onError(event: Event): void {
    this.status$.next('error');
    this.disconnect();
    console.error(event);
  }

  /**
   * Helper function to build a message.
   * The message is a comma-separated string consisting in four parts:
   * 1. Operation
   * 2. Topic name
   * 3. Message type
   * 4. Payload
   */
  private buildMsg(parts: string[]): string {
    return parts.join(',');
  }
}
