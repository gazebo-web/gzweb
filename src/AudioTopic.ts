import { binaryToBase64 } from "./Globals";
import { Transport } from "./Transport";
import { Topic } from "./Topic";

export class AudioTopic {
  constructor(name: string, trans: Transport) {
    let audioMap = new Map<string, [HTMLAudioElement, boolean]>();
    let topic = new Topic(name, (msg) => {
      let playback = false;
      let uri = "";

      // Get the playback and uri information.
      for (var key in msg.params) {
        if (key === "playback") {
          playback = msg.params[key].bool_value;
        } else if (key === "uri") {
          uri = msg.params[key].string_value;
        }
      }

      // Control audio playback if the audio file is in the audio map.
      if (uri in audioMap) {
        const tuple = audioMap[uri];
        if (tuple[1]) {
          tuple[0].play();
        } else {
          tuple[0].pause();
        }
        tuple[1] = playback;
        // Otherwise, fetch the audio file
      } else {
        console.log("Getting audio file", uri);
        // Fetching of the asset via getAsset() below is asynchronous, meaning
        // that we could have requests for the same asset come in while we are
        // fetching it.  To prevent multiple downloads and playing of the
        // audio, add the uri to the map immediately with an empty object;
        // we'll replace that dummy object with a fully active one once
        // downloading the asset is complete.
        audioMap[uri] = [new Audio(), playback];
        trans.getAsset(uri, (asset: Uint8Array) => {
          var audioSrc = "data:audio/mp3;base64," + binaryToBase64(asset);
          let audio = new Audio(audioSrc);
          audio.src = audioSrc;
          audioMap[uri][0] = audio;
          if (audioMap[uri][1]) {
            audio.play();
          }
        });
      }
    });
    trans.subscribe(topic);
  }
}
