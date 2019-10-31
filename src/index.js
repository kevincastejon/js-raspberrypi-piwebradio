// You should create a .env file at the project root to use env variables
import 'dotenv/config';
import '@babel/polyfill';

import { MPC } from 'mpc-js';
import Rotary from 'raspberrypi-rotary-encoder';
import { promises as fs } from 'fs';
import path from 'path';
import i2c from 'i2c-bus';
import Oled from 'oled-i2c-bus';
import font from 'oled-font-5x7';
import gpio from 'rpi-gpio';
import { exec } from 'child_process';
import convert from '@daisy-electronics/pin-converter';

let maxVolume = null;
let wifiDisplayTimeout = null;
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
    };
    this.mpc = new MPC();
    this.oled = new Oled(i2c.openSync(config.lcdI2CBus), {
      width: config.lcdWidth,
      height: config.lcdHeight,
      address: config.lcdAddress,
    });
    this.rotary = new Rotary(convert(`wiringPi${config.rotaryPinA}`, 'physical'),
      convert(`wiringPi${config.rotaryPinB}`, 'physical'),
      convert(`wiringPi${config.rotaryPinButton}`, 'physical'));
    gpio.setup(26, gpio.DIR_IN, gpio.EDGE_BOTH);
    this.radios = null;
    this.playingRadio = 0;
    this.pickingRadio = 0;
    this.pickTimer = null;
    this.volumeTimer = null;
    maxVolume = config.startingVolume;
    this.volume = maxVolume;
    this.muteMode = false;
    this.displayWIFIMode = false;
    this.init();
  }

  async init() {
    this.mpc.connectTCP('localhost', 6600);
    await this.mpc.playback.stop();
    await this.mpc.playbackOptions.setVolume(this.volume);
    this.oled.clearDisplay();
    this.oled.stopScroll();
    this.rotary.on('rotate', (delta) => this.onRotate(delta));
    this.rotary.on('pressed', () => this.onPress());
    this.rotary.on('released', () => this.onRelease());
    gpio.on('change', (channel, value) => {
      if (lastMuteBtnVal !== value) {
        lastMuteBtnVal = value;
        if (value) {
          this.onMutePress();
        }
      }
    });
    this.refreshRadios();
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
    if (this.muteMode) {
      this.muteMode = false;
      this.display(this.radios[this.playingRadio]);
      this.mpc.playbackOptions.setVolume(this.volume);
    } else {
      this.muteMode = true;
      this.clearPickTimer();
      this.clearVolumeTimer();
      this.display('MUTE');
      this.mpc.playbackOptions.setVolume(0);
    }
  }

  onPress() {
    wifiDisplayTimeout = setTimeout(() => {
      this.displayWIFIMode = true;
      exec('iwgetid', (error, stdout) => {
        this.display(stdout.split('ESSID:')[1]);
      });
    }, 2000);
  }

  onRelease() {
    clearTimeout(wifiDisplayTimeout);
    if (!this.displayWIFIMode) {
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
      this.displayWIFIMode = false;
      this.display(this.radios[this.playingRadio]);
    }
  }

  async play(radioId) {
    this.playingRadio = radioId;
    await this.mpc.playback.stop();
    await this.mpc.playback.play(radioId);
    this.display(this.radios[this.playingRadio]);
  }

  pick(radioId) {
    this.pickingRadio = radioId;
    this.display(this.radios[radioId], this.pickingRadio);
    this.renewPickTimer();
  }

  async setVolume(volume) {
    this.volume = volume;
    this.volume = this.volume > 100 ? 100 : this.volume;
    this.volume = this.volume < 0 ? 0 : this.volume;
    await this.mpc.playbackOptions.setVolume(parseInt((this.volume * maxVolume) / 100, 10));
    this.display(`Volume: ${this.volume}%`);
    this.renewVolumeTimer();
  }

  display(message, number = -1) {
    this.oled.clearDisplay();
    if (number > -1) {
      this.oled.setCursor(1, 1);
      this.oled.writeString(font, 2, number.toString(10), 1, false);
    }
    this.oled.setCursor(1, 24);
    this.oled.writeString(font, 2, message, 1, true);
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
      this.display(this.radios[this.playingRadio]);
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
      this.display(this.radios[this.playingRadio]);
    }, 3000);
  }

  async refreshRadios() {
    await this.mpc.playback.stop();
    await this.mpc.currentPlaylist.clear();
    await this.mpc.storedPlaylists.load('radios');
    this.radios = JSON.parse(await fs.readFile(path.resolve(__dirname, 'files', 'radios.json'))).radios.map((r) => r.name);
    this.pickingRadio = 0;
    this.clearPickTimer();
    this.clearVolumeTimer();
    this.play(0);
  }
}
module.exports = Radio;
