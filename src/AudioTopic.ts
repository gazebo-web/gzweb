import { binaryToBase64 } from './Globals';
import { Transport } from './Transport';
import { Topic } from './Topic';

export class AudioTopic {

  constructor(name: string, trans: Transport) {
    let audioMap = new Map<string, typeof Audio>;
    let topic = new Topic(
      name,
      (msg) => {
        let playback = false;
        let uri = '';
    
        // Get the playback and uri information.
        for (var key in msg.params) {
          if (key === 'playback') {
            playback = msg.params[key].bool_value;
          } else if (key === 'uri') {
            uri = msg.params[key].string_value;
          }
        }
    
        // Control audio playback if the audio file is in the audio map.
        if (uri in audioMap) {
          if (playback) {
            audioMap[uri].play();
          } else {
            audioMap[uri].pause();
          }
        // Otherwise, fetch the audio file
        } else {
          console.log('Getting audio file', uri);
          trans.getAsset(uri, (asset: Uint8Array) => {
            var audioSrc = 'data:audio/mp3;base64,' +
              binaryToBase64(asset);
            let audio = new Audio(audioSrc);
            audio.src = audioSrc;
            audioMap[uri] = audio;
            if (playback) {
              audio.play();
            }
          });
        }
      }
    );
    trans.subscribe(topic);
  }
}
