(function() {
  'use strict';
 
  document.addEventListener('DOMContentLoaded', event => {
    let connectButton = document.querySelector("#connect");
    let connectSpan = document.querySelector('#status');
    let tSpan = document.querySelector('#T');
    let hSpan = document.querySelector('#H');

    let rex = /w4330\[00\]r4306\[([0-9a-f]{12})\]w43210003p\[00\]/;
    let textDecoder = new TextDecoder();
    let polltimer;
    let port;
    let rxbuf="";
    
    let ascii = (s => s.split('').map(c=>c.charCodeAt(0)) );

    function onrxline(line) {
      console.log(line)            
      let res = line.match(rex);
      if( (res!=null) && (res.length==2) ) {
        let T=parseInt(res[1].substr(1*2,2)+res[1].substr(0*2,2),16)/64-273.15;
        let H=parseInt(res[1].substr(4*2,2)+res[1].substr(3*2,2),16)/512;
        tSpan.textContent= Math.round(T*10)/10;
        hSpan.textContent= Math.round(H);
      } else {
        tSpan.textContent= "?";
        hSpan.textContent= "?";        
      }
    }
  
    function connect() {
      port.connect().then(() => {
        connectSpan.textContent = 'Connected name="'+port.device_.productName+'" vid='+port.device_.vendorId.toString(16)+' pid='+port.device_.productId.toString(16);;
        connectButton.textContent = 'Disconnect';

        port.onReceive = data => {
          rxbuf+= textDecoder.decode(data)
          let ix= rxbuf.indexOf("\n>")
          if( ix>=0 ) {
            let msg= rxbuf.substr(0,ix)
            rxbuf= rxbuf.substr(ix+2)
            onrxline(msg);
          }
        }
        port.onReceiveError = error => {
          console.error(error);
        };
      }, error => {
        connectSpan.textContent = error;
      });
    }

    function onUpdateLed() {
      if( !port ) {
        return;
      }
      let cmd = "w431000w4300r4302p"
      port.send(Uint8Array.from( ascii(cmd)));
    };

    function pollfunc() {
      let cmd = "w4330r4306w43210003p"
      port.send(Uint8Array.from( ascii(cmd)));
    }
    polltimer= setInterval(pollfunc,500)
    // clearInterval(polltimer)

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

    serial.getPorts().then(ports => {
      if (ports.length == 0) {
        connectSpan.textContent = 'No device found.';
      } else {
        connectSpan.textContent = 'Connecting...';
        port = ports[0]
        connect();
      }
    });
    
    connectSpan.textContent = 'Starting...';
  });
})();
