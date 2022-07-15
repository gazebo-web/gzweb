import { binaryToBase64 } from './Globals';
import { Transport } from './Transport';
import { Topic } from './Topic';

let audioMap = new Map<string, typeof Audio>;
let transport: Transport;

export class GzAudioTopic extends Topic {
  constructor(name: string, trans: Transport) {
    super(name, audioCb);
    transport = trans;
  }
}

function audioCb(msg: any) {
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
    transport.getAsset(uri, function(asset: Uint8Array) {
      var audioSrc = 'data:audio/mp3;base64,' +
        binaryToBase64(asset);
      var audio = new Audio(audioSrc);
      audio.src = audioSrc;
      audioMap[uri] = audio;
      if (playback) {
        audio.play();
      }
    });
  }
}
