# raspberrypi-piwebradio

The PiWebRadio raspberry core app

### Run dev
```
npm run dev
```

### Run prod
```
npm start
```

### API
- constructor(config={})   
  - config : Object - (optional)
  {
    - volumeKnobClkPin : int - The volume knob clock pin. default = 11
    - volumeKnobDataPin : int - The volume knob data pin. default = 13
    - volumeKnobSwitchPin : int - The volume knob switch pin. default = 15
    - channelKnobClkPin : int - The channel selector knob clock pin. default = 16
    - channelKnobDataPin : int - The channel selector knob data pin. default = 18
    - channelKnobSwitchPin : int - The channel selector knob switch pin. default = 22
    - lcdWidth : int                 The width resolution of your lcd screen. default = 128,
    - lcdHeight : int                The height resolution of your lcd screen. default = 64,
    - lcdAddress : hex               The address used by your lcd screen. default = 0x3C,
    - lcdI2CBus : int                The i2c bus used by your lcd screen. default = 1,
    - startingVolume : int [0-100]   The volume set when you plug your radio. default = 50,
    - volumeLimiter : int [0-100]    Set a maximum volume. If you have power issues or just want to limit the volume, this will adjust and create a scale so the knob user still deals with a 0-100 range. default = 80
    - radios : array[{name, url}] - The starting radios object arrays. (radio object example : {name:'MyRadio', url:'http://myradio.fr/stream'}). Default is an empty array.
  }

- refreshRadios(radios)         Will replace the radios array with the one given in parameter.
  - radios : []string             An array of radio object.


### Wiring

Volume knob + : 1
Volume knob - : 9
Volume knob CLOCK : 11
Volume knob DATA : 13
Volume knob SWITCH : 15
Select knob + : 17
Select knob - : 14
Select knob CLOCK : 16
Select knob DATA : 18
Select knob SWITCH : 22
Screen + : 4
Screen - : 6
Screen SDA : 3
Screen SCL : 5
