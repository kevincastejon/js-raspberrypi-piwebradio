// You should create a .env file at the project root to use env variables
import 'dotenv/config';
import '@babel/polyfill';

import mpg from 'mpg123';
import Rotary from 'raspberrypi-rotary-encoder';
import i2c from 'i2c-bus';
import Oled from 'oled-i2c-bus';
import font from 'oled-font-5x7';
import gpio from 'rpi-gpio';
import { exec } from 'child_process';
import convert from '@daisy-electronics/pin-converter';

let title = 'no info';
let player = null;
let maxVolume = null;
let wifiDisplayTimeout = null;
let titleDisplayTimeout = null;
let lastMuteBtnVal = null;


class Radio {
  constructor(pConfig = {}) {
    const config = {
      rotaryPinA: pConfig.rotaryPinA || 11,
      rotaryPinB: pConfig.rotaryPinB || 12,
      rotaryPinButton: pConfig.rotaryPinButton || 13,
      muteButtonPin: pConfig.muteButtonPin || 26,
      lcdWidth: pConfig.lcdWidth || 128,
      lcdHeight: pConfig.lcdHeight || 64,
      lcdAddress: pConfig.lcdAddress || 0x3C,
      lcdI2CBus: pConfig.lcdI2CBus || 1,
      startingVolume: pConfig.startingVolume || 50,
      volumeLimiter: pConfig.volumeLimiter || 80,
      radios: pConfig.radios || [],
    };
    this.oled = new Oled(i2c.openSync(config.lcdI2CBus), {
      width: config.lcdWidth,
      height: config.lcdHeight,
      address: config.lcdAddress,
    });
    this.rotary = new Rotary(convert(`physical${config.rotaryPinA}`, 'wiringPi'),
      convert(`physical${config.rotaryPinB}`, 'wiringPi'),
      convert(`physical${config.rotaryPinButton}`, 'wiringPi'));
    gpio.setup(26, gpio.DIR_IN, gpio.EDGE_BOTH);
    this.radios = null;
    this.playingRadio = 0;
    this.pickingRadio = 0;
    this.pickTimer = null;
    this.volumeTimer = null;
    maxVolume = config.volumeLimiter;
    this.volume = config.startingVolume;
    this.muteMode = false;
    this.displayWIFIMode = false;
    this.displayTitleMode = false;
    this.init(config.radios);
  }

  async init(radios) {
    this.oled.clearDisplay();
    this.oled.stopScroll();
    this.rotary.on('rotate', (delta) => this.onRotate(delta));
    this.rotary.on('pressed', () => this.onPress());
    this.rotary.on('released', () => this.onRelease());
    gpio.on('change', (channel, value) => {
      if (lastMuteBtnVal !== value) {
        lastMuteBtnVal = value;
        if (value) {
          this.onMuteRelease();
        } else {
          this.onMutePress();
        }
      }
    });
    this.refreshRadios(radios);
  }

  onRotate(delta) {
    if (!this.muteMode) {
      if (this.pickTimer) {
        if (delta > 0) {
          this.pick(this.pickingRadio + 1 > this.radios.length - 1 ? 0 : this.pickingRadio + 1);
        } else {
          this.pick(this.pickingRadio - 1 < 0 ? this.radios.length - 1 : this.pickingRadio - 1);
        }
      } else {
        this.setVolume(this.volume + delta * 2);
      }
    }
  }

  onMutePress() {
    wifiDisplayTimeout = setTimeout(() => {
      this.displayWIFIMode = true;
      exec('iwgetid', (error, stdout) => {
        this.display(stdout.split('ESSID:')[1], -1, true, 1);
      });
    }, 2000);
  }

  onMuteRelease() {
    clearTimeout(wifiDisplayTimeout);
    if (!this.displayWIFIMode) {
      if (this.muteMode) {
        this.muteMode = false;
        this.display(this.radios[this.playingRadio].name);
        player.volume(parseInt((this.volume * maxVolume) / 100, 10));
      } else {
        this.muteMode = true;
        this.clearPickTimer();
        this.clearVolumeTimer();
        this.display('MUTE');
        player.volume(0);
      }
    } else {
      this.displayWIFIMode = false;
      this.display(this.radios[this.playingRadio].name);
    }
  }

  onPress() {
    titleDisplayTimeout = setTimeout(() => {
      this.displayTitleMode = true;
      this.display(title, -1, true, 1);
    }, 2000);
  }

  onRelease() {
    clearTimeout(titleDisplayTimeout);
    if (!this.displayTitleMode) {
      if (!this.muteMode) {
        if (this.pickTimer) {
          this.play(this.pickingRadio);
          this.clearPickTimer();
        } else {
          this.clearVolumeTimer();
          this.pick(this.pickingRadio);
        }
      }
    } else {
      this.displayTitleMode = false;
      this.display(this.radios[this.playingRadio].name);
    }
  }

  async play(radioId) {
    this.playingRadio = radioId;
    if (player) {
      player.close();
    }
    player = new mpg.MpgPlayer();
    title = 'no info';
    player.on('format', () => {
      player.child.stdout.on('data', (data) => {
        const line = data.toString();
        if (line.includes('ICY-META: StreamTitle=')) {
          const pretitle = line.split('ICY-META: StreamTitle=')[1].substring(1);
          title = pretitle.substring(0, pretitle.length - 2);
        }
      });
    });
    player.volume(parseInt((this.volume * maxVolume) / 100, 10));
    player.play(this.radios[radioId].url);
    this.display(this.radios[this.playingRadio].name);
  }

  pick(radioId) {
    this.pickingRadio = radioId;
    this.display(this.radios[radioId].name, this.pickingRadio);
    this.renewPickTimer();
  }

  async setVolume(volume) {
    this.volume = volume;
    this.volume = this.volume > 100 ? 100 : this.volume;
    this.volume = this.volume < 0 ? 0 : this.volume;
    player.volume(parseInt((this.volume * maxVolume) / 100, 10));
    this.display(`Volume: ${this.volume}%`);
    this.renewVolumeTimer();
  }

  display(message, number = -1, firstLineText = false, size = 2) {
    this.oled.clearDisplay();
    if (number > -1) {
      this.oled.setCursor(1, 1);
      this.oled.writeString(font, 2, number.toString(10), 1, false);
    }
    this.oled.setCursor(1, firstLineText ? 1 : 24);
    this.oled.writeString(font, size, message, 1, true);
  }

  clearPickTimer() {
    if (this.pickTimer) {
      clearTimeout(this.pickTimer);
      this.pickTimer = null;
    }
  }

  renewPickTimer() {
    this.clearPickTimer();
    this.pickTimer = setTimeout(() => {
      this.display(this.radios[this.playingRadio].name);
    }, 6000);
  }

  clearVolumeTimer() {
    if (this.volumeTimer) {
      clearTimeout(this.volumeTimer);
      this.volumeTimer = null;
    }
  }

  renewVolumeTimer() {
    this.clearVolumeTimer();
    this.volumeTimer = setTimeout(() => {
      this.display(this.radios[this.playingRadio].name);
    }, 3000);
  }

  async refreshRadios(radios) {
    if (player) {
      player.close();
      player = null;
    }
    this.radios = radios.concat();
    this.pickingRadio = 0;
    this.clearPickTimer();
    this.clearVolumeTimer();
    this.play(0);
  }
}
module.exports = Radio;
