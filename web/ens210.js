// This is a javascript file, belonging to the github project https://github.com/maarten-pennings/WebUSB-I2C
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', event => {
    let connectButton = document.querySelector("#id_connect");
    let statsSpan = document.querySelector('#id_stats');
    let tSpan = document.querySelector('#id_t');
    let tminmaxSpan = document.querySelector('#id_tminmax');
    let hSpan = document.querySelector('#id_h');
    let hminmaxSpan = document.querySelector('#id_hminmax');

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

    // Sets the message for the (dongle) shield
    function set_shield_msg(msg) {
      document.querySelector('#id_shieldmsg').textContent= msg==null || msg=="" ? "" : ", "+msg
    }
    
    // Sets the message for the (usb) dongle and clears sub message
    function set_dongle_msg(msg) {
      document.querySelector('#id_donglemsg').textContent=  msg==null || msg=="" ? "" : ", "+msg
      set_shield_msg("")
    }
    
    // Sets the message for the usb connection and clears sub messages
    function set_usb_msg(msg) {
      document.querySelector('#id_usbmsg').textContent= msg
      set_dongle_msg("")
    }
    
    // This functions extracts T and H data from the 'data_th' and outputs them (if they are sensible).
    let avgdelta;
    let lasttime;
    let count;
    let tmin;
    let tmax;
    let hmin;
    let hmax;
    function ui_init() {
      count= 0;
      tmin= 250;
      tmax= -100;
      hmin= 100;
      hmax= 0;
    }
    function ui_update(data_th) {
      // Compute time
      let time= new Date().getTime();
      let delta= time-lasttime;
      lasttime= time;
      count++
      if( count==2 ) avgdelta= delta; 
      if( count>=3 ) avgdelta= avgdelta*9/10.0 + delta/10.0;
      // Extract the T_VAL and H_VAL
      let Tval=parseInt( data_th.substr(2*2,2)+data_th.substr(1*2,2)+data_th.substr(0*2,2) , 16 );
      let Hval=parseInt( data_th.substr(5*2,2)+data_th.substr(4*2,2)+data_th.substr(3*2,2) , 16 );
      // CRC matches?
      if( !crc_ok(Tval) || !crc_ok(Hval) ) {
        tSpan.textContent= "err:crc";
        hSpan.textContent= "err:crc";
        console.log("ui: err:crc")
        return;
      }
      // Valid bit set?
      if( !valid_ok(Tval) || !valid_ok(Hval) ) {
        tSpan.textContent= "err:val";
        hSpan.textContent= "err:val";
        console.log("ui: err:val")
        return;
      }
      // Convert to Celsius and %RH
      let t= (Tval & 0xFFFF)/64-273.15;
      let h= (Hval & 0xFFFF)/512;
      console.log("ui: T="+t+" H="+h)
      // Update min, max
      if( t<tmin ) tmin=t
      if( t>tmax ) tmax=t
      if( h<hmin ) hmin=h
      if( h>hmax ) hmax=h
      // Use the data
      tSpan.textContent= t.toFixed(1)+" \u00B0C"
      tminmaxSpan.textContent= "("+tmin.toFixed(2)+","+tmax.toFixed(2)+")"
      hSpan.textContent= h.toFixed(0)+" %RH"
      hminmaxSpan.textContent= "("+hmin.toFixed(1)+","+hmax.toFixed(1)+")"
      if( count<2 ) statsSpan.textContent= "#"+count; else statsSpan.textContent= "#"+count+" ("+avgdelta.toFixed(0)+"ms)";
      tline.append(time, t);
      hline.append(time, h);
    }

    
    // === ENS210 FSM (Finite State Machine) ======================================================
    
    
    let state
    let tmr
    let port
    
    // Transition FSM to new state `newstate`.
    // Send the `cmdtosend` to the dongle, wait for a responds (line of chars - and call next() with that line)
    // or timeout after `timeoutms` ms (and call next() with null as line).
    // Add `logmsg` to the log.    
    // The calls to next() - either when receiving a line or on timeout - keep the FSM alive.
    // The initial call "kick off" is step() in connect().
    function step(newstate, cmdtosend, timeoutms, logmsg) {
      // record new state
      state=newstate
      // if transition requires command to send, do so
      if( cmdtosend!=null) port.send( str_u8(cmdtosend) )
      // clear pending timeout (if one exists)
      if( tmr!=null ) { clearTimeout(tmr); tmr=null }
      // if transition requires timeout, set one
      if( timeoutms!=null ) tmr=setTimeout(next,timeoutms, null); // call `next(null)` in `timeoutms` ms
      // log transition
      console.log("step: "+logmsg)
    }
    
    
    // This function is called (see port.onReceive) when characters are received, or when a timeout occurs (see step).
    // When line==null it is the latter (timeout), otherwise the former (incoming data).
    // It takes the dongle+ENS210 to an initialization, the does repeated single shot measurements.
    // Every measurement is passed to ui_update()
    let retries
    function next(line) {
      let m // for match results
      // clear timeout timer, if one exists
      if( tmr!=null ) { clearTimeout(tmr); tmr=null }
      // handle state
      switch( state ) {
        case 0: // flushing
          set_dongle_msg("probing dongle ...")
          if( line!=null ) { step(0,null,50,"0: flushing - flush '"+line+"'"); break }
          step(1,"v",500,"0: flushing - get version")
          break
        case 1: // get version
          if( line==null ) { step(0,null,100,"1: get version - timeout: restart FSM"); break }
          m = line.match(/(v[0-9])/);
          if( (m==null) || (m.length!=2) ) { step(0,null,100,"1: get version - parse error: restart FSM"); break }
          let dongleversion= m[1]
          set_dongle_msg("firmware "+dongleversion)
          console.log("version: "+dongleversion)
          retries=0
          step(2,"w431080p",500,"1: get version - resetting 210 "+retries)
          break
        case 2: // resetting 210
          if( line==null ) { step(0,null,100,"2: resetting 210 - timeout: restart FSM "); break }
          m = line.match(/w431080p\[00\]/);
          if( (m==null) || (m.length!=1) ) { 
          set_shield_msg("no ENS210")
          if( retries>=50 ) { step(0,null,100,"2: resetting 210 - no ack '"+line+"': restart FSM"); break }
            retries++;
            step(2,"w431080p",500,"1: get version - resetting 210 "+retries); break
          }
          set_shield_msg("ENS210 found");
          step(3,"w43210003p",500,"2: resetting 210 - start single")
          ui_init()
          break
        case 3: // start single
          if( line==null ) { step(0,null,100,"3: start single - timeout: restart FSM"); break }
          m = line.match(/w43210003p\[00\]/);
          if( (m==null) || (m.length!=1) ) { step(0,null,100,"3: start single - no ack '"+line+"': restart FSM"); break }
          step(4,null,130,"3: start single - wait 130")
          break
        case 4: // wait 130
          if( line!=null ) { step(0,null,100,"4: wait 130 - unexpected data: restart FSM"); break }
          step(5,"w4330r4306p",500,"4: wait 130 - get th")
          break
        case 5: // get th
          if( line==null ) { step(0,null,100,"5: get th - timeout: restart FSM"); break }
          m = line.match(/w4330\[00\]r4306p\[([0-9a-f]{12})\]/);
          if( (m==null) || (m.length!=2) ) { step(0,null,100,"5: get th - no ack '"+line+"': restart FSM"); break }
          ui_update(m[1])
          step(3,"w43210003p",500,"5: get th - start single")
          break
        default: assert(false,"unknown state "+state)
          break
      }
    }
    
    
    // === USB connect ============================================================================
    
    
    // This function connects to the serial port, and directs received lines to 'next()'.
    // This function is called when the user clicks the connect button (see 'connectButton.addEventListener').
    // It is also called when the web page gets loaded and an active port is detected (see 'serial.getPorts()')
    function connect() {
      // Install rx handler for port
      let rxbuf= "" // clear buffer that records all incoming bytes
      port.onReceive = data => {
        let textDecoder = new TextDecoder();
        rxbuf+= textDecoder.decode(data)
        let ix= rxbuf.indexOf("\n>")
        if( ix>=0 ) {
          // Line received, extract all chars up to (but excluding) the prompt+newline
          let line= rxbuf.substr(0,ix)
          // Keep all data after the prompt+newline
          rxbuf= rxbuf.substr(ix+2)
          // Dispatch extracted line
          next(line);
        }
      }
      // Install error handler for port
      port.onReceiveError = error => {
        console.error(error);
      };
      // Connect to port
      port.connect().then(() => {
        // Connect successful: show state
        set_usb_msg("Connected to "+port.device_.productName); // port.device_.vendorId.toString(16)
        port.device_.productId.toString(16)
        connectButton.textContent = 'Disconnect';
        // Initialize for this new port connection
        console.log("Connected")
        // Startup state machine (it keeps itself going)
        step(0,null,100,"Start state machine")
      }, error => {
        // Connect failed: show state
        set_usb_msg(error);
      });
    }

    // Install click handler for the connect button.
    connectButton.addEventListener('click', function() {
      if( port ) {
        port.disconnect();
        connectButton.textContent = 'Connect';
        set_usb_msg("Disconnected")
        port = null;
      } else {
        serial.requestPort().then(selectedPort => {
          port = selectedPort;
          connect();
        }).catch(error => {
          set_usb_msg(error);
        });
      }
    });

    // Init UI, try to auto connect to USB port
    set_usb_msg("Starting...")
    serial.getPorts().then(ports => {
      if( ports.length==0 ) {
        set_usb_msg("No device found")
      } else {
        set_usb_msg("Connecting...")
        port = ports[0]
        connect();
      }
    });

  });
})();
