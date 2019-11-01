# piwebradio

The PiWebRadio raspberry core app

### Run dev
```
yarn dev
```

### Build for prod
```
yarn build
```

### Build and start
```
yarn start
```

### API
- constructor(config)   
  - config : Object
  {
    - rotaryPinA : int               The rotary encoder A pin. default = 11,
    - rotaryPinB : int               The rotary encoder B pin. default = 12,
    - rotaryPinButton : int          The rotary encoder switch pin. default = 13,
    - muteButtonPin : int            The mute switch pin. default = 26,
    - lcdWidth : int                 The width resolution of your lcd screen. default = 128,
    - lcdHeight : int                The height resolution of your lcd screen. default = 64,
    - lcdAddress : hex               The address used by your lcd screen. default = 0x3C,
    - lcdI2CBus : int                The i2c bus used by your lcd screen. default = 1,
    - startingVolume : int [0-100]   The volume set when you plug your radio. default = 50,
    - volumeLimiter : int [0-100]    Set a maximum volume. If you have power issues or just want to limit the volume, this will adjust and create a scale so the knob user still deals with a 0-100 range. default = 80,
  }

- refreshRadios(radios)         Will refresh the 'radios' playlist
  - radios : []string             An array of radio names. It must match the .m3u file content used by MPD server. Required.
