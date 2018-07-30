// This is a javascript file, belonging to the github project https://github.com/maarten-pennings/WebUSB-I2C
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', event => {
    let connectButton = document.querySelector("#id_connect");
    let connectSpan = document.querySelector('#id_status');
    let statsSpan = document.querySelector('#id_stats');
    let tSpan = document.querySelector('#id_T');
    let hSpan = document.querySelector('#id_H');

    // Convert a string to a Uint8Array (needed for uart send).
    function str_u8(s) {
      let ascii = (s => s.split('').map(c=>c.charCodeAt(0)) );
      return Uint8Array.from(ascii(s));
    }

    // 'val' is a 24 bit T_VAL or H_VAL; return ok if CRC is ok.
    function crc_ok(val) {
      return true; // not yet implemented
    }

    // 'val' is a 24 bit T_VAL or H_VAL; return ok if valid bit is set.
    function valid_ok(val) {
      return val & (1<<16);
    }

    // This functions extracts T and H data from the 'line' and outputs them (if they are sensible).
    // 'line' is a line received over serial (see 'connect()') in response to a 'measure' command (see 'connect()').
    let avgdelta;
    let lasttime;
    let count;
    function onrxline(line) {
      // Compute time
      let time= new Date().getTime();
      let delta= time-lasttime;
      lasttime= time;
      count++
      if( count==2 ) avgdelta= delta; 
      if( count>=3 ) avgdelta= avgdelta*9/10.0 + delta/10.0;
      console.log("rx: "+line)
      // Match the line with expected answer
      let rex = /w4330\[00\]r4306\[([0-9a-f]{12})\]w43210003p\[00\]/;
      let res = line.match(rex);
      if( (res==null) || (res.length!=2) ) {
        tSpan.textContent= "err:i2c";
        hSpan.textContent= "err:i2c";
        console.log("rx: err:i2c")
        return;
      }
      // Extract the T_VAL and H_VAL
      let Tval=parseInt( res[1].substr(2*2,2)+res[1].substr(1*2,2)+res[1].substr(0*2,2) , 16 );
      let Hval=parseInt( res[1].substr(5*2,2)+res[1].substr(4*2,2)+res[1].substr(3*2,2) , 16 );
      // CRC matches?
      if( !crc_ok(Tval) || !crc_ok(Hval) ) {
        tSpan.textContent= "err:crc";
        hSpan.textContent= "err:crc";
        console.log("rx: err:crc")
        return;
      }
      // Valid bit set?
      if( !valid_ok(Tval) || !valid_ok(Hval) ) {
        tSpan.textContent= "err:val";
        hSpan.textContent= "err:val";
        console.log("rx: err:val")
        return;
      }
      // Convert to Celsius and %RH
      let T= (Tval & 0xFFFF)/64-273.15;
      let H= (Hval & 0xFFFF)/512;
      console.log("rx: T="+T+" H="+H)
      // Use the data
      tSpan.textContent= T.toFixed(1)+" \u00B0C";
      hSpan.textContent= H.toFixed(0)+" %RH"
      statsSpan.textContent= "(#"+count+", "+avgdelta.toFixed(0)+"ms)"
      tline.append(time, T);
      hline.append(time, H);
    }

    // This function connects to the serial port, sends 'measure' commands, and directs received responses to 'onrxline'.
    // This function is called when the user clicks the connect button (see 'connectButton.addEventListener').
    // It is also called when the web page gets loaded and an active port is detected (see 'serial.getPorts()')
    let port;
    let rxbuf;
    function connect() {
      port.connect().then(() => {
        // Connect successful: show state
        connectSpan.textContent = 'Connected to '+port.device_.productName; // port.device_.vendorId.toString(16)   port.device_.productId.toString(16)
        connectButton.textContent = 'Disconnect';
        // Initialize for this new port connection
        let measure= str_u8("w4330r4306w43210003p") // Prepare I2C command: read 6 bytes from 0x30, write run/21=00 (singleshot), write start/22=03(start)
        rxbuf= "" // clear buffer that records all incoming bytes
        count= 0;
        console.log("tx: measure first")
        port.send( measure ) // execute first measurement
        // Install rx handler
        port.onReceive = data => {
          let textDecoder = new TextDecoder();
          rxbuf+= textDecoder.decode(data)
          let ix= rxbuf.indexOf("\n>")
          if( ix>=0 ) {
            // Line received, dispatch all data up to the prompt+newline
            let msg= rxbuf.substr(0,ix)
            rxbuf= rxbuf.substr(ix+2)
            onrxline(msg);
            // Answer received: execute next measurement
            console.log("tx: measure next")
            port.send( measure )
          }
        }
        // Install error handler
        port.onReceiveError = error => {
          console.error(error);
        };
      }, error => {
        // Connect failed: show state
        connectSpan.textContent = error;
      });
    }

    // Install click handler for the connect button.
    connectButton.addEventListener('click', function() {
      if( port ) {
        port.disconnect();
        connectButton.textContent = 'Connect';
        connectSpan.textContent = 'Disconnected';
        port = null;
      } else {
        serial.requestPort().then(selectedPort => {
          port = selectedPort;
          connect();
        }).catch(error => {
          connectSpan.textContent = error;
        });
      }
    });

    // Init UI, try to detect port
    connectSpan.textContent = 'Starting...';
    serial.getPorts().then(ports => {
      if( ports.length==0 ) {
        connectSpan.textContent = 'No device found.';
      } else {
        connectSpan.textContent = 'Connecting...';
        port = ports[0]
        connect();
      }
    });

  });
})();
