// const '@babel/polyfill';
const mpg = require('mpg123');
const Rotary = require('raspberrypi-rotary-encoder');
const i2c = require('i2c-bus');
const Oled = require('oled-i2c-bus');
const font = require('oled-font-5x7');
const convert = require('@daisy-electronics/pin-converter');
const IsItConnected = require('is-it-connected');

const isItConnected = new IsItConnected();
// Hardware
let player; // Sound
let oled; // Screen
let volumeKnob; // Volume knob
let channelKnob; // Channel knob

// Timers
const timerModes = { volume: 'volume', pick: 'pick', title: 'title' };
let timerMode = null;
let displayTimer = null;
let debugTimer = null; // Force reloading radios when holding channel knob

// Store
let radios = null; // Array of radios object {name, url}
let title = 'no info'; // Last title info received
let playingRadio = 0; // Currently playing radio index (related to 'radios' array)
let pickingRadio = 0; // Currently displaying radio index (when using channel knob)
let muted = false; // Muted state
let volume; // Current volume [0-100]
let backupVolume; // Current volume [0-100]
let maxVolume; // Volume limiter (set with the config below) that creates a transparent scale
let config; // Hardware and starting config

class Radio {
  constructor(pConfig = {}) {
    config = {
      volumeKnobClkPin: pConfig.volumeKnobClkPin || 11,
      volumeKnobDataPin: pConfig.volumeKnobDataPin || 13,
      volumeKnobSwitchPin: pConfig.volumeKnobSwitchPin || 15,
      channelKnobClkPin: pConfig.channelKnobClkPin || 16,
      channelKnobDataPin: pConfig.channelKnobDataPin || 18,
      channelKnobSwitchPin: pConfig.channelKnobSwitchPin || 22,
      lcdWidth: pConfig.lcdWidth || 128,
      lcdHeight: pConfig.lcdHeight || 64,
      lcdAddress: pConfig.lcdAddress || 0x3C,
      lcdI2CBus: pConfig.lcdI2CBus || 1,
      startingVolume: pConfig.startingVolume || 50,
      volumeLimiter: pConfig.volumeLimiter || 80,
      radios: pConfig.radios || [],
    };
    oled = new Oled(i2c.openSync(config.lcdI2CBus), {
      width: config.lcdWidth,
      height: config.lcdHeight,
      address: config.lcdAddress,
    });
    volumeKnob = new Rotary(convert(`physical${config.volumeKnobClkPin}`, 'wiringPi'),
      convert(`physical${config.volumeKnobDataPin}`, 'wiringPi'),
      convert(`physical${config.volumeKnobSwitchPin}`, 'wiringPi'));
    channelKnob = new Rotary(convert(`physical${config.channelKnobClkPin}`, 'wiringPi'),
      convert(`physical${config.channelKnobDataPin}`, 'wiringPi'),
      convert(`physical${config.channelKnobSwitchPin}`, 'wiringPi'));
    maxVolume = config.volumeLimiter;
    volume = config.startingVolume;
    oled.clearDisplay();
    oled.stopScroll();
    volumeKnob.on('rotate', (delta) => {
      if (!muted && radios.length > 0) {
        this.setVolumeAndDisplay(volume + delta);
      }
    });
    volumeKnob.on('released', () => {
      if (!muted) {
        this.mute();
      } else {
        this.unmute();
      }
    });
    channelKnob.on('rotate', (delta) => {
      if (!muted && radios.length > 0) {
        let ind;
        if (delta > 0) {
          ind = pickingRadio + 1 > radios.length - 1 ? 0 : pickingRadio + 1;
        } else {
          ind = pickingRadio - 1 < 0 ? radios.length - 1 : pickingRadio - 1;
        }
        this.pick(ind);
      }
    });
    channelKnob.on('pressed', () => {
      if (!muted){
        debugTimer = setTimeout(() => {
          debugTimer = null;
          this.refreshRadios(radios);
        }, 4000);
      }
    });
    channelKnob.on('released', () => {
      if (debugTimer && !muted && radios.length > 0) {
        clearTimeout(debugTimer);
        debugTimer = null;
        if (pickingRadio === playingRadio) {
          this.showTitle();
        } else {
          this.play(pickingRadio);
        }
      }
    });
    radios = config.radios;
    isItConnected.on('online', () => {
      this.refreshRadios(radios);
    });
    isItConnected.on('offline', () => {
      this.refreshDisplay();
    });
    isItConnected.watch();
  }

  async play(radioId) {
    this.clearTimer(false);
    playingRadio = radioId;
    if (player) {
      player.removeAllListeners('format');
      player.close();
    }
    player = new mpg.MpgPlayer();
    title = 'no info';
    player.on('error', (error) => {
      console.log(error);
    });
    player.on('format', () => {
      player.child.stdout.on('data', (data) => {
        const line = data.toString();
        if (line.includes('ICY-META: StreamTitle=')) {
          const pretitle = line.split('ICY-META: StreamTitle=')[1].substring(1);
          title = pretitle.substring(0, pretitle.length - 2);
        }
      });
    });
    this.setVolume(volume);
    player.play(radios[playingRadio].url);
    this.refreshDisplay();
  }

  pick(radioId) {
    pickingRadio = radioId;
    this.setTimer(timerModes.pick, 3000);
  }

  showTitle() {
    this.setTimer(timerModes.title, 3000);
  }

  setVolume(pVolume) {
    volume = pVolume;
    volume = volume > 100 ? 100 : volume;
    volume = volume < 0 ? 0 : volume;
    if (player) {
      player.volume(parseInt((volume * maxVolume) / 100, 10));
    }
  }

  setVolumeAndDisplay(pVolume) {
    this.setVolume(pVolume);
    this.setTimer(timerModes.volume, 3000);
  }

  mute() {
    if (!muted) {
      this.clearTimer(false);
      backupVolume = volume;
      this.setVolume(0);
      muted = true;
      this.refreshDisplay();
    }
  }

  unmute() {
    if (muted) {
      this.clearTimer(false);
      this.setVolume(backupVolume);
      backupVolume = null;
      muted = false;
      this.refreshDisplay();
    }
  }

  refreshDisplay() {
    oled.clearDisplay();
    if (radios.length > 0) {
      if (!isItConnected.connected) {
        oled.setCursor(1, 24);
        oled.writeString(font, 2, 'NO INTERNET', 1, true);
      } else if (muted) {
        oled.setCursor(1, 24);
        oled.writeString(font, 2, 'MUTE', 1, true);
      } else if (!timerMode) {
        oled.setCursor(1, 24);
        oled.writeString(font, 2, radios[playingRadio].name, 1, true);
      } else if (timerMode === timerModes.volume) {
        oled.setCursor(1, 24);
        oled.writeString(font, 2, `Vol:${volume}`, 1, true);
      } else if (timerMode === timerModes.pick) {
        oled.setCursor(1, 1);
        oled.writeString(font, 2, `${pickingRadio}.`, 1, true);
        oled.setCursor(1, 24);
        oled.writeString(font, 2, radios[pickingRadio].name, 1, true);
      } else if (timerMode === timerModes.title) {
        oled.setCursor(1, 1);
        oled.writeString(font, 2, title, 1, true);
      }
    } else {
      oled.setCursor(1, 1);
      oled.writeString(font, 2, 'NO RADIOS! Visit the web app', 1, true);
    }
  }

  setTimer(mode, duration) {
    this.clearTimer(false);
    displayTimer = setTimeout(() => {
      if (timerMode === timerModes.pick) {
        pickingRadio = playingRadio;
      }
      displayTimer = null;
      timerMode = null;
      this.refreshDisplay();
    }, duration);
    timerMode = mode;
    this.refreshDisplay();
  }

  clearTimer(refreshDisplay) {
    if (displayTimer) {
      clearTimeout(displayTimer);
      displayTimer = null;
      timerMode = null;
    }
    if (refreshDisplay) {
      this.refreshDisplay();
    }
  }

  async refreshRadios(pRadios) {
    if (muted) {
      muted = false;
      volume = backupVolume;
    }
    if (player) {
      player.close();
      player = null;
    }
    radios = pRadios.concat();
    pickingRadio = 0;
    this.clearTimer(false);
    if (radios.length > 0) {
      this.play(0);
    } else {
      this.refreshDisplay();
    }
  }
}
module.exports = Radio;
